import { casCompoundInput } from "../lib/reagents"
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react"
import { Link, useNavigate } from "react-router-dom"
import { Button } from "../components/ui/button"
import { request, type Compound } from "../services/records"
import { CasCompoundSearch, CasCompoundPreview, type CasSelection } from "./cas-compound"

export function CasCompoundDialog({ onClose }: { onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const saving = useRef(false)
  const navigate = useNavigate()
  const [selected, setSelected] = useState<CasSelection | null>(null)
  const [finding, setFinding] = useState(false)
  const [busy, setBusy] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [codename, setCodename] = useState("")
  const [error, setError] = useState("")
  const select = useCallback((value: CasSelection | null) => { setSelected(value); setCodename(""); setError("") }, [])
  const edited = useCallback(() => { setDirty(true) }, [])
  useEffect(() => { if (dialog.current && !dialog.current.open) dialog.current.showModal() }, [])
  function allowClose() { return !busy && (!dirty || window.confirm("未保存的内容将丢失，确定关闭？")) }
  async function save(event: FormEvent) {
    event.preventDefault()
    if (!selected || "id" in selected || finding || saving.current) return
    saving.current = true; setBusy(true); setError("")
    try {
      const created = await request<Compound>("/compounds", { method: "POST", body: JSON.stringify({ ...casCompoundInput(selected), codename: codename.trim() || null }) })
      navigate(`/compounds/${created.id}`)
    } catch (reason) { setError(reason instanceof Error ? reason.message : "创建失败") }
    finally { saving.current = false; setBusy(false) }
  }
  return <dialog ref={dialog} className="record-dialog cas-compound-dialog" aria-labelledby="cas-compound-dialog-title" onClose={onClose} onCancel={event => { if (!allowClose()) event.preventDefault() }}><div className="dialog-heading"><h2 id="cas-compound-dialog-title">根据CAS号新建</h2><Button type="button" variant="outline" disabled={busy} onClick={() => { if (allowClose()) dialog.current?.close() }}>关闭</Button></div><form className="record-form" onSubmit={event => void save(event)}><fieldset disabled={busy}><CasCompoundSearch onSelect={select} onSearching={setFinding} onEdited={edited} />{selected && <CasCompoundPreview selected={selected} disabled={busy || finding} onSaved={setSelected} />}{selected && !("id" in selected) && <label>代号<input maxLength={300} value={codename} onChange={event => { setCodename(event.target.value); setDirty(true) }} /></label>}</fieldset>{error && <p role="alert">{error}</p>}<div className="form-actions">{selected && "id" in selected ? <><span>本机已有该化合物</span><Button asChild><Link to={`/compounds/${selected.id}`}>打开已有化合物</Link></Button></> : <Button type="submit" disabled={busy || finding || !selected}>{busy ? "保存中…" : "创建化合物"}</Button>}</div></form></dialog>
}
