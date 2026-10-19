import { ChemicalFormula } from "../components/chemical-formula"
import { useEffect, useRef, useState } from "react"
import { Button } from "../components/ui/button"
import { formatDecimal } from "../lib/format-mass"
import { validCas } from "../lib/reagents"
import { request, resourceUrl, type Compound } from "../services/records"
import type { components } from "../types/api.generated"
import { CasStructureButton } from "./compound-chemistry"

export type CasCandidate = components["schemas"]["ReagentCandidate"]
export type CasSelection = Compound | CasCandidate
type Lookup = components["schemas"]["CasLookupResult"]

export function CasCompoundSearch({ onSelect, onSearching, onEdited }: { onSelect: (value: CasSelection | null) => void; onSearching: (value: boolean) => void; onEdited?: () => void }) {
  const [cas, setCas] = useState("")
  const [lookup, setLookup] = useState<Lookup | null>(null)
  const [finding, setFinding] = useState(false)
  const [error, setError] = useState("")
  const [retry, setRetry] = useState(0)
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => { input.current?.focus() }, [])
  useEffect(() => {
    if (!validCas(cas.trim())) return
    let active = true
    const timer = window.setTimeout(() => {
      setFinding(true); onSearching(true)
      void request<Lookup>("/compounds/cas/lookup", { method: "POST", body: JSON.stringify({ cas_number: cas.trim() }) }).then(result => {
        if (!active) return
        setLookup(result)
        if (result.local_matches.length === 1) onSelect(result.local_matches[0])
        else if (!result.local_matches.length && result.candidates.length === 1) onSelect(result.candidates[0])
      }).catch(reason => { if (active) setError(reason instanceof Error ? reason.message : "查找失败") }).finally(() => { if (active) { setFinding(false); onSearching(false) } })
    }, 500)
    return () => { active = false; window.clearTimeout(timer) }
  }, [cas, retry, onSelect, onSearching])
  return <div className="cas-search"><label>CAS 号<input ref={input} value={cas} maxLength={32} placeholder="例如 64-17-5" onChange={event => { setCas(event.target.value); setLookup(null); onSelect(null); setFinding(false); onSearching(false); setError(""); onEdited?.() }} /></label><p>输入完整 CAS 号后自动查找，优先使用本机试剂；未收录时查询 PubChem。</p>{cas.trim() && !validCas(cas.trim()) && <p>请输入有效的 CAS 号（含校验位）。</p>}{finding && <p role="status">正在查找试剂…</p>}{error && <p role="alert">{error}</p>}{lookup?.warnings.map(message => <p key={message} role="status">{message}</p>)}{!finding && validCas(cas.trim()) && (error || Boolean(lookup?.warnings.length)) && <Button type="button" variant="outline" onClick={() => { setError(""); setRetry(retry + 1) }}>重新查询</Button>}{lookup && lookup.local_matches.length + lookup.candidates.length > 1 && <div className="cas-candidates"><p>找到多个匹配，请选择具体试剂：</p>{[...lookup.local_matches, ...lookup.candidates].map((candidate, index) => <Button key={index} type="button" variant="outline" onClick={() => onSelect(candidate)}>{candidate.name || ("codename" in candidate ? candidate.codename : "系统名称待补充")} · <ChemicalFormula value={candidate.molecular_formula} /> · {"id" in candidate ? candidate.cas_number : "PubChem"}</Button>)}</div>}</div>
}

export function CasCompoundPreview({ selected, disabled, onSaved }: { selected: CasSelection; disabled: boolean; onSaved: (item: Compound) => void }) {
  return <div className="reagent-preview">{selected.structure_molfile && <img className="reagent-structure-preview" src={"id" in selected ? resourceUrl(`/compounds/${selected.id}/structure.svg?v=${selected.version}`) : `data:image/svg+xml;charset=utf-8,${encodeURIComponent(selected.svg || "")}`} alt={`${selected.name || "试剂"} 的化学结构`} />}<strong>{selected.name || "系统名称待补充"}</strong>{!selected.name && <small>系统名称待补充</small>}{"codename" in selected && selected.codename && <small>代号：{selected.codename}</small>}<dl><div><dt>化学式</dt><dd><ChemicalFormula value={selected.molecular_formula} /></dd></div><div><dt>CAS</dt><dd>{selected.cas_number || "—"}</dd></div><div><dt>Mw (g/mol)</dt><dd>{formatDecimal(selected.molecular_weight) || "—"}</dd></div></dl>{"id" in selected && selected.cas_number && !selected.structure_molfile && <CasStructureButton item={selected} disabled={disabled} onSaved={onSaved} />}{"source_url" in selected && <a className="text-link" href={selected.source_url} target="_blank" rel="noreferrer">查看 PubChem 资料</a>}</div>
}
