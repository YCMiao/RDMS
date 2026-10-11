import { Search as SearchIcon } from "lucide-react"
import { useEffect, useState, type FormEvent } from "react"
import { Link, useSearchParams } from "react-router-dom"
import { Button } from "../components/ui/button"
import { EmptyPanel } from "../components/empty-panel"
import { query, request } from "../services/records"
import type { components } from "../types/api.generated"

type SearchOut = components["schemas"]["SearchOut"]
const errorText = (reason: unknown) => reason instanceof Error ? reason.message : "请求失败"
const fieldNames: Record<string, string> = { title: "标题", experiment_code: "实验编号", name: "名称", cas_number: "CAS 编号", codename: "代号", smiles: "SMILES" }

export function SearchPage() {
  const [params, setParams] = useSearchParams()
  const term = params.get("q") || ""
  const experimentPage = Number(params.get("experiment_page") || 1)
  const compoundPage = Number(params.get("compound_page") || 1)
  const [input, setInput] = useState(term)
  const [result, setResult] = useState<SearchOut | null>(null)
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  useEffect(() => { setInput(term) }, [term])
  useEffect(() => {
    if (!term.trim()) { setResult(null); setLoading(false); return }
    let active = true
    setLoading(true); setError("")
    void request<SearchOut>(`/search?${query({ q: term, experiment_page: experimentPage, compound_page: compoundPage, page_size: 10 })}`).then(value => { if (active) setResult(value) }).catch(reason => { if (active) setError(errorText(reason)) }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [term, experimentPage, compoundPage])
  function submit(event: FormEvent) { event.preventDefault(); setParams(input.trim() ? { q: input.trim() } : {}) }
  function changePage(kind: "experiment_page" | "compound_page", value: number) { setParams({ q: term, experiment_page: String(kind === "experiment_page" ? value : experimentPage), compound_page: String(kind === "compound_page" ? value : compoundPage) }) }
  return <main className="records-page"><div className="page-heading"><div><span className="eyebrow">SEARCH</span><h1>搜索实验与化合物</h1><p>支持编号、标题、名称、代号和 SMILES。</p></div></div><form className="relation-picker" onSubmit={submit}><label>搜索词<input maxLength={200} value={input} onChange={event => setInput(event.target.value)} placeholder="中文、编号或 SMILES" /></label><Button>搜索</Button></form>{error && <p role="alert">{error}</p>}{loading && <p role="status">正在搜索…</p>}{!term && <EmptyPanel icon={SearchIcon} title="准备搜索" description="输入关键词开始搜索。" />}{result && !loading && <><section className="relation-section"><h2>实验 · {result.experiments.total}</h2>{result.experiments.items.length ? <><div className="table-scroll"><table><thead><tr><th>编号</th><th>标题</th><th>命中字段</th></tr></thead><tbody>{result.experiments.items.map(item => <tr key={item.id}><td><Link to={`/experiments/${item.id}`}>{item.experiment_code}</Link></td><td>{item.title}</td><td>{item.matched_fields.map(field => fieldNames[field]).join("、")}</td></tr>)}</tbody></table></div><Button type="button" variant="outline" disabled={experimentPage === 1} onClick={() => changePage("experiment_page", experimentPage - 1)}>上一页</Button> <Button type="button" variant="outline" disabled={experimentPage * 10 >= result.experiments.total} onClick={() => changePage("experiment_page", experimentPage + 1)}>下一页</Button></> : <EmptyPanel icon={SearchIcon} title="没有匹配的实验" description="试试其他编号、标题或关键词。" />}</section><section className="relation-section"><h2>化合物 · {result.compounds.total}</h2>{result.compounds.items.length ? <><div className="table-scroll"><table><thead><tr><th>CAS 编号</th><th>名称（IUPAC） / 代号</th><th>命中字段</th></tr></thead><tbody>{result.compounds.items.map(item => <tr key={item.id}><td><Link to={`/compounds/${item.id}`}>{item.cas_number || "CAS 待确认"}</Link></td><td>{item.name || "系统名称待补充"}<small className="block">{item.codename}</small></td><td>{item.matched_fields.map(field => fieldNames[field]).join("、")}</td></tr>)}</tbody></table></div><Button type="button" variant="outline" disabled={compoundPage === 1} onClick={() => changePage("compound_page", compoundPage - 1)}>上一页</Button> <Button type="button" variant="outline" disabled={compoundPage * 10 >= result.compounds.total} onClick={() => changePage("compound_page", compoundPage + 1)}>下一页</Button></> : <EmptyPanel icon={SearchIcon} title="没有匹配的化合物" description="试试其他编号、名称或 SMILES。" />}</section></>}</main>
}

export function SummaryPanel({ experimentId, experimentCode }: { experimentId: string; experimentCode: string }) {
  const [revision, setRevision] = useState("")
  const [generatedAt, setGeneratedAt] = useState("")
  const [markdown, setMarkdown] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  async function generate() {
    setLoading(true); setError("")
    try {
      const response = await fetch(`/api/experiments/${experimentId}/summary?format=markdown`)
      if (!response.ok) throw new Error("Markdown 摘要读取失败")
      const content = await response.text()
      setMarkdown(content)
      setRevision(content.match(/^内容版本：([0-9a-f]{64})$/m)?.[1] || "")
      setGeneratedAt(content.match(/^生成时间：(.+)$/m)?.[1] || "")
    } catch (reason) { setError(errorText(reason)) } finally { setLoading(false) }
  }
  async function copy() { try { await navigator.clipboard.writeText(markdown); setError("已复制 Markdown 摘要") } catch { setError("复制失败，请从预览中手动复制") } }
  function download() { if (!markdown) return; const objectUrl = URL.createObjectURL(new Blob([markdown], { type: "text/markdown;charset=utf-8" })); const link = document.createElement("a"); link.href = objectUrl; link.download = `${experimentCode}-summary.md`; link.click(); setTimeout(() => URL.revokeObjectURL(objectUrl), 0) }
  return <section className="relation-section"><h2>实验摘要</h2><p className="helper">汇总已保存内容。</p><Button type="button" onClick={() => void generate()} disabled={loading}>{loading ? "正在生成…" : "生成摘要"}</Button>{error && <p role="status">{error}</p>}{markdown && <><p>生成时间：{generatedAt ? new Date(generatedAt).toLocaleString("zh-CN") : "未记录"} · 内容版本：<code>{revision}</code></p><div className="form-actions"><Button type="button" variant="outline" onClick={() => void copy()}>复制 Markdown</Button><Button type="button" variant="outline" onClick={download}>下载 Markdown</Button></div><pre className="summary-preview">{markdown}</pre></>}</section>
}
