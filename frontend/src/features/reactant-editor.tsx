import { useCallback, useEffect, useRef, useState, type FormEvent } from "react"
import { Button } from "../components/ui/button"
import { formatDecimalInput } from "../lib/format-mass"
import { request, type Compound, type Page } from "../services/records"
import type { components } from "../types/api.generated"
import { massToMg, productYield } from "../lib/yield"
import { reactantRoles, validCas, casCompoundInput } from "../lib/reagents"
import { CompoundPicker } from "./lab"
import { CasCompoundSearch, CasCompoundPreview, type CasSelection } from "./cas-compound"

type Component = components["schemas"]["ComponentOut"]
type Role = components["schemas"]["ComponentFields"]["role"]
type Candidate = components["schemas"]["ReagentCandidate"]
const errorText = (reason: unknown) => reason instanceof Error ? reason.message : "操作失败"
const decimal = (value: string) => value.trim() || null

export function ReactantEditor({ reactionId, row, product = false, solvent = false, onSaved, onCancel }: { reactionId: string; row?: Component; product?: boolean; solvent?: boolean; onSaved: () => void; onCancel: () => void }) {
  const noun = product ? "产物" : solvent ? "溶剂" : "反应物"
  const [mode, setMode] = useState<"cas" | "local" | "manual">(row || product ? "local" : "cas")
  const [selected, setSelected] = useState<Compound | Candidate | null>(null)
  const [compoundId, setCompoundId] = useState(row?.compound_id || "")
  const [manual, setManual] = useState({ name: "", codename: "", molecular_formula: "", molecular_weight: "", cas_number: "" })
  const [form, setForm] = useState({ role: row?.role || (product ? "product" : solvent ? "solvent" : "substrate"), amount: formatDecimalInput(row?.amount), unit: row?.unit || (solvent ? "mL" : "mg"), mmol: formatDecimalInput(row?.mmol), equivalents: formatDecimalInput(row?.equivalents), notes: row?.notes || "", yield_percent: formatDecimalInput(row?.yield_percent) })
  const [isLimiting, setIsLimiting] = useState(row?.is_limiting || false)
  const [ratio, setRatio] = useState(formatDecimalInput(row?.stoichiometric_ratio) || "1")
  const [autoYield, setAutoYield] = useState(!row)
  const [limitingMmol, setLimitingMmol] = useState<number | null>(null)
  const [otherLimiting, setOtherLimiting] = useState(false)
  const [componentVersions, setComponentVersions] = useState<Record<string, number> | null>(null)
  const [scaleRequested, setScaleRequested] = useState(false)
  const [mmolPerEq, setMmolPerEq] = useState<number | null>(null)
  const [finding, setFinding] = useState(false)
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  const saving = useRef(false)
  const selectCas = useCallback((value: CasSelection | null) => { setSelected(value); setCompoundId(value && "id" in value ? value.id : ""); setError("") }, [])
  useEffect(() => {
    if (mode !== "local" || !compoundId) return
    let active = true
    void request<Compound>(`/compounds/${compoundId}`).then(value => { if (active) setSelected(value) }).catch(reason => { if (active) setError(errorText(reason)) })
    return () => { active = false }
  }, [compoundId, mode])
  useEffect(() => {
    let active = true
    setMmolPerEq(null)
    setComponentVersions(null)
    setLimitingMmol(null); setOtherLimiting(false)
    async function loadBasis() {
      let page = 1
      let seen = 0
      const rows: Component[] = []
      while (active) {
        const result = await request<Page<Component>>(`/reactions/${reactionId}/components?page=${page}&page_size=100&reactants_only=true&exclude_solvents=true`)
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
      setComponentVersions(Object.fromEntries(rows.map(item => [item.id, item.version])))
      if (limiting) setMmolPerEq(n && n > 0 ? n : null)
    }
    void loadBasis().catch(reason => { if (active) setError(errorText(reason)) })
    return () => { active = false }
  }, [reactionId, row?.id, product])
  const identity = mode === "manual" ? manual : selected
  const mw = Number(identity?.molecular_weight)
  const yieldResult = productYield(form.amount, form.unit, mw, limitingMmol, ratio)
  const yieldValue = product && autoYield ? yieldResult.value || "" : form.yield_percent
  function switchMode(next: typeof mode) { setMode(next); setSelected(null); setCompoundId(""); setFinding(false); setError(""); if (product) setAutoYield(true) }
  const dosingValue = (number: number) => number.toFixed(8).replace(/\.?0+$/, "") || "0"
  function withMmol(current: typeof form, value: string, weight = mw) {
    const next = { ...current, mmol: value }
    const n = Number(value)
    if (!value.trim() || !Number.isFinite(n) || n < 0) return next
    if (massToMg[current.unit] && weight > 0 && Number.isFinite(weight)) {
      const amount = n * weight / massToMg[current.unit]
      if (Number.isFinite(amount)) next.amount = dosingValue(amount)
    }
    return next
  }
  function changeDosing(field: "mmol" | "equivalents" | "amount", value: string) {
    if (!product && !solvent) {
      if (field === "equivalents" && mmolPerEq) setScaleRequested(false)
      else if (field === "mmol" || (field === "amount" && massToMg[form.unit] && mw > 0 && Number.isFinite(mw))) setScaleRequested(true)
    }
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
  const rescale = !product && !solvent && scaleRequested && Number(form.mmol) > 0 && Number(isLimiting ? "1" : form.equivalents) > 0
  async function save(event: FormEvent) {
    event.preventDefault()
    if (saving.current) return
    setError("")
    if (!identity || (mode === "local" && !compoundId)) { setError(`请先选择${noun}`); return }
    if (mode === "manual" && manual.cas_number && !validCas(manual.cas_number.trim())) { setError("CAS 号格式或校验位无效"); return }
    if (rescale && componentVersions === null) { setError("请等待投料表加载完成后重试；加载失败时请刷新。"); return }
    saving.current = true; setBusy(true)
    try {
      let id = compoundId
      if (!id) {
        const candidate = identity as Candidate
        const created = await request<Compound>("/compounds", { method: "POST", body: JSON.stringify(mode !== "manual" ? casCompoundInput(candidate) : {
          name: manual.name.trim() || null, codename: manual.codename.trim() || null,
          molecular_formula: identity.molecular_formula?.trim() || null, molecular_weight: decimal(String(identity.molecular_weight || "")),
          cas_number: manual.cas_number.trim() || null, cas_source: "手工录入",
          notes: null, tag_ids: [],
          structure_molfile: null,
        }) })
        id = created.id; setCompoundId(id); setSelected(created)
      }
      await request<Component>(`/reactions/${reactionId}/components${row ? `/${row.id}` : ""}`, { method: row ? "PATCH" : "POST", body: JSON.stringify({
        ...(row && { expected_version: row.version }), compound_id: id, role: product ? "product" : solvent ? "solvent" : form.role,
        amount: decimal(form.amount), unit: form.amount.trim() ? form.unit : null,
        ...(rescale && { rescale_reactants: true, expected_component_versions: componentVersions }),
        mmol: decimal(form.mmol), equivalents: isLimiting ? "1" : decimal(form.equivalents), is_limiting: !product && !solvent && isLimiting, ...(product && { yield_percent: decimal(yieldValue), stoichiometric_ratio: decimal(ratio), calculate_yield: autoYield && yieldResult.value !== undefined }), notes: form.notes || null,
      }) })
      onSaved()
    } catch (reason) { setError(errorText(reason)) } finally { saving.current = false; setBusy(false) }
  }
  return <form className="record-form reactant-editor" aria-label={row ? `编辑${noun}` : product ? "记录产物详情" : solvent ? "添加溶剂详情" : "添加反应物详情"} onSubmit={event => void save(event)}>
    <div className="reactant-editor-heading"><h4>{row ? `编辑${noun}` : product ? "记录产物" : solvent ? "添加溶剂" : "添加反应物"}</h4><Button type="button" variant="outline" disabled={busy} onClick={onCancel}>取消</Button></div>
    <fieldset disabled={busy}>
      <div className="reactant-modes" aria-label={`选择${noun}方式`}>{([["cas", "按 CAS 查找"], ["local", product ? "本机化合物库" : "本机试剂库"], ["manual", "手动填写"]] as const).map(([value, label]) => <Button key={value} type="button" variant={mode === value ? "default" : "outline"} aria-pressed={mode === value} onClick={() => switchMode(value)}>{label}</Button>)}</div>
      {mode === "cas" && <CasCompoundSearch onSelect={selectCas} onSearching={setFinding} />}
      {mode === "local" && <CompoundPicker showManualCreate={false} value={compoundId} onChange={id => { setSelected(null); setCompoundId(id); if (product) setAutoYield(true) }} />}
      {mode === "manual" && <div className="form-grid">{([["name", "名称（IUPAC）"], ["codename", "代号"] , ["molecular_formula", "化学式"], ["cas_number", "CAS 号"], ["molecular_weight", "Mw (g/mol)"]] as const).map(([key, label]) => <label key={key}>{label}<input maxLength={key === "molecular_formula" ? 200 : 300} value={manual[key]} onChange={event => { setManual({ ...manual, [key]: event.target.value }); setCompoundId(""); if (key === "molecular_weight") { setForm(current => withMmol(current, current.mmol, Number(event.target.value))); if (product) setAutoYield(true) } }} /></label>)}</div>}
      {mode !== "manual" && selected && <CasCompoundPreview selected={selected} disabled={busy || finding} onSaved={setSelected} />}
      <div className={`form-grid dosing-inputs${!product && !solvent ? " reactant-dosing-inputs" : ""}`}>{!product && !solvent && <label>角色<select aria-label="角色" value={form.role} onChange={event => setForm({ ...form, role: event.target.value as Role })}>{reactantRoles.filter(([value]) => value !== "solvent").map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>} {!product && !solvent && <label className="limiting-choice"><input type="checkbox" checked={isLimiting} disabled={otherLimiting && !isLimiting} title={otherLimiting && !isLimiting ? "已有一个限制反应物，请先取消原勾选" : undefined} onChange={event => { setIsLimiting(event.target.checked); if (event.target.checked) setForm(current => ({ ...withMmol(current, current.mmol), equivalents: "1" })) }} />限制反应物（1 eq）</label>}{!product && !solvent && <label>eq<input type="number" min="0" step="any" readOnly={isLimiting} value={isLimiting ? "1" : form.equivalents} onChange={event => changeDosing("equivalents", event.target.value)} /></label>}{!solvent && <label>mmol<input type="number" min="0" step="any" value={form.mmol} onChange={event => changeDosing("mmol", event.target.value)} /></label>}<label>{product ? "产物量" : solvent ? "体积" : "投料量"}<input type="number" min="0" step="any" value={form.amount} onChange={event => changeDosing("amount", event.target.value)} /></label><label>单位<select value={form.unit} onChange={event => { setForm(current => withMmol({ ...current, unit: event.target.value }, current.mmol)); if (product) setAutoYield(true) }}>{[...new Set([...(solvent ? ["mL", "L", "µL"] : ["mg", ...(product ? ["g", "µg"] : []), "mL"]), ...(row?.unit ? [row.unit] : [])])].map(unit => <option key={unit}>{unit}</option>)}</select></label>{product && <label>计量比<input type="number" min="0.00000001" step="any" value={ratio} onChange={event => { setRatio(event.target.value); setAutoYield(true) }} /><small>每 1 mol 限制反应物生成的产物 mol 数</small></label>}{product && <label>收率 %<input type="number" min="0" step="any" value={yieldValue} onChange={event => { setForm({ ...form, yield_percent: event.target.value }); setAutoYield(false) }} /></label>}</div>
      {product && autoYield && yieldResult.message && <p role="status">{yieldResult.message}</p>}
      {product && autoYield && yieldResult.value !== undefined && <p className="helper">收率已自动计算，可手动修改。</p>}
      <label>{product ? "产物备注" : solvent ? "溶剂备注" : "投料备注"}<textarea value={form.notes} onChange={event => setForm({ ...form, notes: event.target.value })} rows={2} /></label>
    </fieldset>
    {error && <p role="alert">{error}</p>}
    <div className="form-actions"><Button disabled={busy || finding || !identity || (mode === "local" && !compoundId)}>{busy ? "保存中…" : row ? `保存${noun}` : product ? "保存产物" : solvent ? "保存溶剂" : "加入投料表"}</Button><Button type="button" variant="outline" disabled={busy} onClick={onCancel}>取消</Button></div>
  </form>
}
