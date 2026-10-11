"""Stage 03 API checks against the isolated PostgreSQL test service."""

from datetime import UTC, datetime
from uuid import UUID, uuid4

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.db.session import engine
from app.models import Reaction, ReactionComponent, Sample
from app.services.numbering import allocate_code


def test_crud_tags_and_relationships(client: TestClient) -> None:
    tag = client.post("/api/tags", json={"name": "  催化  "})
    assert tag.status_code == 201
    tag_data = tag.json()
    assert tag_data["name"] == "催化"
    duplicate = client.post("/api/tags", json={"name": "催化"})
    assert duplicate.status_code == 409
    other_tag = client.post("/api/tags", json={"name": "重复目标"}).json()
    assert (
        client.patch(
            f"/api/tags/{other_tag['id']}",
            json={"name": "催化", "expected_version": 1},
        ).status_code
        == 409
    )
    renamed = client.patch(
        f"/api/tags/{tag_data['id']}",
        json={"name": " 条件探索 ", "expected_version": tag_data["version"]},
    )
    assert renamed.status_code == 200
    tag_data = renamed.json()
    bad = client.post(
        "/api/experiments", json={"title": "非法", "date": "2026-09-23", "experiment_code": "FAKE"}
    )
    assert bad.status_code == 422
    experiment = client.post(
        "/api/experiments",
        json={"title": "  条件探索  ", "date": "2026-09-23", "tag_ids": [tag_data["id"]]},
    )
    assert experiment.status_code == 201, experiment.text
    exp = experiment.json()
    assert exp["experiment_code"].startswith("EXP-2026-")
    assert exp["title"] == "条件探索"
    assert exp["tags"][0]["name"] == "条件探索"
    compound = client.post(
        "/api/compounds",
        json={"name": "联苯", "molecular_weight": "154.21000000", "tag_ids": [tag_data["id"]]},
    )
    assert compound.status_code == 201, compound.text
    cmp = compound.json()
    assert cmp["molecular_weight"] == "154.21000000"
    assert (
        client.get("/api/compounds?sort=date_desc").json()
        == client.get("/api/compounds?sort=created_desc").json()
    )
    assert (
        client.get("/api/experiments?sort=created_desc").json()
        == client.get("/api/experiments?sort=date_desc").json()
    )
    relation = client.post(
        f"/api/experiments/{exp['id']}/compounds",
        json={"compound_id": cmp["id"], "expected_version": exp["version"]},
    )
    assert relation.status_code == 201, relation.text
    assert (
        client.post(
            f"/api/experiments/{exp['id']}/compounds",
            json={"compound_id": cmp["id"], "expected_version": exp["version"] + 1},
        ).status_code
        == 409
    )
    listed = client.get(f"/api/experiments/{exp['id']}/compounds?page=1&page_size=1")
    assert listed.status_code == 200, listed.text
    assert listed.json()["total"] == 1
    assert listed.json()["items"][0]["sources"] == ["explicit"]
    assert client.get(f"/api/compounds/{cmp['id']}/experiments").json()["total"] == 1
    assert client.delete(f"/api/compounds/{cmp['id']}?expected_version=1").status_code == 409
    assert (
        client.delete(
            f"/api/experiments/{exp['id']}/compounds/{cmp['id']}?expected_version=2"
        ).status_code
        == 204
    )
    assert client.get(f"/api/experiments/{exp['id']}/compounds").json()["total"] == 0
    assert client.delete(f"/api/compounds/{cmp['id']}?expected_version=1").status_code == 204
    assert client.get(f"/api/compounds/{cmp['id']}").status_code == 404
    assert (
        client.post(f"/api/compounds/{cmp['id']}/restore", json={"expected_version": 2}).status_code
        == 200
    )
    assert client.delete(f"/api/tags/{tag_data['id']}?expected_version=2").status_code == 204
    after_tag = client.get(f"/api/experiments/{exp['id']}").json()
    assert after_tag["tags"] == []
    assert after_tag["version"] == 4
    assert client.get(f"/api/compounds/{cmp['id']}").json()["version"] == 4


def test_stale_writes_and_atomic_tag_failure(client: TestClient) -> None:
    failed_create = client.post(
        "/api/experiments",
        json={"title": "不能留下半条", "date": "2026-09-23", "tag_ids": [str(uuid4())]},
    )
    assert failed_create.status_code == 422
    assert client.get("/api/experiments?q=不能留下半条").json()["total"] == 0
    response = client.post("/api/experiments", json={"title": "并发实验", "date": "2026-09-23"})
    assert response.status_code == 201
    item = response.json()
    first = client.patch(
        f"/api/experiments/{item['id']}",
        json={"expected_version": 1, "title": "第一次"},
    )
    assert first.status_code == 200
    stale = client.patch(
        f"/api/experiments/{item['id']}",
        json={"expected_version": 1, "title": "不应覆盖"},
    )
    assert stale.status_code == 409
    assert client.get(f"/api/experiments/{item['id']}").json()["title"] == "第一次"
    assert (
        client.patch(
            f"/api/experiments/{item['id']}",
            json={"expected_version": 2, "status": None},
        ).status_code
        == 422
    )
    assert (
        client.post(
            "/api/compounds", json={"name": "非法分子量", "molecular_weight": 12.34}
        ).status_code
        == 422
    )
    failed = client.patch(
        f"/api/experiments/{item['id']}",
        json={"expected_version": 2, "title": "不应保存", "tag_ids": [str(uuid4())]},
    )
    assert failed.status_code == 422
    assert client.get(f"/api/experiments/{item['id']}").json()["title"] == "第一次"
    assert client.delete(f"/api/experiments/{item['id']}?expected_version=2").status_code == 204
    assert client.get(f"/api/experiments/{item['id']}").status_code == 404
    assert (
        client.post(
            f"/api/experiments/{item['id']}/restore", json={"expected_version": 3}
        ).status_code
        == 200
    )


def test_compound_reference_checks_include_sample_and_reaction(client: TestClient) -> None:
    exp = client.post("/api/experiments", json={"title": "引用检查", "date": "2026-09-23"}).json()
    cmp = client.post("/api/compounds", json={"name": "引用目标"}).json()
    with Session(engine) as session:
        sample = Sample(
            sample_code=allocate_code(session, "SMP"),
            experiment_id=UUID(exp["id"]),
            compound_id=UUID(cmp["id"]),
            sample_type="固体",
        )
        session.add(sample)
        session.commit()
        sample_id = sample.id
    assert client.delete(f"/api/compounds/{cmp['id']}?expected_version=1").status_code == 409
    linked = client.post(
        f"/api/experiments/{exp['id']}/compounds",
        json={"compound_id": cmp["id"], "expected_version": 1},
    )
    assert linked.status_code == 201
    assert (
        client.delete(
            f"/api/experiments/{exp['id']}/compounds/{cmp['id']}?expected_version=2"
        ).status_code
        == 204
    )
    assert client.get(f"/api/experiments/{exp['id']}/compounds").json()["items"][0]["sources"] == [
        "sample"
    ]
    with Session(engine) as session:
        sample = session.get(Sample, sample_id)
        assert sample is not None
        sample.deleted_at = datetime.now(UTC)
        reaction = Reaction(experiment_id=UUID(exp["id"]), reaction_name="测试反应")
        session.add(reaction)
        session.flush()
        session.add(
            ReactionComponent(reaction_id=reaction.id, compound_id=UUID(cmp["id"]), role="product")
        )
        session.commit()
    assert client.delete(f"/api/compounds/{cmp['id']}?expected_version=1").status_code == 409
    sources = client.get(f"/api/experiments/{exp['id']}/compounds").json()["items"][0]["sources"]
    assert sources == ["reaction"]


def test_experiment_restore_waits_for_compound(client: TestClient) -> None:
    exp = client.post("/api/experiments", json={"title": "恢复顺序", "date": "2026-09-23"}).json()
    cmp = client.post("/api/compounds", json={"name": "恢复目标"}).json()
    assert (
        client.post(
            f"/api/experiments/{exp['id']}/compounds",
            json={"compound_id": cmp["id"], "expected_version": 1},
        ).status_code
        == 201
    )
    assert client.delete(f"/api/experiments/{exp['id']}?expected_version=2").status_code == 204
    assert client.get(f"/api/experiments/{exp['id']}").status_code == 404
    assert client.delete(f"/api/compounds/{cmp['id']}?expected_version=1").status_code == 204
    blocked = client.post(f"/api/experiments/{exp['id']}/restore", json={"expected_version": 3})
    assert blocked.status_code == 409
    assert (
        client.post(f"/api/compounds/{cmp['id']}/restore", json={"expected_version": 2}).status_code
        == 200
    )
    assert (
        client.post(
            f"/api/experiments/{exp['id']}/restore", json={"expected_version": 3}
        ).status_code
        == 200
    )


def test_bulk_compound_tag_is_atomic_and_preserves_existing_tags(client: TestClient) -> None:
    old_tag = client.post("/api/tags", json={"name": "旧分类"}).json()
    compounds = [
        client.post(
            "/api/compounds", json={"name": f"批量化合物{i}", "tag_ids": [old_tag["id"]]}
        ).json()
        for i in range(2)
    ]
    selection = [{"id": c["id"], "expected_version": c["version"]} for c in compounds]
    response = client.post(
        "/api/compounds/bulk-tag", json={"name": " Batch ", "compounds": selection}
    )
    assert response.status_code == 200, response.text
    assert response.json()["selected_count"] == 2
    tag = response.json()["tag"]
    for c in compounds:
        updated = client.get(f"/api/compounds/{c['id']}").json()
        assert {t["id"] for t in updated["tags"]} == {old_tag["id"], tag["id"]}
        assert updated["version"] == c["version"] + 1
    selection = [{"id": c["id"], "expected_version": c["version"] + 1} for c in compounds]
    repeat = client.post("/api/compounds/bulk-tag", json={"name": "batch", "compounds": selection})
    assert repeat.status_code == 200
    assert repeat.json()["tag"]["id"] == tag["id"]
    assert client.get(f"/api/compounds/{compounds[0]['id']}").json()["version"] == 2
    stale = [dict(selection[0]), {"id": compounds[1]["id"], "expected_version": 1}]
    assert (
        client.post(
            "/api/compounds/bulk-tag", json={"name": "不应创建", "compounds": stale}
        ).status_code
        == 409
    )
    assert client.get("/api/tags?q=不应创建").json()["total"] == 0
    assert len(client.get(f"/api/compounds/{compounds[0]['id']}").json()["tags"]) == 2
    assert (
        client.post(
            "/api/compounds/bulk-tag",
            json={"name": "重复", "compounds": [selection[0], selection[0]]},
        ).status_code
        == 422
    )
    assert (
        client.post("/api/compounds/bulk-tag", json={"name": "空选", "compounds": []}).status_code
        == 422
    )
    client.delete(f"/api/compounds/{compounds[1]['id']}?expected_version=2")
    assert (
        client.post(
            "/api/compounds/bulk-tag", json={"name": "已删除", "compounds": selection}
        ).status_code
        == 404
    )
    assert client.get("/api/tags?q=已删除").json()["total"] == 0
