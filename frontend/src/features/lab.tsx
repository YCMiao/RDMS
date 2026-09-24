import { Boxes } from "lucide-react"
import { useEffect, useState, type FormEvent } from "react"
import { Link, useNavigate, useParams } from "react-router-dom"
import { Button } from "../components/ui/button"
import { EmptyPanel } from "../components/empty-panel"
import { request, query, type Compound, type Experiment, type Page } from "../services/records"
import type { components } from "../types/api.generated"

type Sample = components["schemas"]["SampleOut"]
type Reaction = components["schemas"]["ReactionOut"]
type Component = components["schemas"]["ComponentOut"]
type Role = components["schemas"]["ComponentFields"]["role"]
const roles: [Role, string][] = [["substrate", "底物"], ["reagent", "试剂"], ["catalyst", "催化剂"], ["ligand", "配体"], ["base", "碱"], ["solvent", "溶剂"], ["additive", "添加剂"], ["product", "产物"]]
const errorText = (reason: unknown) => reason instanceof Error ? reason.message : "操作失败"
const decimal = (value: string) => value.trim() || null

function ReactionScheme({ rows, reaction }: { rows: Component[]; reaction: Reaction }) {
  const [compounds, setCompounds] = useState<Record<string, Compound>>({})
  useEffect(() => {
    let active = true
    const ids = [...new Set(rows.map(row => row.compound_id))]
    void Promise.allSettled(ids.map(id => request<Compound>(`/compounds/${id}`))).then(results => {
      if (!active) return
      setCompounds(Object.fromEntries(results.flatMap((result, index) => result.status === "fulfilled" ? [[ids[index], result.value] as const] : [])))
    })
    return () => { active = false }
  }, [rows])
  const substrates = rows.filter(row => row.role === "substrate")
  const products = rows.filter(row => row.role === "product")
  const auxiliaries = rows.filter(row => row.role !== "substrate" && row.role !== "product")
  const compoundCard = (row: Component) => {
    const compound = compounds[row.compound_id]
    return <Link className="reaction-molecule" key={row.id} to={`/compounds/${row.compound_id}`}>
      <span className="reaction-role">{roles.find(([role]) => role === row.role)?.[1]}</span>
      {compound?.structure_molfile ? <img src={`/api/compounds/${row.compound_id}/structure.svg`} alt={`${compound.name} 的化学结构`} /> : <span className="reaction-no-structure">{compound ? "未录入结构" : "正在读取化合物"}</span>}
      <strong>{compound?.name || row.compound_id.slice(0, 8)}</strong>
      <small>{[row.amount && `${row.amount} ${row.unit || ""}`.trim(), row.mmol && `${row.mmol} mmol`, row.equivalents && `${row.equivalents} eq`, row.yield_percent && `${row.yield_percent}% 收率`].filter(Boolean).join(" · ") || "未记录用量"}</small>
    </Link>
  }
  return <div className="reaction-sheet" aria-label="反应式">
    <div className="reaction-side"><span className="reaction-side-title">反应物</span><div className="reaction-molecules">{substrates.length ? substrates.map(compoundCard) : <span className="reaction-placeholder">添加底物后显示结构</span>}</div></div>
    <div className="reaction-center"><div className="reaction-reagents">{auxiliaries.length ? auxiliaries.map(row => <span key={row.id}>{compounds[row.compound_id]?.name || roles.find(([role]) => role === row.role)?.[1]}{row.equivalents ? ` · ${row.equivalents} eq` : ""}</span>) : <span>试剂与催化剂</span>}</div><div className="reaction-arrow" aria-hidden="true" /><div className="reaction-conditions">{[reaction.solvent, reaction.temperature_c && `${reaction.temperature_c} °C`, reaction.reaction_time_hours && `${reaction.reaction_time_hours} h`, reaction.atmosphere].filter(Boolean).join(" · ") || "添加溶剂与条件"}</div></div>
    <div className="reaction-side"><span className="reaction-side-title">产物</span><div className="reaction-molecules">{products.length ? products.map(compoundCard) : <span className="reaction-placeholder">添加产物后显示结构</span>}</div></div>
  </div>
}

export function CompoundPicker({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const [term, setTerm] = useState("")
  const [page, setPage] = useState(1)
  const [data, setData] = useState<Page<Compound> | null>(null)
  const [error, setError] = useState("")
  const [selected, setSelected] = useState<Compound | null>(null)
  useEffect(() => { if (value) void request<Compound>(`/compounds/${value}`).then(setSelected).catch(() => setSelected(null)) }, [value])
  useEffect(() => { void request<Page<Compound>>(`/compounds?${query({ q: term, page, page_size: 20 })}`).then(setData).catch(reason => setError(errorText(reason))) }, [term, page])
  return <div className="relation-picker"><label>查找化合物<input value={term} onChange={event => { setTerm(event.target.value); setPage(1) }} placeholder="名称或编号" /></label><label>化合物<select value={value} onChange={event => onChange(event.target.value)}><option value="">{data ? "请选择" : "加载中…"}</option>{selected && !data?.items.some(item => item.id === selected.id) && <option value={selected.id}>{selected.compound_code} · {selected.name}</option>}{data?.items.map(item => <option key={item.id} value={item.id}>{item.compound_code} · {item.name}</option>)}</select></label>{data && data.total > 20 && <Button type="button" variant="outline" onClick={() => setPage(page + 1)} disabled={page * 20 >= data.total}>下一页</Button>}<Link className="text-link" to="/compounds/import">从结构建档</Link><Link className="text-link" to="/compounds/new">手动新建</Link>{error && <p role="alert">{error}</p>}</div>
}

export function SamplesPage() {
  const [data, setData] = useState<Page<Sample> | null>(null)
  const [experiments, setExperiments] = useState<Page<Experiment> | null>(null)
  const [filter, setFilter] = useState("")
  const [page, setPage] = useState(1)
  const [error, setError] = useState("")
  const [revision, setRevision] = useState(0)
  const [form, setForm] = useState({ experiment_id: "", sample_type: "", name: "", compound_id: "", amount: "", unit: "", concentration: "", concentration_unit: "", notes: "" })
  const [busy, setBusy] = useState(false)
  useEffect(() => { void request<Page<Sample>>(`/samples?${query({ q: filter, page, page_size: 20 })}`).then(setData).catch(reason => setError(errorText(reason))) }, [filter, page, revision])
  useEffect(() => { void request<Page<Experiment>>("/experiments?page_size=100").then(setExperiments).catch(reason => setError(errorText(reason))) }, [])
  async function create(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError("")
    try {
      await request<Sample>("/samples", { method: "POST", body: JSON.stringify({ experiment_id: form.experiment_id, sample_type: form.sample_type, name: form.name || null, compound_id: form.compound_id || null, amount: decimal(form.amount), unit: form.unit || null, concentration: decimal(form.concentration), concentration_unit: form.concentration_unit || null, notes: form.notes || null }) })
      setForm({ experiment_id: form.experiment_id, sample_type: "", name: "", compound_id: "", amount: "", unit: "", concentration: "", concentration_unit: "", notes: "" }); setRevision(revision + 1)
    } catch (reason) { setError(errorText(reason)) } finally { setBusy(false) }
  }
  return <main className="records-page"><div className="page-heading"><div><span className="eyebrow">SAMPLES</span><h1>样品</h1><p>为实验保存样品、数量与浓度；混合物可以不关联单一化合物。</p></div></div>{error && <p role="alert">{error}</p>}
    <section className="relation-section sample-create-section"><h2>创建样品</h2><form className="record-form" onSubmit={event => void create(event)}><div className="form-grid"><label>所属实验 *<select required value={form.experiment_id} onChange={event => setForm({ ...form, experiment_id: event.target.value })}><option value="">请选择实验</option>{experiments?.items.map(item => <option key={item.id} value={item.id}>{item.experiment_code} · {item.title}</option>)}</select></label><label>样品类型 *<input required value={form.sample_type} onChange={event => setForm({ ...form, sample_type: event.target.value })} /></label><label>名称<input value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} /></label><CompoundPicker value={form.compound_id} onChange={value => setForm({ ...form, compound_id: value })} />{([ ["amount", "数量"], ["unit", "单位"], ["concentration", "浓度"], ["concentration_unit", "浓度单位"] ] as const).map(([key, label]) => <label key={key}>{label}<input value={form[key]} onChange={event => setForm({ ...form, [key]: event.target.value })} /></label>)}<label>备注<textarea value={form.notes} onChange={event => setForm({ ...form, notes: event.target.value })} /></label></div><Button disabled={busy}>{busy ? "保存中…" : "创建样品"}</Button></form></section>
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
  useEffect(() => { if (id) void request<Sample>(`/samples/${id}`).then(value => { setItem(value); setForm({ name: value.name || "", sample_type: value.sample_type, compound_id: value.compound_id || "", amount: value.amount || "", unit: value.unit || "", concentration: value.concentration || "", concentration_unit: value.concentration_unit || "", notes: value.notes || "" }) }).catch(reason => setError(errorText(reason))) }, [id])
  async function save(event: FormEvent) {
    event.preventDefault(); if (!item) return; setBusy(true); setError("")
    try { const updated = await request<Sample>(`/samples/${item.id}`, { method: "PATCH", body: JSON.stringify({ expected_version: item.version, name: form.name || null, sample_type: form.sample_type, compound_id: form.compound_id || null, amount: decimal(form.amount), unit: form.unit || null, concentration: decimal(form.concentration), concentration_unit: form.concentration_unit || null, notes: form.notes || null }) }); setItem(updated); setError("已保存") } catch (reason) { setError(errorText(reason)) } finally { setBusy(false) }
  }
  async function remove() { if (!item || !window.confirm("确定删除样品？")) return; try { await request<void>(`/samples/${item.id}?expected_version=${item.version}`, { method: "DELETE" }); setItem({ ...item, version: item.version + 1 }); setDeleted(true) } catch (reason) { setError(errorText(reason)) } }
  async function restore() { if (!item) return; try { setItem(await request<Sample>(`/samples/${item.id}/restore`, { method: "POST", body: JSON.stringify({ expected_version: item.version }) })); setDeleted(false) } catch (reason) { setError(errorText(reason)) } }
  return <main className="records-page editor-page"><div className="page-heading"><div><span className="eyebrow">SAMPLE / {item?.sample_code}</span><h1>{item?.name || item?.sample_code || "样品"}</h1></div><Link to="/samples" className="text-link">返回样品</Link></div>{error && <p role="alert">{error}</p>}{item && <p>来源实验：<Link to={`/experiments/${item.experiment_id}`}>查看实验</Link> · 版本 {item.version}</p>}{deleted ? <Button onClick={() => void restore()}>恢复样品</Button> : item && <form className="record-form" onSubmit={event => void save(event)}><div className="form-grid"><label>名称<input value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} /></label><label>样品类型 *<input required value={form.sample_type} onChange={event => setForm({ ...form, sample_type: event.target.value })} /></label><CompoundPicker value={form.compound_id} onChange={value => setForm({ ...form, compound_id: value })} />{([ ["amount", "数量"], ["unit", "单位"], ["concentration", "浓度"], ["concentration_unit", "浓度单位"] ] as const).map(([key, label]) => <label key={key}>{label}<input value={form[key]} onChange={event => setForm({ ...form, [key]: event.target.value })} /></label>)}<label>备注<textarea value={form.notes} onChange={event => setForm({ ...form, notes: event.target.value })} /></label></div><div className="form-actions"><Button disabled={busy}>保存修改</Button><Button type="button" variant="outline" onClick={() => void remove()}>删除样品</Button><Button type="button" variant="outline" onClick={() => navigate("/samples")}>返回</Button></div></form>}</main>
}

function ReactionCard({ item, onChange }: { item: Reaction; onChange: () => void }) {
  const [form, setForm] = useState({ reaction_name: item.reaction_name, temperature_c: item.temperature_c || "", reaction_time_hours: item.reaction_time_hours || "", atmosphere: item.atmosphere || "", solvent: item.solvent || "", workup: item.workup || "", purification: item.purification || "", notes: item.notes || "" })
  const [version, setVersion] = useState(item.version)
  const [rows, setRows] = useState<Page<Component> | null>(null)
  const [page, setPage] = useState(1)
  const [revision, setRevision] = useState(0)
  const [error, setError] = useState("")
  const [compound, setCompound] = useState("")
  const [component, setComponent] = useState({ role: "substrate" as Role, amount: "", unit: "", mmol: "", equivalents: "", yield_percent: "", sort_order: "", notes: "" })
  useEffect(() => { void request<Page<Component>>(`/reactions/${item.id}/components?${query({ page, page_size: 100 })}`).then(setRows).catch(reason => setError(errorText(reason))) }, [item.id, page, revision])
  async function save(event: FormEvent) {
    event.preventDefault(); setError("")
    try { const result = await request<Reaction>(`/reactions/${item.id}`, { method: "PATCH", body: JSON.stringify({ expected_version: version, reaction_name: form.reaction_name, temperature_c: decimal(form.temperature_c), reaction_time_hours: decimal(form.reaction_time_hours), atmosphere: form.atmosphere || null, solvent: form.solvent || null, workup: form.workup || null, purification: form.purification || null, notes: form.notes || null }) }); setVersion(result.version); onChange(); setError("反应已保存") } catch (reason) { setError(errorText(reason)) }
  }
  async function add(event: FormEvent) {
    event.preventDefault(); setError("")
    try { await request<Component>(`/reactions/${item.id}/components`, { method: "POST", body: JSON.stringify({ compound_id: compound, role: component.role, amount: decimal(component.amount), unit: component.unit || null, mmol: decimal(component.mmol), equivalents: decimal(component.equivalents), yield_percent: decimal(component.yield_percent), sort_order: component.sort_order ? Number(component.sort_order) : null, notes: component.notes || null }) }); setRevision(revision + 1); setCompound(""); setComponent({ role: "substrate", amount: "", unit: "", mmol: "", equivalents: "", yield_percent: "", sort_order: "", notes: "" }) } catch (reason) { setError(errorText(reason)) }
  }
  async function removeComponent(row: Component) { if (!window.confirm("删除这个组分？")) return; try { await request<void>(`/reactions/${item.id}/components/${row.id}?expected_version=${row.version}`, { method: "DELETE" }); setRevision(revision + 1) } catch (reason) { setError(errorText(reason)) } }
  async function removeReaction() { if (!window.confirm("删除整个反应及其可见组分？")) return; try { await request<void>(`/reactions/${item.id}?expected_version=${version}`, { method: "DELETE" }); onChange() } catch (reason) { setError(errorText(reason)) } }
  return <article className="relation-section reaction-entry"><div className="reaction-entry-heading"><div><span className="eyebrow">REACTION / {item.id.slice(0, 8)}</span><h3>{item.reaction_name}</h3></div><span className="reaction-count">{rows?.total ?? 0} 个组分</span></div>{error && <p role="alert">{error}</p>}
    {rows ? <ReactionScheme rows={rows.items} reaction={{ ...item, ...form }} /> : <p>正在载入反应式…</p>}
    <form className="record-form reaction-details" onSubmit={event => void save(event)}><div className="reaction-section-title"><span>01</span><h4>条件与处理</h4></div><div className="form-grid"><label>反应名称 *<input required value={form.reaction_name} onChange={event => setForm({ ...form, reaction_name: event.target.value })} /></label>{([ ["temperature_c", "温度 °C"], ["reaction_time_hours", "时间 h"], ["atmosphere", "气氛"], ["solvent", "溶剂"] ] as const).map(([key, label]) => <label key={key}>{label}<input value={form[key]} onChange={event => setForm({ ...form, [key]: event.target.value })} /></label>)}<label className="wide-field">后处理<textarea rows={3} value={form.workup} onChange={event => setForm({ ...form, workup: event.target.value })} placeholder="例如：淬灭、萃取、洗涤、干燥、浓缩" /></label><label className="wide-field">纯化<textarea rows={3} value={form.purification} onChange={event => setForm({ ...form, purification: event.target.value })} placeholder="例如：柱层析洗脱体系、重结晶、制备 HPLC" /></label><label className="wide-field">补充备注<textarea rows={2} value={form.notes} onChange={event => setForm({ ...form, notes: event.target.value })} /></label></div><div className="form-actions"><Button>保存反应</Button><Button type="button" variant="outline" onClick={() => void removeReaction()}>删除反应</Button></div></form>
    <div className="reaction-section-title"><span>02</span><h4>参与物和用量</h4></div>{rows ? rows.items.length ? <><div className="table-scroll"><table><thead><tr><th>顺序</th><th>角色</th><th>化合物</th><th>数量</th><th>mmol</th><th>当量</th><th>收率 %</th><th>操作</th></tr></thead><tbody>{rows.items.map(row => <tr key={row.id}><td>{row.sort_order}</td><td>{roles.find(([role]) => role === row.role)?.[1]}</td><td><Link to={`/compounds/${row.compound_id}`}>{row.compound_id.slice(0, 8)}</Link></td><td>{row.amount ? `${row.amount} ${row.unit}` : "—"}</td><td>{row.mmol || "—"}</td><td>{row.equivalents || "—"}</td><td>{row.yield_percent || "—"}</td><td><ComponentEdit reactionId={item.id} row={row} onChange={() => setRevision(revision + 1)} /> <Button type="button" variant="outline" onClick={() => void removeComponent(row)}>删除</Button></td></tr>)}</tbody></table></div>{rows.total > 100 && <><Button type="button" variant="outline" disabled={page === 1} onClick={() => setPage(page - 1)}>上一页</Button><Button type="button" variant="outline" disabled={page * 100 >= rows.total} onClick={() => setPage(page + 1)}>下一页</Button></>}</> : <p>暂无组分。</p> : <p>正在载入组分…</p>}
    <form className="record-form" onSubmit={event => void add(event)}><h4>添加组分</h4><CompoundPicker value={compound} onChange={setCompound} /><div className="form-grid"><label>角色<select value={component.role} onChange={event => setComponent({ ...component, role: event.target.value as Role })}>{roles.map(([role, label]) => <option key={role} value={role}>{label}</option>)}</select></label>{([ ["amount", "数量"], ["unit", "单位"], ["mmol", "mmol"], ["equivalents", "当量"], ["yield_percent", "收率 %"], ["sort_order", "顺序"], ["notes", "备注"] ] as const).map(([key, label]) => <label key={key}>{label}<input value={component[key]} onChange={event => setComponent({ ...component, [key]: event.target.value })} /></label>)}</div><Button disabled={!compound}>添加组分</Button></form></article>
}

function ComponentEdit({ reactionId, row, onChange }: { reactionId: string; row: Component; onChange: () => void }) {
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ compound_id: row.compound_id, role: row.role as Role, amount: row.amount || "", unit: row.unit || "", mmol: row.mmol || "", equivalents: row.equivalents || "", yield_percent: row.yield_percent || "", sort_order: String(row.sort_order), notes: row.notes || "" })
  const [error, setError] = useState("")
  async function save(event: FormEvent) { event.preventDefault(); try { await request<Component>(`/reactions/${reactionId}/components/${row.id}`, { method: "PATCH", body: JSON.stringify({ expected_version: row.version, compound_id: form.compound_id, role: form.role, amount: decimal(form.amount), unit: form.unit || null, mmol: decimal(form.mmol), equivalents: decimal(form.equivalents), yield_percent: decimal(form.yield_percent), sort_order: Number(form.sort_order), notes: form.notes || null }) }); setOpen(false); onChange() } catch (reason) { setError(errorText(reason)) } }
  return <>{<Button type="button" variant="outline" onClick={() => setOpen(!open)}>编辑</Button>}{open && <form className="record-form" onSubmit={event => void save(event)}>{error && <p role="alert">{error}</p>}<CompoundPicker value={form.compound_id} onChange={value => setForm({ ...form, compound_id: value })} /><label>角色<select value={form.role} onChange={event => setForm({ ...form, role: event.target.value as Role })}>{roles.map(([role, label]) => <option key={role} value={role}>{label}</option>)}</select></label>{([ ["amount", "数量"], ["unit", "单位"], ["mmol", "mmol"], ["equivalents", "当量"], ["yield_percent", "收率 %"], ["sort_order", "顺序"], ["notes", "备注"] ] as const).map(([key, label]) => <label key={key}>{label}<input value={form[key]} onChange={event => setForm({ ...form, [key]: event.target.value })} /></label>)}<Button>保存组分</Button></form>}</>
}

export function ExperimentLab({ experimentId }: { experimentId: string }) {
  const [samples, setSamples] = useState<Page<Sample> | null>(null)
  const [reactions, setReactions] = useState<Page<Reaction> | null>(null)
  const [page, setPage] = useState(1)
  const [revision, setRevision] = useState(0)
  const [samplePage, setSamplePage] = useState(1)
  const [error, setError] = useState("")
  const [name, setName] = useState("")
  useEffect(() => { void request<Page<Sample>>(`/samples?${query({ experiment_id: experimentId, page: samplePage, page_size: 20 })}`).then(setSamples).catch(reason => setError(errorText(reason))) }, [experimentId, samplePage, revision])
  useEffect(() => { void request<Page<Reaction>>(`/experiments/${experimentId}/reactions?${query({ page, page_size: 10 })}`).then(setReactions).catch(reason => setError(errorText(reason))) }, [experimentId, page, revision])
  async function create(event: FormEvent) { event.preventDefault(); try { await request<Reaction>(`/experiments/${experimentId}/reactions`, { method: "POST", body: JSON.stringify({ reaction_name: name }) }); setName(""); setRevision(revision + 1) } catch (reason) { setError(errorText(reason)) } }
  return <><section className="relation-section"><h2>反应记录</h2>{error && <p role="alert">{error}</p>}<form className="relation-picker" onSubmit={event => void create(event)}><label>新反应名称<input required value={name} onChange={event => setName(event.target.value)} /></label><Button>创建反应</Button></form>{reactions ? reactions.items.length ? <>{reactions.items.map(item => <ReactionCard key={item.id} item={item} onChange={() => setRevision(revision + 1)} />)}<p>第 {page} 页，共 {reactions.total} 个反应</p><Button type="button" variant="outline" disabled={page === 1} onClick={() => setPage(page - 1)}>上一页</Button> <Button type="button" variant="outline" disabled={page * 10 >= reactions.total} onClick={() => setPage(page + 1)}>下一页</Button></> : <p>暂无反应。</p> : <p>正在载入反应…</p>}</section><section className="relation-section"><h2>样品</h2>{samples ? samples.items.length ? <><p>共 {samples.total} 个样品</p><div className="table-scroll"><table><thead><tr><th>编号</th><th>名称</th><th>类型</th></tr></thead><tbody>{samples.items.map(item => <tr key={item.id}><td><Link to={`/samples/${item.id}`}>{item.sample_code}</Link></td><td>{item.name || "—"}</td><td>{item.sample_type}</td></tr>)}</tbody></table></div><Button type="button" variant="outline" disabled={samplePage === 1} onClick={() => setSamplePage(samplePage - 1)}>上一页</Button> <Button type="button" variant="outline" disabled={samplePage * 20 >= samples.total} onClick={() => setSamplePage(samplePage + 1)}>下一页</Button></> : <p>暂无样品。</p> : <p>正在载入样品…</p>}<Link className="text-link" to="/samples">创建或管理样品</Link></section></>
}
