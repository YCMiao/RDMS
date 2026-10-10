import { Plus } from "lucide-react"
import { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import { Button } from "../components/ui/button"
import { formatDecimal } from "../lib/format-mass"
import { request, type Compound, type Page } from "../services/records"
import type { components } from "../types/api.generated"
import { ReactantEditor } from "./reactant-editor"

type Component = components["schemas"]["ComponentOut"]

export function ReactionProducts({ reactionId, revision, onSaved }: { reactionId: string; revision: number; onSaved: () => void }) {
  const [data, setData] = useState<{ rows: Component[]; compounds: Record<string, Compound> } | null>(null)
  const [editing, setEditing] = useState<Component | "new" | null>(null)
  const [error, setError] = useState("")
  const [retry, setRetry] = useState(0)
  const [removing, setRemoving] = useState(false)
  useEffect(() => {
    let active = true
    setData(null)
    async function load() {
      const rows: Component[] = []
      let page = 1
      let seen = 0
      while (active) {
        const result = await request<Page<Component>>(`/reactions/${reactionId}/components?page=${page}&page_size=100`)
        rows.push(...result.items.filter(row => row.role === "product"))
        seen += result.items.length
        if (!result.items.length || seen >= result.total) break
        page++
      }
      if (!active) return
      const ids = [...new Set(rows.map(row => row.compound_id))]
      const compounds = await Promise.all(ids.map(async id => [id, await request<Compound>(`/compounds/${id}`)] as const))
      if (active) { setData({ rows, compounds: Object.fromEntries(compounds) }); setError("") }
    }
    void load().catch(reason => { if (active) setError(reason instanceof Error ? reason.message : "读取产物失败") })
    return () => { active = false }
  }, [reactionId, revision, retry])
  async function remove(row: Component) {
    if (!window.confirm("删除这个产物记录？")) return
    setRemoving(true); setError("")
    try {
      await request<void>(`/reactions/${reactionId}/components/${row.id}?expected_version=${row.version}`, { method: "DELETE" })
      onSaved()
    } catch (reason) { setError(reason instanceof Error ? reason.message : "删除失败") }
    finally { setRemoving(false) }
  }
  return <section aria-label="产物记录">
    <div className="dosing-heading"><div className="reaction-section-title"><span>02</span><h4>产物与收率</h4></div><Button type="button" variant="outline" disabled={editing !== null || removing} onClick={() => setEditing("new")}><Plus size={15} />记录产物</Button></div>
    {error && <p role="alert">{error} <Button type="button" variant="outline" onClick={() => setRetry(retry + 1)}>重试读取产物</Button></p>}
    {!data ? !error && <p role="status">正在读取产物…</p> : data.rows.length ? <div className="table-scroll" tabIndex={0} aria-label="产物表"><table className="dosing-table"><thead><tr><th scope="col">名称（系统命名）</th><th scope="col">CAS 号</th><th scope="col">产物量</th><th scope="col">mmol</th><th scope="col">计量比</th><th scope="col">收率 %</th><th scope="col">操作</th></tr></thead><tbody>{data.rows.map(row => {
      const compound = data.compounds[row.compound_id]
      return <tr key={row.id}><td className="reagent-name"><Link to={`/compounds/${row.compound_id}`}>{compound.name || "系统名称待补充"}</Link>{compound.codename && <small>代号：{compound.codename}</small>}{row.notes && <small>{row.notes}</small>}</td><td>{compound.cas_number || "—"}</td><td>{row.amount !== null ? `${formatDecimal(row.amount)} ${row.unit || ""}` : "—"}</td><td>{formatDecimal(row.mmol) || "—"}</td><td>{formatDecimal(row.stoichiometric_ratio) || "—"}</td><td>{formatDecimal(row.yield_percent) || "—"}</td><td><div className="dosing-actions"><Button type="button" variant="outline" disabled={editing !== null || removing} onClick={() => setEditing(row)}>编辑产物</Button><Button type="button" variant="outline" disabled={editing !== null || removing} onClick={() => void remove(row)}>删除产物</Button></div></td></tr>
    })}</tbody></table></div> : <p>尚未记录产物。可选择已有化合物或手动建档，填写产物量和收率。</p>}
    {editing !== null && <ReactantEditor key={editing === "new" ? "new-product" : editing.id} reactionId={reactionId} product row={editing === "new" ? undefined : editing} onCancel={() => setEditing(null)} onSaved={() => { setEditing(null); onSaved() }} />}
  </section>
}
