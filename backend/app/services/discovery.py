"""Literal search, effective dashboard and deterministic rule-based summary."""

import hashlib
import json
from datetime import UTC, datetime
from decimal import ROUND_HALF_UP, Decimal
from typing import Any
from uuid import UUID

from sqlalchemy import func, or_, select, text
from sqlalchemy.orm import Session

from app.api.discovery_schema import DashboardOut, ReactionSummary, SummaryOut
from app.api.files_schema import FileOut
from app.api.lab_schema import ComponentOut, ReactionOut, SampleOut
from app.api.records_schema import ExperimentOut
from app.models import Compound, Experiment, FileAsset, Reaction, ReactionComponent, Sample
from app.repositories.records import escaped
from app.services import files, lab, records, visibility


def search(
    session: Session, q: str, experiment_page: int, compound_page: int, size: int
) -> dict[str, Any]:
    term = q.strip()
    pattern = f"%{escaped(term)}%"
    sections: dict[str, Any] = {}
    for model, fields, page in (
        (Experiment, ("title", "experiment_code"), experiment_page),
        (Compound, ("name", "codename", "cas_number", "smiles"), compound_page),
    ):
        predicates = [getattr(model, field).ilike(pattern, escape="\\") for field in fields]
        statement = select(model, *predicates).where(model.deleted_at.is_(None), or_(*predicates))
        total = session.scalar(select(func.count()).select_from(statement.subquery())) or 0
        rows = session.execute(
            statement.order_by(model.created_at.desc(), model.id.desc())
            .limit(size)
            .offset((page - 1) * size)
        ).all()
        items = []
        for row in rows:
            entity = row[0]
            output = records.output(session, entity)
            output["matched_fields"] = [
                field for field, matched in zip(fields, row[1:], strict=True) if matched
            ]
            items.append(output)
        sections["experiments" if model is Experiment else "compounds"] = {
            "items": items,
            "page": page,
            "page_size": size,
            "total": total,
        }
    return {"query": term, **sections}


def dashboard(session: Session) -> dict[str, Any]:
    experiments = select(Experiment).where(Experiment.deleted_at.is_(None))
    compounds = select(Compound).where(Compound.deleted_at.is_(None))
    samples = visibility.visible_samples()
    file_rows = session.scalars(
        visibility.visible_files()
        .order_by(FileAsset.uploaded_at.desc(), FileAsset.id.desc())
        .limit(5)
    ).all()
    recent = session.scalars(
        experiments.order_by(Experiment.created_at.desc(), Experiment.id.desc()).limit(5)
    ).all()
    return DashboardOut(
        experiment_count=session.scalar(select(func.count()).select_from(experiments.subquery()))
        or 0,
        compound_count=session.scalar(select(func.count()).select_from(compounds.subquery())) or 0,
        sample_count=session.scalar(select(func.count()).select_from(samples.subquery())) or 0,
        recent_experiments=[
            ExperimentOut.model_validate(records.output(session, row)) for row in recent
        ],
        recent_files=[FileOut.model_validate(files.file_output(row)) for row in file_rows],
    ).model_dump(mode="json")


def summary(session: Session, experiment_id: UUID) -> SummaryOut:
    # This must be the first SQL statement in this request's transaction.
    session.execute(text("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY"))
    experiment = session.scalar(
        select(Experiment).where(Experiment.id == experiment_id, Experiment.deleted_at.is_(None))
    )
    if experiment is None:
        raise records.missing()
    exp_out = ExperimentOut.model_validate(records.output(session, experiment))
    reaction_rows = session.scalars(
        visibility.visible_reactions()
        .where(Reaction.experiment_id == experiment_id)
        .order_by(Reaction.sort_order, Reaction.created_at, Reaction.id)
    ).all()
    reaction_groups: list[ReactionSummary] = []
    for reaction in reaction_rows:
        components = session.scalars(
            visibility.visible_components()
            .where(ReactionComponent.reaction_id == reaction.id)
            .order_by(
                ReactionComponent.sort_order, ReactionComponent.created_at, ReactionComponent.id
            )
        ).all()
        reaction_groups.append(
            ReactionSummary(
                reaction=ReactionOut.model_validate(lab.out(reaction)),
                components=[
                    ComponentOut.model_validate(lab.out(component)) for component in components
                ],
            )
        )
    samples = session.scalars(
        visibility.visible_samples()
        .where(Sample.experiment_id == experiment_id)
        .order_by(Sample.created_at, Sample.id)
    ).all()
    file_rows = session.scalars(
        visibility.visible_files()
        .where(FileAsset.experiment_id == experiment_id)
        .order_by(FileAsset.uploaded_at, FileAsset.id)
    ).all()
    content = {
        "experiment": exp_out.model_dump(mode="json"),
        "reactions": [
            {
                "reaction": group.reaction.model_dump(mode="json"),
                "components": [component.model_dump(mode="json") for component in group.components],
            }
            for group in reaction_groups
        ],
        "samples": [
            SampleOut.model_validate(lab.out(row)).model_dump(mode="json") for row in samples
        ],
        "files": [
            FileOut.model_validate(files.file_output(row)).model_dump(mode="json")
            for row in file_rows
        ],
    }
    canonical = json.dumps(content, sort_keys=True, ensure_ascii=False, separators=(",", ":"))
    revision = hashlib.sha256(canonical.encode("utf-8")).hexdigest()
    return SummaryOut.model_validate(
        {**content, "generated_at": datetime.now(UTC), "source_revision": revision}
    )


def markdown(summary: SummaryOut) -> str:
    experiment = summary.experiment

    def value(item: Any) -> str:
        return str(item) if item is not None and item != "" else "未记录"

    def decimal_value(item: Decimal | None) -> str:
        if item is None:
            return "未记录"
        rounded = item.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        if rounded == 0:
            return "0"
        text_value = format(rounded, "f")
        return text_value.rstrip("0").rstrip(".") if "." in text_value else text_value

    lines = [
        f"# {experiment.experiment_code} · {experiment.title}",
        f"日期：{experiment.date.isoformat()}  状态：{experiment.status}",
        f"生成时间：{summary.generated_at.isoformat()}",
        f"内容版本：{summary.source_revision}",
    ]
    for label, field in (
        ("目的", experiment.objective),
        ("操作", experiment.procedure),
        ("观察", experiment.observation),
        ("结果", experiment.result),
        ("结论", experiment.conclusion),
    ):
        lines.extend(["", f"## {label}", value(field)])
    lines.extend(["", "## 反应与组分"])
    if not summary.reactions:
        lines.append("未记录")
    for group in summary.reactions:
        reaction = group.reaction
        temperature = (
            reaction.temperature_description
            if reaction.temperature_description is not None
            else f"{decimal_value(reaction.temperature_c)} °C"
        )
        duration = (
            reaction.reaction_time_description
            if reaction.reaction_time_description is not None
            else f"{decimal_value(reaction.reaction_time_minutes)} min"
            if reaction.reaction_time_minutes is not None
            else f"{decimal_value(reaction.reaction_time_hours)} h"
        )
        lines.extend(
            [
                "",
                f"### {reaction.reaction_name}",
                f"温度：{temperature}；"
                f"时间：{duration}；"
                f"气氛：{value(reaction.atmosphere)}；溶剂：{value(reaction.solvent)}",
                f"后处理：{value(reaction.workup)}",
                f"纯化：{value(reaction.purification)}",
                f"备注：{value(reaction.notes)}",
            ]
        )
        if not group.components:
            lines.append("组分：未记录")
        for component in group.components:
            lines.append(
                f"- {component.role} · 化合物 {component.compound_id} · "
                f"数量 {decimal_value(component.amount)} {value(component.unit)} · "
                f"mmol {decimal_value(component.mmol)} · "
                f"当量 {decimal_value(component.equivalents)} · "
                f"收率 {decimal_value(component.yield_percent)}%"
            )
    lines.extend(["", "## 样品"])
    if not summary.samples:
        lines.append("未记录")
    for sample in summary.samples:
        lines.append(
            f"- {sample.sample_code} · {value(sample.name)} · {sample.sample_type} · "
            f"数量 {decimal_value(sample.amount)} {value(sample.unit)} · "
            f"浓度 {decimal_value(sample.concentration)} {value(sample.concentration_unit)}"
        )
    lines.extend(["", "## 文件"])
    if not summary.files:
        lines.append("未记录")
    for file in summary.files:
        lines.append(
            f"- {file.original_filename} · {file.file_type} · "
            f"{file.file_size} B · SHA256 {file.sha256}"
        )
    return "\n".join(lines) + "\n"
