import { FolderOpen } from "lucide-react"
import { useEffect, useState, type FormEvent } from "react"
import { Link, useParams } from "react-router-dom"
import { Button } from "../components/ui/button"
import { EmptyPanel } from "../components/empty-panel"
import { query, request, type Experiment, type Page } from "../services/records"
import type { components } from "../types/api.generated"

type FileItem = components["schemas"]["FileOut"]
type Sample = components["schemas"]["SampleOut"]
const errorText = (reason: unknown) => reason instanceof Error ? reason.message : "请求失败"

function FileTable({ data, onChange }: { data: Page<FileItem> | null; onChange?: () => void }) {
  if (!data) return <p>正在载入文件…</p>
  if (!data.items.length) return <EmptyPanel icon={FolderOpen} title="还没有文件" description="选择实验并上传原始文件后，记录会显示在这里。" />
  return <div className="table-scroll"><table><thead><tr><th>原文件名</th><th>类型</th><th>大小</th><th>上传时间</th><th>操作</th></tr></thead><tbody>{data.items.map(item => <tr key={item.id}><td><Link to={`/files/${item.id}`}>{item.original_filename}</Link></td><td>{item.file_type}</td><td>{item.file_size.toLocaleString()} B</td><td>{item.uploaded_at.slice(0, 10)}</td><td><a href={item.download_url} download={item.original_filename}>下载</a>{onChange && <Button type="button" variant="outline" onClick={onChange}>刷新</Button>}</td></tr>)}</tbody></table></div>
}


function SamplePicker({ experimentId, value, onChange }: { experimentId: string; value: string; onChange: (value: string) => void }) {
  const [term, setTerm] = useState("")
  const [page, setPage] = useState(1)
  const [data, setData] = useState<Page<Sample> | null>(null)
  const [selected, setSelected] = useState<Sample | null>(null)
  const [error, setError] = useState("")
  useEffect(() => { void request<Page<Sample>>(`/samples?${query({ experiment_id: experimentId, q: term, page, page_size: 20 })}`).then(setData).catch(reason => setError(errorText(reason))) }, [experimentId, term, page])
  useEffect(() => { if (value) void request<Sample>(`/samples/${value}`).then(setSelected).catch(() => setSelected(null)) }, [value])
  return <div className="relation-picker"><label>查找样品<input value={term} onChange={event => { setTerm(event.target.value); setPage(1) }} placeholder="编号或名称" /></label><label>关联样品<select value={value} onChange={event => onChange(event.target.value)}><option value="">仅关联实验</option>{value && !data?.items.some(item => item.id === value) && <option value={value}>{selected ? `${selected.sample_code} · ${selected.name || selected.sample_type}` : "当前关联样品不可见，可解除关联"}</option>}{data?.items.map(item => <option key={item.id} value={item.id}>{item.sample_code} · {item.name || item.sample_type}</option>)}</select></label>{data && data.total > 20 && <><Button type="button" variant="outline" disabled={page === 1} onClick={() => setPage(page - 1)}>上一页</Button><Button type="button" variant="outline" disabled={page * 20 >= data.total} onClick={() => setPage(page + 1)}>下一页</Button></>}{error && <p role="alert">{error}</p>}</div>
}

export function FileUploader({ experimentId, onUploaded }: { experimentId: string; onUploaded: () => void }) {
  const [selected, setSelected] = useState<File[]>([])
  const [sampleId, setSampleId] = useState("")
  const [instrumentType, setInstrumentType] = useState("")
  const [notes, setNotes] = useState("")
  const [results, setResults] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  async function submit(event: FormEvent) {
    event.preventDefault(); if (!selected.length) return
    setBusy(true); setResults([])
    const next: string[] = []
    for (const file of selected) {
      const body = new FormData()
      body.append("file", file)
      if (sampleId) body.append("sample_id", sampleId)
      if (instrumentType) body.append("instrument_type", instrumentType)
      if (notes) body.append("notes", notes)
      try { const saved = await request<FileItem>(`/experiments/${experimentId}/files`, { method: "POST", body }); next.push(`${file.name}：已保存为 ${saved.original_filename}（${saved.file_size} B）`); onUploaded() }
      catch (reason) { next.push(`${file.name}：${errorText(reason)}。若连接中断，请先核对列表，再决定是否重试。`) }
      setResults([...next])
    }
    setBusy(false)
  }
  return <form className="record-form" onSubmit={event => void submit(event)}><div className="form-grid"><label>选择原始文件<input type="file" multiple required onChange={event => setSelected(Array.from(event.target.files || []))} /></label><SamplePicker experimentId={experimentId} value={sampleId} onChange={setSampleId} /><label>仪器类型<input value={instrumentType} onChange={event => setInstrumentType(event.target.value)} /></label><label>备注<textarea value={notes} onChange={event => setNotes(event.target.value)} /></label></div><Button disabled={busy || !selected.length}>{busy ? "正在逐个上传…" : `上传 ${selected.length || ""} 个文件`}</Button><p className="helper">每个文件单独保存；单文件上限 100 MiB。原始内容保存后不可覆盖。</p>{results.map((result, index) => <p key={index} role="status">{result}</p>)}</form>
}

export function ExperimentFiles({ experimentId }: { experimentId: string }) {
  const [data, setData] = useState<Page<FileItem> | null>(null)
  const [page, setPage] = useState(1)
  const [revision, setRevision] = useState(0)
  const [error, setError] = useState("")
  useEffect(() => { void request<Page<FileItem>>(`/experiments/${experimentId}/files?${query({ page, page_size: 20 })}`).then(setData).catch(reason => setError(errorText(reason))) }, [experimentId, page, revision])
  return <section className="relation-section"><h2>原始文件</h2>{error && <p role="alert">{error}</p>}<FileUploader experimentId={experimentId} onUploaded={() => setRevision(revision + 1)} /><FileTable data={data} />{data && data.total > 20 && <><Button type="button" variant="outline" disabled={page === 1} onClick={() => setPage(page - 1)}>上一页</Button><Button type="button" variant="outline" disabled={page * 20 >= data.total} onClick={() => setPage(page + 1)}>下一页</Button></>}</section>
}

export function FilesPage() {
  const [data, setData] = useState<Page<FileItem> | null>(null)
  const [experiments, setExperiments] = useState<Page<Experiment> | null>(null)
  const [experimentId, setExperimentId] = useState("")
  const [term, setTerm] = useState("")
  const [page, setPage] = useState(1)
  const [revision, setRevision] = useState(0)
  const [error, setError] = useState("")
  useEffect(() => { void request<Page<FileItem>>(`/files?${query({ experiment_id: experimentId, q: term, page, page_size: 20 })}`).then(setData).catch(reason => setError(errorText(reason))) }, [experimentId, term, page, revision])
  useEffect(() => { void request<Page<Experiment>>("/experiments?page_size=100").then(setExperiments).catch(reason => setError(errorText(reason))) }, [])
  return <main className="records-page"><div className="page-heading"><div><span className="eyebrow">FILES</span><h1>原始文件</h1></div></div>{error && <p role="alert">{error}</p>}<section className="relation-section"><div className="relation-picker"><label>实验<select value={experimentId} onChange={event => { setExperimentId(event.target.value); setPage(1) }}><option value="">全部实验</option>{experiments?.items.map(item => <option key={item.id} value={item.id}>{item.experiment_code} · {item.title}</option>)}</select></label><label>搜索原名<input value={term} onChange={event => { setTerm(event.target.value); setPage(1) }} /></label></div>{experimentId && <><h2>上传到所选实验</h2><FileUploader key={experimentId} experimentId={experimentId} onUploaded={() => setRevision(revision + 1)} /></>}<h2>文件列表</h2><FileTable data={data} />{data && <><p>第 {page} 页，共 {data.total} 个文件</p><Button type="button" variant="outline" disabled={page === 1} onClick={() => setPage(page - 1)}>上一页</Button> <Button type="button" variant="outline" disabled={page * 20 >= data.total} onClick={() => setPage(page + 1)}>下一页</Button></>}</section></main>
}

export function FileEditor() {
  const { id } = useParams()
  const [item, setItem] = useState<FileItem | null>(null)
  const [sampleId, setSampleId] = useState("")
  const [instrumentType, setInstrumentType] = useState("")
  const [notes, setNotes] = useState("")
  const [deleted, setDeleted] = useState(false)
  const [error, setError] = useState("")
  useEffect(() => { if (id) void request<FileItem>(`/files/${id}`).then(value => { setItem(value); setSampleId(value.sample_id || ""); setInstrumentType(value.instrument_type || ""); setNotes(value.notes || "") }).catch(reason => setError(errorText(reason))) }, [id])
  async function save(event: FormEvent) { event.preventDefault(); if (!item) return; try { const result = await request<FileItem>(`/files/${item.id}`, { method: "PATCH", body: JSON.stringify({ expected_version: item.version, sample_id: sampleId || null, instrument_type: instrumentType || null, notes: notes || null }) }); setItem(result); setError("已保存元数据") } catch (reason) { setError(errorText(reason)) } }
  async function remove() { if (!item || !window.confirm("删除此文件记录？原始文件仍会保留。")) return; try { await request<void>(`/files/${item.id}?expected_version=${item.version}`, { method: "DELETE" }); setItem({ ...item, version: item.version + 1 }); setDeleted(true) } catch (reason) { setError(errorText(reason)) } }
  async function restore() { if (!item) return; try { setItem(await request<FileItem>(`/files/${item.id}/restore`, { method: "POST", body: JSON.stringify({ expected_version: item.version }) })); setDeleted(false) } catch (reason) { setError(errorText(reason)) } }
  return <main className="records-page editor-page"><div className="page-heading"><div><span className="eyebrow">FILE</span><h1>{item?.original_filename || "文件详情"}</h1></div><Link to="/files" className="text-link">返回文件列表</Link></div>{error && <p role="alert">{error}</p>}{item && <><p>所属实验：<Link to={`/experiments/${item.experiment_id}`}>查看实验</Link> · {item.file_size.toLocaleString()} B · SHA256：<code>{item.sha256}</code></p>{deleted ? <Button onClick={() => void restore()}>恢复文件记录</Button> : <><p><a href={item.download_url} download={item.original_filename}>下载原始文件</a></p><form className="record-form" onSubmit={event => void save(event)}><div className="form-grid"><SamplePicker experimentId={item.experiment_id} value={sampleId} onChange={setSampleId} /><label>仪器类型<input value={instrumentType} onChange={event => setInstrumentType(event.target.value)} /></label><label>备注<textarea value={notes} onChange={event => setNotes(event.target.value)} /></label></div><div className="form-actions"><Button>保存元数据</Button><Button type="button" variant="outline" onClick={() => void remove()}>删除记录</Button></div></form></>}</>}</main>
}
