import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { StrictMode } from "react"
import { MemoryRouter, Route, Routes } from "react-router-dom"
import { afterEach, describe, expect, it, vi } from "vitest"

import { RecordEditor, RecordList } from "./records"

describe("experiment editor", () => {
  afterEach(() => vi.restoreAllMocks())

  it("submits a record without a client generated code and displays the server code", async () => {
    const sent: unknown[] = []
    const created = {
      id: "9bcb3bdd-08a9-44a9-8202-feb3d36092f4",
      experiment_code: "EXP-2026-0001",
      title: "新的实验",
      date: "2026-09-23",
      status: "draft",
      objective: null,
      procedure: null,
      observation: null,
      result: null,
      conclusion: null,
      tags: [],
      version: 1,
      created_at: "2026-09-23T00:00:00Z",
      updated_at: "2026-09-23T00:00:00Z",
    }
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input)
      if (url === "/api/experiments" && init?.method === "POST") {
        sent.push(JSON.parse(String(init.body)))
        return new Response(JSON.stringify(created), { status: 201 })
      }
      if (url === `/api/experiments/${created.id}`) return new Response(JSON.stringify(created))
      return new Response(JSON.stringify({ items: [], total: 0, page: 1, page_size: 20 }))
    })
    render(<MemoryRouter initialEntries={["/experiments/new"]}><Routes><Route path="/experiments/new" element={<RecordEditor kind="experiments" />} /><Route path="/experiments/:id" element={<RecordEditor kind="experiments" />} /></Routes></MemoryRouter>)
    await userEvent.type(screen.getByRole("textbox", { name: /标题/ }), "新的实验")
    await userEvent.click(screen.getByRole("button", { name: "创建并分配编号" }))
    await waitFor(() => expect(screen.getByText(/EXP-2026-0001/)).toBeInTheDocument())
    expect(sent).toHaveLength(1)
    expect(sent[0]).toMatchObject({ title: "新的实验", tag_ids: [] })
    expect(sent[0]).not.toHaveProperty("experiment_code")
  })

  it("creates a compound from the list dialog", async () => {
    Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
      configurable: true,
      value: function (this: HTMLDialogElement) { this.open = true },
    })
    const sent: unknown[] = []
    const created = {
      id: "6035a847-5220-484b-84a0-df2b148f55aa", compound_code: "CMP-000001",
      name: "联苯", smiles: null, molecular_formula: null, molecular_weight: null,
      notes: null, tags: [], version: 1,
      created_at: "2026-09-23T00:00:00Z", updated_at: "2026-09-23T00:00:00Z",
    }
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input)
      if (url === "/api/compounds" && init?.method === "POST") {
        sent.push(JSON.parse(String(init.body)))
        return new Response(JSON.stringify(created), { status: 201 })
      }
      if (url === `/api/compounds/${created.id}`) return new Response(JSON.stringify(created))
      return new Response(JSON.stringify({ items: [], total: 0, page: 1, page_size: 25 }))
    })
    render(<StrictMode><MemoryRouter initialEntries={["/compounds"]}><Routes><Route path="/compounds" element={<RecordList kind="compounds" />} /><Route path="/compounds/:id" element={<RecordEditor kind="compounds" />} /></Routes></MemoryRouter></StrictMode>)
    await userEvent.click(screen.getByRole("button", { name: "新建化合物" }))
    expect(screen.getByRole("dialog", { name: "新建化合物" })).toBeInTheDocument()
    await userEvent.type(screen.getByRole("textbox", { name: /名称/ }), "联苯")
    await userEvent.click(screen.getByRole("button", { name: "创建并分配编号" }))
    await waitFor(() => expect(screen.getByText(/CMP-000001/)).toBeInTheDocument())
    expect(sent[0]).toMatchObject({ name: "联苯", tag_ids: [] })
    expect(sent[0]).not.toHaveProperty("compound_code")
  })

  it("shows two decimals without changing the stored weight on an unrelated edit", async () => {
    const compound = {
      id: "6035a847-5220-484b-84a0-df2b148f55aa", compound_code: "CMP-000001",
      name: "测试化合物", smiles: null, molecular_formula: "C10H10", molecular_weight: "154.21000000",
      structure_molfile: null, exact_mass: null, inchi_key: null, cas_number: null, cas_source: null,
      physical_properties: [], notes: null, tags: [], version: 1,
      created_at: "2026-09-23T00:00:00Z", updated_at: "2026-09-23T00:00:00Z",
    }
    const sent: Record<string, unknown>[] = []
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const path = String(input)
      if (path === `/api/compounds/${compound.id}` && init?.method === "PATCH") {
        sent.push(JSON.parse(String(init.body)) as Record<string, unknown>)
        return new Response(JSON.stringify({ ...compound, ...sent[0], version: 2 }))
      }
      if (path === `/api/compounds/${compound.id}`) return new Response(JSON.stringify(compound))
      return new Response(JSON.stringify({ items: [], total: 0, page: 1, page_size: 20 }))
    })
    render(<MemoryRouter initialEntries={[`/compounds/${compound.id}`]}><Routes><Route path="/compounds/:id" element={<RecordEditor kind="compounds" />} /></Routes></MemoryRouter>)
    const weight = await screen.findByRole("textbox", { name: "分子量 (g/mol)" })
    expect(weight).toHaveValue("154.21")
    await userEvent.type(screen.getByRole("textbox", { name: /名称/ }), " A")
    await userEvent.click(screen.getByRole("button", { name: "保存修改" }))
    await waitFor(() => expect(sent).toHaveLength(1))
    expect(sent[0].molecular_weight).toBe("154.21000000")
  })
})
