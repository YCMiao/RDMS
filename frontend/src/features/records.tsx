import { TrashPanel } from "./trash"
import { SummaryPanel } from "./discovery"
import { ExperimentFiles } from "./files"
import { ExperimentLab } from "./lab"
import { CompoundStructurePanel } from "./compound-chemistry"
import { useEffect, useRef, useState, type FormEvent } from "react"
import { Link, useNavigate, useParams } from "react-router-dom"

import { Button } from "../components/ui/button"
import { formatMass } from "../lib/format-mass"
import type { components } from "../types/api.generated"
import {
  ApiError, request, query,
  type Compound, type CompoundInput, type Experiment, type ExperimentInput,
  type ExperimentRelation, type Page, type Relation, type Tag,
} from "../services/records"

type Kind = "experiments" | "compounds"
type RecordItem = Experiment | Compound

function message(error: unknown): string {
  return error instanceof Error ? error.message : "操作失败，请稍后重试"
}

function Notice({ text }: { text: string }) {
  return <p className="form-notice" role="alert">{text}</p>
}

function PageNav({ page, total, size, onPage }: { page: number; total: number; size: number; onPage: (page: number) => void }) {
  return <div className="page-nav"><span>第 {page} 页 · 共 {total} 条</span><Button type="button" variant="outline" disabled={page <= 1} onClick={() => onPage(page - 1)}>上一页</Button><Button type="button" variant="outline" disabled={page * size >= total} onClick={() => onPage(page + 1)}>下一页</Button></div>
}

export function RecordList({ kind }: { kind: Kind }) {
  const [data, setData] = useState<Page<RecordItem> | null>(null)
  const [q, setQ] = useState("")
  const [search, setSearch] = useState("")
  const [page, setPage] = useState(1)
  const [sort, setSort] = useState(kind === "experiments" ? "date_desc" : "created_desc")
  const [status, setStatus] = useState("")
  const [dateFrom, setDateFrom] = useState("")
  const [dateTo, setDateTo] = useState("")
  const [tagId, setTagId] = useState("")
  const [tags, setTags] = useState<Tag[]>([])
  const [error, setError] = useState("")
  const [createOpen, setCreateOpen] = useState(false)
  useEffect(() => { void request<Page<Tag>>("/tags?page_size=100").then(result => setTags(result.items)).catch(() => undefined) }, [])
  useEffect(() => {
    let live = true
    setData(null); setError("")
    const path = `/${kind}?${query({ q: search, page, page_size: 25, sort, tag_id: tagId, ...(kind === "experiments" ? { status, date_from: dateFrom, date_to: dateTo } : {}) })}`
    void request<Page<RecordItem>>(path).then(result => { if (live) setData(result) }).catch(reason => { if (live) setError(message(reason)) })
    return () => { live = false }
  }, [kind, search, page, sort, status, dateFrom, dateTo, tagId])
  const experiment = kind === "experiments"
  return <main className="records-page">
    <div className="page-heading"><div><span className="eyebrow">RDMS / {experiment ? "Experiments" : "Compounds"}</span><h1>{experiment ? "实验记录" : "化合物"}</h1><p>{experiment ? "按日期整理研究过程和结论。" : "从结构建档，追踪 CAS、理化资料与实验来源。"}</p></div>{experiment ? <Button asChild><Link to="/experiments/new">新建实验</Link></Button> : <div className="heading-actions"><Button asChild><Link to="/compounds/import">从结构新建</Link></Button><Button variant="outline" onClick={() => setCreateOpen(true)}>新建化合物</Button></div>}</div>
    <form className="filter-bar" onSubmit={event => { event.preventDefault(); setPage(1); setSearch(q) }}>
      <label>关键词<input value={q} onChange={event => setQ(event.target.value)} placeholder={experiment ? "标题或编号" : "名称、编号、CAS 或 SMILES"} /></label>
      <Button type="submit" variant="outline">搜索</Button>
      <label>标签<select value={tagId} onChange={event => { setTagId(event.target.value); setPage(1) }}><option value="">全部</option>{tags.map(tag => <option key={tag.id} value={tag.id}>{tag.name}</option>)}</select></label>
      {experiment && <><label>状态<select value={status} onChange={event => { setStatus(event.target.value); setPage(1) }}><option value="">全部</option><option value="draft">草稿</option><option value="in_progress">进行中</option><option value="completed">已完成</option><option value="cancelled">已取消</option></select></label><label>起始日期<input type="date" value={dateFrom} onChange={event => { setDateFrom(event.target.value); setPage(1) }} /></label><label>结束日期<input type="date" value={dateTo} onChange={event => { setDateTo(event.target.value); setPage(1) }} /></label></>}
      <label>排序<select value={sort} onChange={event => { setSort(event.target.value); setPage(1) }}>{experiment ? <><option value="date_desc">日期从近到远</option><option value="date_asc">日期从远到近</option></> : <><option value="created_desc">最新创建</option><option value="name_asc">名称排序</option></>}</select></label>
    </form>
    {error && <Notice text={error} />}
    {!data && !error && <p className="loading-state">正在载入记录…</p>}
    {data && (data.items.length ? <><div className="table-scroll"><table><thead><tr><th>编号</th><th>{experiment ? "标题" : "名称"}</th><th>{experiment ? "日期" : "分子式"}</th><th>{experiment ? "状态" : "分子量 (g/mol)"}</th>{!experiment && <th>CAS</th>}<th>标签</th></tr></thead><tbody>{data.items.map(item => <tr key={item.id}><td className="code-cell"><Link to={`/${kind}/${item.id}`}>{experiment ? (item as Experiment).experiment_code : (item as Compound).compound_code}</Link></td><td><Link to={`/${kind}/${item.id}`}>{experiment ? (item as Experiment).title : (item as Compound).name}</Link></td><td>{experiment ? (item as Experiment).date : (item as Compound).molecular_formula || "—"}</td><td>{experiment ? statusLabel((item as Experiment).status) : formatMass((item as Compound).molecular_weight, 2) || "—"}</td>{!experiment && <td>{(item as Compound).cas_number || "—"}</td>}<td>{item.tags.map(tag => tag.name).join("、") || "—"}</td></tr>)}</tbody></table></div><PageNav page={page} total={data.total} size={25} onPage={setPage} /></> : <div className="blank-card"><h2>{search ? "没有匹配的记录" : "这里还没有记录"}</h2><p>可以调整搜索条件，或创建第一条{experiment ? "实验" : "化合物"}。</p>{experiment ? <Button asChild><Link to="/experiments/new">新建记录</Link></Button> : <Button asChild><Link to="/compounds/import">从结构新建</Link></Button>}</div>)}
    {createOpen && <CompoundCreateDialog onClose={() => setCreateOpen(false)} />}
  </main>
}

function CompoundCreateDialog({ onClose }: { onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const navigate = useNavigate()
  const [name, setName] = useState("")
  const [smiles, setSmiles] = useState("")
  const [formula, setFormula] = useState("")
  const [weight, setWeight] = useState("")
  const [notes, setNotes] = useState("")
  const [tagIds, setTagIds] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const dirty = Boolean(name || smiles || formula || weight || notes || tagIds.length)
  useEffect(() => { if (dialog.current && !dialog.current.open) dialog.current.showModal() }, [])
  function close() { if (!busy && (!dirty || window.confirm("未保存的内容将丢失，确定关闭？"))) dialog.current?.close() }
  async function submit(event: FormEvent) {
    event.preventDefault(); if (busy) return
    setBusy(true); setError("")
    const body: CompoundInput = { name, smiles: smiles || null, molecular_formula: formula || null, molecular_weight: weight || null, notes: notes || null, tag_ids: tagIds }
    try { const created = await request<Compound>("/compounds", { method: "POST", body: JSON.stringify(body) }); navigate(`/compounds/${created.id}`) }
    catch (reason) { setError(message(reason)) }
    finally { setBusy(false) }
  }
  return <dialog ref={dialog} className="record-dialog" aria-labelledby="compound-dialog-title" onClose={onClose} onCancel={event => { if (busy || (dirty && !window.confirm("未保存的内容将丢失，确定关闭？"))) event.preventDefault() }}><div className="dialog-heading"><div><span className="eyebrow">NEW COMPOUND</span><h2 id="compound-dialog-title">新建化合物</h2><p>保存后由服务器分配编号。</p></div><Button type="button" variant="outline" disabled={busy} onClick={close}>关闭</Button></div>{error && <Notice text={error} />}<form className="record-form" onSubmit={event => void submit(event)}><div className="form-grid"><label>名称 <span>*</span><input autoFocus required maxLength={300} value={name} onChange={event => setName(event.target.value)} /></label><label>分子式<input maxLength={200} value={formula} onChange={event => setFormula(event.target.value)} /></label><label className="wide-field">SMILES<input maxLength={10000} value={smiles} onChange={event => setSmiles(event.target.value)} /></label><label>分子量 (g/mol)<input inputMode="decimal" value={weight} onChange={event => setWeight(event.target.value)} placeholder="例如 154.21" /></label><label className="wide-field">备注<textarea rows={3} value={notes} onChange={event => setNotes(event.target.value)} /></label><TagPicker selected={tagIds} onChange={setTagIds} initial={[]} /></div><div className="form-actions"><Button type="submit" disabled={busy}>{busy ? "保存中…" : "创建并分配编号"}</Button></div></form></dialog>
}

function statusLabel(status: string): string {
  return ({ draft: "草稿", in_progress: "进行中", completed: "已完成", cancelled: "已取消" } as Record<string, string>)[status] || status
}

function TagPicker({ selected, onChange, initial }: { selected: string[]; onChange: (ids: string[]) => void; initial: Tag[] }) {
  const [q, setQ] = useState("")
  const [term, setTerm] = useState("")
  const [page, setPage] = useState(1)
  const [data, setData] = useState<Page<Tag> | null>(null)
  const [error, setError] = useState("")
  const [seen, setSeen] = useState<Record<string, string>>({})
  const known = new Map([...initial.map(tag => [tag.id, tag.name] as const), ...Object.entries(seen)])
  useEffect(() => { void request<Page<Tag>>(`/tags?${query({ q: term, page, page_size: 20 })}`).then(result => { setData(result); setSeen(current => ({ ...current, ...Object.fromEntries(result.items.map(tag => [tag.id, tag.name])) })) }).catch(reason => setError(message(reason))) }, [term, page])
  return <fieldset className="picker"><legend>标签</legend><div className="picker-search"><input aria-label="搜索标签" placeholder="搜索标签" value={q} onChange={event => setQ(event.target.value)} /><Button type="button" variant="outline" onClick={() => { setTerm(q); setPage(1) }}>查找</Button></div>{error && <Notice text={error} />}{data && <><div className="choice-list">{data.items.map(tag => <label key={tag.id}><input type="checkbox" checked={selected.includes(tag.id)} onChange={event => onChange(event.target.checked ? [...selected, tag.id] : selected.filter(id => id !== tag.id))} />{tag.name}</label>)}</div><PageNav page={page} total={data.total} size={20} onPage={setPage} /></>}<p className="helper">管理标签请前往设置。已选择 {selected.length} 个：{selected.map(id => known.get(id) || "已选标签").join("、") || "无"}。</p></fieldset>
}

export function RecordEditor({ kind }: { kind: Kind }) {
  const { id } = useParams()
  const navigate = useNavigate()
  const isNew = !id || id === "new"
  const experiment = kind === "experiments"
  const [record, setRecord] = useState<RecordItem | null>(null)
  const [form, setForm] = useState<Record<string, string>>({})
  const [weightTouched, setWeightTouched] = useState(false)
  const [tagIds, setTagIds] = useState<string[]>([])
  const [dirty, setDirty] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [fields, setFields] = useState<Record<string, string>>({})
  const [deleted, setDeleted] = useState(false)
  const [version, setVersion] = useState(1)
  useEffect(() => {
    if (isNew) { setForm(experiment ? { title: "", date: new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()), status: "draft" } : { name: "" }); setWeightTouched(false); return }
    void request<RecordItem>(`/${kind}/${id}`).then(item => { setRecord(item); setForm(Object.fromEntries(Object.entries(item).filter(([, value]) => typeof value === "string" || value === null).map(([key, value]) => [key, value ?? ""])) as Record<string, string>); setTagIds(item.tags.map(tag => tag.id)); setVersion(item.version); setDirty(false); setWeightTouched(false) }).catch(reason => setError(message(reason)))
  }, [id, isNew, kind, experiment])
  useEffect(() => { const handler = (event: BeforeUnloadEvent) => { if (dirty) event.preventDefault() }; window.addEventListener("beforeunload", handler); return () => window.removeEventListener("beforeunload", handler) }, [dirty])
  useEffect(() => {
    if (!dirty) return
    const confirmNavigation = (event: MouseEvent) => {
      if (!(event.target instanceof Element)) return
      const link = event.target.closest("a[href]")
      if (!link || link.getAttribute("href")?.startsWith("#")) return
      const destination = new URL(link.getAttribute("href") || "", window.location.href)
      if (destination.origin === window.location.origin && destination.pathname !== window.location.pathname && !window.confirm("有未保存的修改，确定离开？")) {
        event.preventDefault()
        event.stopPropagation()
      }
    }
    document.addEventListener("click", confirmNavigation, true)
    return () => document.removeEventListener("click", confirmNavigation, true)
  }, [dirty])
  function set(field: string, value: string) { setForm(current => ({ ...current, [field]: value })); if (field === "molecular_weight") setWeightTouched(true); setDirty(true) }
  function setTags(ids: string[]) { setTagIds(ids); setDirty(true) }
  async function save(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(""); setFields({})
    const body = experiment
      ? { title: form.title, date: form.date, status: (form.status || "draft") as ExperimentInput["status"], objective: form.objective || null, procedure: form.procedure || null, observation: form.observation || null, result: form.result || null, conclusion: form.conclusion || null, tag_ids: tagIds } satisfies ExperimentInput
      : { name: form.name, smiles: form.smiles || null, molecular_formula: form.molecular_formula || null, molecular_weight: form.molecular_weight || null, notes: form.notes || null, tag_ids: tagIds } satisfies CompoundInput
    try {
      const item = await request<RecordItem>(`/${kind}${isNew ? "" : `/${id}`}`, { method: isNew ? "POST" : "PATCH", body: JSON.stringify(isNew ? body : { ...body, expected_version: version }) })
      setDirty(false); setVersion(item.version); setRecord(item); setWeightTouched(false)
      if (isNew) navigate(`/${kind}/${item.id}`)
      else { setForm(current => ({ ...current })); setError("已保存") }
    } catch (reason) {
      setError(message(reason))
      if (reason instanceof ApiError) setFields(Object.fromEntries(reason.fields.map(field => [field.field.split(".").at(-1) || field.field, field.message])))
    } finally { setBusy(false) }
  }
  async function remove() {
    if (!record || !window.confirm(experiment ? "删除后实验及其子记录会隐藏；原始文件仍保留，可恢复。确定删除？" : "确定删除此化合物？仍被有效记录引用时不能删除。")) return
    setBusy(true); setError("")
    try { await request<void>(`/${kind}/${record.id}?expected_version=${version}`, { method: "DELETE" }); setDeleted(true); setVersion(version + 1); setDirty(false) } catch (reason) { setError(message(reason)) } finally { setBusy(false) }
  }
  async function restore() {
    if (!record) return
    setBusy(true); setError("")
    try { const item = await request<RecordItem>(`/${kind}/${record.id}/restore`, { method: "POST", body: JSON.stringify({ expected_version: version }) }); setRecord(item); setVersion(item.version); setDeleted(false) } catch (reason) { setError(message(reason)) } finally { setBusy(false) }
  }
  if (!isNew && !record && !error) return <main className="records-page"><p className="loading-state">正在载入记录…</p></main>
  const hasStructure = !experiment && Boolean((record as Compound | null)?.structure_molfile)
  return <main className="records-page editor-page"><div className="page-heading"><div><span className="eyebrow">{experiment ? "EXPERIMENT" : "COMPOUND"} / {isNew ? "NEW" : (experiment ? (record as Experiment)?.experiment_code : (record as Compound)?.compound_code)}</span><h1>{isNew ? `新建${experiment ? "实验" : "化合物"}` : experiment ? (record as Experiment)?.title : (record as Compound)?.name}</h1><p>{isNew ? "保存后由服务器分配唯一编号。" : `版本 ${version} · 创建于 ${record?.created_at.slice(0, 10)}`}</p></div><Link className="text-link" to={`/${kind}`}>返回列表</Link></div>
    {error && <Notice text={error} />}
    {!isNew && !deleted && record && experiment && <ExperimentLab experimentId={record.id} />}
    {deleted ? <div className="blank-card"><h2>记录已移入回收状态</h2><p>普通列表和详情已隐藏该记录。</p><Button onClick={() => void restore()} disabled={busy}>恢复记录</Button></div> : <form className={`record-form${experiment ? " experiment-metadata" : ""}`} onSubmit={event => void save(event)}><div className="form-grid">
      {experiment ? <><label>标题 <span>*</span><input required maxLength={300} value={form.title || ""} onChange={event => set("title", event.target.value)} />{fields.title && <small role="alert">{fields.title}</small>}</label><label>日期 <span>*</span><input required type="date" value={form.date || ""} onChange={event => set("date", event.target.value)} />{fields.date && <small role="alert">{fields.date}</small>}</label><label>状态<select value={form.status || "draft"} onChange={event => set("status", event.target.value)}><option value="draft">草稿</option><option value="in_progress">进行中</option><option value="completed">已完成</option><option value="cancelled">已取消</option></select></label><label className="wide-field">目的<textarea maxLength={100000} rows={2} value={form.objective || ""} onChange={event => set("objective", event.target.value)} />{fields.objective && <small role="alert">{fields.objective}</small>}</label><details className="experiment-notes wide-field"><summary>操作记录、观察与结论</summary><div className="experiment-notes-grid">{([ ["procedure", "加料与反应操作"], ["observation", "观察"], ["result", "结果"], ["conclusion", "结论"] ] as const).map(([key, label]) => <label key={key}>{label}<textarea maxLength={100000} rows={3} value={form[key] || ""} onChange={event => set(key, event.target.value)} />{fields[key] && <small role="alert">{fields[key]}</small>}</label>)}</div></details></> : <><label>名称 <span>*</span><input required maxLength={300} value={form.name || ""} onChange={event => set("name", event.target.value)} />{fields.name && <small role="alert">{fields.name}</small>}</label><label>分子式<input readOnly={hasStructure} maxLength={200} value={form.molecular_formula || ""} onChange={event => set("molecular_formula", event.target.value)} /></label><label className="wide-field">SMILES<input readOnly={hasStructure} maxLength={10000} value={form.smiles || ""} onChange={event => set("smiles", event.target.value)} /></label><label>分子量 (g/mol)<input readOnly={hasStructure} inputMode="decimal" value={weightTouched ? form.molecular_weight || "" : formatMass(form.molecular_weight, 2)} onChange={event => set("molecular_weight", event.target.value)} placeholder="例如 154.21" />{fields.molecular_weight && <small role="alert">{fields.molecular_weight}</small>}</label>{hasStructure && <p className="helper wide-field">分子式、SMILES 和分子量由结构计算；如需修改，请使用下方“替换结构”。</p>}<label className="wide-field">备注<textarea rows={5} value={form.notes || ""} onChange={event => set("notes", event.target.value)} /></label></>}
      <TagPicker selected={tagIds} onChange={setTags} initial={record?.tags || []} />
    </div><div className="form-actions"><Button type="submit" disabled={busy}>{busy ? "保存中…" : isNew ? "创建并分配编号" : "保存修改"}</Button>{!isNew && <Button type="button" variant="outline" disabled={busy} onClick={() => void remove()}>删除记录</Button>}</div></form>}
    {!isNew && !deleted && record && (experiment ? <><ExperimentLinks item={record as Experiment} onVersion={setVersion} /><ExperimentFiles experimentId={record.id} /><SummaryPanel experimentId={record.id} experimentCode={(record as Experiment).experiment_code} /></> : <><CompoundStructurePanel item={record as Compound} /><CompoundLinks item={record as Compound} /></>)}
  </main>
}

function ExperimentLinks({ item, onVersion }: { item: Experiment; onVersion: (version: number) => void }) {
  const [data, setData] = useState<Page<Relation> | null>(null)
  const [page, setPage] = useState(1)
  const [term, setTerm] = useState("")
  const [options, setOptions] = useState<Page<Compound> | null>(null)
  const [optionPage, setOptionPage] = useState(1)
  const [selected, setSelected] = useState("")
  const [version, setVersion] = useState(item.version)
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  const [revision, setRevision] = useState(0)
  useEffect(() => { setVersion(item.version) }, [item.version])
  useEffect(() => { void request<Page<Relation>>(`/experiments/${item.id}/compounds?${query({ page, page_size: 10 })}`).then(setData).catch(reason => setError(message(reason))) }, [item.id, page, revision])
  useEffect(() => { void request<Page<Compound>>(`/compounds?${query({ q: term, page: optionPage, page_size: 10 })}`).then(setOptions).catch(reason => setError(message(reason))) }, [term, optionPage])
  async function link(removeId?: string) {
    if (busy) return
    setBusy(true); setError("")
    try {
      await request<void>(`/experiments/${item.id}/compounds${removeId ? `/${removeId}?expected_version=${version}` : ""}`, removeId ? { method: "DELETE" } : { method: "POST", body: JSON.stringify({ compound_id: selected, expected_version: version }) })
      setVersion(version + 1); onVersion(version + 1); setRevision(current => current + 1); setSelected("")
    } catch (reason) { setError(message(reason)) } finally { setBusy(false) }
  }
  return <section className="relation-section"><h2>相关化合物</h2><p className="helper">显式关联可解除；样品和反应来源会独立保留。</p>{error && <Notice text={error} />}
    <div className="relation-picker"><label>查找已有化合物<input value={term} onChange={event => { setTerm(event.target.value); setOptionPage(1) }} placeholder="名称、编号或 SMILES" /></label><label>选择化合物<select value={selected} onChange={event => setSelected(event.target.value)}><option value="">请选择</option>{options?.items.map(compound => <option key={compound.id} value={compound.id}>{compound.compound_code} · {compound.name}</option>)}</select></label><Button type="button" disabled={!selected || busy} onClick={() => void link()}>建立关联</Button></div>{options && <PageNav page={optionPage} total={options.total} size={10} onPage={setOptionPage} />}
    {data && (data.items.length ? <><div className="table-scroll"><table><thead><tr><th>编号</th><th>名称</th><th>来源</th><th>操作</th></tr></thead><tbody>{data.items.map(row => <tr key={row.compound.id}><td><Link to={`/compounds/${row.compound.id}`}>{row.compound.compound_code}</Link></td><td>{row.compound.name}</td><td>{row.sources.join("、")}</td><td>{row.sources.includes("explicit") && <Button type="button" variant="outline" disabled={busy} onClick={() => void link(row.compound.id)}>解除显式关联</Button>}</td></tr>)}</tbody></table></div><PageNav page={page} total={data.total} size={10} onPage={setPage} /></> : <p className="helper">暂无相关化合物。</p>)}
  </section>
}

function CompoundLinks({ item }: { item: Compound }) {
  const [data, setData] = useState<Page<ExperimentRelation> | null>(null)
  const [page, setPage] = useState(1)
  const [error, setError] = useState("")
  useEffect(() => { void request<Page<ExperimentRelation>>(`/compounds/${item.id}/experiments?${query({ page, page_size: 10 })}`).then(setData).catch(reason => setError(message(reason))) }, [item.id, page])
  return <><section className="relation-section"><h2>参与实验</h2>{error && <Notice text={error} />}{data && (data.items.length ? <><div className="table-scroll"><table><thead><tr><th>编号</th><th>标题</th><th>来源</th></tr></thead><tbody>{data.items.map(row => <tr key={row.experiment.id}><td><Link to={`/experiments/${row.experiment.id}`}>{row.experiment.experiment_code}</Link></td><td>{row.experiment.title}</td><td>{row.sources.join("、")}</td></tr>)}</tbody></table></div><PageNav page={page} total={data.total} size={10} onPage={setPage} /></> : <p className="helper">暂无关联实验。</p>)}</section><CompoundDerived item={item} kind="reactions" /><CompoundDerived item={item} kind="samples" /></>
}

type ReactionBrief = components["schemas"]["ReactionBrief"]
type SampleBrief = components["schemas"]["SampleBrief"]

function CompoundDerived({ item, kind }: { item: Compound; kind: "reactions" | "samples" }) {
  const [data, setData] = useState<Page<ReactionBrief | SampleBrief> | null>(null)
  const [page, setPage] = useState(1)
  const [error, setError] = useState("")
  useEffect(() => { void request<Page<ReactionBrief | SampleBrief>>(`/compounds/${item.id}/${kind}?${query({ page, page_size: 10 })}`).then(setData).catch(reason => setError(message(reason))) }, [item.id, kind, page])
  return <section className="relation-section"><h2>{kind === "reactions" ? "反应来源" : "样品来源"}</h2>{error && <Notice text={error} />}{data && (data.items.length ? <><div className="table-scroll"><table><thead><tr><th>{kind === "reactions" ? "反应" : "样品编号"}</th><th>所属实验</th></tr></thead><tbody>{data.items.map(row => <tr key={row.id}><td>{kind === "reactions" ? (row as ReactionBrief).reaction_name : (row as SampleBrief).sample_code}</td><td><Link to={`/experiments/${row.experiment_id}`}>查看实验</Link></td></tr>)}</tbody></table></div><PageNav page={page} total={data.total} size={10} onPage={setPage} /></> : <p className="helper">暂无{kind === "reactions" ? "反应" : "样品"}来源。</p>)}</section>
}

export function TagManager() {
  const [data, setData] = useState<Page<Tag> | null>(null)
  const [page, setPage] = useState(1)
  const [name, setName] = useState("")
  const [editing, setEditing] = useState<string | null>(null)
  const [editName, setEditName] = useState("")
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  const [revision, setRevision] = useState(0)
  useEffect(() => { void request<Page<Tag>>(`/tags?${query({ page, page_size: 25 })}`).then(setData).catch(reason => setError(message(reason))) }, [page, revision])
  async function create(event: FormEvent) { event.preventDefault(); if (busy) return; setBusy(true); setError(""); try { await request<Tag>("/tags", { method: "POST", body: JSON.stringify({ name }) }); setName(""); setRevision(current => current + 1) } catch (reason) { setError(message(reason)) } finally { setBusy(false) } }
  async function rename(tag: Tag) { if (busy) return; setBusy(true); setError(""); try { await request<Tag>(`/tags/${tag.id}`, { method: "PATCH", body: JSON.stringify({ name: editName, expected_version: tag.version }) }); setEditing(null); setRevision(current => current + 1) } catch (reason) { setError(message(reason)) } finally { setBusy(false) } }
  async function remove(tag: Tag) { if (busy || !window.confirm(`删除标签“${tag.name}”会永久清除它与实验、化合物的分类关联，不删除科研记录。确定继续？`)) return; setBusy(true); setError(""); try { await request<void>(`/tags/${tag.id}?expected_version=${tag.version}`, { method: "DELETE" }); setRevision(current => current + 1) } catch (reason) { setError(message(reason)) } finally { setBusy(false) } }
  return <main className="records-page"><div className="page-heading"><div><span className="eyebrow">SETTINGS</span><h1>设置与数据保护</h1><p>管理分类、回收站与手动备份。</p></div></div>{error && <Notice text={error} />}<section className="relation-section"><h2>标签管理</h2><form className="filter-bar" onSubmit={event => void create(event)}><label>新标签名称<input required maxLength={50} value={name} onChange={event => setName(event.target.value)} /></label><Button type="submit" disabled={busy}>创建标签</Button></form>{data && (data.items.length ? <><div className="table-scroll"><table><thead><tr><th>名称</th><th>版本</th><th>操作</th></tr></thead><tbody>{data.items.map(tag => <tr key={tag.id}><td>{editing === tag.id ? <input aria-label="标签新名称" value={editName} onChange={event => setEditName(event.target.value)} /> : tag.name}</td><td>{tag.version}</td><td className="action-cell">{editing === tag.id ? <><Button type="button" disabled={busy} onClick={() => void rename(tag)}>保存</Button><Button type="button" variant="outline" disabled={busy} onClick={() => setEditing(null)}>取消</Button></> : <><Button type="button" variant="outline" disabled={busy} onClick={() => { setEditing(tag.id); setEditName(tag.name) }}>改名</Button><Button type="button" variant="outline" disabled={busy} onClick={() => void remove(tag)}>删除</Button></>}</td></tr>)}</tbody></table></div><PageNav page={page} total={data.total} size={25} onPage={setPage} /></> : <div className="blank-card"><h2>还没有标签</h2><p>创建一个标签后，即可在实验与化合物表单中使用。</p></div>)}</section><TrashPanel /><section className="relation-section"><h2>本机数据与备份</h2><div className="settings-info"><div><span>运行信息</span><p>时区：Asia/Shanghai · 单文件上限：100 MiB</p></div><div><span>手动备份</span><p>备份会短暂停止写入。请按项目 README 的“数据检查、备份与恢复”步骤操作；恢复只能写入新的隔离项目。</p></div></div></section></main>
}
