import { NotebookSelect } from "./notebooks"
import { ArchiveRestore } from "lucide-react"
import { useEffect, useState } from "react"
import { Button } from "../components/ui/button"
import { EmptyPanel } from "../components/empty-panel"
import { query, request, type Page } from "../services/records"
import type { components } from "../types/api.generated"

type TrashItem = components["schemas"]["TrashOut"]
type TrashType = TrashItem["type"]
const options: [TrashType, string][] = [["experiment", "实验"], ["compound", "化合物"], ["sample", "样品"], ["reaction", "反应"], ["component", "组分"], ["file", "文件"]]

function dependencyType(reason: string | null): TrashType | null {
  if (!reason) return null
  if (reason.includes("化合物")) return "compound"
  if (reason.includes("样品")) return "sample"
  if (reason.includes("实验")) return "experiment"
  if (reason.includes("反应")) return "reaction"
  return null
}

export function TrashPanel() {
  const [restoreTarget, setRestoreTarget] = useState("")
  const [kind, setKind] = useState<TrashType>("experiment")
  const [page, setPage] = useState(1)
  const [data, setData] = useState<Page<TrashItem> | null>(null)
  const [revision, setRevision] = useState(0)
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  useEffect(() => { setData(null); void request<Page<TrashItem>>(`/trash?${query({ type: kind, page, page_size: 20 })}`).then(setData).catch(reason => setError(reason instanceof Error ? reason.message : "回收站读取失败")) }, [kind, page, revision])
  async function restore(item: TrashItem) {
    setBusy(true); setError("")
    try { await request(item.restore_url.replace(/^\/api/, ""), { method: "POST", body: JSON.stringify({ expected_version: item.version, ...(item.type === "experiment" ? { notebook_id: restoreTarget } : {}) }) }); setRevision(revision + 1) }
    catch (reason) { setError(reason instanceof Error ? reason.message : "恢复失败") }
    finally { setBusy(false) }
  }
  return <section className="relation-section"><h2>科研记录回收站</h2><p className="helper">仅列出自身被删除的记录；恢复不会自动恢复此前单独删除的子记录。</p>{error && <p role="alert">{error}</p>}<div className="trash-filter"><label>记录类型<select value={kind} onChange={event => { setKind(event.target.value as TrashType); setPage(1) }}>{options.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>{kind === "experiment" && <NotebookSelect value={restoreTarget} onChange={setRestoreTarget} />}</div>{!data ? <p>正在载入…</p> : data.items.length ? <><div className="table-scroll"><table><thead><tr><th>记录</th><th>删除时间</th><th>恢复状态</th><th>操作</th></tr></thead><tbody>{data.items.map(item => <tr key={item.id}><td>{item.label}</td><td>{new Date(item.deleted_at).toLocaleString("zh-CN")}</td><td>{item.restore_block_reason || "可恢复"}{dependencyType(item.restore_block_reason) && <Button type="button" variant="outline" onClick={() => { setKind(dependencyType(item.restore_block_reason)!); setPage(1) }}>查看{options.find(([value]) => value === dependencyType(item.restore_block_reason))?.[1]}回收站</Button>}</td><td><Button type="button" variant="outline" disabled={busy || !!item.restore_block_reason || (item.type === "experiment" && !restoreTarget)} onClick={() => void restore(item)}>恢复</Button></td></tr>)}</tbody></table></div><p>第 {page} 页，共 {data.total} 条</p><Button type="button" variant="outline" disabled={page === 1} onClick={() => setPage(page - 1)}>上一页</Button> <Button type="button" variant="outline" disabled={page * 20 >= data.total} onClick={() => setPage(page + 1)}>下一页</Button></> : <EmptyPanel icon={ArchiveRestore} title="没有已删除的记录" description="当前类型没有已删除记录。" />}</section>
}
