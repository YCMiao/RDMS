import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter } from "react-router-dom"
import { afterEach, describe, expect, it, vi } from "vitest"

import { SearchPage, SummaryPanel } from "./discovery"

describe("discovery pages", () => {
  afterEach(() => vi.restoreAllMocks())

  it("renders separate experiment and compound groups with matched fields", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      query: "C%_N", experiments: { items: [], total: 0, page: 1, page_size: 10 },
      compounds: { items: [{ id: "compound-id", cas_number: "92-52-4", codename: "BP", name: "目标物", matched_fields: ["smiles"] }], total: 1, page: 1, page_size: 10 },
    })))
    render(<MemoryRouter initialEntries={["/search?q=C%25_N"]}><SearchPage /></MemoryRouter>)
    await waitFor(() => expect(screen.getByText("目标物")).toBeInTheDocument())
    expect(screen.getByRole("heading", { name: "实验 · 0" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "化合物 · 1" })).toBeInTheDocument()
    expect(screen.getByText("SMILES")).toBeInTheDocument()
  })

  it("previews one markdown response and its content revision", async () => {
    const revision = "a".repeat(64)
    const calls: string[] = []
    vi.spyOn(globalThis, "fetch").mockImplementation(async input => {
      calls.push(String(input))
      return new Response(`# EXP-2026-0001 · 测试\n生成时间：2026-09-23T00:00:00+00:00\n内容版本：${revision}\n\n## 结论\n未记录\n`)
    })
    render(<MemoryRouter><SummaryPanel experimentId="exp-id" experimentCode="EXP-2026-0001" /></MemoryRouter>)
    await userEvent.click(screen.getByRole("button", { name: "生成摘要" }))
    await waitFor(() => expect(screen.getByText(/未记录/, { selector: "pre" })).toBeInTheDocument())
    expect(screen.getByText(revision)).toBeInTheDocument()
    expect(calls).toEqual(["/api/experiments/exp-id/summary?format=markdown"])
  })
})
