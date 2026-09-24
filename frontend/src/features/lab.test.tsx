import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter } from "react-router-dom"
import { afterEach, describe, expect, it, vi } from "vitest"

import { ExperimentLab, SamplesPage } from "./lab"

const empty = { items: [], page: 1, page_size: 20, total: 0 }
const experiment = { id: "e7f7c424-6ed2-4084-944d-d9dc7c02a995", experiment_code: "EXP-2026-0001", title: "测试实验" }

function respond(body: unknown, status = 200) { return new Response(JSON.stringify(body), { status }) }

describe("sample and reaction workflows", () => {
  afterEach(() => vi.restoreAllMocks())

  it("creates a mixture sample without a compound and uses the server code", async () => {
    const sent: Record<string, unknown>[] = []
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const path = String(input)
      if (path === "/api/samples" && init?.method === "POST") {
        sent.push(JSON.parse(String(init.body)))
        return respond({ ...sent[0], id: "d6c824df-6d46-4a4c-bd9b-c7fc2e9a1163", sample_code: "SMP-2026-0001" }, 201)
      }
      if (path.startsWith("/api/experiments")) return respond({ ...empty, items: [experiment], total: 1 })
      return respond(empty)
    })
    render(<MemoryRouter><SamplesPage /></MemoryRouter>)
    await waitFor(() => expect(screen.getByRole("option", { name: /测试实验/ })).toBeInTheDocument())
    await userEvent.selectOptions(screen.getByLabelText(/所属实验/), experiment.id)
    await userEvent.type(screen.getByRole("textbox", { name: /样品类型/ }), "混合物")
    await userEvent.click(screen.getByRole("button", { name: "创建样品" }))
    await waitFor(() => expect(sent).toHaveLength(1))
    expect(sent[0]).toMatchObject({ experiment_id: experiment.id, sample_type: "混合物", compound_id: null })
    expect(sent[0]).not.toHaveProperty("sample_code")
  })

  it("creates two reactions under one experiment", async () => {
    const reactions: Record<string, unknown>[] = []
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const path = String(input)
      if (path.endsWith("/reactions") && init?.method === "POST") {
        const body = JSON.parse(String(init.body)) as Record<string, unknown>
        reactions.push({ ...body, id: `reaction-${reactions.length + 1}`, experiment_id: experiment.id, version: 1, temperature_c: null, reaction_time_hours: null, atmosphere: null, solvent: null, notes: null })
        return respond(reactions.at(-1), 201)
      }
      if (path.includes("/reactions?")) return respond({ ...empty, items: reactions, total: reactions.length })
      return respond(empty)
    })
    render(<MemoryRouter><ExperimentLab experimentId={experiment.id} /></MemoryRouter>)
    const name = screen.getByRole("textbox", { name: "新反应名称" })
    await userEvent.type(name, "反应 A")
    await userEvent.click(screen.getByRole("button", { name: "创建反应" }))
    await waitFor(() => expect(screen.getByRole("heading", { name: "反应 A" })).toBeInTheDocument())
    await userEvent.type(name, "反应 B")
    await userEvent.click(screen.getByRole("button", { name: "创建反应" }))
    await waitFor(() => expect(screen.getByRole("heading", { name: "反应 B" })).toBeInTheDocument())
    expect(reactions.map(item => item.reaction_name)).toEqual(["反应 A", "反应 B"])
  })
})
