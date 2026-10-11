import { Boxes, Plus } from "lucide-react"
import { useEffect, useRef, useState, type FormEvent } from "react"
import { Link, useNavigate, useParams } from "react-router-dom"
import { Button } from "../components/ui/button"
import { EmptyPanel } from "../components/empty-panel"
import { formatDecimal, formatDecimalInput } from "../lib/format-mass"
import { ApiError, request, query, type Compound, type Experiment, type Page } from "../services/records"
import { ReactionProducts } from "./reaction-products"
import { ReactionOverview } from "./reaction-overview"
import { ReactantEditor } from "./reactant-editor"
import { reactantRoles } from "../lib/reagents"
import type { components } from "../types/api.generated"

type Sample = components["schemas"]["SampleOut"]
type Reaction = components["schemas"]["ReactionOut"]
type Component = components["schemas"]["ComponentOut"]
const errorText = (reason: unknown) => reason instanceof Error ? reason.message : "操作失败"
const decimal = (value: string) => value.trim() || null

function doseIn(row: Component, target: "mg" | "mL") {
  const factors: Record<string, number> = target === "mg" ? { mg: 1, g: 1000, kg: 1000000, ug: .001, "µg": .001, "μg": .001 } : { mL: 1, ml: 1, L: 1000, uL: .001, "µL": .001, "μL": .001 }
  const factor = factors[row.unit || ""]
  return row.amount !== null && factor ? formatDecimal(Number(row.amount) * factor) : "—"
}

export function CompoundPicker({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const [term, setTerm] = useState("")
  const [page, setPage] = useState(1)
  const [data, setData] = useState<Page<Compound> | null>(null)
  const [error, setError] = useState("")
  const [selected, setSelected] = useState<Compound | null>(null)
  useEffect(() => { if (value) void request<Compound>(`/compounds/${value}`).then(setSelected).catch(() => setSelected(null)) }, [value])
  useEffect(() => { void request<Page<Compound>>(`/compounds?${query({ q: term, page, page_size: 20 })}`).then(setData).catch(reason => setError(errorText(reason))) }, [term, page])
  return <div className="relation-picker"><label>查找化合物<input value={term} onChange={event => { setTerm(event.target.value); setPage(1) }} placeholder="名称、代号或 CAS" /></label><label>化合物<select value={value} onChange={event => onChange(event.target.value)}><option value="">{data ? "请选择" : "加载中…"}</option>{selected && !data?.items.some(item => item.id === selected.id) && <option value={selected.id}>{selected.cas_number} · {selected.name}</option>}{data?.items.map(item => <option key={item.id} value={item.id}>{item.cas_number} · {item.name}</option>)}</select></label>{data && data.total > 20 && <Button type="button" variant="outline" onClick={() => setPage(page + 1)} disabled={page * 20 >= data.total}>下一页</Button>}<Link className="text-link" to="/compounds/import">从结构建档</Link><Link className="text-link" to="/compounds/new">手动新建</Link>{error && <p role="alert">{error}</p>}</div>
}

export function SamplesPage() {
  const [data, setData] = useState<Page<Sample> | null>(null)
  const [experiments, setExperiments] = useState<Page<Experiment> | null>(null)
  const [filter, setFilter] = useState("")
  const [page, setPage] = useState(1)
  const [error, setError] = useState("")
  const [revision, setRevision] = useState(0)
  const [createOpen, setCreateOpen] = useState(false)
  const emptyForm = { experiment_id: "", sample_type: "", name: "", compound_id: "", amount: "", unit: "", concentration: "", concentration_unit: "", notes: "" }
  const [form, setForm] = useState(emptyForm)
  const [busy, setBusy] = useState(false)
  useEffect(() => { void request<Page<Sample>>(`/samples?${query({ q: filter, page, page_size: 20 })}`).then(setData).catch(reason => setError(errorText(reason))) }, [filter, page, revision])
  useEffect(() => { void request<Page<Experiment>>("/experiments?page_size=100").then(setExperiments).catch(reason => setError(errorText(reason))) }, [])
  function cancelCreate() {
    if (busy || (Object.values(form).some(value => value !== "") && !window.confirm("未保存的内容将丢失，确定取消？"))) return
    setForm(emptyForm); setCreateOpen(false)
  }
  async function create(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError("")
    try {
      await request<Sample>("/samples", { method: "POST", body: JSON.stringify({ experiment_id: form.experiment_id, sample_type: form.sample_type, name: form.name || null, compound_id: form.compound_id || null, amount: decimal(form.amount), unit: form.unit || null, concentration: decimal(form.concentration), concentration_unit: form.concentration_unit || null, notes: form.notes || null }) })
      setForm(emptyForm); setCreateOpen(false); setRevision(revision + 1)
    } catch (reason) { setError(errorText(reason)) } finally { setBusy(false) }
  }
  return <main className="records-page"><div className="page-heading"><div><span className="eyebrow">SAMPLES</span><h1>样品</h1></div><Button type="button" disabled={createOpen} aria-expanded={createOpen} aria-controls="sample-create" onClick={() => setCreateOpen(true)}><Plus size={15} />新建样品</Button></div>{error && <p role="alert">{error}</p>}
    {createOpen && <section id="sample-create" className="relation-section sample-create-section"><h2>创建样品</h2><form className="record-form" onSubmit={event => void create(event)}><div className="form-grid"><label>所属实验 *<select autoFocus required value={form.experiment_id} onChange={event => setForm({ ...form, experiment_id: event.target.value })}><option value="">请选择实验</option>{experiments?.items.map(item => <option key={item.id} value={item.id}>{item.experiment_code} · {item.title}</option>)}</select></label><label>样品类型 *<input required value={form.sample_type} onChange={event => setForm({ ...form, sample_type: event.target.value })} /></label><label>名称<input value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} /></label><CompoundPicker value={form.compound_id} onChange={value => setForm({ ...form, compound_id: value })} />{([ ["amount", "数量"], ["unit", "单位"], ["concentration", "浓度"], ["concentration_unit", "浓度单位"] ] as const).map(([key, label]) => <label key={key}>{label}<input value={form[key]} onChange={event => setForm({ ...form, [key]: event.target.value })} /></label>)}<label>备注<textarea value={form.notes} onChange={event => setForm({ ...form, notes: event.target.value })} /></label></div><div className="form-actions"><Button disabled={busy}>{busy ? "保存中…" : "创建样品"}</Button><Button type="button" variant="outline" disabled={busy} onClick={cancelCreate}>取消</Button></div></form></section>}
    <section className="relation-section"><h2>样品列表</h2><div className="sample-list-filter"><label>搜索名称或编号<input value={filter} onChange={event => { setFilter(event.target.value); setPage(1) }} /></label></div>{!data ? <p>正在载入…</p> : data.items.length ? <><div className="table-scroll"><table><thead><tr><th>编号</th><th>名称</th><th>类型</th><th>实验</th></tr></thead><tbody>{data.items.map(item => <tr key={item.id}><td><Link to={`/samples/${item.id}`}>{item.sample_code}</Link></td><td>{item.name || "—"}</td><td>{item.sample_type}</td><td><Link to={`/experiments/${item.experiment_id}`}>查看实验</Link></td></tr>)}</tbody></table></div><p>第 {page} 页，共 {data.total} 条</p><Button type="button" variant="outline" disabled={page === 1} onClick={() => setPage(page - 1)}>上一页</Button> <Button type="button" variant="outline" disabled={page * 20 >= data.total} onClick={() => setPage(page + 1)}>下一页</Button></> : <EmptyPanel icon={Boxes} title="还没有样品" description="创建样品后，可以在这里按名称或编号查找。" />}</section></main>
}

export function SampleEditor() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [item, setItem] = useState<Sample | null>(null)
  const [form, setForm] = useState({ name: "", sample_type: "", compound_id: "", amount: "", unit: "", concentration: "", concentration_unit: "", notes: "" })
  const [error, setError] = useState("")
  const [deleted, setDeleted] = useState(false)
  const [busy, setBusy] = useState(false)
  useEffect(() => { if (id) void request<Sample>(`/samples/${id}`).then(value => { setItem(value); setForm({ name: value.name || "", sample_type: value.sample_type, compound_id: value.compound_id || "", amount: formatDecimalInput(value.amount), unit: value.unit || "", concentration: formatDecimalInput(value.concentration), concentration_unit: value.concentration_unit || "", notes: value.notes || "" }) }).catch(reason => setError(errorText(reason))) }, [id])
  async function save(event: FormEvent) {
    event.preventDefault(); if (!item) return; setBusy(true); setError("")
    try { const updated = await request<Sample>(`/samples/${item.id}`, { method: "PATCH", body: JSON.stringify({ expected_version: item.version, name: form.name || null, sample_type: form.sample_type, compound_id: form.compound_id || null, amount: decimal(form.amount), unit: form.unit || null, concentration: decimal(form.concentration), concentration_unit: form.concentration_unit || null, notes: form.notes || null }) }); setItem(updated); setError("已保存") } catch (reason) { setError(errorText(reason)) } finally { setBusy(false) }
  }
  async function remove() { if (!item || !window.confirm("确定删除样品？")) return; try { await request<void>(`/samples/${item.id}?expected_version=${item.version}`, { method: "DELETE" }); setItem({ ...item, version: item.version + 1 }); setDeleted(true) } catch (reason) { setError(errorText(reason)) } }
  async function restore() { if (!item) return; try { setItem(await request<Sample>(`/samples/${item.id}/restore`, { method: "POST", body: JSON.stringify({ expected_version: item.version }) })); setDeleted(false) } catch (reason) { setError(errorText(reason)) } }
  return <main className="records-page editor-page"><div className="page-heading"><div><span className="eyebrow">SAMPLE / {item?.sample_code}</span><h1>{item?.name || item?.sample_code || "样品"}</h1></div><Link to="/samples" className="text-link">返回样品</Link></div>{error && <p role="alert">{error}</p>}{item && <p>来源实验：<Link to={`/experiments/${item.experiment_id}`}>查看实验</Link> · 版本 {item.version}</p>}{deleted ? <Button onClick={() => void restore()}>恢复样品</Button> : item && <form className="record-form" onSubmit={event => void save(event)}><div className="form-grid"><label>名称<input value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} /></label><label>样品类型 *<input required value={form.sample_type} onChange={event => setForm({ ...form, sample_type: event.target.value })} /></label><CompoundPicker value={form.compound_id} onChange={value => setForm({ ...form, compound_id: value })} />{([ ["amount", "数量"], ["unit", "单位"], ["concentration", "浓度"], ["concentration_unit", "浓度单位"] ] as const).map(([key, label]) => <label key={key}>{label}<input value={form[key]} onChange={event => setForm({ ...form, [key]: event.target.value })} /></label>)}<label>备注<textarea value={form.notes} onChange={event => setForm({ ...form, notes: event.target.value })} /></label></div><div className="form-actions"><Button disabled={busy}>保存修改</Button><Button type="button" variant="outline" onClick={() => void remove()}>删除样品</Button><Button type="button" variant="outline" onClick={() => navigate("/samples")}>返回</Button></div></form>}</main>
}

function ReactionCard({ item, number, leaveGuard, onChange }: { item: Reaction; number: number; leaveGuard: { current: (() => boolean) | null }; onChange: () => void }) {
  const [form, setForm] = useState({ reaction_name: item.reaction_name, temperature_c: formatDecimalInput(item.temperature_c), temperature_description: item.temperature_description || "", temperature_mode: (item.temperature_description ? "description" : "celsius") as "celsius" | "description", reaction_time_hours: formatDecimalInput(item.reaction_time_hours), reaction_time_minutes: formatDecimalInput(item.reaction_time_minutes), reaction_time_description: item.reaction_time_description || "", time_mode: (item.reaction_time_description ? "description" : item.reaction_time_minutes != null ? "min" : "h") as "h" | "min" | "description", atmosphere: item.atmosphere || "", solvent: item.solvent || "", workup: item.workup || "", purification: item.purification || "", notes: item.notes || "" })
  const savedForm = useRef(form)
  const cardRef = useRef<HTMLElement>(null)
  const [version, setVersion] = useState(item.version)
  const [saving, setSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState("")
  const [rows, setRows] = useState<Page<Component> | null>(null)
  const [page, setPage] = useState(1)
  const [revision, setRevision] = useState(0)
  const [error, setError] = useState("")
  const [editing, setEditing] = useState<Component | "new" | null>(null)
  const [compounds, setCompounds] = useState<Record<string, Compound>>({})
  useEffect(() => {
    leaveGuard.current = () => {
      const pending = JSON.stringify(form) !== JSON.stringify(savedForm.current) || Boolean(cardRef.current?.querySelector("form.reactant-editor"))
      return !pending || window.confirm("切换反应将丢弃未保存的修改，确定继续？")
    }
    return () => { leaveGuard.current = null }
  }, [form, leaveGuard])
  useEffect(() => { let active = true; void request<Page<Component>>(`/reactions/${item.id}/components?${query({ page, page_size: 100, reactants_only: "true", exclude_solvents: "true" })}`).then(result => { if (active) { if (!result.items.length && page > 1) setPage(page - 1); else setRows(result) } }).catch(reason => { if (active) setError(errorText(reason)) }); return () => { active = false } }, [item.id, page, revision])
  useEffect(() => {
    let active = true
    const ids = [...new Set(rows?.items.map(row => row.compound_id) || [])]
    void Promise.allSettled(ids.map(id => request<Compound>(`/compounds/${id}`))).then(results => {
      if (!active) return
      setCompounds(Object.fromEntries(results.flatMap((result, index) => result.status === "fulfilled" ? [[ids[index], result.value] as const] : [])))
      if (results.some(result => result.status === "rejected")) setError("部分试剂资料读取失败，请刷新页面重试")
    })
    return () => { active = false }
  }, [rows])
  async function save(event: FormEvent) {
    event.preventDefault()
    if (saving) return
    setSaving(true); setSaveMessage("")
    try {
      const result = await request<Reaction>(`/reactions/${item.id}`, { method: "PATCH", body: JSON.stringify({ expected_version: version, reaction_name: form.reaction_name, temperature_c: form.temperature_mode === "celsius" ? decimal(form.temperature_c) : null, temperature_description: form.temperature_mode === "description" ? decimal(form.temperature_description) : null, reaction_time_hours: form.time_mode === "h" ? decimal(form.reaction_time_hours) : null, reaction_time_minutes: form.time_mode === "min" ? decimal(form.reaction_time_minutes) : null, reaction_time_description: form.time_mode === "description" ? decimal(form.reaction_time_description) : null, atmosphere: form.atmosphere || null, workup: form.workup || null, purification: form.purification || null, notes: form.notes || null }) })
      savedForm.current = form
      setVersion(result.version); onChange(); setSaveMessage("反应已保存")
    } catch (reason) {
      const labels: Record<string, string> = { reaction_name: "反应名称", temperature_c: "温度 °C", temperature_description: "温度描述", reaction_time_hours: "时间 h", reaction_time_minutes: "时间 min", reaction_time_description: "时间描述", atmosphere: "气氛", solvent: "溶剂", workup: "后处理", purification: "纯化", notes: "补充备注" }
      const fields = reason instanceof ApiError ? reason.fields.map(({ field }) => {
        const key = field.split(".").at(-1) || field
        return key === "temperature_c" || key === "reaction_time_hours" || key === "reaction_time_minutes"
          ? `${labels[key]}须填写数字（最多 8 位小数${key !== "temperature_c" ? "，且不能为负数" : ""}）；文字内容请选择“描述”后填写`
          : `${labels[key] || "输入内容"}不符合要求，请检查`
      }) : []
      setSaveMessage(`未保存：${fields.length ? fields.join("；") : errorText(reason)}`)
    } finally { setSaving(false) }
  }
  async function removeComponent(row: Component) { if (!window.confirm("删除这个反应物？")) return; try { await request<void>(`/reactions/${item.id}/components/${row.id}?expected_version=${row.version}`, { method: "DELETE" }); setRevision(revision + 1) } catch (reason) { setError(errorText(reason)) } }
  async function removeReaction() { if (!window.confirm("删除整个反应及其可见组分？")) return; try { await request<void>(`/reactions/${item.id}?expected_version=${version}`, { method: "DELETE" }); onChange() } catch (reason) { setError(errorText(reason)) } }
  return <article ref={cardRef} className="relation-section reaction-entry"><div className="reaction-entry-heading"><div><span className="eyebrow">REACTION {number}</span><h3>{item.reaction_name}</h3></div><span className="reaction-count">{rows?.total ?? 0} 个反应物</span></div>{error && <p role="alert">{error}</p>}
    <ReactionOverview reactionId={item.id} revision={revision} conditions={form} />
    <div className="dosing-heading"><div className="reaction-section-title"><span>01</span><h4>投料</h4></div><Button type="button" variant="outline" disabled={editing !== null} onClick={() => setEditing("new")}><Plus size={15} />添加反应物</Button></div>
    <div className="table-scroll dosing-table-scroll" tabIndex={0} aria-label="反应物投料表"><table className="dosing-table"><thead><tr><th scope="col">#</th><th scope="col">名称（系统命名）</th><th scope="col">化学式</th><th scope="col">CAS 号</th><th scope="col">Mw<small>g/mol</small></th><th scope="col">eq</th><th scope="col">mmol</th><th scope="col">mg</th><th scope="col">mL</th><th scope="col">操作</th></tr></thead><tbody>{rows ? rows.items.length ? rows.items.map((row, index) => {
      const compound = compounds[row.compound_id]
      return <tr key={row.id}><td>{(page - 1) * 100 + index + 1}</td><td className="reagent-name"><Link to={`/compounds/${row.compound_id}`}>{compound ? compound.name || "系统名称待补充" : "读取试剂资料…"}</Link><small>{reactantRoles.find(([role]) => role === row.role)?.[1]}{compound?.codename && ` · 代号：${compound.codename}`}</small>{row.is_limiting && <small>限制反应物 · 1 eq</small>}{row.notes && <small>{row.notes}</small>}{row.amount && !["mg", "g", "kg", "ug", "µg", "μg", "mL", "ml", "L", "uL", "µL", "μL"].includes(row.unit || "") && <small>原用量：{formatDecimal(row.amount)} {row.unit}</small>}</td><td>{compound?.molecular_formula || "—"}</td><td>{compound?.cas_number || "—"}</td><td>{formatDecimal(compound?.molecular_weight) || "—"}</td><td>{formatDecimal(row.equivalents) || "—"}</td><td>{formatDecimal(row.mmol) || "—"}</td><td>{doseIn(row, "mg")}</td><td>{doseIn(row, "mL")}</td><td><div className="dosing-actions"><Button type="button" variant="outline" disabled={editing !== null} onClick={() => setEditing(row)}>编辑</Button><Button type="button" variant="outline" disabled={editing !== null} onClick={() => void removeComponent(row)}>删除</Button></div></td></tr>
    }) : <tr><td colSpan={10} className="dosing-empty">尚未添加反应物。点击“添加反应物”，通过 CAS 号查找或从本机试剂库选择。</td></tr> : <tr><td colSpan={10}>正在读取投料表…</td></tr>}</tbody></table></div>
    {rows && rows.total > 100 && <div className="form-actions"><Button type="button" variant="outline" disabled={page === 1 || editing !== null} onClick={() => setPage(page - 1)}>上一页</Button><span>第 {page} 页</span><Button type="button" variant="outline" disabled={page * 100 >= rows.total || editing !== null} onClick={() => setPage(page + 1)}>下一页</Button></div>}
    {editing !== null && <ReactantEditor key={editing === "new" ? "new" : editing.id} reactionId={item.id} row={editing === "new" ? undefined : editing} onCancel={() => setEditing(null)} onSaved={() => { setEditing(null); setRevision(revision + 1) }} />}
    <ReactionProducts reactionId={item.id} revision={revision} onSaved={() => setRevision(value => value + 1)} />
    <ReactionSolvents reactionId={item.id} revision={revision} legacy={item.solvent} onSaved={() => setRevision(value => value + 1)} />
    <form className="record-form reaction-details" onChange={() => setSaveMessage("")} onSubmit={event => void save(event)}><div className="reaction-section-title"><span>04</span><h4>条件与处理</h4></div><div className="form-grid"><label className="wide-field">反应名称 *<input required value={form.reaction_name} onChange={event => setForm({ ...form, reaction_name: event.target.value })} /></label><div className="condition-control"><span>温度</span><div className="condition-input">{form.temperature_mode === "celsius" ? <input aria-label="温度 °C" type="number" step="any" inputMode="decimal" value={form.temperature_c} onChange={event => setForm({ ...form, temperature_c: event.target.value })} placeholder="例如：25 或 -10" /> : <input aria-label="温度描述" maxLength={300} value={form.temperature_description} onChange={event => setForm({ ...form, temperature_description: event.target.value })} placeholder="例如：室温、冰浴、回流" />}<select aria-label="温度记录方式" value={form.temperature_mode} onChange={event => setForm({ ...form, temperature_mode: event.target.value as typeof form.temperature_mode })}><option value="celsius">°C</option><option value="description">描述</option></select></div></div>
      <div className="condition-control"><span>时间</span><div className="condition-input">{form.time_mode === "description" ? <input aria-label="时间描述" maxLength={300} value={form.reaction_time_description} onChange={event => setForm({ ...form, reaction_time_description: event.target.value })} placeholder="例如：过夜、至反应完全" /> : form.time_mode === "min" ? <input aria-label="时间 min" type="number" step="any" min="0" inputMode="decimal" value={form.reaction_time_minutes} onChange={event => setForm({ ...form, reaction_time_minutes: event.target.value })} placeholder="例如：30" /> : <input aria-label="时间 h" type="number" step="any" min="0" inputMode="decimal" value={form.reaction_time_hours} onChange={event => setForm({ ...form, reaction_time_hours: event.target.value })} placeholder="例如：8" />}<select aria-label="时间记录方式" value={form.time_mode} onChange={event => setForm({ ...form, time_mode: event.target.value as typeof form.time_mode })}><option value="h">h</option><option value="min">min</option><option value="description">描述</option></select></div></div>
      {([ ["atmosphere", "气氛"] ] as const).map(([key, label]) => <label key={key}>{label}<input value={form[key]} onChange={event => setForm({ ...form, [key]: event.target.value })} /></label>)}<label className="wide-field">后处理<textarea rows={3} value={form.workup} onChange={event => setForm({ ...form, workup: event.target.value })} placeholder="例如：淬灭、萃取、洗涤、干燥、浓缩" /></label><label className="wide-field">纯化<textarea rows={3} value={form.purification} onChange={event => setForm({ ...form, purification: event.target.value })} placeholder="例如：柱层析洗脱体系、重结晶、制备 HPLC" /></label><label className="wide-field">补充备注<textarea rows={2} value={form.notes} onChange={event => setForm({ ...form, notes: event.target.value })} /></label></div><div className="form-actions"><Button disabled={saving}>{saving ? "保存中…" : "保存反应"}</Button><Button type="button" variant="outline" disabled={saving} onClick={() => void removeReaction()}>删除反应</Button></div>{saveMessage && <p role="alert">{saveMessage}</p>}</form>
  </article>
}

export function ExperimentLab({ experimentId }: { experimentId: string }) {
  const leaveGuard = useRef<(() => boolean) | null>(null)
  const [samples, setSamples] = useState<Page<Sample> | null>(null)
  const [reactions, setReactions] = useState<Page<Reaction> | null>(null)
  const [page, setPage] = useState(1)
  const [revision, setRevision] = useState(0)
  const [samplePage, setSamplePage] = useState(1)
  const [error, setError] = useState("")
  const [name, setName] = useState("")
  useEffect(() => { setPage(1); setReactions(null) }, [experimentId])
  useEffect(() => { void request<Page<Sample>>(`/samples?${query({ experiment_id: experimentId, page: samplePage, page_size: 20 })}`).then(setSamples).catch(reason => setError(errorText(reason))) }, [experimentId, samplePage, revision])
  useEffect(() => {
    let active = true
    void request<Page<Reaction>>(`/experiments/${experimentId}/reactions?${query({ page, page_size: 1 })}`).then(result => {
      if (!active) return
      if (page > Math.max(1, result.total)) { setPage(Math.max(1, result.total)); return }
      setReactions(result)
    }).catch(reason => { if (active) setError(errorText(reason)) })
    return () => { active = false }
  }, [experimentId, page, revision])
  function changePage(next: number) {
    if (leaveGuard.current && !leaveGuard.current()) return
    setPage(next)
  }
  async function create(event: FormEvent) {
    event.preventDefault()
    if (leaveGuard.current && !leaveGuard.current()) return
    try {
      await request<Reaction>(`/experiments/${experimentId}/reactions`, { method: "POST", body: JSON.stringify({ reaction_name: name }) })
      setName("")
      const result = await request<Page<Reaction>>(`/experiments/${experimentId}/reactions?page=1&page_size=1`)
      setPage(Math.max(1, result.total)); setRevision(revision + 1)
    } catch (reason) { setError(errorText(reason)) }
  }
  return <><section className="relation-section" aria-label="反应记录"><h2>反应记录</h2>{error && <p role="alert">{error}</p>}<form className="relation-picker" onSubmit={event => void create(event)}><label>新反应名称<input required value={name} onChange={event => setName(event.target.value)} /></label><Button>创建反应</Button></form>{reactions && reactions.page === page ? reactions.items.length ? <>{reactions.items.map(item => <ReactionCard key={item.id} item={item} number={page} leaveGuard={leaveGuard} onChange={() => setRevision(revision + 1)} />)}<p>第 {page} 页，共 {reactions.total} 个反应</p><Button type="button" variant="outline" disabled={page === 1} onClick={() => changePage(page - 1)}>上一页</Button> <Button type="button" variant="outline" disabled={page >= reactions.total} onClick={() => changePage(page + 1)}>下一页</Button></> : <p>暂无反应。</p> : <p>正在载入反应…</p>}</section><section className="relation-section"><h2>样品</h2>{samples ? samples.items.length ? <><p>共 {samples.total} 个样品</p><div className="table-scroll"><table><thead><tr><th>编号</th><th>名称</th><th>类型</th></tr></thead><tbody>{samples.items.map(item => <tr key={item.id}><td><Link to={`/samples/${item.id}`}>{item.sample_code}</Link></td><td>{item.name || "—"}</td><td>{item.sample_type}</td></tr>)}</tbody></table></div><Button type="button" variant="outline" disabled={samplePage === 1} onClick={() => setSamplePage(samplePage - 1)}>上一页</Button> <Button type="button" variant="outline" disabled={samplePage * 20 >= samples.total} onClick={() => setSamplePage(samplePage + 1)}>下一页</Button></> : <p>暂无样品。</p> : <p>正在载入样品…</p>}<Link className="text-link" to="/samples">创建或管理样品</Link></section></>
}


function ReactionSolvents({ reactionId, revision, legacy, onSaved }: { reactionId: string; revision: number; legacy: string | null; onSaved: () => void }) {
  const [data, setData] = useState<Page<Component> | null>(null)
  const [compounds, setCompounds] = useState<Record<string, Compound>>({})
  const [page, setPage] = useState(1)
  const [editing, setEditing] = useState<Component | "new" | null>(null)
  const [error, setError] = useState("")
  useEffect(() => {
    let active = true
    void request<Page<Component>>(`/reactions/${reactionId}/components?${query({ solvents_only: "true", page, page_size: 100 })}`).then(async result => {
      const entries = await Promise.all([...new Set(result.items.map(row => row.compound_id))].map(async id => [id, await request<Compound>(`/compounds/${id}`)] as const))
      if (active) { if (!result.items.length && page > 1) setPage(page - 1); else { setData(result); setCompounds(Object.fromEntries(entries)); setError("") } }
    }).catch(reason => { if (active) setError(errorText(reason)) })
    return () => { active = false }
  }, [reactionId, revision, page])
  async function remove(row: Component) {
    if (!window.confirm("删除这个溶剂？")) return
    try { await request<void>(`/reactions/${reactionId}/components/${row.id}?expected_version=${row.version}`, { method: "DELETE" }); onSaved() } catch (reason) { setError(errorText(reason)) }
  }
  return <section aria-label="溶剂记录"><div className="dosing-heading"><div className="reaction-section-title"><span>03</span><h4>溶剂</h4></div><Button type="button" variant="outline" disabled={editing !== null} onClick={() => setEditing("new")}><Plus size={15} />添加溶剂</Button></div>{error && <p role="alert">{error}</p>}<div className="table-scroll solvent-table-scroll" aria-label="溶剂表"><table className="solvent-table"><thead><tr><th>名称</th><th>化学式</th><th>CAS 号</th><th>体积 (mL)</th><th>操作</th></tr></thead><tbody>{data?.items.map(row => {
    const compound = compounds[row.compound_id]
    return <tr key={row.id}><td className="reagent-name"><Link to={`/compounds/${row.compound_id}`}>{compound?.name || compound?.codename || "系统名称待补充"}</Link>{compound?.codename && <small>代号：{compound.codename}</small>}{row.notes && <small>{row.notes}</small>}</td><td>{compound?.molecular_formula || "—"}</td><td>{compound?.cas_number || "—"}</td><td>{doseIn(row, "mL")}{row.amount !== null && doseIn(row, "mL") === "—" && <small>{formatDecimal(row.amount)} {row.unit}</small>}</td><td><div className="dosing-actions"><Button type="button" variant="outline" disabled={editing !== null} onClick={() => setEditing(row)}>编辑溶剂</Button><Button type="button" variant="outline" disabled={editing !== null} onClick={() => void remove(row)}>删除溶剂</Button></div></td></tr>
  })}{legacy && page === 1 && <tr><td>{legacy}</td><td>—</td><td>—</td><td>—</td><td>—</td></tr>}{!data && <tr><td colSpan={5}>正在读取溶剂…</td></tr>}{data && !data.items.length && !legacy && <tr><td colSpan={5} className="dosing-empty">暂无溶剂</td></tr>}</tbody></table></div>{data && data.total > 100 && <div className="form-actions"><Button type="button" variant="outline" disabled={page === 1 || editing !== null} onClick={() => setPage(page - 1)}>上一页</Button><span>第 {page} 页</span><Button type="button" variant="outline" disabled={page * 100 >= data.total || editing !== null} onClick={() => setPage(page + 1)}>下一页</Button></div>}{editing !== null && <ReactantEditor key={editing === "new" ? "new-solvent" : editing.id} reactionId={reactionId} solvent row={editing === "new" ? undefined : editing} onCancel={() => setEditing(null)} onSaved={() => { setEditing(null); onSaved() }} />}</section>
}
