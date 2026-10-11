"""Structure import and explicit external lookup on the isolated test database."""

from types import SimpleNamespace
from unittest.mock import patch
from urllib.error import HTTPError

import pytest
from fastapi.testclient import TestClient
from rdkit import Chem

from app.services.compound_lookup import LookupAuthError, _read_json, lookup


def test_structure_preview_create_duplicate_and_replace(client: TestClient) -> None:
    molfile = Chem.MolToMolBlock(Chem.MolFromSmiles("CCO"))
    preview = client.post(
        "/api/compounds/structure/preview",
        json={"structure": molfile, "format": "molfile"},
    )
    assert preview.status_code == 200, preview.text
    parsed = preview.json()
    assert parsed["molecular_formula"] == "C2H6O"
    assert parsed["smiles"] == "CCO"
    assert parsed["duplicates"] == []
    assert "<svg" in parsed["svg"]

    created = client.post(
        "/api/compounds",
        json={
            "name": "乙醇",
            "structure_molfile": parsed["structure_molfile"],
            "molecular_formula": "故意错误",
            "molecular_weight": "999.0",
            "cas_number": "64-17-5",
            "cas_source": "手工核对",
            "physical_properties": [
                {"name": "Density", "value": "0.789 g/mL at 20 °C", "source": "手工资料"}
            ],
        },
    )
    assert created.status_code == 201, created.text
    item = created.json()
    assert item["molecular_formula"] == "C2H6O"
    assert item["molecular_weight"] != "999.00000000"
    assert item["inchi_key"] == parsed["inchi_key"]
    assert item["cas_number"] == "64-17-5"
    assert item["physical_properties"][0]["name"] == "Density"
    assert "<svg" in client.get(f"/api/compounds/{item['id']}/structure.svg").text
    assert client.get("/api/compounds?q=64-17-5").json()["total"] == 1

    duplicate = client.post("/api/compounds/structure/preview", json={"structure": "CCO"}).json()
    assert duplicate["duplicates"][0]["id"] == item["id"]
    changed = client.patch(
        f"/api/compounds/{item['id']}",
        json={
            "expected_version": item["version"],
            "structure_molfile": Chem.MolToMolBlock(Chem.MolFromSmiles("CO")),
            "cas_number": None,
            "cas_source": None,
            "physical_properties": [],
        },
    )
    assert changed.status_code == 200, changed.text
    assert changed.json()["smiles"] == "CO"
    assert changed.json()["molecular_formula"] == "CH4O"
    assert changed.json()["cas_number"] is None


def test_invalid_structure_and_lookup_only_on_request(client: TestClient) -> None:
    with patch("app.services.compound_lookup._read_json") as remote:
        invalid = client.post(
            "/api/compounds/structure/preview", json={"structure": "not a molecule"}
        )
        assert invalid.status_code == 422
        assert (
            client.post("/api/compounds/structure/preview", json={"structure": "CCO"}).status_code
            == 200
        )
        remote.assert_not_called()

    with patch("app.api.compound_chemistry.lookup") as mocked:
        mocked.return_value = {
            "candidates": [],
            "properties": [],
            "pubchem_cid": None,
            "warnings": [],
        }
        response = client.post(
            "/api/compounds/structure/lookup",
            json={"inchi_key": "LFQSCWFLJHTTHZ-UHFFFAOYSA-N"},
        )
        assert response.status_code == 200, response.text
        mocked.assert_called_once_with("LFQSCWFLJHTTHZ-UHFFFAOYSA-N")


def test_cas_lookup_verifies_identity_and_preserves_property_source() -> None:
    key = "LFQSCWFLJHTTHZ-UHFFFAOYSA-N"

    def fake_read(url: str, *, api_key: str | None = None) -> dict[str, object]:
        if "/api/search" in url:
            assert api_key == "test-key"
            return {"results": [{"rn": "64-17-5"}, {"rn": "67-56-1"}]}
        if "cas_rn=64-17-5" in url:
            return {
                "inchiKey": f"InChIKey={key}",
                "name": "Ethanol",
                "experimentalProperties": [{"name": "Density", "property": "0.789 g/mL at 20 °C"}],
            }
        if "cas_rn=67-56-1" in url:
            return {"inchiKey": "InChIKey=OKKJLVBELUTLKV-UHFFFAOYSA-N"}
        if "/cids/JSON" in url:
            return {"IdentifierList": {"CID": [702]}}
        if "/synonyms/JSON" in url:
            return {"InformationList": {"Information": [{"Synonym": ["64-17-5", "67-56-1"]}]}}
        return {
            "Record": {
                "Section": [
                    {
                        "Information": [
                            {"Value": {"StringWithMarkup": [{"String": "0.789 g/mL at 20 °C"}]}}
                        ]
                    }
                ]
            }
        }

    with (
        patch(
            "app.services.compound_lookup.get_settings",
            return_value=SimpleNamespace(cas_common_chemistry_api_key="test-key"),
        ),
        patch("app.services.compound_lookup._read_json", side_effect=fake_read),
    ):
        result = lookup(key)
    assert result["candidates"][0]["cas_number"] == "64-17-5"
    assert result["candidates"][0]["source"] == "CAS Common Chemistry"
    assert result["properties"][0]["source_url"].startswith("https://commonchemistry.cas.org/")
    assert result["pubchem_cid"] == 702


def test_cas_unauthorized_response_identifies_credential_problem() -> None:
    with (
        patch(
            "app.services.compound_lookup.urlopen",
            side_effect=HTTPError(
                "https://commonchemistry.cas.org/api/search", 401, "Unauthorized", None, None
            ),
        ),
        pytest.raises(LookupAuthError),
    ):
        _read_json("https://commonchemistry.cas.org/api/search?q=ethanol", api_key="test-key")

    def fake_read(url: str, *, api_key: str | None = None) -> dict[str, object]:
        if "commonchemistry.cas.org" in url:
            raise LookupAuthError("rejected")
        if "/cids/JSON" in url:
            return {"IdentifierList": {"CID": [702]}}
        if "/synonyms/JSON" in url:
            return {"InformationList": {"Information": [{"Synonym": []}]}}
        return {"Record": {}}

    with (
        patch(
            "app.services.compound_lookup.get_settings",
            return_value=SimpleNamespace(cas_common_chemistry_api_key="test-key"),
        ),
        patch("app.services.compound_lookup._read_json", side_effect=fake_read),
    ):
        result = lookup("LFQSCWFLJHTTHZ-UHFFFAOYSA-N")
    assert result["pubchem_cid"] == 702
    assert result["warnings"] == [
        "CAS Common Chemistry 拒绝当前密钥；请向 CAS 核对有效期和接口权限"
    ]


def test_cas_reagent_lookup_local_exact_readonly_and_systematic_name(client: TestClient) -> None:
    created = client.post(
        "/api/compounds",
        json={
            "codename": "乙醇",
            "name": "ethanol",
            "cas_number": "64-17-5",
            "molecular_formula": "C2H6O",
            "molecular_weight": "46.06844",
        },
    ).json()
    other = client.post("/api/compounds", json={"name": "名称含 64-17-5，不是精确 CAS"}).json()
    with patch("app.api.compound_chemistry.lookup_cas") as remote:
        response = client.post("/api/compounds/cas/lookup", json={"cas_number": " 64-17-5 "})
        assert response.status_code == 200, response.text
        assert [row["id"] for row in response.json()["local_matches"]] == [created["id"]]
        assert response.json()["local_matches"][0]["name"] == "ethanol"
        assert response.json()["candidates"] == []
        remote.assert_not_called()
        invalid = client.post("/api/compounds/cas/lookup", json={"cas_number": "64-17-6"})
        assert invalid.status_code == 422
        remote.assert_not_called()
    assert client.get("/api/compounds?q=ethanol").json()["items"][0]["id"] == created["id"]
    before = client.get("/api/compounds").json()["total"]
    assert client.delete(f"/api/compounds/{created['id']}?expected_version=1").status_code == 204
    with patch(
        "app.api.compound_chemistry.lookup_cas",
        return_value={
            "candidates": [],
            "warnings": ["未找到"],
        },
    ) as remote:
        response = client.post("/api/compounds/cas/lookup", json={"cas_number": "64-17-5"})
        assert response.json()["local_matches"] == []
        remote.assert_called_once_with("64-17-5")
    assert client.get("/api/compounds").json()["total"] == before - 1
    assert client.get(f"/api/compounds/{other['id']}").json()["version"] == 1


def test_cas_reagent_lookup_checks_synonyms_and_uses_iupac() -> None:
    from app.services.compound_lookup import lookup_cas

    def fake_read(url: str) -> dict[str, object]:
        if "/property/" in url:
            return {
                "PropertyTable": {
                    "Properties": [
                        {
                            "CID": 702,
                            "IUPACName": "ethanol",
                            "MolecularFormula": "C2H6O",
                            "MolecularWeight": "46.07",
                            "SMILES": "CCO",
                            "InChIKey": "LFQSCWFLJHTTHZ-UHFFFAOYSA-N",
                        },
                        {
                            "CID": 887,
                            "IUPACName": "methanol",
                            "MolecularFormula": "CH4O",
                            "MolecularWeight": "32.04",
                        },
                    ]
                }
            }
        if "/702/" in url:
            return {"InformationList": {"Information": [{"CID": 702, "Synonym": ["64-17-5"]}]}}
        return {"InformationList": {"Information": [{"CID": 887, "Synonym": ["67-56-1"]}]}}

    with patch("app.services.compound_lookup._read_json", side_effect=fake_read):
        result = lookup_cas("64-17-5")
    assert len(result["candidates"]) == 1
    assert result["candidates"][0]["name"] == "ethanol"
    assert result["candidates"][0]["molecular_weight"] == "46.07"
    assert result["candidates"][0]["source_url"].endswith("/702")
    assert result["candidates"][0]["smiles"] == "CCO"
    assert "M  END" in result["candidates"][0]["structure_molfile"]
    assert "<svg" in result["candidates"][0]["svg"]
    with patch("app.services.compound_lookup._read_json", side_effect=LookupError("offline")):
        assert lookup_cas("64-17-5")["warnings"]
    with patch("app.services.compound_lookup._read_json", return_value={}):
        assert lookup_cas("64-17-5")["candidates"] == []


@pytest.mark.parametrize("smiles", ["C[C@H](O)C(=O)O", "CC(=O)[O-].[Na+]"])
def test_cas_structure_preserves_stereochemistry_and_salts(smiles: str) -> None:
    from app.services.chemistry import parse_structure
    from app.services.compound_lookup import lookup_cas

    parsed = parse_structure(smiles, "smiles")

    def fake_read(url: str) -> dict[str, object]:
        if "/property/" in url:
            assert "SMILES,InChIKey" in url
            return {
                "PropertyTable": {
                    "Properties": [
                        {
                            "CID": 123,
                            "IUPACName": "verified compound",
                            "MolecularFormula": parsed.molecular_formula,
                            "MolecularWeight": str(parsed.molecular_weight),
                            "IsomericSMILES": smiles,
                            "InChIKey": parsed.inchi_key,
                        }
                    ]
                }
            }
        return {"InformationList": {"Information": [{"CID": 123, "Synonym": ["64-17-5"]}]}}

    with patch("app.services.compound_lookup._read_json", side_effect=fake_read):
        candidate = lookup_cas("64-17-5")["candidates"][0]
    saved = parse_structure(candidate["structure_molfile"], "molfile")
    assert saved.inchi_key == parsed.inchi_key
    assert saved.smiles == parsed.smiles
    assert saved.molecular_formula == parsed.molecular_formula


@pytest.mark.parametrize(
    "smiles,key",
    [
        ("CCO", "WRONG-STRUCTURE-KEY"),
        ("not a molecule", "LFQSCWFLJHTTHZ-UHFFFAOYSA-N"),
        ("CCO", None),
    ],
)
def test_cas_structure_rejects_unverified_structure(smiles: str, key: str | None) -> None:
    from app.services.compound_lookup import lookup_cas

    def fake_read(url: str) -> dict[str, object]:
        if "/property/" in url:
            return {
                "PropertyTable": {
                    "Properties": [
                        {
                            "CID": 702,
                            "IUPACName": "ethanol",
                            "MolecularFormula": "C2H6O",
                            "MolecularWeight": "46.07",
                            "SMILES": smiles,
                            "InChIKey": key,
                        }
                    ]
                }
            }
        return {"InformationList": {"Information": [{"CID": 702, "Synonym": ["64-17-5"]}]}}

    with patch("app.services.compound_lookup._read_json", side_effect=fake_read):
        result = lookup_cas("64-17-5")
    assert result["candidates"][0]["name"] == "ethanol"
    assert not result["candidates"][0].get("structure_molfile")
    assert result["warnings"]


def test_existing_cas_structure_completion_preserves_associations_and_versions(
    client: TestClient,
) -> None:
    from app.services.chemistry import parse_structure

    parsed = parse_structure("CCO")
    candidate = {"structure_molfile": parsed.molfile, "source": "PubChem CAS 同义词匹配"}
    item = client.post(
        "/api/compounds",
        json={
            "name": "original name",
            "codename": "EtOH",
            "cas_number": "64-17-5",
            "cas_source": "手工核对",
            "molecular_formula": "C2H6O",
            "notes": "original notes",
            "physical_properties": [{"name": "Density", "value": "0.789", "source": "手工"}],
        },
    ).json()
    experiment = client.post(
        "/api/experiments",
        json={
            "title": "CAS structure link",
            "date": "2026-10-11",
        },
    ).json()
    reaction = client.post(
        f"/api/experiments/{experiment['id']}/reactions",
        json={
            "reaction_name": "CAS reaction",
        },
    ).json()
    component = client.post(
        f"/api/reactions/{reaction['id']}/components",
        json={
            "compound_id": item["id"],
            "role": "substrate",
            "amount": "92.14",
            "unit": "mg",
            "mmol": "2",
            "equivalents": "1",
        },
    ).json()
    path = f"/api/compounds/{item['id']}/structure/cas"
    with patch("app.api.compound_chemistry.lookup_cas", return_value={"candidates": [candidate]}):
        response = client.post(path, json={"expected_version": item["version"]})
    assert response.status_code == 200, response.text
    updated = response.json()
    for field in (
        "id",
        "name",
        "codename",
        "notes",
        "cas_number",
        "cas_source",
        "physical_properties",
        "tags",
        "created_at",
    ):
        assert updated[field] == item[field]
    assert updated["inchi_key"] == parsed.inchi_key
    assert updated["version"] == item["version"] + 1
    svg = client.get(f"/api/compounds/{item['id']}/structure.svg")
    assert svg.status_code == 200 and "<svg" in svg.text
    assert client.get(f"/api/reactions/{reaction['id']}/components").json()["items"] == [component]
    with patch("app.api.compound_chemistry.lookup_cas") as remote:
        assert client.post(path, json={"expected_version": item["version"]}).status_code == 409
        assert client.post(path, json={"expected_version": updated["version"]}).json() == updated
        remote.assert_not_called()


def test_cas_structure_completion_never_replaces_uncertain_identity(client: TestClient) -> None:
    from app.services.chemistry import parse_structure

    item = client.post(
        "/api/compounds",
        json={
            "name": "uncertain identity",
            "cas_number": "64-17-5",
            "molecular_formula": "CH4O",
        },
    ).json()
    ethanol = {"structure_molfile": parse_structure("CCO").molfile, "source": "PubChem"}
    path = f"/api/compounds/{item['id']}/structure/cas"
    for candidates in ([], [ethanol, ethanol], [{"source": "PubChem"}], [ethanol]):
        with patch(
            "app.api.compound_chemistry.lookup_cas", return_value={"candidates": candidates}
        ):
            response = client.post(path, json={"expected_version": item["version"]})
        assert response.status_code == 422, response.text
        assert client.get(f"/api/compounds/{item['id']}").json() == item
