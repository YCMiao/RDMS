import { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import { Button } from "../components/ui/button"
import { formatDecimal } from "../lib/format-mass"
import { reactantRoles } from "../lib/reagents"
import { request, type Compound, type Page } from "../services/records"
import type { components } from "../types/api.generated"

type Component = components["schemas"]["ComponentOut"]
type Conditions = { solvent: string; temperature_c: string; temperature_description: string; temperature_mode: "celsius" | "description"; reaction_time_hours: string; reaction_time_minutes: string; reaction_time_description: string; time_mode: "h" | "min" | "description"; atmosphere: string }

export function ReactionOverview({ reactionId, revision, conditions }: { reactionId: string; revision: number; conditions: Conditions }) {
  const [data, setData] = useState<{ rows: Component[]; compounds: Record<string, Compound> } | null>(null)
  const [error, setError] = useState("")
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    let active = true
    async function load() {
      const rows: Component[] = []
      let page = 1
      while (active) {
        const result = await request<Page<Component>>(`/reactions/${reactionId}/components?page=${page}&page_size=100`)
        rows.push(...result.items)
        if (rows.length >= result.total || !result.items.length) break
        page++
      }
      if (!active) return
      const ids = [...new Set(rows.map(row => row.compound_id))]
      const compounds = await Promise.all(ids.map(async id => [id, await request<Compound>(`/compounds/${id}`)] as const))
      if (active) { setData({ rows, compounds: Object.fromEntries(compounds) }); setError("") }
    }
    void load().catch(() => { if (active) { setData(null); setError("反应总览读取失败，请重试。") } })
    return () => { active = false }
  }, [reactionId, revision, retry])
  const substrates = data?.rows.filter(row => row.role === "substrate") || []
  const products = data?.rows.filter(row => row.role === "product") || []
  const reagents = data?.rows.filter(row => row.role !== "substrate" && row.role !== "product") || []
  function molecule(row: Component) {
    const compound = data!.compounds[row.compound_id]
    const amount = [row.amount !== null && `${formatDecimal(row.amount)} ${row.unit || ""}`, row.mmol !== null && `${formatDecimal(row.mmol)} mmol`, row.equivalents !== null && `${formatDecimal(row.equivalents)} eq`, row.role === "product" && row.yield_percent !== null && `${formatDecimal(row.yield_percent)}% 收率`].filter(Boolean).join(" · ")
    return <Link className="reaction-molecule" key={row.id} to={`/compounds/${row.compound_id}`}>
      <span className="reaction-role">{row.role === "product" ? "产物" : "底物"}</span>
      {compound.structure_molfile ? <img src={`/api/compounds/${compound.id}/structure.svg`} alt={`${compound.name || compound.codename || "未命名化合物"} 的化学结构`} /> : <span className="reaction-no-structure">{compound.molecular_formula || "未录入结构"}</span>}
      <strong>{compound.name || "系统名称待补充"}</strong>{compound.codename && <small>代号：{compound.codename}</small>}<small>{amount || "未记录用量"}</small>
    </Link>
  }
  return <section className="reaction-overview" aria-label="反应总览">
    <h4>反应总览</h4>
    {error ? <div role="alert">{error} <Button type="button" variant="outline" onClick={() => setRetry(retry + 1)}>重试总览</Button></div> : !data ? <p role="status">正在读取反应总览…</p> : <div className="reaction-sheet" aria-label="反应式">
      <div className="reaction-side"><span className="reaction-side-title">反应物</span><div className="reaction-molecules">{substrates.length ? substrates.map(molecule) : <span className="reaction-placeholder">尚未记录底物</span>}</div></div>
      <div className="reaction-center"><div className="reaction-reagents">{reagents.length ? reagents.map(row => <span key={row.id}>{data.compounds[row.compound_id].name} <small>({reactantRoles.find(([role]) => role === row.role)?.[1]}{row.equivalents !== null ? ` · ${formatDecimal(row.equivalents)} eq` : ""})</small></span>) : <span>未记录辅助试剂</span>}</div><div className="reaction-arrow" aria-hidden="true" /><div className="reaction-conditions">{[conditions.solvent, conditions.temperature_mode === "description" ? conditions.temperature_description : conditions.temperature_c !== "" && `${formatDecimal(conditions.temperature_c)} °C`, conditions.time_mode === "description" ? conditions.reaction_time_description : conditions.time_mode === "min" ? conditions.reaction_time_minutes !== "" && `${formatDecimal(conditions.reaction_time_minutes)} min` : conditions.reaction_time_hours !== "" && `${formatDecimal(conditions.reaction_time_hours)} h`, conditions.atmosphere].filter(Boolean).join(" · ") || "尚未填写反应条件"}</div></div>
      <div className="reaction-side"><span className="reaction-side-title">产物</span><div className="reaction-molecules">{products.length ? products.map(molecule) : <span className="reaction-placeholder">尚未记录产物</span>}</div></div>
    </div>}
  </section>
}
