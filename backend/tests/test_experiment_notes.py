"""Unified notes preserve legacy records and version checks."""

from fastapi.testclient import TestClient


def test_notes_preserve_legacy_and_summary(client: TestClient) -> None:
    legacy = {
        "procedure": "操作原文",
        "observation": "观察原文",
        "result": "结果原文",
        "conclusion": "结论原文",
    }
    response = client.post(
        "/api/experiments", json={"title": "旧实验", "date": "2026-10-11", **legacy}
    )
    assert response.status_code == 201
    source = response.json()
    assert source["notes"] is None
    result = client.patch(
        f"/api/experiments/{source['id']}", json={"expected_version": 1, "notes": "统一备注"}
    )
    assert result.status_code == 200
    saved = result.json()
    assert saved["notes"] == "统一备注"
    assert all(saved[key] == value for key, value in legacy.items())
    summary = client.get(f"/api/experiments/{source['id']}/summary?format=markdown").text
    assert "统一备注" in summary
    conflict = client.patch(
        f"/api/experiments/{source['id']}", json={"expected_version": 1, "notes": "过期"}
    )
    assert conflict.status_code == 409
    cleared = client.patch(
        f"/api/experiments/{source['id']}", json={"expected_version": saved["version"], "notes": ""}
    )
    assert cleared.status_code == 200 and cleared.json()["notes"] == ""
    assert all(cleared.json()[key] == value for key, value in legacy.items())
