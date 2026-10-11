"""Explicit, read-only lookups against fixed public chemistry sources."""

import json
import re
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import Request, urlopen

from app.core.config import get_settings
from app.services.chemistry import parse_structure
from app.services.records import RecordError

CAS_PATTERN = re.compile(r"^\d{2,7}-\d{2}-\d$")


class LookupAuthError(LookupError):
    """The reference service rejected the configured API credential."""


def _read_json(url: str, *, api_key: str | None = None) -> dict[str, Any]:
    headers = {"User-Agent": "RDMS/0.1 (personal chemistry records)", "Accept": "application/json"}
    if api_key:
        headers["X-API-KEY"] = api_key
    try:
        with urlopen(Request(url, headers=headers), timeout=8) as response:
            raw = response.read(2_000_001)
    except HTTPError as exc:
        if exc.code in {401, 403}:
            raise LookupAuthError("公开资料服务拒绝当前密钥") from exc
        raise LookupError("公开资料服务暂不可用") from exc
    except (URLError, TimeoutError) as exc:
        raise LookupError("公开资料服务暂不可用") from exc
    if len(raw) > 2_000_000:
        raise LookupError("公开资料响应超过大小限制")
    try:
        result = json.loads(raw)
    except (json.JSONDecodeError, UnicodeDecodeError) as exc:
        raise LookupError("公开资料格式无效") from exc
    if not isinstance(result, dict):
        raise LookupError("公开资料格式无效")
    return result


def _valid_cas(value: str) -> bool:
    if not CAS_PATTERN.fullmatch(value):
        return False
    digits = value.replace("-", "")
    return sum(
        int(digit) * index for index, digit in enumerate(reversed(digits[:-1]), 1)
    ) % 10 == int(digits[-1])


def _strings(section: Any) -> list[str]:
    """Extract display strings from PUG View's nested annotations."""
    if isinstance(section, list):
        return [value for item in section for value in _strings(item)]
    if not isinstance(section, dict):
        return []
    values: list[str] = []
    marked = section.get("StringWithMarkup")
    if isinstance(marked, list):
        values.extend(
            item["String"]
            for item in marked
            if isinstance(item, dict) and isinstance(item.get("String"), str)
        )
    for key in ("Section", "Information", "Value"):
        if key in section:
            values.extend(_strings(section[key]))
    return values


def lookup(inchi_key: str) -> dict[str, Any]:
    candidates: list[dict[str, str]] = []
    properties: list[dict[str, str | None]] = []
    warnings: list[str] = []
    cas_key = get_settings().cas_common_chemistry_api_key
    if cas_key:
        try:
            query = quote(f"InChIKey={inchi_key}", safe="")
            search = _read_json(
                f"https://commonchemistry.cas.org/api/search?q={query}", api_key=cas_key
            )
            for result in search.get("results", [])[:5]:
                if not isinstance(result, dict):
                    continue
                rn = result.get("rn")
                if not isinstance(rn, str) or not _valid_cas(rn):
                    continue
                detail = _read_json(
                    f"https://commonchemistry.cas.org/api/detail?cas_rn={quote(rn)}",
                    api_key=cas_key,
                )
                if str(detail.get("inchiKey", "")).removeprefix("InChIKey=") != inchi_key:
                    continue
                url = f"https://commonchemistry.cas.org/detail?cas_rn={rn}"
                candidates.append(
                    {
                        "cas_number": rn,
                        "name": str(detail.get("name") or result.get("name") or rn),
                        "source": "CAS Common Chemistry",
                        "source_url": url,
                    }
                )
                for item in detail.get("experimentalProperties", [])[:10]:
                    if (
                        isinstance(item, dict)
                        and isinstance(item.get("name"), str)
                        and isinstance(item.get("property"), str)
                    ):
                        properties.append(
                            {
                                "name": item["name"][:80],
                                "value": item["property"][:500],
                                "source": "CAS Common Chemistry",
                                "source_url": url,
                            }
                        )
        except LookupAuthError:
            warnings.append("CAS Common Chemistry 拒绝当前密钥；请向 CAS 核对有效期和接口权限")
        except (LookupError, TypeError, ValueError, KeyError):
            warnings.append("CAS Common Chemistry 当前不可用，可稍后重试")
    else:
        warnings.append("未配置 CAS Common Chemistry 密钥；PubChem 的 CAS 候选需要人工核对")

    pubchem_cid: int | None = None
    try:
        ids = _read_json(
            f"https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/inchikey/{inchi_key}/cids/JSON"
        )
        found = ids.get("IdentifierList", {}).get("CID", [])
        if found and isinstance(found[0], int):
            pubchem_cid = found[0]
            url = f"https://pubchem.ncbi.nlm.nih.gov/compound/{pubchem_cid}"
            synonyms = _read_json(
                f"https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/{pubchem_cid}/synonyms/JSON"
            )
            info = synonyms.get("InformationList", {}).get("Information", [])
            names = info[0].get("Synonym", []) if info and isinstance(info[0], dict) else []
            existing = {item["cas_number"] for item in candidates}
            for name in names:
                if isinstance(name, str) and _valid_cas(name) and name not in existing:
                    candidates.append(
                        {
                            "cas_number": name,
                            "name": name,
                            "source": "PubChem 同义词（待核对）",
                            "source_url": url,
                        }
                    )
                    existing.add(name)
                if len(candidates) >= 8:
                    break
            try:
                density = _read_json(
                    f"https://pubchem.ncbi.nlm.nih.gov/rest/pug_view/data/compound/{pubchem_cid}/JSON?heading=Density"
                )
                for value in _strings(density.get("Record", {}))[:3]:
                    properties.append(
                        {
                            "name": "Density",
                            "value": value[:500],
                            "source": "PubChem",
                            "source_url": url,
                        }
                    )
            except LookupError:
                pass
    except (LookupError, TypeError, ValueError, KeyError):
        warnings.append("PubChem 当前不可用，仍可保存本机计算的结构资料")
    return {
        "candidates": candidates[:8],
        "properties": properties[:20],
        "pubchem_cid": pubchem_cid,
        "warnings": warnings,
    }


def lookup_cas(cas_number: str) -> dict[str, Any]:
    """Return reference candidates, never create records or guess a CAS identity."""
    candidates: list[dict[str, Any]] = []
    warnings: list[str] = []
    try:
        data = _read_json(
            "https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/"
            f"{quote(cas_number, safe='')}/property/"
            "IUPACName,MolecularFormula,MolecularWeight,SMILES,InChIKey/JSON"
        )
        properties = data.get("PropertyTable", {}).get("Properties", [])
        if len(properties) > 5:
            return {"candidates": [], "warnings": ["此 CAS 对应多个结果，请核对具体试剂身份"]}
        for entry in properties:
            cid = int(entry["CID"])
            synonyms = _read_json(
                f"https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/{cid}/synonyms/JSON"
            )
            info = synonyms.get("InformationList", {}).get("Information", [])
            if not any(
                int(item.get("CID", 0)) == cid and cas_number in item.get("Synonym", [])
                for item in info
            ):
                continue
            name = entry.get("IUPACName")
            formula = entry.get("MolecularFormula")
            weight = entry.get("MolecularWeight")
            if not isinstance(name, str) or not name.strip() or len(name) > 300:
                continue
            if not isinstance(formula, str) or not formula or len(formula) > 200:
                continue
            from decimal import Decimal, InvalidOperation

            try:
                mw = Decimal(str(weight))
            except InvalidOperation:
                continue
            if not mw.is_finite() or not 0 < mw < Decimal("1e12"):
                continue
            candidate = {
                "name": name,
                "cas_number": cas_number,
                "molecular_formula": formula,
                "molecular_weight": str(mw),
                "source": "PubChem CAS 同义词匹配",
                "source_url": f"https://pubchem.ncbi.nlm.nih.gov/compound/{cid}",
            }
            smiles = entry.get("SMILES") or entry.get("IsomericSMILES")
            if isinstance(smiles, str) and smiles.strip():
                try:
                    parsed = parse_structure(smiles, "smiles")
                    if (
                        parsed.inchi_key != entry.get("InChIKey")
                        or parsed.molecular_formula != formula
                    ):
                        raise ValueError("结构与公开身份资料不一致")
                    candidate.update(
                        structure_molfile=parsed.molfile,
                        smiles=parsed.smiles,
                        inchi_key=parsed.inchi_key,
                        svg=parsed.svg,
                    )
                except (RecordError, ValueError):
                    warnings.append(f"{name} 的结构未通过核对，保留试剂资料但不关联结构")
            else:
                warnings.append(f"{name} 未提供可用结构，可先保存试剂资料")
            candidates.append(candidate)
    except (LookupError, TypeError, ValueError, KeyError, AttributeError):
        warnings.append("公开资料查询失败或未收录此 CAS；可重试、选择本机记录或手动填写")
    if not candidates and not warnings:
        warnings.append("未找到可核对的 CAS 对应试剂，请选择本机记录或手动填写")
    return {"candidates": candidates, "warnings": warnings}
