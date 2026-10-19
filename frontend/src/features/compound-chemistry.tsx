import { ChemicalFormula } from "../components/chemical-formula"
import { useEffect, useState, type ClipboardEvent, type DragEvent, type FormEvent } from "react"
import { Link, useNavigate, useSearchParams } from "react-router-dom"

import { Button } from "../components/ui/button"
import { formatMass } from "../lib/format-mass"
import { request, resourceUrl, type Compound } from "../services/records"

type StructurePreview = {
  structure_molfile: string
  smiles: string
  molecular_formula: string
  molecular_weight: string
  exact_mass: string
  inchi_key: string
  svg: string
  duplicates: { id: string; cas_number: string | null; name: string | null; codename: string | null }[]
}

type LookupResult = {
  candidates: { cas_number: string; name: string; source: string; source_url: string }[]
  properties: { name: string; value: string; source: string; source_url: string | null }[]
  pubchem_cid: number | null
  warnings: string[]
}

type StructuredCompound = Compound

function errorText(reason: unknown): string {
  return reason instanceof Error ? reason.message : "操作失败，请稍后重试"
}

export function CasStructureButton({ item, onSaved, disabled = false }: { item: Compound; onSaved: (item: Compound) => void; disabled?: boolean }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  async function complete() {
    if (busy) return
    setBusy(true); setError("")
    try {
      const updated = await request<Compound>(`/compounds/${item.id}/structure/cas`, { method: "POST", body: JSON.stringify({ expected_version: item.version }) })
      onSaved(updated)
    } catch (reason) { setError(errorText(reason)) }
    finally { setBusy(false) }
  }
  return <><Button type="button" variant="outline" disabled={busy || disabled} onClick={() => void complete()}>{busy ? "查询结构中…" : "按 CAS 补全结构"}</Button>{error && <p role="alert">{error}</p>}</>
}

export function CompoundStructurePanel({ item, onSaved, disabled }: { item: StructuredCompound; onSaved: (item: Compound) => void; disabled?: boolean }) {
  return <section className="relation-section compound-summary">
    <div className="compound-summary-heading"><div><span className="eyebrow">STRUCTURE &amp; PROPERTIES</span><h2>结构与理化资料</h2></div><div className="heading-actions">{!item.structure_molfile && item.cas_number && <CasStructureButton item={item} onSaved={onSaved} disabled={disabled} />}<Link className="text-link" to={`/compounds/import?replace=${item.id}`}>{item.structure_molfile ? "替换结构" : "导入结构"}</Link></div></div>
    {item.structure_molfile ? <div className="compound-summary-grid"><div className="structure-figure"><img src={resourceUrl(`/compounds/${item.id}/structure.svg`)} alt={`${item.name || item.codename || "未命名化合物"} 的二维化学结构`} /></div><dl className="compound-facts"><div><dt>CAS 号</dt><dd>{item.cas_number || "未确认"}{item.cas_source && <small>{item.cas_source}</small>}</dd></div><div><dt>分子式</dt><dd><ChemicalFormula value={item.molecular_formula} /></dd></div><div><dt>分子量</dt><dd>{item.molecular_weight ? `${formatMass(item.molecular_weight, 2)} g/mol` : "—"}</dd></div><div><dt>精确质量</dt><dd>{formatMass(item.exact_mass, 4) || "—"}</dd></div><div><dt>InChIKey</dt><dd className="mono-wrap">{item.inchi_key || "—"}</dd></div></dl></div> : <p className="helper">此记录没有结构文件。可导入 ChemDraw 的 MOL、SMILES 或 CDXML，再由本机计算结构资料。</p>}
    {item.physical_properties?.length ? <div className="compound-properties"><h3>有来源的性质</h3>{item.physical_properties.map((property, index) => <div key={`${property.name}-${index}`}><strong>{property.name}</strong><span>{property.value}</span>{property.source_url ? <a href={property.source_url} target="_blank" rel="noopener noreferrer">{property.source}</a> : <small>{property.source}</small>}</div>)}</div> : null}
  </section>
}

export function CompoundImportPage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const replaceId = params.get("replace")
  const [existing, setExisting] = useState<StructuredCompound | null>(null)
  const [structure, setStructure] = useState("")
  const [preview, setPreview] = useState<StructurePreview | null>(null)
  const [lookup, setLookup] = useState<LookupResult | null>(null)
  const [selectedCas, setSelectedCas] = useState("")
  const [selectedProperties, setSelectedProperties] = useState<number[]>([])
  const [name, setName] = useState("")
  const [codename, setCodename] = useState("")
  const [notes, setNotes] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  useEffect(() => {
    if (!replaceId) return
    void request<StructuredCompound>(`/compounds/${replaceId}`).then(item => { setExisting(item); setName(item.name || ""); setCodename(item.codename || ""); setNotes(item.notes || "") }).catch(reason => setError(errorText(reason)))
  }, [replaceId])

  async function parse(value: string) {
    if (!value.trim()) { setError("请先粘贴结构或选择结构文件"); return }
    setBusy(true); setError(""); setPreview(null); setLookup(null); setSelectedCas(""); setSelectedProperties([])
    try {
      const result = await request<StructurePreview>("/compounds/structure/preview", { method: "POST", body: JSON.stringify({ structure: value, format: "auto" }) })
      setPreview(result)
      if (existing && result.inchi_key !== existing.inchi_key) setName("")
    } catch (reason) { setError(errorText(reason)) }
    finally { setBusy(false) }
  }

  function paste(event: ClipboardEvent<HTMLTextAreaElement>) {
    const value = ["chemical/x-mdl-molfile", "chemical/x-cdxml", "application/x-mdl-molfile", "text/plain"]
      .map(type => event.clipboardData.getData(type)).find(Boolean)
    event.preventDefault()
    if (!value) { setError("浏览器只读到图片或专有剪贴板格式。请在 ChemDraw 使用 Copy As → MOL 或 SMILES，或导出 CDXML 文件。"); return }
    setStructure(value)
    void parse(value)
  }

  async function readFile(file?: File) {
    if (!file) return
    if (file.size > 100_000) { setError("单个结构文件不能超过 100 KB"); return }
    const value = await file.text()
    setStructure(value)
    await parse(value)
  }

  function drop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    void readFile(event.dataTransfer.files[0])
  }

  async function findReferences() {
    if (!preview) return
    setBusy(true); setError("")
    try {
      const result = await request<LookupResult>("/compounds/structure/lookup", { method: "POST", body: JSON.stringify({ inchi_key: preview.inchi_key }) })
      setLookup(result)
    } catch (reason) { setError(errorText(reason)) }
    finally { setBusy(false) }
  }

  async function save(event: FormEvent) {
    event.preventDefault()
    if (!preview || !(name.trim() || codename.trim()) || (replaceId && !existing)) return
    setBusy(true); setError("")
    const candidate = lookup?.candidates.find(item => item.cas_number === selectedCas)
    const payload = {
      name: name.trim() || null,
      codename: codename.trim() || null,
      notes: notes.trim() || null,
      structure_molfile: preview.structure_molfile,
      cas_number: candidate?.cas_number || null,
      cas_source: candidate?.source || null,
      physical_properties: selectedProperties.map(index => lookup?.properties[index]).filter((item): item is NonNullable<typeof item> => Boolean(item)),
    }
    try {
      const item = replaceId && existing
        ? await request<StructuredCompound>(`/compounds/${replaceId}`, { method: "PATCH", body: JSON.stringify({ ...payload, expected_version: existing.version }) })
        : await request<StructuredCompound>("/compounds", { method: "POST", body: JSON.stringify({ ...payload, tag_ids: [] }) })
      navigate(`/compounds/${item.id}`)
    } catch (reason) { setError(errorText(reason)) }
    finally { setBusy(false) }
  }

  return <main className="records-page compound-import"><div className="page-heading"><div><span className="eyebrow">RDMS / COMPOUNDS</span><h1>{replaceId ? "替换化合物结构" : "从结构建立化合物"}</h1><p>粘贴 ChemDraw 结构，核对预览，再选择需要保存的公开资料。</p></div><Link className="text-link" to={replaceId ? `/compounds/${replaceId}` : "/compounds"}>返回化合物</Link></div>
    <div className="compound-import-grid"><section className="record-form"><span className="eyebrow">01 / 输入结构</span><h2>从 ChemDraw 粘贴</h2><p className="helper">支持 Copy As → MOL、SMILES、CDXML 文本，也可拖入 .mol、.sdf、.smi 或 .cdxml。普通复制若只得到图片，请使用 Copy As。</p>
      <div className="structure-drop" onDragOver={event => event.preventDefault()} onDrop={drop}><textarea aria-label="化学结构文本" value={structure} onChange={event => { setStructure(event.target.value); setPreview(null); setLookup(null) }} onPaste={paste} placeholder="在此按 ⌘V，或粘贴 SMILES / MOL / CDXML" rows={8} /><label className="structure-file">选择结构文件<input type="file" accept=".mol,.sdf,.smi,.smiles,.cdxml,.txt" onChange={event => void readFile(event.target.files?.[0])} /></label></div>
      <Button type="button" variant="outline" disabled={busy || !structure.trim()} onClick={() => void parse(structure)}>{busy ? "处理中…" : "解析结构"}</Button>
      {error && <p className="form-notice" role="alert">{error}</p>}
    </section>
    <section className="record-form"><span className="eyebrow">02 / 本机计算</span><h2>确认结构</h2>
      {preview ? <><div className="structure-figure"><img src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(preview.svg)}`} alt="导入结构的二维预览" /></div><dl className="compound-facts"><div><dt>分子式</dt><dd><ChemicalFormula value={preview.molecular_formula} /></dd></div><div><dt>分子量</dt><dd>{formatMass(preview.molecular_weight, 2)} g/mol</dd></div><div><dt>精确质量</dt><dd>{formatMass(preview.exact_mass, 4)}</dd></div><div><dt>InChIKey</dt><dd className="mono-wrap">{preview.inchi_key}</dd></div></dl><p className="helper">以上由本机计算；此时结构尚未发送至公开资料服务。</p>{preview.duplicates.length > 0 && <div className="form-notice"><strong>发现已有相同结构</strong>{preview.duplicates.map(item => <p key={item.id}><Link to={`/compounds/${item.id}`}>{item.cas_number || "CAS 待确认"} · {item.name || item.codename}</Link></p>)}</div>}</> : <p className="helper">粘贴后将在这里显示结构图和计算结果。</p>}
    </section></div>
    {preview && <section className="record-form compound-reference"><span className="eyebrow">03 / 可选查询</span><h2>公开资料</h2><p className="helper">点击后会把结构标识发送给 CAS Common Chemistry（已配置密钥时）和 PubChem。对未发表结构可跳过，直接保存本机计算结果。</p><Button type="button" variant="outline" disabled={busy} onClick={() => void findReferences()}>{busy ? "查询中…" : "查询 CAS 与理化性质"}</Button>
      {lookup && <><div className="lookup-warnings">{lookup.warnings.map(text => <p key={text}>{text}</p>)}</div><h3>CAS 候选</h3>{lookup.candidates.length ? <div className="lookup-choices">{lookup.candidates.map(item => <label key={`${item.source}-${item.cas_number}`}><input type="radio" name="cas-choice" checked={selectedCas === item.cas_number} onChange={() => { setSelectedCas(item.cas_number) }} /><span><strong>{item.cas_number}</strong> · {item.name}<small>{item.source} · <a href={item.source_url} target="_blank" rel="noopener noreferrer">查看来源</a></small></span></label>)}</div> : <p className="helper">没有找到 CAS 候选；可保持未确认状态。</p>}
      <h3>可保存的实验性质</h3>{lookup.properties.length ? <div className="lookup-choices">{lookup.properties.map((item, index) => <label key={`${item.name}-${index}`}><input type="checkbox" checked={selectedProperties.includes(index)} onChange={event => setSelectedProperties(current => event.target.checked ? [...current, index] : current.filter(value => value !== index))} /><span><strong>{item.name}</strong> · {item.value}<small>{item.source}</small></span></label>)}</div> : <p className="helper">此结构没有查到可用的密度、熔点或沸点资料。</p>}</>}
    </section>}
    {preview && <form className="record-form compound-save" onSubmit={event => void save(event)}><span className="eyebrow">04 / 保存记录</span><h2>化合物身份</h2><div className="form-grid"><label>名称（IUPAC）<input maxLength={300} value={name} onChange={event => setName(event.target.value)} placeholder="系统名称" /></label><label>代号<input maxLength={300} value={codename} onChange={event => setCodename(event.target.value)} placeholder="实验简称或中间体代号" /></label><label className="wide-field">备注<textarea rows={3} value={notes} onChange={event => setNotes(event.target.value)} /></label></div><div className="form-actions"><Button disabled={busy || !(name.trim() || codename.trim()) || Boolean(replaceId && !existing)}>{busy ? "保存中…" : replaceId ? "保存新结构" : "创建化合物"}</Button></div></form>}
  </main>
}
