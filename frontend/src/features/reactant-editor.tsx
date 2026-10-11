import { useEffect, useRef, useState, type FormEvent } from "react"
import { Button } from "../components/ui/button"
import { formatDecimal, formatDecimalInput } from "../lib/format-mass"
import { request, type Compound, type Page } from "../services/records"
import type { components } from "../types/api.generated"
import { massToMg, productYield } from "../lib/yield"
import { reactantRoles, validCas } from "../lib/reagents"
import { CompoundPicker } from "./lab"

type Component = components["schemas"]["ComponentOut"]
type Role = components["schemas"]["ComponentFields"]["role"]
type Candidate = components["schemas"]["ReagentCandidate"]
type Lookup = components["schemas"]["CasLookupResult"]
const errorText = (reason: unknown) => reason instanceof Error ? reason.message : "操作失败"
const decimal = (value: string) => value.trim() || null

export function ReactantEditor({ reactionId, row, product = false, solvent = false, onSaved, onCancel }: { reactionId: string; row?: Component; product?: boolean; solvent?: boolean; onSaved: () => void; onCancel: () => void }) {
  const noun = product ? "产物" : solvent ? "溶剂" : "反应物"
  const [mode, setMode] = useState<"cas" | "local" | "manual">(row || product ? "local" : "cas")
  const [cas, setCas] = useState("")
  const [lookup, setLookup] = useState<Lookup | null>(null)
  const [selected, setSelected] = useState<Compound | Candidate | null>(null)
  const [compoundId, setCompoundId] = useState(row?.compound_id || "")
  const [manual, setManual] = useState({ name: "", codename: "", molecular_formula: "", molecular_weight: "", cas_number: "" })
  const [form, setForm] = useState({ role: row?.role || (product ? "product" : solvent ? "solvent" : "substrate"), amount: formatDecimalInput(row?.amount), unit: row?.unit || (solvent ? "mL" : "mg"), mmol: formatDecimalInput(row?.mmol), equivalents: formatDecimalInput(row?.equivalents), notes: row?.notes || "", yield_percent: formatDecimalInput(row?.yield_percent) })
  const [isLimiting, setIsLimiting] = useState(row?.is_limiting || false)
  const [ratio, setRatio] = useState(formatDecimalInput(row?.stoichiometric_ratio) || "1")
  const [autoYield, setAutoYield] = useState(!row)
  const [limitingMmol, setLimitingMmol] = useState<number | null>(null)
  const [otherLimiting, setOtherLimiting] = useState(false)
  const [mmolPerEq, setMmolPerEq] = useState<number | null>(null)
  const [retry, setRetry] = useState(0)
  const [finding, setFinding] = useState(false)
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  const saving = useRef(false)
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => { inputRef.current?.focus() }, [])
  useEffect(() => {
    if (mode !== "cas" || !validCas(cas.trim())) return
    let active = true
    const timer = window.setTimeout(() => {
      setFinding(true)
      void request<Lookup>("/compounds/cas/lookup", { method: "POST", body: JSON.stringify({ cas_number: cas.trim() }) }).then(result => {
        if (!active) return
        setLookup(result)
        if (result.local_matches.length === 1) { setSelected(result.local_matches[0]); setCompoundId(result.local_matches[0].id) }
        else if (!result.local_matches.length && result.candidates.length === 1) setSelected(result.candidates[0])
      }).catch(reason => { if (active) setError(errorText(reason)) }).finally(() => { if (active) setFinding(false) })
    }, 500)
    return () => { active = false; window.clearTimeout(timer) }
  }, [cas, mode, retry])
  useEffect(() => {
    if (mode !== "local" || !compoundId) return
    let active = true
    void request<Compound>(`/compounds/${compoundId}`).then(value => { if (active) setSelected(value) }).catch(reason => { if (active) setError(errorText(reason)) })
    return () => { active = false }
  }, [compoundId, mode])
  useEffect(() => {
    let active = true
    setMmolPerEq(null)
    setLimitingMmol(null); setOtherLimiting(false)
    async function loadBasis() {
      let page = 1
      let seen = 0
      const rows: Component[] = []
      while (active) {
        const result = await request<Page<Component>>(`/reactions/${reactionId}/components?page=${page}&page_size=100&reactants_only=true`)
        rows.push(...result.items)
        seen += result.items.length
        if (!result.items.length || seen >= result.total) break
        page++
      }
      if (!active) return
      const limiting = rows.find(item => item.is_limiting)
      let n = limiting?.mmol != null ? Number(limiting.mmol) : null
      if (limiting && n === null && limiting.amount !== null && massToMg[limiting.unit || ""]) {
        const compound = await request<Compound>(`/compounds/${limiting.compound_id}`)
        if (Number(compound.molecular_weight) > 0) n = Number(limiting.amount) * massToMg[limiting.unit || ""] / Number(compound.molecular_weight)
      }
      if (!active) return
      setLimitingMmol(n); setOtherLimiting(Boolean(limiting && limiting.id !== row?.id))
      const basis = rows.find(item => item.id !== row?.id && Number(item.mmol) > 0 && Number(item.equivalents) > 0)
      if (limiting) setMmolPerEq(n && n > 0 ? n : null)
      else if (basis) setMmolPerEq(Number(basis.mmol) / Number(basis.equivalents))
    }
    void loadBasis().catch(reason => { if (active) setError(errorText(reason)) })
    return () => { active = false }
  }, [reactionId, row?.id, product])
  const identity = mode === "manual" ? manual : selected
  const mw = Number(identity?.molecular_weight)
  const yieldResult = productYield(form.amount, form.unit, mw, limitingMmol, ratio)
  const yieldValue = product && autoYield ? yieldResult.value || "" : form.yield_percent
  function switchMode(next: typeof mode) { setMode(next); setSelected(null); setCompoundId(""); setLookup(null); setFinding(false); setError(""); setCas(""); if (product) setAutoYield(true) }
  const dosingValue = (number: number) => number.toFixed(8).replace(/\.?0+$/, "") || "0"
  function withMmol(current: typeof form, value: string, limiting = isLimiting, weight = mw) {
    const next = { ...current, mmol: value }
    const n = Number(value)
    if (!value.trim() || !Number.isFinite(n) || n < 0) return next
    if (!product && !solvent && !limiting && mmolPerEq && Number.isFinite(mmolPerEq)) next.equivalents = dosingValue(n / mmolPerEq)
    if (massToMg[current.unit] && weight > 0 && Number.isFinite(weight)) {
      const amount = n * weight / massToMg[current.unit]
      if (Number.isFinite(amount)) next.amount = dosingValue(amount)
    }
    return next
  }
  function changeDosing(field: "mmol" | "equivalents" | "amount", value: string) {
    setForm(current => {
      const next = { ...current, [field]: value }
      const n = Number(value)
      if (!value.trim() || !Number.isFinite(n) || n < 0 || solvent) return next
      if (field === "mmol") return withMmol(next, value)
      if (field === "equivalents" && !product && !isLimiting && mmolPerEq && Number.isFinite(mmolPerEq)) {
        const mmol = n * mmolPerEq
        if (Number.isFinite(mmol)) return { ...withMmol(next, dosingValue(mmol)), equivalents: value }
      }
      if (field === "amount" && massToMg[current.unit] && mw > 0 && Number.isFinite(mw)) {
        const mmol = n * massToMg[current.unit] / mw
        if (Number.isFinite(mmol)) return { ...withMmol(next, dosingValue(mmol)), amount: value }
      }
      return next
    })
    if (product) setAutoYield(true)
  }
  async function save(event: FormEvent) {
    event.preventDefault()
    if (saving.current) return
    setError("")
    if (!identity || (mode === "local" && !compoundId)) { setError(`请先选择${noun}`); return }
    if (mode === "manual" && manual.cas_number && !validCas(manual.cas_number.trim())) { setError("CAS 号格式或校验位无效"); return }
    saving.current = true; setBusy(true)
    try {
      let id = compoundId
      if (!id) {
        const candidate = identity as Candidate
        const created = await request<Compound>("/compounds", { method: "POST", body: JSON.stringify({
          name: identity.name?.trim() || null, codename: mode === "manual" ? manual.codename.trim() || null : null,
          molecular_formula: identity.molecular_formula?.trim() || null, molecular_weight: decimal(String(identity.molecular_weight || "")),
          cas_number: identity.cas_number?.trim() || null, cas_source: mode === "manual" ? "手工录入" : candidate.source,
          notes: mode === "manual" ? null : `资料来源：${candidate.source_url}`, tag_ids: [],
        }) })
        id = created.id; setCompoundId(id); setSelected(created)
      }
      await request<Component>(`/reactions/${reactionId}/components${row ? `/${row.id}` : ""}`, { method: row ? "PATCH" : "POST", body: JSON.stringify({
        ...(row && { expected_version: row.version }), compound_id: id, role: product ? "product" : solvent ? "solvent" : form.role,
        amount: decimal(form.amount), unit: form.amount.trim() ? form.unit : null,
        mmol: decimal(form.mmol), equivalents: isLimiting ? "1" : decimal(form.equivalents), is_limiting: !product && !solvent && isLimiting, ...(product && { yield_percent: decimal(yieldValue), stoichiometric_ratio: decimal(ratio), calculate_yield: autoYield && yieldResult.value !== undefined }), notes: form.notes || null,
      }) })
      onSaved()
    } catch (reason) { setError(errorText(reason)) } finally { saving.current = false; setBusy(false) }
  }
  return <form className="record-form reactant-editor" aria-label={row ? `编辑${noun}` : product ? "记录产物详情" : solvent ? "添加溶剂详情" : "添加反应物详情"} onSubmit={event => void save(event)}>
    <div className="reactant-editor-heading"><h4>{row ? `编辑${noun}` : product ? "记录产物" : solvent ? "添加溶剂" : "添加反应物"}</h4><Button type="button" variant="outline" disabled={busy} onClick={onCancel}>取消</Button></div>
    <fieldset disabled={busy}>
      <div className="reactant-modes" aria-label={`选择${noun}方式`}>{([["cas", "按 CAS 查找"], ["local", product ? "本机化合物库" : "本机试剂库"], ["manual", "手动填写"]] as const).map(([value, label]) => <Button key={value} type="button" variant={mode === value ? "default" : "outline"} aria-pressed={mode === value} onClick={() => switchMode(value)}>{label}</Button>)}</div>
      {mode === "cas" && <div className="cas-search"><label>CAS 号<input ref={inputRef} value={cas} placeholder="例如 64-17-5" onChange={event => { setCas(event.target.value); setLookup(null); setSelected(null); setCompoundId(""); setFinding(false); setError("") }} /></label><p>输入完整 CAS 号后自动查找，优先使用本机试剂；未收录时查询 PubChem。</p>{cas.trim() && !validCas(cas.trim()) && <p>请输入有效的 CAS 号（含校验位）。</p>}{finding && <p role="status">正在查找试剂…</p>}{lookup?.warnings.map(message => <p key={message} role="status">{message}</p>)}{!finding && validCas(cas.trim()) && (error || Boolean(lookup?.warnings.length)) && <Button type="button" variant="outline" onClick={() => { setError(""); setRetry(retry + 1) }}>重新查询</Button>}{lookup && lookup.local_matches.length + lookup.candidates.length > 1 && <div className="cas-candidates"><p>找到多个匹配，请选择具体试剂：</p>{[...lookup.local_matches, ...lookup.candidates].map((candidate, index) => <Button key={index} type="button" variant="outline" onClick={() => { setSelected(candidate); setCompoundId("id" in candidate ? candidate.id : "") }}>{candidate.name || ("codename" in candidate ? candidate.codename : "系统名称待补充")} · {candidate.molecular_formula} · {"id" in candidate ? candidate.cas_number : "PubChem"}</Button>)}</div>}</div>}
      {mode === "local" && <CompoundPicker value={compoundId} onChange={id => { setSelected(null); setCompoundId(id); if (product) setAutoYield(true) }} />}
      {mode === "manual" && <div className="form-grid">{([["name", "名称（IUPAC）"], ["codename", "代号"] , ["molecular_formula", "化学式"], ["cas_number", "CAS 号"], ["molecular_weight", "Mw (g/mol)"]] as const).map(([key, label]) => <label key={key}>{label}<input maxLength={key === "molecular_formula" ? 200 : 300} value={manual[key]} onChange={event => { setManual({ ...manual, [key]: event.target.value }); setCompoundId(""); if (key === "molecular_weight") { setForm(current => withMmol(current, current.mmol, isLimiting, Number(event.target.value))); if (product) setAutoYield(true) } }} /></label>)}</div>}
      {mode !== "manual" && selected && <div className="reagent-preview"><strong>{selected.name || "系统名称待补充"}</strong>{!selected.name && <small>系统名称待补充</small>}{"codename" in selected && selected.codename && <small>代号：{selected.codename}</small>}<dl><div><dt>化学式</dt><dd>{selected.molecular_formula || "—"}</dd></div><div><dt>CAS</dt><dd>{selected.cas_number || "—"}</dd></div><div><dt>Mw (g/mol)</dt><dd>{formatDecimal(selected.molecular_weight) || "—"}</dd></div></dl>{"source_url" in selected && <a className="text-link" href={selected.source_url} target="_blank" rel="noreferrer">查看 PubChem 资料</a>}</div>}
      <div className={`form-grid dosing-inputs${!product && !solvent ? " reactant-dosing-inputs" : ""}`}>{!product && !solvent && <label>角色<select aria-label="角色" value={form.role} onChange={event => setForm({ ...form, role: event.target.value as Role })}>{reactantRoles.filter(([value]) => value !== "solvent").map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>} {!product && !solvent && <label className="limiting-choice"><input type="checkbox" checked={isLimiting} disabled={otherLimiting && !isLimiting} title={otherLimiting && !isLimiting ? "已有一个限制反应物，请先取消原勾选" : undefined} onChange={event => { setIsLimiting(event.target.checked); if (event.target.checked) setForm(current => ({ ...withMmol(current, current.mmol, true), equivalents: "1" })) }} />限制反应物（1 eq）</label>}{!product && !solvent && <label>eq<input type="number" min="0" step="any" readOnly={isLimiting} value={isLimiting ? "1" : form.equivalents} onChange={event => changeDosing("equivalents", event.target.value)} /></label>}{!solvent && <label>mmol<input type="number" min="0" step="any" value={form.mmol} onChange={event => changeDosing("mmol", event.target.value)} /></label>}<label>{product ? "产物量" : solvent ? "体积" : "投料量"}<input type="number" min="0" step="any" value={form.amount} onChange={event => changeDosing("amount", event.target.value)} /></label><label>单位<select value={form.unit} onChange={event => { setForm(current => withMmol({ ...current, unit: event.target.value }, current.mmol)); if (product) setAutoYield(true) }}>{[...new Set([...(solvent ? ["mL", "L", "µL"] : ["mg", ...(product ? ["g", "µg"] : []), "mL"]), ...(row?.unit ? [row.unit] : [])])].map(unit => <option key={unit}>{unit}</option>)}</select></label>{product && <label>计量比<input type="number" min="0.00000001" step="any" value={ratio} onChange={event => { setRatio(event.target.value); setAutoYield(true) }} /><small>每 1 mol 限制反应物生成的产物 mol 数</small></label>}{product && <label>收率 %<input type="number" min="0" step="any" value={yieldValue} onChange={event => { setForm({ ...form, yield_percent: event.target.value }); setAutoYield(false) }} /></label>}</div>
      {product && autoYield && yieldResult.message && <p role="status">{yieldResult.message}</p>}
      {product && autoYield && yieldResult.value !== undefined && <p className="helper">收率已自动计算，可手动修改。</p>}
      <label>{product ? "产物备注" : solvent ? "溶剂备注" : "投料备注"}<textarea value={form.notes} onChange={event => setForm({ ...form, notes: event.target.value })} rows={2} /></label>
    </fieldset>
    {error && <p role="alert">{error}</p>}
    <div className="form-actions"><Button disabled={busy || finding || !identity || (mode === "local" && !compoundId)}>{busy ? "保存中…" : row ? `保存${noun}` : product ? "保存产物" : solvent ? "保存溶剂" : "加入投料表"}</Button><Button type="button" variant="outline" disabled={busy} onClick={onCancel}>取消</Button></div>
  </form>
}
