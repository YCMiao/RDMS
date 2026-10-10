import { useEffect, useRef, useState, type FormEvent } from "react"
import { useNavigate } from "react-router-dom"
import type { components } from "../types/api.generated"
import { Button } from "../components/ui/button"
import { query, request, type Experiment, type Page } from "../services/records"

function today() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`
}

export function ExperimentCopyDialog({ onClose }: { onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const saving = useRef(false)
  const navigate = useNavigate()
  const [search, setSearch] = useState("")
  const [q, setQ] = useState("")
  const [page, setPage] = useState(1)
  const [data, setData] = useState<Page<Experiment> | null>(null)
  const [source, setSource] = useState<Experiment | null>(null)
  const [title, setTitle] = useState("")
  const [date, setDate] = useState(today)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  useEffect(() => { dialog.current?.showModal() }, [])
  useEffect(() => {
    let active = true
    setData(null)
    void request<Page<Experiment>>(`/experiments?${query({ q, page, page_size: 25 })}`)
      .then(value => { if (active) setData(value) })
      .catch(reason => { if (active) setError(reason instanceof Error ? reason.message : "读取实验失败") })
    return () => { active = false }
  }, [q, page])
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!source || saving.current) return
    saving.current = true; setBusy(true); setError("")
    try {
      const copied = await request<Experiment>(`/experiments/${source.id}/copy`, {
        method: "POST", body: JSON.stringify({ title, date, expected_version: source.version } satisfies components["schemas"]["ExperimentCopy"]),
      })
      navigate(`/experiments/${copied.id}`)
      onClose()
    } catch (reason) { setError(reason instanceof Error ? reason.message : "复制失败，请重试") }
    finally { saving.current = false; setBusy(false) }
  }
  return <dialog ref={dialog} className="record-dialog" aria-labelledby="copy-dialog-title" onClose={onClose} onCancel={event => { if (busy) event.preventDefault() }}>
    <div className="dialog-heading"><div><h2 id="copy-dialog-title">从现有实验复制</h2><p>复制目的、操作、标签、反应条件与反应物投料，新实验为草稿。观察、结果、结论、产物、样品和附件不复制。</p></div><Button variant="outline" style={{ flexShrink: 0, whiteSpace: "nowrap" }} disabled={busy} onClick={() => dialog.current?.close()}>关闭</Button></div>
    <form className="filter-bar" onSubmit={event => { event.preventDefault(); setQ(search); setPage(1); setError("") }}>
      <label>查找原实验<input autoFocus placeholder="标题或编号" value={search} onChange={event => setSearch(event.target.value)} /></label><Button variant="outline" disabled={busy}>查找</Button>
    </form>
    {error && <p role="alert">{error}</p>}
    {!data ? <p role="status">正在读取实验…</p> : <fieldset disabled={busy}><legend>选择原实验</legend>{data.items.length ? data.items.map(item => <label className="checkbox-label" key={item.id}><input type="radio" name="source-experiment" checked={source?.id === item.id} onChange={() => { setSource(item); setTitle(`${item.title.slice(0, 297)} 副本`) }} />{item.experiment_code} · {item.title} · {item.date}</label>) : <p>没有匹配的实验。</p>}<div className="page-nav"><span>第 {page} 页 · 共 {data.total} 条</span><Button type="button" variant="outline" disabled={busy || page === 1} onClick={() => setPage(page - 1)}>上一页</Button><Button type="button" variant="outline" disabled={busy || page * 25 >= data.total} onClick={() => setPage(page + 1)}>下一页</Button></div></fieldset>}
    <form className="record-form" onSubmit={event => void submit(event)}><fieldset disabled={busy}><div className="form-grid"><label>新实验标题<input required maxLength={300} value={title} onChange={event => setTitle(event.target.value)} /></label><label>新实验日期<input required type="date" value={date} onChange={event => setDate(event.target.value)} /></label></div></fieldset><div className="form-actions"><Button disabled={busy || !source}>{busy ? "复制中…" : "复制并创建实验"}</Button><Button type="button" variant="outline" disabled={busy} onClick={() => dialog.current?.close()}>取消</Button></div></form>
  </dialog>
}
