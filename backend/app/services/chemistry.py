"""Local, deterministic structure parsing and depiction."""

from dataclasses import dataclass
from decimal import Decimal
from typing import Literal

from rdkit import Chem
from rdkit.Chem import Descriptors, rdDepictor, rdMolDescriptors
from rdkit.Chem.Draw import rdMolDraw2D

from app.services.records import RecordError

StructureFormat = Literal["auto", "smiles", "molfile", "cdxml"]


@dataclass(frozen=True)
class StructureResult:
    molfile: str
    smiles: str
    molecular_formula: str
    molecular_weight: Decimal
    exact_mass: Decimal
    inchi_key: str
    svg: str


def parse_structure(value: str, format: StructureFormat = "auto") -> StructureResult:
    if not value.strip() or len(value.encode("utf-8")) > 100_000:
        raise RecordError(422, "INVALID_STRUCTURE", "结构内容为空或超过 100 KB")
    if format == "auto":
        if "<CDXML" in value[:500] or "<cdxml" in value[:500]:
            format = "cdxml"
        elif "M  END" in value or "V2000" in value or "V3000" in value:
            format = "molfile"
        else:
            format = "smiles"
    try:
        if format == "cdxml":
            molecules = [item for item in Chem.MolsFromCDXML(value) if item is not None]
            if len(molecules) != 1:
                raise RecordError(
                    422,
                    "INVALID_STRUCTURE",
                    "CDXML 中须恰好包含一个化合物结构；请只选中目标结构复制",
                )
            molecule = molecules[0]
        elif format == "molfile":
            if "$$$$" in value:
                raise RecordError(
                    422, "INVALID_STRUCTURE", "请一次导入一个分子；多记录 SDF 暂不支持"
                )
            molecule = Chem.MolFromMolBlock(
                value, sanitize=True, removeHs=False, strictParsing=True
            )
        else:
            molecule = Chem.MolFromSmiles(value.strip())
        if molecule is None or molecule.GetNumAtoms() == 0 or molecule.GetNumAtoms() > 500:
            raise RecordError(422, "INVALID_STRUCTURE", "结构无法解析，或原子数超过 500")
        if any(atom.HasQuery() for atom in molecule.GetAtoms()):
            raise RecordError(
                422, "INVALID_STRUCTURE", "含 R 基或查询原子的结构暂不能作为单一化合物保存"
            )
        smiles = Chem.MolToSmiles(molecule, isomericSmiles=True)
        formula = rdMolDescriptors.CalcMolFormula(molecule)
        weight = Decimal(str(round(Descriptors.MolWt(molecule), 4)))  # type: ignore[attr-defined]
        exact_mass = Decimal(str(round(Descriptors.ExactMolWt(molecule), 6)))  # type: ignore[attr-defined]
        inchi_key = Chem.MolToInchiKey(molecule)  # type: ignore[no-untyped-call]
        if not inchi_key:
            raise RecordError(422, "INVALID_STRUCTURE", "无法生成结构标识；请检查化合物结构")
        if molecule.GetNumConformers() == 0:
            rdDepictor.Compute2DCoords(molecule)
        drawer = rdMolDraw2D.MolDraw2DSVG(420, 280)
        drawer.drawOptions().padding = 0.08  # type: ignore[assignment]
        rdMolDraw2D.PrepareAndDrawMolecule(drawer, molecule)
        drawer.FinishDrawing()
        return StructureResult(
            molfile=Chem.MolToMolBlock(molecule),
            smiles=smiles,
            molecular_formula=formula,
            molecular_weight=weight,
            exact_mass=exact_mass,
            inchi_key=inchi_key,
            svg=drawer.GetDrawingText(),
        )
    except RecordError:
        raise
    except Exception as exc:
        raise RecordError(
            422, "INVALID_STRUCTURE", "结构无法解析；请尝试从 ChemDraw 复制为 MOL 或 SMILES"
        ) from exc
