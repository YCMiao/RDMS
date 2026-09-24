"""Structure import and explicit external lookup on the isolated test database."""

from types import SimpleNamespace
from unittest.mock import patch

from fastapi.testclient import TestClient
from rdkit import Chem

from app.services.compound_lookup import lookup


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
