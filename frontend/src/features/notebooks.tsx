import { Pagination } from "../components/pagination"
import { BookOpen, Plus } from "lucide-react"
import { useEffect, useRef, useState, type FormEvent } from "react"
import { Link, useSearchParams } from "react-router-dom"
import { Button } from "../components/ui/button"
import { request, query, type Page, type Experiment } from "../services/records"
import type { components } from "../types/api.generated"
import { RecordList } from "./records"

export type Notebook = components["schemas"]["NotebookOut"]

async function loadNotebooks(): Promise<Notebook[]> {
  const first = await request<Page<Notebook>>("/notebooks?page_size=100")
  const rows = [...first.items]
  for (let page = 2; rows.length < first.total; page++) {
    const next = await request<Page<Notebook>>(`/notebooks?page_size=100&page=${page}`)
    rows.push(...next.items)
    if (!next.items.length) break
  }
  return rows
}

export function NotebookSelect({ value, onChange, includeArchived = false, all = false }: { value: string; onChange: (id: string) => void; includeArchived?: boolean; all?: boolean }) {
  const [rows, setRows] = useState<Notebook[]>([])
  const [error, setError] = useState("")
  useEffect(() => { let live = true; void loadNotebooks().then(rows => { if (live) setRows(rows) }).catch(reason => { if (live) setError(reason instanceof Error ? reason.message : "读取失败") }); return () => { live = false } }, [])
  return <label>记录本<select aria-label="记录本" required={!all} value={value} onChange={event => onChange(event.target.value)}><option value="">{all ? "全部记录本" : "请选择记录本"}</option>{rows.filter(row => includeArchived || !row.archived || row.id === value).map(row => <option key={row.id} value={row.id} disabled={row.archived && !includeArchived}>{row.code} · {row.name}{row.archived ? "（已归档）" : ""}</option>)}</select>{error && <small role="alert">{error}</small>}</label>
}

export function ExperimentsPage() {
  const [params] = useSearchParams()
  return params.has("notebook") || params.get("view") === "all" ? <RecordList key={params.get("notebook") || "all"} kind="experiments" /> : <NotebookCards />
}

function NotebookCards() {
  const [data, setData] = useState<Page<Notebook> | null>(null)
  const [page, setPage] = useState(1)
  const [filter, setFilter] = useState("active")
  const [search, setSearch] = useState("")
  const [q, setQ] = useState("")
  const [revision, setRevision] = useState(0)
  const [editing, setEditing] = useState<Notebook | "new" | null>(null)
  const [error, setError] = useState("")
  useEffect(() => { let live = true; setData(null); void request<Page<Notebook>>(`/notebooks?${query({ q, page, page_size: 24, archived: filter === "all" ? undefined : filter === "archived" ? "true" : "false" })}`).then(rows => { if (live) setData(rows) }).catch(reason => { if (live) setError(reason instanceof Error ? reason.message : "读取失败") }); return () => { live = false } }, [page, filter, q, revision])
  return <main className="records-page"><div className="page-heading"><div><span className="eyebrow">LAB NOTEBOOKS</span><h1>实验记录本</h1></div><div className="heading-actions"><Button onClick={() => setEditing("new")}><Plus size={16} />新建记录本</Button><Button asChild variant="outline"><Link to="/experiments?view=all">全部实验</Link></Button></div></div>
    <form className="filter-bar" onSubmit={event => { event.preventDefault(); setQ(search.trim()); setPage(1) }}><label>查找记录本<input value={search} onChange={event => setSearch(event.target.value)} /></label><Button type="submit" variant="outline">搜索</Button><label>显示<select aria-label="显示" value={filter} onChange={event => { setFilter(event.target.value); setPage(1) }}><option value="active">使用中</option><option value="archived">已归档</option><option value="all">全部</option></select></label></form>
    {error && <p role="alert">{error}</p>}{!data && !error && <p>正在载入记录本…</p>}
    <div className="notebook-grid">{data?.items.map(row => <article className={`notebook-card${row.archived ? " archived" : ""}`} key={row.id}><Link className="notebook-cover" to={`/experiments?notebook=${row.id}`}><div className="notebook-cover-top"><BookOpen size={22} strokeWidth={1.5} /><span>{row.code}</span></div><h2>{row.name}</h2>{row.description && <p>{row.description}</p>}<div className="notebook-cover-bottom"><span>{row.experiment_count} 个实验</span>{row.archived && <span>已归档</span>}</div></Link><div className="notebook-card-footer"><small>{row.last_experiment_at ? `最近记录 ${row.last_experiment_at.slice(0, 10)}` : `创建于 ${row.created_at.slice(0, 10)}`}</small><Button variant="outline" onClick={() => setEditing(row)}>编辑</Button></div></article>)}</div>
    {data && !data.items.length && <p>没有匹配的记录本。</p>}{data && data.total > 24 && <Pagination page={page} total={data.total} size={24} onPage={setPage} />}
    {editing && <NotebookDialog item={editing === "new" ? undefined : editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); setRevision(revision + 1) }} />}
  </main>
}

function NotebookDialog({ item, onClose, onSaved }: { item?: Notebook; onClose: () => void; onSaved: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [name, setName] = useState(item?.name || "")
  const [description, setDescription] = useState(item?.description || "")
  const [archived, setArchived] = useState(item?.archived || false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  useEffect(() => { dialog.current?.showModal() }, [])
  const dirty = name !== (item?.name || "") || description !== (item?.description || "") || archived !== (item?.archived || false)
  function close() { if (!busy && (!dirty || window.confirm("放弃未保存的记录本修改？"))) dialog.current?.close() }
  async function save(event: FormEvent) {
    event.preventDefault(); if (busy) return; setBusy(true); setError("")
    try { await request(`/notebooks${item ? `/${item.id}` : ""}`, { method: item ? "PATCH" : "POST", body: JSON.stringify({ name, description: description || null, ...(item ? { expected_version: item.version, archived } : {}) }) }); onSaved() }
    catch (reason) { setError(reason instanceof Error ? reason.message : "保存失败") }
    finally { setBusy(false) }
  }
  return <dialog ref={dialog} className="record-dialog" aria-labelledby="notebook-dialog-title" onClose={onClose} onCancel={event => { if (busy || (dirty && !window.confirm("放弃未保存的记录本修改？"))) event.preventDefault() }}><div className="dialog-heading"><h2 id="notebook-dialog-title">{item ? "编辑记录本" : "新建记录本"}</h2><Button variant="outline" disabled={busy} onClick={close}>关闭</Button></div>{error && <p role="alert">{error}</p>}<form className="record-form" onSubmit={event => void save(event)}><label>记录本名称<input autoFocus required maxLength={100} value={name} onChange={event => setName(event.target.value)} /></label><label>说明<textarea maxLength={1000} value={description} onChange={event => setDescription(event.target.value)} /></label>{item && <label className="checkbox-label"><input type="checkbox" checked={archived} onChange={event => setArchived(event.target.checked)} />归档（停止新增实验）</label>}<Button disabled={busy}>{busy ? "保存中…" : "保存记录本"}</Button></form></dialog>
}

export function TransferDialog({ experiments, onClose, onSaved }: { experiments: Experiment[]; onClose: () => void; onSaved: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [target, setTarget] = useState("")
  const [preview, setPreview] = useState<components["schemas"]["TransferPreview"] | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  useEffect(() => { dialog.current?.showModal() }, [])
  useEffect(() => { let live = true; setPreview(null); setError(""); if (target) void request<components["schemas"]["TransferPreview"]>("/experiments/transfer-preview", { method: "POST", body: JSON.stringify({ notebook_id: target, experiments: experiments.map(item => ({ id: item.id, expected_version: item.version })) }) }).then(value => { if (live) setPreview(value) }).catch(reason => { if (live) setError(reason instanceof Error ? reason.message : "预览失败") }); return () => { live = false } }, [target, experiments])
  async function move(event: FormEvent) {
    event.preventDefault(); if (busy || !preview) return; setBusy(true); setError("")
    try { await request("/experiments/transfer", { method: "POST", body: JSON.stringify({ notebook_id: target, expected_next_number: preview.next_number, experiments: experiments.map(item => ({ id: item.id, expected_version: item.version })) }) }); onSaved() }
    catch (reason) { setError(reason instanceof Error ? reason.message : "移入失败"); setPreview(null) }
    finally { setBusy(false) }
  }
  return <dialog ref={dialog} className="record-dialog" aria-labelledby="transfer-title" onClose={onClose} onCancel={event => { if (busy) event.preventDefault() }}><div className="dialog-heading"><h2 id="transfer-title">移入记录本</h2><Button variant="outline" disabled={busy} onClick={() => dialog.current?.close()}>关闭</Button></div><form className="record-form" onSubmit={event => void move(event)}><NotebookSelect value={target} onChange={setTarget} />{error && <p role="alert">{error}</p>}{preview && <div className="table-scroll"><table><thead><tr><th>实验</th><th>移入后编号</th></tr></thead><tbody>{preview.items.map(item => <tr key={item.id}><td>{item.title}</td><td>{item.experiment_code}</td></tr>)}</tbody></table></div>}<Button disabled={busy || !preview}>{busy ? "移入中…" : "确认移入"}</Button></form></dialog>
}
