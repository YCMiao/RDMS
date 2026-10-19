import chemistry from "./chemistry.json"
import { ApiError } from "../services/records"
import { massToMg, productYield } from "../lib/yield"
import { validCas } from "../lib/reagents"

// This module never reads application data. All state belongs to this document.
type Row = { id: string; version: number; [key: string]: unknown }
type Kind = "notebooks" | "experiments" | "compounds" | "samples" | "reactions" | "components" | "files" | "tags"
type Body = Record<string, unknown>
type State = Record<Kind, Row[]>
const kinds: Kind[] = ["notebooks", "experiments", "compounds", "samples", "reactions", "components", "files", "tags"]
let state: State | undefined
let sequence = 0
const counters = new Map<string, number>()
const assets = new Map<string, string>()
const fileBlobs = new Map<string, Blob>()
const text = (row: Body, field: string) => String(row[field] ?? "")
const number = (row: Body, field: string) => Number(row[field] ?? 0)
const now = () => new Date().toISOString()
const uid = () => `demo-${++sequence}`
function row(id: string, fields: Body): Row {
  return { id, version: 1, created_at: now(), updated_at: now(), deleted_at: null, ...fields }
}
function fail(message: string, status = 422): never { throw new ApiError(message, status) }
function data(): State {
  if (state) return state
  const tag = row("tag-synthesis", { name: "有机合成" })
  const analytics = row("tag-analysis", { name: "分析标准品" })
  const compounds = chemistry.map(item => row(item.id, { ...item, tags: [item.id === "caffeine" ? analytics : tag], notes: null, cas_source: "内置示例资料", physical_properties: [] }))
  const notebooks = [
    row("00000000-0000-4000-8000-000000000001", { code: "NB001", name: "有机合成", description: "反应路线探索与条件优化", archived: false }),
    row("notebook-analysis", { code: "NB002", name: "分析与表征", description: "样品制备、纯度分析与原始记录", archived: false }),
  ]
  const experiment = (id: string, notebook: number, serial: number, title: string, date: string, status: string, objective: string, notes: string | null) => row(id, {
    notebook_id: notebooks[notebook].id, notebook_number: serial, experiment_code: `${notebooks[notebook].code}-${String(serial).padStart(4, "0")}`,
    title, date, status, objective, notes, procedure: null, observation: null, result: null, conclusion: null, tags: [],
  })
  const experiments = [
    experiment("aspirin-synthesis", 0, 1, "阿司匹林合成与重结晶", "2026-10-16", "completed", "建立水杨酸乙酰化的实验记录，关联投料、产物与表征文件。", "白色晶体。重结晶后称量 756 mg；以下记录与附件均为虚构示例。"),
    experiment("condition-screen", 0, 2, "乙酰化反应条件筛选", "2026-10-17", "in_progress", "比较反应温度与时间，整理两组反应条件。", null),
    experiment("caffeine-analysis", 1, 1, "咖啡因标准溶液与 HPLC 分析", "2026-10-18", "draft", "制备标准溶液，演示样品与仪器原始文件的关联。", null),
  ]
  const reaction = (id: string, experiment_id: string, name: string, sort_order: number, extra: Body = {}) => row(id, {
    experiment_id, reaction_name: name, sort_order, temperature_c: "70", temperature_k: null, temperature_description: null,
    reaction_time_hours: "0.5", reaction_time_minutes: null, reaction_time_description: null, atmosphere: "空气", solvent: null,
    workup: "冷却后加水，过滤收集固体。", purification: "乙醇 / 水重结晶", notes: null, ...extra,
  })
  const reactions = [reaction("acetylation", "aspirin-synthesis", "水杨酸乙酰化", 0), reaction("screen-a", "condition-screen", "条件 A · 60 °C", 0, { temperature_c: "60" }), reaction("screen-b", "condition-screen", "条件 B · 80 °C", 1, { temperature_c: "80" })]
  const component = (id: string, compound_id: string, role: string, amount: string, unit: string, mmol: string | null, equivalents: string | null, extra: Body = {}) => row(id, {
    reaction_id: "acetylation", compound_id, role, amount, unit, mmol, equivalents, is_limiting: false, stoichiometric_ratio: null, yield_percent: null, sort_order: 0, notes: null, ...extra,
  })
  const aspirinMmol = 756 / Number(chemistry.find(item => item.id === "aspirin")!.molecular_weight)
  const components = [
    component("dose-salicylic", "salicylic", "substrate", "690.6", "mg", "5", "1", { is_limiting: true }),
    component("dose-anhydride", "anhydride", "reagent", "765.675", "mg", "7.5", "1.5", { sort_order: 1 }),
    component("product-aspirin", "aspirin", "product", "756", "mg", String(Number(aspirinMmol.toFixed(8))), null, { yield_percent: String(Number((aspirinMmol / 5 * 100).toFixed(8))), stoichiometric_ratio: "1", sort_order: 2 }),
    component("solvent-ethanol", "ethanol", "solvent", "5", "mL", null, null, { sort_order: 3 }),
  ]
  const samples = [
    row("aspirin-crystals", { sample_code: "SMP-2026-0001", experiment_id: "aspirin-synthesis", compound_id: "aspirin", name: "重结晶产物", sample_type: "pure", amount: "756", unit: "mg", concentration: null, concentration_unit: null, notes: "白色晶体" }),
    row("caffeine-standard", { sample_code: "SMP-2026-0002", experiment_id: "caffeine-analysis", compound_id: "caffeine", name: "咖啡因标准溶液", sample_type: "solution", amount: "10", unit: "mL", concentration: "1", concentration_unit: "mg/mL", notes: null }),
  ]
  const content = "RDMS synthetic demonstration attachment\nSample: aspirin crystals\nPurity (illustrative): 98.5%\nThis is not an experimental measurement.\n"
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" })
  fileBlobs.set("characterization", blob)
  const files = [row("characterization", { experiment_id: "aspirin-synthesis", sample_id: "aspirin-crystals", original_filename: "阿司匹林-表征记录.txt", file_type: "txt", file_size: blob.size, sha256: "", instrument_type: "NMR", uploaded_at: now(), notes: null })]
  counters.set("00000000-0000-4000-8000-000000000001", 3); counters.set("notebook-analysis", 2)
  state = { notebooks, experiments, compounds, samples, reactions, components, files, tags: [tag, analytics] }
  return state
}
function find(kind: Kind, id: string): Row { return data()[kind].find(item => item.id === id) ?? fail("记录不存在", 404) }
function visible(kind: Kind, item: Row): boolean {
  if (item.deleted_at) return false
  if (["samples", "reactions", "files"].includes(kind) && !visible("experiments", find("experiments", text(item, "experiment_id")))) return false
  if (kind === "components" && !visible("reactions", find("reactions", text(item, "reaction_id")))) return false
  return true
}
function active(kind: Kind): Row[] { return data()[kind].filter(item => visible(kind, item)) }
function version(item: Row, expected: unknown) { if (Number(expected) !== item.version) fail("记录已变化，请刷新后重试", 409) }
function touch(item: Row) { item.version++; item.updated_at = now() }
function output(kind: Kind, item: Row): Row {
  if (kind === "notebooks") {
    const experiments = active("experiments").filter(exp => exp.notebook_id === item.id)
    return { ...item, experiment_count: experiments.length, last_experiment_at: experiments.at(-1)?.updated_at ?? null }
  }
  if (kind === "experiments") return { ...item, notebook_name: item.notebook_id ? find("notebooks", text(item, "notebook_id")).name : null }
  if (kind === "files") return { ...item, download_url: blobUrl(item.id) }
  if (kind === "compounds") return { ...item, tags: ((item.tags ?? []) as Row[]).map(tag => find("tags", tag.id)).filter(tag => !tag.deleted_at) }
  return item
}
function blobUrl(id: string): string {
  const key = `file:${id}`
  if (!assets.has(key)) assets.set(key, URL.createObjectURL(fileBlobs.get(id) ?? fail("文件不存在", 404)))
  return assets.get(key)!
}
export function demoResourceUrl(path: string): string {
  const match = path.match(/^\/compounds\/([^/]+)\/structure\.svg/)
  if (!match) return ""
  const item = find("compounds", match[1])
  const asset = chemistry.find(entry => entry.inchi_key === item.inchi_key)
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(asset?.svg ?? "")}`
}
function filtered(kind: Kind, params: URLSearchParams): Row[] {
  let rows = active(kind)
  const q = (params.get("q") ?? "").trim().toLocaleLowerCase()
  if (q) rows = rows.filter(item => ["name", "title", "codename", "cas_number", "smiles", "experiment_code", "sample_code", "original_filename", "code"].some(key => text(item, key).toLocaleLowerCase().includes(q)))
  for (const key of ["notebook_id", "experiment_id", "status"]) if (params.get(key)) rows = rows.filter(item => item[key] === params.get(key))
  if (params.has("archived")) rows = rows.filter(item => item.archived === (params.get("archived") === "true"))
  if (params.get("date_from")) rows = rows.filter(item => text(item, "date") >= params.get("date_from")!)
  if (params.get("date_to")) rows = rows.filter(item => text(item, "date") <= params.get("date_to")!)
  if (params.get("tag_id")) rows = rows.filter(item => ((item.tags ?? []) as Row[]).some(tag => tag.id === params.get("tag_id")))
  const sort = params.get("sort") ?? (kind === "experiments" ? "date_desc" : "created_desc")
  const field = ({ date: "date", code: "experiment_code", title: "title", name: "name", created: "created_at" } as Record<string, string>)[sort.replace(/_(asc|desc)$/, "")] ?? "created_at"
  const direction = sort.endsWith("_asc") ? 1 : -1
  return [...rows].sort((a, b) => direction * text(a, field).localeCompare(text(b, field), "zh-CN", { numeric: true }))
}
function page(rows: Row[], params: URLSearchParams, pageKey = "page") {
  const size = Math.min(100, Math.max(1, Number(params.get("page_size")) || 20))
  const index = Math.max(1, Number(params.get(pageKey)) || 1)
  return { items: rows.slice((index - 1) * size, index * size), total: rows.length, page: index, page_size: size }
}
function notebook(id: string): Row {
  const book = find("notebooks", id)
  if (book.archived) fail("记录本已归档，请选择其他记录本")
  return book
}
function assignCode(item: Row, notebookId: string) {
  const book = notebook(notebookId)
  const next = counters.get(book.id) ?? 1
  counters.set(book.id, next + 1)
  Object.assign(item, { notebook_id: book.id, notebook_number: next, experiment_code: `${book.code}-${String(next).padStart(4, "0")}` })
}
function defaults(kind: Kind): Body {
  const base = { notes: null }
  switch (kind) {
    case "experiments": return { ...base, status: "draft", objective: null, procedure: null, observation: null, result: null, conclusion: null, tags: [] }
    case "compounds": return { ...base, name: null, codename: null, cas_number: null, smiles: null, molecular_formula: null, molecular_weight: null, structure_molfile: null, exact_mass: null, inchi_key: null, cas_source: null, tags: [], physical_properties: [] }
    case "samples": return { ...base, compound_id: null, name: null, amount: null, unit: null, concentration: null, concentration_unit: null, sample_code: `SMP-2026-${String(++sequence + 2).padStart(4, "0")}` }
    case "reactions": return { ...base, temperature_c: null, temperature_k: null, temperature_description: null, reaction_time_hours: null, reaction_time_minutes: null, reaction_time_description: null, atmosphere: null, solvent: null, workup: null, purification: null, sort_order: ++sequence }
    case "components": return { ...base, amount: null, unit: null, mmol: null, equivalents: null, is_limiting: false, stoichiometric_ratio: null, yield_percent: null, sort_order: ++sequence }
    case "notebooks": return { description: null, archived: false, code: `NB${String(data().notebooks.length + 1).padStart(3, "0")}` }
    default: return base
  }
}
function validate(kind: Kind, fields: Body, current?: Row) {
  const next = { ...current, ...fields }
  if (["tags", "notebooks"].includes(kind) && !text(next, "name").trim()) fail("名称不能为空")
  if (kind === "tags" && active("tags").some(tag => tag.id !== current?.id && text(tag, "name").toLowerCase() === text(next, "name").trim().toLowerCase())) fail("同名标签已存在", 409)
  if (kind === "experiments" && !text(next, "title").trim()) fail("标题不能为空")
  if (kind === "compounds" && next.cas_number && !validCas(text(next, "cas_number"))) fail("CAS 号格式或校验位无效")
  if (["samples", "reactions", "files"].includes(kind) && !active("experiments").some(item => item.id === next.experiment_id)) fail("请先恢复所属实验", 409)
  if (["samples", "components"].includes(kind) && next.compound_id && !active("compounds").some(item => item.id === next.compound_id)) fail("关联化合物不可用", 409)
  if (kind === "components") {
    if (!active("reactions").some(item => item.id === next.reaction_id)) fail("请先恢复所属反应", 409)
    if (next.is_limiting && active("components").some(item => item.reaction_id === next.reaction_id && item.id !== current?.id && item.is_limiting)) fail("同一反应只能有一个限制反应物", 409)
  }
  if (kind === "files" && next.sample_id && !active("samples").some(item => item.id === next.sample_id && item.experiment_id === next.experiment_id)) fail("样品必须属于当前实验")
}
function clean(body: Body): Body {
  const fields = { ...body }
  for (const key of ["id", "version", "created_at", "updated_at", "deleted_at", "expected_version", "rescale_reactants", "expected_component_versions", "calculate_yield", "tag_ids", "structure_format"]) delete fields[key]
  return fields
}
function structureFields(fields: Body) {
  if (!fields.structure_molfile) return
  const known = chemistry.find(entry => entry.structure_molfile.trim() === text(fields, "structure_molfile").trim())
  if (!known) fail("离线演示仅支持内置示例结构；可使用手工建档。")
  Object.assign(fields, { smiles: known.smiles, molecular_formula: known.molecular_formula, molecular_weight: known.molecular_weight, exact_mass: known.exact_mass, inchi_key: known.inchi_key })
}
function rescale(row: Row, body: Body) {
  if (!body.rescale_reactants) return
  const peers = active("components").filter(item => item.reaction_id === row.reaction_id && !["product", "solvent"].includes(text(item, "role")))
  const expected = body.expected_component_versions as Record<string, number> | undefined
  if (!expected || peers.some(item => expected[item.id] !== item.version)) fail("投料表已变化，请刷新后重试", 409)
}
function applyScale(item: Row, body: Body) {
  if (!body.rescale_reactants || !(number(item, "mmol") > 0 && number(item, "equivalents") > 0)) return
  const scale = number(item, "mmol") / number(item, "equivalents")
  active("components").filter(peer => peer.id !== item.id && peer.reaction_id === item.reaction_id && !["product", "solvent"].includes(text(peer, "role")) && number(peer, "equivalents") > 0).forEach(peer => {
    peer.mmol = String(Number((scale * number(peer, "equivalents")).toFixed(8)))
    const mw = number(find("compounds", text(peer, "compound_id")), "molecular_weight")
    const factor = massToMg[text(peer, "unit")]
    if (mw > 0 && factor) peer.amount = String(Number((number(peer, "mmol") * mw / factor).toFixed(8)))
    touch(peer)
  })
}
function blockReason(kind: Kind, item: Row): string | null {
  if (["samples", "reactions", "files"].includes(kind) && !visible("experiments", find("experiments", text(item, "experiment_id")))) return "请先恢复所属实验"
  if (kind === "components" && !visible("reactions", find("reactions", text(item, "reaction_id")))) return "请先恢复所属反应"
  if (["components", "samples"].includes(kind) && item.compound_id && find("compounds", text(item, "compound_id")).deleted_at) return "请先恢复关联化合物"
  if (kind === "files" && item.sample_id && !visible("samples", find("samples", text(item, "sample_id")))) return "请先恢复关联样品"
  return null
}
function restoreUrl(kind: Kind, item: Row) { return kind === "components" ? `/api/reactions/${item.reaction_id}/components/${item.id}/restore` : `/api/${kind}/${item.id}/restore` }
async function sha(blob: Blob) {
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", await blob.arrayBuffer()))].map(value => value.toString(16).padStart(2, "0")).join("")
}
async function summary(id: string): Promise<string> {
  const exp = output("experiments", find("experiments", id))
  const reactions = active("reactions").filter(item => item.experiment_id === id)
  const samples = active("samples").filter(item => item.experiment_id === id)
  const files = active("files").filter(item => item.experiment_id === id)
  const lines = [`# ${exp.experiment_code} · ${exp.title}`, "", `日期：${exp.date}`, `状态：${exp.status}`, "", "## 目的", text(exp, "objective"), "", "## 备注", text(exp, "notes")]
  reactions.forEach(reaction => {
    lines.push("", `## ${reaction.reaction_name}`, `温度：${reaction.temperature_c ? `${reaction.temperature_c} °C` : reaction.temperature_k ? `${reaction.temperature_k} K` : reaction.temperature_description ?? "—"}`, `时间：${reaction.reaction_time_hours ? `${reaction.reaction_time_hours} h` : reaction.reaction_time_minutes ? `${reaction.reaction_time_minutes} min` : reaction.reaction_time_description ?? "—"}`, `气氛：${reaction.atmosphere ?? "—"}`)
    active("components").filter(item => item.reaction_id === reaction.id).forEach(item => lines.push(`- ${find("compounds", text(item, "compound_id")).name} · ${item.role} · ${item.amount ?? "—"} ${item.unit ?? ""} · ${item.mmol ?? "—"} mmol · ${item.equivalents ?? "—"} eq${item.yield_percent ? ` · 收率 ${item.yield_percent}%` : ""}`))
    lines.push(`后处理：${reaction.workup ?? "—"}`, `纯化：${reaction.purification ?? "—"}`)
  })
  lines.push("", "## 样品", ...samples.map(item => `- ${item.sample_code} · ${item.name ?? ""}`), "", "## 原始文件", ...files.map(item => `- ${item.original_filename} · ${item.file_size} B`))
  const content = lines.join("\n")
  return `${content}\n\n内容版本：${await sha(new Blob([content]))}\n生成时间：${now()}\n`
}
async function handle(path: string, init?: RequestInit): Promise<unknown> {
  const url = new URL(path, "https://rdms.invalid")
  const params = url.searchParams
  const parts = url.pathname.split("/").filter(Boolean)
  const method = init?.method ?? "GET"
  const body: Body = typeof init?.body === "string" ? JSON.parse(init.body) : {}
  const db = data()
  if (parts[0] === "auth") fail("离线演示无需账号，修改密码请使用正式版。")
  if (parts[0] === "search") {
    const results = (kind: "experiments" | "compounds", keys: string[], pageKey: string) => page(filtered(kind, params).map(item => ({ ...output(kind, item), matched_fields: keys.filter(key => text(item, key).toLowerCase().includes((params.get("q") ?? "").toLowerCase())) })), params, pageKey)
    return { query: params.get("q"), experiments: results("experiments", ["title", "experiment_code"], "experiment_page"), compounds: results("compounds", ["name", "codename", "cas_number", "smiles"], "compound_page") }
  }
  if (parts[0] === "trash") {
    const map: Record<string, Kind> = { experiment: "experiments", compound: "compounds", sample: "samples", reaction: "reactions", component: "components", file: "files" }
    const kind = map[params.get("type") ?? "experiment"] ?? "experiments"
    return page(db[kind].filter(item => item.deleted_at).map(item => ({ ...item, type: params.get("type") ?? "experiment", label: item.title ?? item.name ?? item.reaction_name ?? item.original_filename ?? item.sample_code ?? "组分", restore_url: restoreUrl(kind, item), restore_block_reason: blockReason(kind, item) })), params)
  }
  if (parts[0] === "dashboard") return { experiment_count: active("experiments").length, compound_count: active("compounds").length, sample_count: active("samples").length, recent_experiments: active("experiments").slice(-5), recent_files: active("files").map(item => output("files", item)).slice(-5) }
  if (parts[0] === "compounds" && parts[1] === "cas") return { local_matches: active("compounds").filter(item => item.cas_number === body.cas_number).map(item => output("compounds", item)), candidates: [], warnings: active("compounds").some(item => item.cas_number === body.cas_number) ? [] : ["离线演示未收录该 CAS；可手动填写或选择本机示例化合物。"] }
  if (parts[0] === "compounds" && parts[1] === "structure") {
    if (parts[2] === "lookup") return { candidates: [], properties: [], pubchem_cid: null, warnings: ["离线演示不连接公开资料服务。"] }
    if (parts[2] === "preview") {
      const value = text(body, "structure").trim()
      const known = chemistry.find(item => [item.smiles, item.input_smiles, item.structure_molfile.trim()].includes(value))
      if (!known) fail("离线演示仅支持内置示例结构（如 CCO）；任意结构解析请使用正式版。")
      return { ...known, duplicates: active("compounds").filter(item => item.inchi_key === known.inchi_key).map(item => ({ id: item.id, name: item.name, codename: item.codename, cas_number: item.cas_number })) }
    }
  }
  if (parts[0] === "compounds" && parts[1] === "bulk-tag") {
    const selected = body.compounds as { id: string; expected_version: number }[]
    selected.forEach(item => version(find("compounds", item.id), item.expected_version))
    let tag = active("tags").find(item => text(item, "name").toLowerCase() === text(body, "name").trim().toLowerCase())
    if (!tag) { tag = row(uid(), { name: text(body, "name").trim() }); db.tags.push(tag) }
    selected.forEach(item => { const compound = find("compounds", item.id); const tags = (compound.tags ?? []) as Row[]; if (!tags.some(item => item.id === tag!.id)) { compound.tags = [...tags, tag]; touch(compound) } })
    return { selected_count: selected.length, tag }
  }
  if (parts[0] === "experiments" && ["transfer", "transfer-preview"].includes(parts[1])) {
    const book = notebook(text(body, "notebook_id"))
    const selected = body.experiments as { id: string; expected_version: number }[]
    selected.forEach(item => version(find("experiments", item.id), item.expected_version))
    const next = counters.get(book.id) ?? 1
    if (parts[1] === "transfer-preview") return { next_number: next, items: selected.map((item, index) => ({ id: item.id, title: find("experiments", item.id).title, experiment_code: `${book.code}-${String(next + index).padStart(4, "0")}` })) }
    if (Number(body.expected_next_number) !== next) fail("记录本编号已变化，请重新预览", 409)
    selected.forEach(item => { const exp = find("experiments", item.id); assignCode(exp, book.id); touch(exp) })
    return undefined
  }
  if (parts[0] === "experiments" && parts[2] === "summary") return summary(parts[1])
  if (parts[0] === "experiments" && parts[2] === "copy") {
    const source = find("experiments", parts[1])
    version(source, body.expected_version)
    const copy = row(uid(), { ...defaults("experiments"), title: body.title, date: body.date, objective: source.objective, procedure: source.procedure })
    validate("experiments", copy); assignCode(copy, text(body, "notebook_id")); db.experiments.push(copy)
    active("reactions").filter(item => item.experiment_id === source.id).forEach(reaction => {
      const copied = row(uid(), { ...clean(reaction), experiment_id: copy.id })
      db.reactions.push(copied)
      active("components").filter(item => item.reaction_id === reaction.id).forEach(item => { const component = row(uid(), { ...clean(item), reaction_id: copied.id }); db.components.push(component) })
    })
    return output("experiments", copy)
  }
  if (parts[0] === "compounds" && ["experiments", "reactions", "samples"].includes(parts[2])) {
    const id = parts[1]
    const reactions = active("reactions").filter(reaction => active("components").some(item => item.reaction_id === reaction.id && item.compound_id === id))
    const samples = active("samples").filter(item => item.compound_id === id)
    if (parts[2] === "reactions") return page(reactions, params)
    if (parts[2] === "samples") return page(samples, params)
    return page(active("experiments").filter(exp => reactions.some(item => item.experiment_id === exp.id) || samples.some(item => item.experiment_id === exp.id)).map(exp => ({ id: exp.id, version: exp.version, experiment: output("experiments", exp), sources: [...(reactions.some(item => item.experiment_id === exp.id) ? ["reaction"] : []), ...(samples.some(item => item.experiment_id === exp.id) ? ["sample"] : [])] })), params)
  }
  if (parts[0] === "compounds" && parts[2] === "structure" && parts[3] === "cas") {
    const item = find("compounds", parts[1]); version(item, body.expected_version)
    const known = chemistry.find(entry => entry.cas_number === item.cas_number)
    if (!known) fail("离线示例库未收录该结构")
    Object.assign(item, { structure_molfile: known.structure_molfile, smiles: known.smiles, molecular_formula: known.molecular_formula, molecular_weight: known.molecular_weight, exact_mass: known.exact_mass, inchi_key: known.inchi_key }); touch(item)
    return output("compounds", item)
  }
  let kind = parts[0] as Kind
  let id = parts[1]
  let action = parts[2]
  let parent: Body = {}
  if (parts[0] === "experiments" && ["reactions", "files"].includes(parts[2])) { kind = parts[2] as Kind; parent = { experiment_id: parts[1] }; id = parts[3]; action = parts[4] }
  if (parts[0] === "reactions" && parts[2] === "components") { kind = "components"; parent = { reaction_id: parts[1] }; id = parts[3]; action = parts[4] }
  if (!kinds.includes(kind)) fail("此操作在离线演示中不可用", 404)
  if (method === "GET" && !id) {
    let rows = filtered(kind, params).filter(item => Object.entries(parent).every(([key, value]) => item[key] === value))
    if (kind === "components") {
      if (params.get("solvents_only") === "true") rows = rows.filter(item => item.role === "solvent")
      if (params.get("reactants_only") === "true") rows = rows.filter(item => item.role !== "product")
      if (params.get("exclude_solvents") === "true") rows = rows.filter(item => item.role !== "solvent")
    }
    if (["reactions", "components"].includes(kind)) rows.sort((a, b) => number(a, "sort_order") - number(b, "sort_order"))
    if (kind === "files") for (const item of rows) if (!item.sha256) item.sha256 = await sha(fileBlobs.get(item.id)!)
    return page(rows.map(item => output(kind, item)), params)
  }
  if (method === "POST" && !id) {
    const fields = { ...defaults(kind), ...clean(body), ...parent }
    if (kind === "files" && init?.body instanceof FormData) {
      const form = init.body; const file = form.get("file")
      if (!(file instanceof Blob) || !file.size) fail("请选择非空文件")
      if (file.size > 100 * 1024 * 1024) fail("文件超过 100 MiB")
      const name = file instanceof File ? file.name : "attachment.txt"
      const extension = name.split(".").at(-1)?.toLowerCase() ?? ""
      if (!["pdf", "csv", "txt", "png", "jpg", "jpeg", "jdx", "dx", "zip"].includes(extension)) fail("不支持的文件类型")
      const item = row(uid(), { ...fields, original_filename: name, file_type: extension, file_size: file.size, sha256: await sha(file), sample_id: form.get("sample_id") ?? null, instrument_type: form.get("instrument_type") ?? null, notes: form.get("notes") ?? null, uploaded_at: now() })
      validate(kind, item); fileBlobs.set(item.id, file); db.files.push(item); return output(kind, item)
    }
    if (kind === "compounds") { structureFields(fields); fields.tags = ((body.tag_ids ?? []) as string[]).map(id => find("tags", id)) }
    if (kind === "components" && fields.is_limiting) fields.equivalents = "1"
    validate(kind, fields)
    const item = row(uid(), fields)
    if (kind === "components") rescale(item, body)
    if (kind === "experiments") assignCode(item, text(body, "notebook_id"))
    db[kind].push(item)
    if (kind === "components") applyScale(item, body)
    return output(kind, item)
  }
  const item = find(kind, id)
  if (Object.entries(parent).some(([key, value]) => item[key] !== value)) fail("记录不属于当前页面", 404)
  if (method === "GET" && action === "neighbors") {
    const rows = filtered(kind, params); const position = rows.findIndex(row => row.id === id)
    return { previous_id: rows[position - 1]?.id ?? null, next_id: rows[position + 1]?.id ?? null, position: position < 0 ? null : position + 1 }
  }
  if (method === "GET") {
    if (!visible(kind, item)) fail("记录已删除", 404)
    if (kind === "files" && !item.sha256) item.sha256 = await sha(fileBlobs.get(item.id)!)
    return output(kind, item)
  }
  version(item, body.expected_version ?? params.get("expected_version"))
  if (method === "DELETE") {
    if (kind === "compounds" && (active("samples").some(row => row.compound_id === id) || active("components").some(row => row.compound_id === id))) fail("化合物仍有实验、反应或样品引用，请先解除关联", 409)
    item.deleted_at = now(); touch(item); return undefined
  }
  if (method === "POST" && action === "restore") {
    const reason = blockReason(kind, item); if (reason) fail(reason, 409)
    if (kind === "experiments") assignCode(item, text(body, "notebook_id"))
    item.deleted_at = null; touch(item); return output(kind, item)
  }
  if (method === "PATCH") {
    const fields = clean(body)
    validate(kind, fields, item)
    if (kind === "compounds") { structureFields(fields); if (body.tag_ids) fields.tags = (body.tag_ids as string[]).map(id => find("tags", id)) }
    if (kind === "components") { rescale(item, body); if (fields.is_limiting) fields.equivalents = "1" }
    Object.assign(item, fields)
    if (kind === "components") {
      applyScale(item, body)
      if (body.calculate_yield) {
        const limiting = active("components").find(row => row.reaction_id === item.reaction_id && row.is_limiting)
        const result = productYield(text(item, "amount"), text(item, "unit"), number(find("compounds", text(item, "compound_id")), "molecular_weight"), limiting ? number(limiting, "mmol") : null, text(item, "stoichiometric_ratio") || "1")
        if (result.value !== undefined) item.yield_percent = result.value
      }
    }
    touch(item); return output(kind, item)
  }
  fail("此操作在离线演示中不可用", 404)
}
export async function demoRequest<T>(path: string, init?: RequestInit): Promise<T> {
  return structuredClone(await handle(path, init)) as T
}
