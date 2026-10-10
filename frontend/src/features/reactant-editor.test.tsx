import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter } from "react-router-dom"
import { afterEach, describe, expect, it, vi } from "vitest"
import { ReactantEditor } from "./reactant-editor"

const ethanol = { name: "ethanol", cas_number: "64-17-5", molecular_formula: "C2H6O", molecular_weight: "46.07", source: "PubChem CAS 同义词匹配", source_url: "https://pubchem.ncbi.nlm.nih.gov/compound/702" }
const methanol = { ...ethanol, name: "methanol", cas_number: "67-56-1", molecular_formula: "CH4O", molecular_weight: "32.04" }
const respond = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })
const empty = { items: [], page: 1, page_size: 20, total: 0 }
function mount(product = false) { const onSaved = vi.fn(); render(<MemoryRouter><ReactantEditor reactionId="r1" product={product} onSaved={onSaved} onCancel={vi.fn()} /></MemoryRouter>); return onSaved }

describe("CAS reagent entry", () => {
  afterEach(() => vi.restoreAllMocks())
  it("saves product quantity and zero yield without treating it as a reactant", async () => {
    const writes: Record<string, unknown>[] = []
    vi.spyOn(globalThis, "fetch").mockImplementation(async (_input, init) => {
      if (init?.method === "POST") {
        const body = JSON.parse(String(init.body)); writes.push(body)
        return respond({ ...body, id: "product-compound" }, 201)
      }
      return respond(empty)
    })
    const onSaved = mount(true)
    await userEvent.click(screen.getByRole("button", { name: "手动填写" }))
    await userEvent.type(screen.getByLabelText("名称（IUPAC）"), "ethanal")
    await userEvent.type(screen.getByLabelText("产物量"), "44.12345678")
    await userEvent.type(screen.getByLabelText("收率 %"), "0")
    expect(screen.queryByLabelText("eq")).not.toBeInTheDocument()
    expect(screen.queryByLabelText("角色")).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole("button", { name: "保存产物" }))
    await waitFor(() => expect(onSaved).toHaveBeenCalledOnce())
    expect(writes[1]).toMatchObject({ role: "product", amount: "44.12345678", unit: "mg", yield_percent: "0" })
  })
  it("finds a reagent without writing, then preserves identity and dosing on save", async () => {
    const writes: { path: string; body: Record<string, unknown> }[] = []
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const path = String(input)
      if (path.endsWith("/cas/lookup")) return respond({ local_matches: [], candidates: [ethanol], warnings: [] })
      if (init?.method === "POST") {
        const body = JSON.parse(String(init.body)); writes.push({ path, body })
        return respond({ ...body, id: "cmp-1" }, 201)
      }
      return respond(empty)
    })
    const onSaved = mount()
    await userEvent.type(screen.getByLabelText("CAS 号"), "64-17-5")
    await screen.findByText("ethanol")
    expect(writes).toHaveLength(0)
    await userEvent.type(screen.getByLabelText("投料量"), "92.14")
    await userEvent.click(screen.getByRole("button", { name: "按 Mw 补全 mg / mmol" }))
    expect(screen.getByLabelText("mmol")).toHaveValue(2)
    await userEvent.type(screen.getByLabelText("eq"), "1.25")
    await userEvent.click(screen.getByRole("button", { name: "加入投料表" }))
    await waitFor(() => expect(onSaved).toHaveBeenCalledOnce())
    expect(writes[0].body).toMatchObject({ name: "ethanol", molecular_formula: "C2H6O", cas_number: "64-17-5", molecular_weight: "46.07" })
    expect(writes[1].body).toMatchObject({ compound_id: "cmp-1", role: "substrate", amount: "92.14", unit: "mg", mmol: "2", equivalents: "1.25" })
    expect(writes[1].body).not.toHaveProperty("yield_percent")
  })
  it("uses the first positive pair across pages for eq/mmol and Mw completion", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async input => {
      const path = String(input)
      if (path.includes("/components?page=1")) return respond({ ...empty, total: 2, items: [{ id: "zero", mmol: "0", equivalents: "1" }] })
      if (path.includes("/components?page=2")) return respond({ ...empty, total: 2, items: [{ id: "basis", mmol: "2", equivalents: "1" }] })
      return respond(empty)
    })
    mount()
    await screen.findByText(/本反应 1 eq = 2 mmol/)
    await userEvent.click(screen.getByRole("button", { name: "手动填写" }))
    await userEvent.type(screen.getByLabelText("Mw (g/mol)"), "46.07")
    await userEvent.type(screen.getByLabelText("eq"), "1.05")
    await userEvent.tab()
    expect(screen.getByLabelText("mmol")).toHaveValue(2.1)
    await userEvent.clear(screen.getByLabelText("mmol"))
    await userEvent.type(screen.getByLabelText("mmol"), "3")
    await userEvent.tab()
    expect(screen.getByLabelText("eq")).toHaveValue(1.5)
    await userEvent.clear(screen.getByLabelText("mmol"))
    await userEvent.clear(screen.getByLabelText("eq"))
    await userEvent.type(screen.getByLabelText("投料量"), "92.14")
    await userEvent.click(screen.getByRole("button", { name: "按 Mw 补全 mg / mmol" }))
    expect(screen.getByLabelText("mmol")).toHaveValue(2)
    expect(screen.getByLabelText("eq")).toHaveValue(1)
  })
  it("ignores a late lookup after CAS changes and does not guess liquid mmol", async () => {
    let completeFirst!: (response: Response) => void
    const remote = vi.spyOn(globalThis, "fetch").mockImplementation(async (_input, init) => {
      if (!init?.body) return respond(empty)
      if (JSON.parse(String(init?.body)).cas_number === "64-17-5") return new Promise<Response>(resolve => { completeFirst = resolve })
      return respond({ local_matches: [], candidates: [methanol], warnings: [] })
    })
    mount()
    await userEvent.type(screen.getByLabelText("CAS 号"), "64-17-5")
    await waitFor(() => expect(remote).toHaveBeenCalledTimes(2))
    await userEvent.clear(screen.getByLabelText("CAS 号"))
    await userEvent.type(screen.getByLabelText("CAS 号"), "67-56-1")
    await screen.findByText("methanol")
    completeFirst(respond({ local_matches: [], candidates: [ethanol], warnings: [] }))
    await userEvent.selectOptions(screen.getByLabelText("单位"), "mL")
    await userEvent.type(screen.getByLabelText("投料量"), "1")
    expect(screen.getByRole("button", { name: "按 Mw 补全 mg / mmol" })).toBeDisabled()
    expect(screen.getByLabelText("mmol")).toHaveValue(null)
    expect(screen.queryByText("ethanol")).not.toBeInTheDocument()
  })
  it("requires a choice for ambiguous results and offers manual entry after failure", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async input => String(input).endsWith("/cas/lookup") ? respond({ local_matches: [], candidates: [ethanol, { ...ethanol, name: "other" }], warnings: [] }) : respond(empty))
    mount()
    await userEvent.type(screen.getByLabelText("CAS 号"), "64-17-5")
    await screen.findByText("找到多个匹配，请选择具体试剂：")
    expect(screen.getByRole("button", { name: "加入投料表" })).toBeDisabled()
    await userEvent.click(screen.getByRole("button", { name: /ethanol ·/ }))
    expect(screen.getByRole("button", { name: "加入投料表" })).toBeEnabled()
    await userEvent.click(screen.getByRole("button", { name: "手动填写" }))
    expect(screen.getByLabelText("名称（IUPAC）")).toBeVisible()
    expect(screen.queryByText("找到多个匹配，请选择具体试剂：")).not.toBeInTheDocument()
  })
  it("blocks invalid CAS, preserves entry on failure and reuses a saved compound on retry", async () => {
    let creates = 0; let saves = 0
    const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const path = String(input)
      if (path.endsWith("/cas/lookup")) return respond({ local_matches: [], candidates: [ethanol], warnings: [] })
      if (path.endsWith("/compounds")) { creates++; return respond({ ...ethanol, id: "cmp-saved" }) }
      if (init?.method === "POST") { saves++; return saves === 1 ? respond({ error: { message: "记录冲突" } }, 409) : respond({ id: "component" }) }
      return respond(empty)
    })
    const onSaved = mount()
    await userEvent.type(screen.getByLabelText("CAS 号"), "64-17-6")
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(screen.getByRole("button", { name: "加入投料表" })).toBeDisabled()
    await userEvent.clear(screen.getByLabelText("CAS 号"))
    await userEvent.type(screen.getByLabelText("CAS 号"), "64-17-5")
    await screen.findByText("ethanol")
    await userEvent.type(screen.getByLabelText("投料量"), "1.12345678")
    await userEvent.click(screen.getByRole("button", { name: "加入投料表" }))
    await screen.findByRole("alert")
    expect(screen.getByLabelText("投料量")).toHaveValue(1.12345678)
    await userEvent.click(screen.getByRole("button", { name: "加入投料表" }))
    await waitFor(() => expect(onSaved).toHaveBeenCalledOnce())
    expect(creates).toBe(1)
    expect(saves).toBe(2)
  })
})
