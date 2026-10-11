import { ChemicalFormula } from "../components/chemical-formula"
import { Pagination } from "../components/pagination"
import { CasCompoundDialog } from "./cas-compound-dialog"
import { NotebookSelect, TransferDialog, type Notebook } from "./notebooks"
import { ExperimentCopyDialog } from "./experiment-copy"
import { TrashPanel } from "./trash"
import { SummaryPanel } from "./discovery"
import { ExperimentFiles } from "./files"
import { ExperimentLab } from "./lab"
import { CompoundStructurePanel } from "./compound-chemistry"
import { useEffect, useRef, useState, type FormEvent } from "react"
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom"

import { Button } from "../components/ui/button"
import { formatMass, formatDecimalInput } from "../lib/format-mass"
import type { components } from "../types/api.generated"
import {
  ApiError, request, query,
  type Compound, type CompoundInput, type Experiment, type ExperimentInput,
  type ExperimentRelation, type Page, type Tag,
} from "../services/records"

type Kind = "experiments" | "compounds"
type RecordItem = Experiment | Compound

function listContext(kind: Kind, params: URLSearchParams, notebookId?: string) {
  const context = new URLSearchParams()
  for (const key of ["q", "sort", "page", ...(kind === "experiments" ? ["notebook", "view", "status", "date_from", "date_to"] : ["tag_id"])]) {
    const value = params.get(key)
    if (value) context.set(key, value)
  }
  const sorts = kind === "experiments" ? ["date_desc", "date_asc", "code_desc", "code_asc", "title_desc", "title_asc"] : ["created_desc", "name_asc"]
  if (!sorts.includes(context.get("sort") || "")) context.set("sort", sorts[0])
  if (kind === "experiments" && !context.has("notebook") && context.get("view") !== "all") {
    if (notebookId) context.set("notebook", notebookId)
    else context.set("view", "all")
  }
  return context
}

function RecordNavigation({ kind, record, busy, params }: { kind: Kind; record: RecordItem; busy: boolean; params: URLSearchParams }) {
  const context = listContext(kind, params, kind === "experiments" ? (record as Experiment).notebook_id || undefined : undefined)
  const filters = query({ q: context.get("q") || undefined, sort: context.get("sort") || undefined, ...(kind === "experiments" ? { notebook_id: context.get("notebook") || undefined, status: context.get("status") || undefined, date_from: context.get("date_from") || undefined, date_to: context.get("date_to") || undefined } : { tag_id: context.get("tag_id") || undefined }) })
  const [neighbors, setNeighbors] = useState<components["schemas"]["RecordNeighbors"] | null>(null)
  const [error, setError] = useState("")
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    let active = true
    setNeighbors(null); setError("")
    void request<components["schemas"]["RecordNeighbors"]>(`/${kind}/${record.id}/neighbors?${filters}`).then(result => { if (active) setNeighbors(result) }).catch(reason => { if (active) setError(message(reason)) })
    return () => { active = false }
  }, [kind, record.id, record.version, filters, retry])
  if (neighbors?.position) context.set("page", String(Math.ceil(neighbors.position / 25)))
  function destination(id: string, offset: number) {
    const target = new URLSearchParams(context)
    if (neighbors?.position) target.set("page", String(Math.ceil((neighbors.position + offset) / 25)))
    return `/${kind}/${id}?${target}`
  }
  return <div className="record-navigation"><nav className="heading-actions" aria-label="记录切换">{([["上一条", neighbors?.previous_id, -1], ["下一条", neighbors?.next_id, 1]] as const).map(([label, id, offset]) => id && !busy ? <Button key={label} asChild variant="outline"><Link to={destination(id, offset)}>{label}</Link></Button> : <Button key={label} type="button" variant="outline" disabled>{label}</Button>)}<Link className="text-link" to={`/${kind}?${context}`}>返回列表</Link></nav>{error && <p role="alert">切换暂不可用 <Button type="button" variant="outline" onClick={() => setRetry(retry + 1)}>重试</Button></p>}</div>
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : "操作失败，请稍后重试"
}

function Notice({ text }: { text: string }) {
  return <p className="form-notice" role="alert">{text}</p>
}


export function RecordList({ kind }: { kind: Kind }) {
  const [params, setParams] = useSearchParams()
  const notebookId = params.get("notebook") || ""
  const [moving, setMoving] = useState(false)
  const [book, setBook] = useState<Notebook | null>(null)
  useEffect(() => { let live = true; setBook(null); if (notebookId) void request<Notebook>(`/notebooks/${notebookId}`).then(row => { if (live) setBook(row) }).catch(() => undefined); return () => { live = false } }, [notebookId])
  const [data, setData] = useState<Page<RecordItem> | null>(null)
  const [q, setQ] = useState(params.get("q") || "")
  const [search, setSearch] = useState(params.get("q") || "")
  const [page, setPage] = useState(Math.max(1, Number(params.get("page")) || 1))
  const [sort, setSort] = useState(params.get("sort") || (kind === "experiments" ? "date_desc" : "created_desc"))
  const [status, setStatus] = useState(params.get("status") || "")
  const [dateFrom, setDateFrom] = useState(params.get("date_from") || "")
  const [dateTo, setDateTo] = useState(params.get("date_to") || "")
  const [tagId, setTagId] = useState(params.get("tag_id") || "")
  const [tags, setTags] = useState<Tag[]>([])
  const [error, setError] = useState("")
  const [casCreateOpen, setCasCreateOpen] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [copyOpen, setCopyOpen] = useState(false)
  const [multi, setMulti] = useState(false)
  const [selected, setSelected] = useState<Record<string, number>>({})
  const [bulkName, setBulkName] = useState("")
  const [bulkBusy, setBulkBusy] = useState(false)
  const [bulkNotice, setBulkNotice] = useState("")
  const [revision, setRevision] = useState(0)
  useEffect(() => { setSelected({}); setBulkNotice("") }, [kind, search, page, sort, tagId, notebookId])
  async function bulkTag(event: FormEvent) {
    event.preventDefault()
    if (bulkBusy || !Object.keys(selected).length || !bulkName.trim()) return
    setBulkBusy(true); setError(""); setBulkNotice("")
    try {
      const result = await request<components["schemas"]["CompoundBulkTagOut"]>("/compounds/bulk-tag", { method: "POST", body: JSON.stringify({ name: bulkName.trim(), compounds: Object.entries(selected).map(([id, expected_version]) => ({ id, expected_version })) }) })
      setBulkNotice(`已为 ${result.selected_count} 个化合物添加标签`)
      setSelected({}); setBulkName(""); setMulti(false); setRevision(current => current + 1)
    } catch (reason) { setError(message(reason)) } finally { setBulkBusy(false) }
  }
  const effectiveSort = kind === "experiments"
    ? (["date_asc", "date_desc", "code_asc", "code_desc", "title_asc", "title_desc"].includes(sort) ? sort : "date_desc")
    : (sort === "name_asc" || sort === "created_desc" ? sort : "created_desc")
  useEffect(() => { if (kind === "compounds") void request<Page<Tag>>("/tags?page_size=100").then(result => setTags(result.items)).catch(() => undefined) }, [kind, revision])
  useEffect(() => {
    let live = true
    setData(null); setError("")
    const path = `/${kind}?${query({ q: search, page, page_size: 25, sort: effectiveSort, tag_id: kind === "compounds" ? tagId : undefined, ...(kind === "experiments" ? { status, date_from: dateFrom, date_to: dateTo, notebook_id: notebookId } : {}) })}`
    void request<Page<RecordItem>>(path).then(result => { if (live) setData(result) }).catch(reason => { if (live) setError(message(reason)) })
    return () => { live = false }
  }, [kind, search, page, effectiveSort, status, dateFrom, dateTo, tagId, revision, notebookId])
  const detailContext = query({ q: search, page, sort: effectiveSort, ...(kind === "experiments" ? { notebook: notebookId, view: notebookId ? undefined : "all", status, date_from: dateFrom, date_to: dateTo } : { tag_id: tagId }) })
  useEffect(() => { if (params.toString() !== detailContext) setParams(detailContext, { replace: true }) }, [detailContext, params, setParams])
  const experiment = kind === "experiments"
  return <main className="records-page">
    <div className="page-heading"><div><span className="eyebrow">RDMS / {experiment ? "Experiments" : "Compounds"}</span><h1>{experiment ? book?.name || "实验记录" : "化合物"}</h1>{book?.archived && <p>已归档</p>}</div>{experiment ? <div className="heading-actions">{!book?.archived && <><Button asChild><Link to={`/experiments/new${notebookId ? `?notebook=${notebookId}` : ""}`}>新建实验</Link></Button><Button variant="outline" onClick={() => setCopyOpen(true)}>从现有实验复制</Button></>}<Button variant="outline" onClick={() => { setMulti(current => !current); setSelected({}) }}>{multi ? "取消多选" : "多选"}</Button><Link className="text-link" to="/experiments">记录本</Link></div> : <div className="heading-actions"><Button onClick={() => setCasCreateOpen(true)}>根据CAS号新建</Button><Button asChild variant="outline"><Link to="/compounds/import">从结构新建</Link></Button><details className="more-actions"><summary>更多</summary><div><Button variant="outline" onClick={event => { event.currentTarget.closest("details")?.removeAttribute("open"); setCreateOpen(true) }}>新建化合物</Button></div></details><Button variant="outline" disabled={bulkBusy} onClick={() => { setMulti(current => !current); setSelected({}); setBulkNotice("") }}>{multi ? "取消多选" : "多选"}</Button></div>}</div>
    <form className="filter-bar" inert={bulkBusy} onSubmit={event => { event.preventDefault(); setPage(1); setSearch(q) }}>
      {experiment && <NotebookSelect all includeArchived value={notebookId} onChange={id => { setParams(id ? { notebook: id } : { view: "all" }); setPage(1) }} />}<label>关键词<input value={q} onChange={event => setQ(event.target.value)} placeholder={experiment ? "标题或编号" : "名称、代号、CAS 或 SMILES"} /></label>
      <Button type="submit" variant="outline">搜索</Button>
      {!experiment && <label>标签<select value={tagId} onChange={event => { setTagId(event.target.value); setPage(1) }}><option value="">全部</option>{tags.map(tag => <option key={tag.id} value={tag.id}>{tag.name}</option>)}</select></label>}
      {experiment && <><label>状态<select value={status} onChange={event => { setStatus(event.target.value); setPage(1) }}><option value="">全部</option><option value="draft">草稿</option><option value="in_progress">进行中</option><option value="completed">已完成</option><option value="cancelled">已取消</option></select></label><label>起始日期<input type="date" value={dateFrom} onChange={event => { setDateFrom(event.target.value); setPage(1) }} /></label><label>结束日期<input type="date" value={dateTo} onChange={event => { setDateTo(event.target.value); setPage(1) }} /></label></>}
      <label>排序<select value={effectiveSort} onChange={event => { setSort(event.target.value); setPage(1) }}>{experiment ? <><option value="date_desc">日期从近到远</option><option value="date_asc">日期从远到近</option><option value="code_desc">编号从大到小</option><option value="code_asc">编号从小到大</option><option value="title_desc">标题降序</option><option value="title_asc">标题升序</option></> : <><option value="created_desc">最新创建</option><option value="name_asc">名称排序</option></>}</select></label>
    </form>
    {experiment && multi && <div className="filter-bar"><span>已选 {Object.keys(selected).length} 个</span><Button disabled={!Object.keys(selected).length} onClick={() => setMoving(true)}>移入记录本</Button></div>}
    {!experiment && multi && <form className="filter-bar bulk-tag-bar" onSubmit={event => void bulkTag(event)}><span>已选 {Object.keys(selected).length} 个</span><label>标签名称<input required maxLength={50} value={bulkName} disabled={bulkBusy} onChange={event => setBulkName(event.target.value)} /></label><Button type="submit" disabled={bulkBusy || !Object.keys(selected).length || !bulkName.trim()}>{bulkBusy ? "保存中…" : "创建并添加标签"}</Button></form>}
    {bulkNotice && <p role="status">{bulkNotice}</p>}
    {error && <Notice text={error} />}
    {!data && !error && <p className="loading-state">正在载入记录…</p>}
    {data && (data.items.length ? <><div className="table-scroll"><table className={experiment ? undefined : "compound-list-table"}>{!experiment && <colgroup>{multi && <col className="compound-selection-col" />}<col style={{ width: "14%" }} /><col style={{ width: "30%" }} /><col style={{ width: "12%" }} /><col style={{ width: "13%" }} /><col style={{ width: "14%" }} /><col style={{ width: "17%" }} /></colgroup>}<thead><tr>{multi && <th className="selection-cell"><input type="checkbox" aria-label="全选本页" disabled={bulkBusy} checked={data.items.length > 0 && data.items.every(item => item.id in selected)} ref={node => { if (node) node.indeterminate = data.items.some(item => item.id in selected) && !data.items.every(item => item.id in selected) }} onChange={event => setSelected(event.target.checked ? Object.fromEntries(data.items.map(item => [item.id, item.version])) : {})} /></th>}<th>{experiment ? "编号" : "CAS 编号"}</th><th>{experiment ? "标题" : "名称"}</th><th>{experiment ? "日期" : "分子式"}</th><th>{experiment ? "状态" : "分子量 (g/mol)"}</th>{!experiment && <th>代号</th>}{!experiment && <th>标签</th>}</tr></thead><tbody>{data.items.map(item => <tr key={item.id}>{multi && <td className="selection-cell"><input type="checkbox" aria-label={`选择 ${experiment ? (item as Experiment).title : (item as Compound).codename || (item as Compound).name || (item as Compound).cas_number || item.id}`} disabled={bulkBusy} checked={item.id in selected} onChange={event => setSelected(current => { const next = { ...current }; if (event.target.checked) next[item.id] = item.version; else delete next[item.id]; return next })} /></td>}<td className="code-cell"><Link to={`/${kind}/${item.id}?${detailContext}`}>{experiment ? (item as Experiment).experiment_code : (item as Compound).cas_number || "CAS 待确认"}</Link></td><td><Link to={`/${kind}/${item.id}?${detailContext}`}>{experiment ? (item as Experiment).title : (item as Compound).name || "系统名称待补充"}</Link></td><td>{experiment ? (item as Experiment).date : <ChemicalFormula value={(item as Compound).molecular_formula} />}</td><td>{experiment ? statusLabel((item as Experiment).status) : formatMass((item as Compound).molecular_weight, 2) || "—"}</td>{!experiment && <td>{(item as Compound).codename || "—"}</td>}{!experiment && <td><div className="table-tags">{item.tags.length ? item.tags.map(tag => <span key={tag.id} title={tag.name}>{tag.name}</span>) : "—"}</div></td>}</tr>)}</tbody></table></div><Pagination page={page} total={data.total} size={25} onPage={next => { if (!bulkBusy) setPage(next) }} /></> : <div className="blank-card"><h2>{search ? "没有匹配的记录" : "这里还没有记录"}</h2><p>可以调整搜索条件，或创建第一条{experiment ? "实验" : "化合物"}。</p>{experiment ? <Button asChild><Link to="/experiments/new">新建记录</Link></Button> : <Button asChild><Link to="/compounds/import">从结构新建</Link></Button>}</div>)}
    {moving && data && <TransferDialog experiments={data.items.filter(item => item.id in selected) as Experiment[]} onClose={() => setMoving(false)} onSaved={() => { setMoving(false); setSelected({}); setRevision(revision + 1) }} />}
    {copyOpen && <ExperimentCopyDialog notebookId={notebookId} onClose={() => setCopyOpen(false)} />}
    {casCreateOpen && <CasCompoundDialog onClose={() => setCasCreateOpen(false)} />}
    {createOpen && <CompoundCreateDialog onClose={() => setCreateOpen(false)} />}
  </main>
}

function CompoundCreateDialog({ onClose }: { onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const navigate = useNavigate()
  const [name, setName] = useState("")
  const [codename, setCodename] = useState("")
  const [cas, setCas] = useState("")
  const [smiles, setSmiles] = useState("")
  const [formula, setFormula] = useState("")
  const [weight, setWeight] = useState("")
  const [notes, setNotes] = useState("")
  const [tagIds, setTagIds] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const dirty = Boolean(name || codename || cas || smiles || formula || weight || notes || tagIds.length)
  useEffect(() => { if (dialog.current && !dialog.current.open) dialog.current.showModal() }, [])
  function close() { if (!busy && (!dirty || window.confirm("未保存的内容将丢失，确定关闭？"))) dialog.current?.close() }
  async function submit(event: FormEvent) {
    event.preventDefault(); if (busy) return
    setBusy(true); setError("")
    const body: CompoundInput = { name: name || null, codename: codename || null, cas_number: cas || null, smiles: smiles || null, molecular_formula: formula || null, molecular_weight: weight || null, notes: notes || null, tag_ids: tagIds }
    try { const created = await request<Compound>("/compounds", { method: "POST", body: JSON.stringify(body) }); navigate(`/compounds/${created.id}`) }
    catch (reason) { setError(message(reason)) }
    finally { setBusy(false) }
  }
  return <dialog ref={dialog} className="record-dialog" aria-labelledby="compound-dialog-title" onClose={onClose} onCancel={event => { if (busy || (dirty && !window.confirm("未保存的内容将丢失，确定关闭？"))) event.preventDefault() }}><div className="dialog-heading"><div><span className="eyebrow">NEW COMPOUND</span><h2 id="compound-dialog-title">新建化合物</h2></div><Button type="button" variant="outline" disabled={busy} onClick={close}>关闭</Button></div>{error && <Notice text={error} />}<form className="record-form" onSubmit={event => void submit(event)}><div className="form-grid"><label>CAS 编号<input autoFocus maxLength={32} value={cas} onChange={event => setCas(event.target.value)} placeholder="例如 64-17-5" /></label><label>名称（IUPAC）<input maxLength={300} value={name} onChange={event => setName(event.target.value)} /></label><label>代号<input placeholder="实验简称或原名称" maxLength={300} value={codename} onChange={event => setCodename(event.target.value)} /></label><label>分子式<input maxLength={200} value={formula} onChange={event => setFormula(event.target.value)} /></label><label className="wide-field">SMILES<input maxLength={10000} value={smiles} onChange={event => setSmiles(event.target.value)} /></label><label>分子量 (g/mol)<input inputMode="decimal" value={weight} onChange={event => setWeight(event.target.value)} placeholder="例如 154.21" /></label><label className="wide-field">备注<textarea rows={3} value={notes} onChange={event => setNotes(event.target.value)} /></label><TagPicker selected={tagIds} onChange={setTagIds} initial={[]} /></div><div className="form-actions"><Button type="submit" disabled={busy}>{busy ? "保存中…" : "创建化合物"}</Button></div></form></dialog>
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
  return <fieldset className="picker"><legend>标签</legend><div className="picker-search"><input aria-label="搜索标签" placeholder="搜索标签" value={q} onChange={event => setQ(event.target.value)} /><Button type="button" variant="outline" onClick={() => { setTerm(q); setPage(1) }}>查找</Button></div>{error && <Notice text={error} />}{data && <><div className="choice-list">{data.items.map(tag => <label key={tag.id}><input type="checkbox" checked={selected.includes(tag.id)} onChange={event => onChange(event.target.checked ? [...selected, tag.id] : selected.filter(id => id !== tag.id))} />{tag.name}</label>)}</div><Pagination page={page} total={data.total} size={20} onPage={setPage} /></>}<p className="helper">管理标签请前往设置。已选择 {selected.length} 个：{selected.map(id => known.get(id) || "已选标签").join("、") || "无"}。</p></fieldset>
}

export function RecordEditor({ kind }: { kind: Kind }) {
  const { id } = useParams()
  return <RecordEditorContent key={`${kind}:${id}`} kind={kind} />
}

function RecordEditorContent({ kind }: { kind: Kind }) {
  const labPending = useRef<(() => boolean) | null>(null)
  const [params] = useSearchParams()
  const [moving, setMoving] = useState(false)
  const [restoreNotebook, setRestoreNotebook] = useState("")
  const { id } = useParams()
  const navigate = useNavigate()
  const isNew = !id || id === "new"
  const experiment = kind === "experiments"
  const [record, setRecord] = useState<RecordItem | null>(null)
  const [form, setForm] = useState<Record<string, string>>({})
  const [saveFeedback, setSaveFeedback] = useState("")
  const [weightTouched, setWeightTouched] = useState(false)
  const [tagIds, setTagIds] = useState<string[]>([])
  const [dirty, setDirty] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [fields, setFields] = useState<Record<string, string>>({})
  const [deleted, setDeleted] = useState(false)
  const [version, setVersion] = useState(1)
  useEffect(() => {
    if (isNew) { setForm(experiment ? { title: "", date: new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()), status: "draft", notebook_id: params.get("notebook") || "00000000-0000-4000-8000-000000000001" } : { name: "" }); setWeightTouched(false); return }
    let active = true
    void request<RecordItem>(`/${kind}/${id}`).then(item => { if (!active) return; setRecord(item); setForm(Object.fromEntries(Object.entries(item).filter(([, value]) => typeof value === "string" || value === null).map(([key, value]) => [key, value ?? ""])) as Record<string, string>); if (experiment && (item as Experiment).notes == null) setForm(current => ({ ...current, notes: ([ ["procedure", "操作"], ["observation", "观察"], ["result", "结果"], ["conclusion", "结论"] ] as const).filter(([key]) => (item as Experiment)[key]).map(([key, label]) => `${label}：\n${(item as Experiment)[key]}`).join("\n\n") })); setTagIds(item.tags.map(tag => tag.id)); setVersion(item.version); setDirty(false); setWeightTouched(false) }).catch(reason => { if (active) setError(message(reason)) })
    return () => { active = false }
  }, [id, isNew, kind, experiment, params])
  useEffect(() => { const handler = (event: BeforeUnloadEvent) => { if (dirty || labPending.current?.()) event.preventDefault() }; window.addEventListener("beforeunload", handler); return () => window.removeEventListener("beforeunload", handler) }, [dirty, busy])
  useEffect(() => {
    const confirmNavigation = (event: MouseEvent) => {
      if (event.defaultPrevented || !(event.target instanceof Element)) return
      const link = event.target.closest("a[href]")
      if (!link || link.getAttribute("href")?.startsWith("#")) return
      const destination = new URL(link.getAttribute("href") || "", window.location.href)
      if (destination.origin === window.location.origin && destination.pathname !== window.location.pathname && (busy || ((dirty || labPending.current?.()) && !window.confirm("有未保存的修改，确定离开？")))) {
        event.preventDefault()
        event.stopPropagation()
      }
    }
    document.addEventListener("click", confirmNavigation, true)
    return () => document.removeEventListener("click", confirmNavigation, true)
  }, [dirty, busy])
  function set(field: string, value: string) { setSaveFeedback(""); setForm(current => ({ ...current, [field]: value })); if (field === "molecular_weight") setWeightTouched(true); setDirty(true) }
  function setTags(ids: string[]) { setSaveFeedback(""); setTagIds(ids); setDirty(true) }
  async function save(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(""); setSaveFeedback(""); setFields({})
    const body = experiment
      ? { title: form.title, date: form.date, status: (form.status || "draft") as ExperimentInput["status"], objective: form.objective || null, notes: form.notes || "", ...(isNew ? { notebook_id: form.notebook_id || null } : {}) } satisfies ExperimentInput
      : { name: form.name || null, codename: form.codename || null, cas_number: form.cas_number || null, ...((form.cas_number || null) !== (record as Compound | null)?.cas_number ? { cas_source: form.cas_number ? "手工录入" : null } : {}), smiles: form.smiles || null, molecular_formula: form.molecular_formula || null, molecular_weight: form.molecular_weight || null, notes: form.notes || null, tag_ids: tagIds } satisfies CompoundInput
    try {
      const item = await request<RecordItem>(`/${kind}${isNew ? "" : `/${id}`}`, { method: isNew ? "POST" : "PATCH", body: JSON.stringify(isNew ? body : { ...body, expected_version: version }) })
      setDirty(false); setVersion(item.version); setRecord(item); setWeightTouched(false)
      if (isNew) navigate(`/${kind}/${item.id}`)
      else { setForm(current => ({ ...current })); if (experiment) setSaveFeedback("已保存"); else setError("已保存") }
    } catch (reason) {
      if (experiment) setSaveFeedback(message(reason)); else setError(message(reason))
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
    try { const item = await request<RecordItem>(`/${kind}/${record.id}/restore`, { method: "POST", body: JSON.stringify({ expected_version: version, ...(experiment ? { notebook_id: restoreNotebook || null } : {}) }) }); setRecord(item); setVersion(item.version); setDeleted(false) } catch (reason) { setError(message(reason)) } finally { setBusy(false) }
  }
  if (!isNew && !record && !error) return <main className="records-page"><p className="loading-state">正在载入记录…</p></main>
  const hasStructure = !experiment && Boolean((record as Compound | null)?.structure_molfile)
  return <main className="records-page editor-page"><div className="page-heading"><div><span className="eyebrow">{experiment ? "EXPERIMENT" : "COMPOUND"} / {isNew ? "NEW" : (experiment ? (record as Experiment)?.experiment_code : (record as Compound)?.cas_number || "CAS 待确认")}</span><h1>{isNew ? `新建${experiment ? "实验" : "化合物"}` : experiment ? (record as Experiment)?.title : (record as Compound)?.name || "系统名称待补充"}</h1>{!isNew && <p>创建于 {record?.created_at.slice(0, 10)}</p>}</div>{record && !deleted ? <RecordNavigation kind={kind} record={record} busy={busy} params={params} /> : <Link className="text-link" to={`/${kind}?${listContext(kind, params)}`}>返回列表</Link>}</div>
    {error && <Notice text={error} />}
    {experiment && record && !deleted && <div className="notebook-membership"><Link className="text-link" to={`/experiments?notebook=${(record as Experiment).notebook_id}`}>{(record as Experiment).notebook_name}</Link><Button variant="outline" onClick={() => { if (!dirty || window.confirm("基础记录有未保存修改，继续移入记录本？")) setMoving(true) }}>移入记录本</Button></div>}
    {moving && record && <TransferDialog experiments={[record as Experiment]} onClose={() => setMoving(false)} onSaved={() => { setMoving(false); void request<RecordItem>(`/${kind}/${record.id}`).then(item => { setRecord(item); setVersion(item.version) }) }} />}
    {deleted ? <div className="blank-card"><h2>记录已移入回收站</h2>{experiment && <NotebookSelect value={restoreNotebook} onChange={setRestoreNotebook} />}<Button onClick={() => void restore()} disabled={busy || (experiment && !restoreNotebook)}>恢复记录</Button></div> : <form aria-label={experiment ? "实验基础记录" : "化合物记录"} className={`record-form${experiment ? " experiment-metadata" : ""}`} onSubmit={event => void save(event)}><div className="form-grid">
      {experiment && isNew && <div className="wide-field"><NotebookSelect value={form.notebook_id || ""} onChange={value => set("notebook_id", value)} /></div>}
      {experiment ? <><label><span className="field-label">标题 <span>*</span></span><input required maxLength={300} value={form.title || ""} onChange={event => set("title", event.target.value)} />{fields.title && <small role="alert">{fields.title}</small>}</label><label><span className="field-label">日期 <span>*</span></span><input required type="date" value={form.date || ""} onChange={event => set("date", event.target.value)} />{fields.date && <small role="alert">{fields.date}</small>}</label><label>状态<select value={form.status || "draft"} onChange={event => set("status", event.target.value)}><option value="draft">草稿</option><option value="in_progress">进行中</option><option value="completed">已完成</option><option value="cancelled">已取消</option></select></label><label className="wide-field">目的<textarea maxLength={100000} rows={2} value={form.objective || ""} onChange={event => set("objective", event.target.value)} />{fields.objective && <small role="alert">{fields.objective}</small>}</label><details className="experiment-notes wide-field"><summary>备注</summary><label>实验备注<textarea maxLength={500000} rows={5} value={form.notes || ""} onChange={event => set("notes", event.target.value)} />{fields.notes && <small role="alert">{fields.notes}</small>}</label></details></> : <><label>名称（IUPAC）<input maxLength={300} value={form.name || ""} onChange={event => set("name", event.target.value)} />{fields.name && <small role="alert">{fields.name}</small>}</label><label>代号<input placeholder="实验简称或原名称" maxLength={300} value={form.codename || ""} onChange={event => set("codename", event.target.value)} /></label><label>CAS 编号<input maxLength={32} value={form.cas_number || ""} onChange={event => set("cas_number", event.target.value)} /></label><label>分子式{hasStructure ? <output className="readonly-field"><ChemicalFormula value={form.molecular_formula} /></output> : <input maxLength={200} value={form.molecular_formula || ""} onChange={event => set("molecular_formula", event.target.value)} />}</label><label className="wide-field">SMILES<input readOnly={hasStructure} maxLength={10000} value={form.smiles || ""} onChange={event => set("smiles", event.target.value)} /></label><label>分子量 (g/mol)<input readOnly={hasStructure} inputMode="decimal" value={weightTouched ? form.molecular_weight || "" : formatMass(form.molecular_weight, 2)} onChange={event => set("molecular_weight", event.target.value)} placeholder="例如 154.21" />{fields.molecular_weight && <small role="alert">{fields.molecular_weight}</small>}</label>{hasStructure && <p className="helper wide-field">分子式、SMILES 和分子量由结构计算；如需修改，请使用下方“替换结构”。</p>}<label className="wide-field">备注<textarea rows={5} value={form.notes || ""} onChange={event => set("notes", event.target.value)} /></label></>}
      {!experiment && <TagPicker selected={tagIds} onChange={setTags} initial={record?.tags || []} />}
    </div><div className="form-actions"><Button type="submit" disabled={busy}>{busy ? "保存中…" : isNew ? (experiment ? "创建并分配编号" : "创建化合物") : experiment ? "保存基础记录" : "保存修改"}</Button>{saveFeedback && <p role="status">{saveFeedback}</p>}{!isNew && <Button className="destructive-action" type="button" variant="outline" disabled={busy} onClick={() => void remove()}>删除记录</Button>}</div></form>}
    {!isNew && !deleted && record && experiment && <ExperimentLab experimentId={record.id} pendingChanges={labPending} />}
    {!isNew && !deleted && record && (experiment ? <><ExperimentFiles experimentId={record.id} /><SummaryPanel experimentId={record.id} experimentCode={(record as Experiment).experiment_code} /></> : <><CompoundStructurePanel item={record as Compound} disabled={busy || dirty} onSaved={item => { setRecord(item); setVersion(item.version); setForm(current => ({ ...current, smiles: item.smiles || "", molecular_formula: item.molecular_formula || "", molecular_weight: formatDecimalInput(item.molecular_weight) })); }} /><CompoundLinks item={record as Compound} /></>)}
  </main>
}

function CompoundLinks({ item }: { item: Compound }) {
  const [data, setData] = useState<Page<ExperimentRelation> | null>(null)
  const [page, setPage] = useState(1)
  const [error, setError] = useState("")
  useEffect(() => { void request<Page<ExperimentRelation>>(`/compounds/${item.id}/experiments?${query({ page, page_size: 10 })}`).then(setData).catch(reason => setError(message(reason))) }, [item.id, page])
  return <><section className="relation-section"><h2>参与实验</h2>{error && <Notice text={error} />}{data && (data.items.length ? <><div className="table-scroll"><table><thead><tr><th>编号</th><th>标题</th><th>来源</th></tr></thead><tbody>{data.items.map(row => <tr key={row.experiment.id}><td><Link to={`/experiments/${row.experiment.id}`}>{row.experiment.experiment_code}</Link></td><td>{row.experiment.title}</td><td>{row.sources.join("、")}</td></tr>)}</tbody></table></div><Pagination page={page} total={data.total} size={10} onPage={setPage} /></> : <p className="helper">暂无关联实验。</p>)}</section><CompoundDerived item={item} kind="reactions" /><CompoundDerived item={item} kind="samples" /></>
}

type ReactionBrief = components["schemas"]["ReactionBrief"]
type SampleBrief = components["schemas"]["SampleBrief"]

function CompoundDerived({ item, kind }: { item: Compound; kind: "reactions" | "samples" }) {
  const [data, setData] = useState<Page<ReactionBrief | SampleBrief> | null>(null)
  const [page, setPage] = useState(1)
  const [error, setError] = useState("")
  useEffect(() => { void request<Page<ReactionBrief | SampleBrief>>(`/compounds/${item.id}/${kind}?${query({ page, page_size: 10 })}`).then(setData).catch(reason => setError(message(reason))) }, [item.id, kind, page])
  return <section className="relation-section"><h2>{kind === "reactions" ? "反应来源" : "样品来源"}</h2>{error && <Notice text={error} />}{data && (data.items.length ? <><div className="table-scroll"><table><thead><tr><th>{kind === "reactions" ? "反应" : "样品编号"}</th><th>所属实验</th></tr></thead><tbody>{data.items.map(row => <tr key={row.id}><td>{kind === "reactions" ? (row as ReactionBrief).reaction_name : (row as SampleBrief).sample_code}</td><td><Link to={`/experiments/${row.experiment_id}`}>查看实验</Link></td></tr>)}</tbody></table></div><Pagination page={page} total={data.total} size={10} onPage={setPage} /></> : <p className="helper">暂无{kind === "reactions" ? "反应" : "样品"}来源。</p>)}</section>
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
  return <main className="records-page"><div className="page-heading"><div><span className="eyebrow">SETTINGS</span><h1>设置与数据保护</h1><p>管理分类、回收站与手动备份。</p></div></div>{error && <Notice text={error} />}<section className="relation-section"><h2>标签管理</h2><form className="filter-bar" onSubmit={event => void create(event)}><label>新标签名称<input required maxLength={50} value={name} onChange={event => setName(event.target.value)} /></label><Button type="submit" disabled={busy}>创建标签</Button></form>{data && (data.items.length ? <><div className="table-scroll"><table><thead><tr><th>名称</th><th>操作</th></tr></thead><tbody>{data.items.map(tag => <tr key={tag.id}><td>{editing === tag.id ? <input aria-label="标签新名称" value={editName} onChange={event => setEditName(event.target.value)} /> : tag.name}</td><td className="action-cell">{editing === tag.id ? <><Button type="button" disabled={busy} onClick={() => void rename(tag)}>保存</Button><Button type="button" variant="outline" disabled={busy} onClick={() => setEditing(null)}>取消</Button></> : <><Button type="button" variant="outline" disabled={busy} onClick={() => { setEditing(tag.id); setEditName(tag.name) }}>改名</Button><Button type="button" variant="outline" disabled={busy} onClick={() => void remove(tag)}>删除</Button></>}</td></tr>)}</tbody></table></div><Pagination page={page} total={data.total} size={25} onPage={setPage} /></> : <div className="blank-card"><h2>还没有标签</h2><p>标签可用于分类化合物。</p></div>)}</section><TrashPanel /><section className="relation-section"><h2>本机数据与备份</h2><div className="settings-info"><div><span>运行信息</span><p>时区：Asia/Shanghai · 单文件上限：100 MiB</p></div><div><span>手动备份</span><p>备份会短暂停止写入。请按项目 README 的“数据检查、备份与恢复”步骤操作；恢复只能写入新的隔离项目。</p></div></div></section></main>
}
