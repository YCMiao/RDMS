import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter, Route, Routes } from "react-router-dom"
import { afterEach, describe, expect, it, vi } from "vitest"

import { ExperimentLab, SampleEditor, SamplesPage } from "./lab"

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
    expect(screen.queryByLabelText(/所属实验/)).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole("button", { name: "新建样品" }))
    await waitFor(() => expect(screen.getByRole("option", { name: /测试实验/ })).toBeInTheDocument())
    await userEvent.selectOptions(screen.getByLabelText(/所属实验/), experiment.id)
    await userEvent.type(screen.getByRole("textbox", { name: /样品类型/ }), "混合物")
    await userEvent.click(screen.getByRole("button", { name: "创建样品" }))
    await waitFor(() => expect(sent).toHaveLength(1))
    expect(sent[0]).toMatchObject({ experiment_id: experiment.id, sample_type: "混合物", compound_id: null })
    expect(sent[0]).not.toHaveProperty("sample_code")
    await waitFor(() => expect(screen.queryByLabelText(/所属实验/)).not.toBeInTheDocument())
  })

  it("keeps unsaved sample input when cancellation is declined and clears it when confirmed", async () => {
    const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(async () => respond(empty))
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false)
    render(<MemoryRouter><SamplesPage /></MemoryRouter>)
    await userEvent.click(screen.getByRole("button", { name: "新建样品" }))
    await userEvent.type(screen.getByLabelText("名称"), "未保存样品")
    await userEvent.click(screen.getByRole("button", { name: "取消" }))
    expect(confirm).toHaveBeenCalledWith("未保存的内容将丢失，确定取消？")
    expect(screen.getByLabelText("名称")).toHaveValue("未保存样品")
    confirm.mockReturnValue(true)
    await userEvent.click(screen.getByRole("button", { name: "取消" }))
    expect(screen.queryByLabelText("名称")).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole("button", { name: "新建样品" }))
    expect(screen.getByLabelText("名称")).toHaveValue("")
    expect(fetch.mock.calls.some(([, init]) => init?.method === "POST")).toBe(false)
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
      if (init?.method === "DELETE") { reactions.pop(); return new Response(null, { status: 204 }) }
      if (path.includes("/reactions?")) { const page = Number(new URL(path, "http://localhost").searchParams.get("page")); return respond({ ...empty, page, items: reactions.slice(page - 1, page), total: reactions.length }) }
      return respond(empty)
    })
    render(<MemoryRouter><ExperimentLab experimentId={experiment.id} /></MemoryRouter>)
    await userEvent.click(screen.getByText("添加反应", { exact: true }))
    const name = screen.getByRole("textbox", { name: "新反应名称" })
    await userEvent.type(name, "反应 A")
    await userEvent.click(screen.getByRole("button", { name: "创建反应" }))
    await waitFor(() => expect(screen.getByRole("heading", { name: "反应 A" })).toBeInTheDocument())
    await userEvent.type(name, "反应 B")
    await userEvent.click(screen.getByRole("button", { name: "创建反应" }))
    await waitFor(() => expect(screen.getByRole("heading", { name: "反应 B" })).toBeInTheDocument())
    expect(reactions.map(item => item.reaction_name)).toEqual(["反应 A", "反应 B"])
    expect(screen.queryByRole("heading", { name: "反应 A" })).not.toBeInTheDocument()
    expect(screen.getByText("REACTION 2")).toBeInTheDocument()
    await userEvent.click(screen.getByRole("button", { name: "上一页" }))
    await screen.findByRole("heading", { name: "反应 A" })
    expect(screen.queryByRole("heading", { name: "反应 B" })).not.toBeInTheDocument()
    expect(screen.getByText("REACTION 1")).toBeInTheDocument()
    await userEvent.type(screen.getByRole("textbox", { name: "反应名称 *" }), "未保存")
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false)
    await userEvent.click(screen.getByRole("button", { name: "下一页" }))
    expect(confirm).toHaveBeenCalled()
    expect(screen.getByRole("heading", { name: "反应 A" })).toBeInTheDocument()
    expect(screen.getByRole("textbox", { name: "反应名称 *" })).toHaveValue("反应 A未保存")
    confirm.mockReturnValue(true)
    await userEvent.click(screen.getByRole("button", { name: "下一页" }))
    await screen.findByRole("heading", { name: "反应 B" })
    await userEvent.click(screen.getByRole("button", { name: "删除反应" }))
    await screen.findByRole("heading", { name: "反应 A" })
    expect(screen.getByText("REACTION 1")).toBeInTheDocument()
    expect(screen.getByRole("textbox", { name: "反应名称 *" })).toHaveValue("反应 A")
  })

  it("shows rejected condition fields beside save and preserves input for retry", async () => {
    const reaction = { id: "reaction-1", reaction_name: "条件验证", experiment_id: experiment.id, version: 1, temperature_c: null, reaction_time_hours: null, atmosphere: null, solvent: null, workup: null, purification: null, notes: null }
    const sent: Record<string, unknown>[] = []
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const path = String(input)
      if (path === "/api/reactions/reaction-1" && init?.method === "PATCH") {
        const body = JSON.parse(String(init.body)) as Record<string, unknown>
        sent.push(body)
        if (body.temperature_c === "25.123456789") return respond({ error: { message: "请求字段无效", fields: [{ field: "body.temperature_c", message: "Input should be a valid decimal" }] } }, 422)
        return respond({ ...reaction, ...body, version: 2 })
      }
      if (path.includes(`/experiments/${experiment.id}/reactions?`)) return respond({ ...empty, items: [reaction], total: 1 })
      return respond(empty)
    })
    render(<MemoryRouter><ExperimentLab experimentId={experiment.id} /></MemoryRouter>)
    const temperature = await screen.findByLabelText("温度 °C")
    await userEvent.type(temperature, "25.123456789")
    await userEvent.type(screen.getByLabelText("后处理"), "浓缩")
    await userEvent.click(screen.getByRole("button", { name: "保存反应" }))
    const failure = await screen.findByRole("alert")
    expect(failure).toHaveTextContent("未保存：温度 °C须填写数字")
    expect(failure.closest("form")).toContainElement(screen.getByRole("button", { name: "保存反应" }))
    expect(screen.getByLabelText("后处理")).toHaveValue("浓缩")
    await userEvent.clear(temperature)
    await userEvent.type(temperature, "25")
    await userEvent.click(screen.getByRole("button", { name: "保存反应" }))
    await screen.findByText("反应已保存")
    expect(sent[1]).toMatchObject({ temperature_c: "25", workup: "浓缩", expected_version: 1 })
  })

  it("sends only the selected temperature and time representation", async () => {
    const reaction = { id: "reaction-modes", reaction_name: "模式验证", experiment_id: experiment.id, version: 1, temperature_c: "25.12345678", reaction_time_hours: "8", atmosphere: null, solvent: null, workup: null, purification: null, notes: null }
    const sent: Record<string, unknown>[] = []
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      if (String(input) === "/api/reactions/reaction-modes" && init?.method === "PATCH") {
        const body = JSON.parse(String(init.body)) as Record<string, unknown>
        sent.push(body)
        return respond({ ...reaction, ...body, version: sent.length + 1 })
      }
      if (String(input).includes(`/experiments/${experiment.id}/reactions?`)) return respond({ ...empty, items: [reaction], total: 1 })
      return respond(empty)
    })
    render(<MemoryRouter><ExperimentLab experimentId={experiment.id} /></MemoryRouter>)
    await screen.findByLabelText("温度 °C")
    await userEvent.selectOptions(screen.getByLabelText("温度记录方式"), "description")
    await userEvent.type(screen.getByLabelText("温度描述"), "室温")
    await userEvent.selectOptions(screen.getByLabelText("时间记录方式"), "min")
    await userEvent.type(screen.getByLabelText("时间 min"), "30.12345678")
    await userEvent.click(screen.getByRole("button", { name: "保存反应" }))
    await screen.findByText("反应已保存")
    expect(sent[0]).toMatchObject({ temperature_c: null, temperature_description: "室温", reaction_time_hours: null, reaction_time_minutes: "30.12345678", reaction_time_description: null })
    await userEvent.selectOptions(screen.getByLabelText("时间记录方式"), "description")
    await userEvent.type(screen.getByLabelText("时间描述"), "过夜")
    await userEvent.click(screen.getByRole("button", { name: "保存反应" }))
    await screen.findByText("反应已保存")
    expect(sent[1]).toMatchObject({ expected_version: 2, reaction_time_hours: null, reaction_time_minutes: null, reaction_time_description: "过夜" })
    await userEvent.selectOptions(screen.getByLabelText("温度记录方式"), "celsius")
    await userEvent.selectOptions(screen.getByLabelText("时间记录方式"), "h")
    await userEvent.click(screen.getByRole("button", { name: "保存反应" }))
    await screen.findByText("反应已保存")
    expect(sent[2]).toMatchObject({ temperature_c: "25.12345678", temperature_description: null, reaction_time_hours: "8", reaction_time_minutes: null, reaction_time_description: null })
  })

  it("shows sample inputs without database padding and keeps precise values when editing a name", async () => {
    const sample = { id: "d6c824df-6d46-4a4c-bd9b-c7fc2e9a1163", sample_code: "SMP-2026-0001", experiment_id: experiment.id, version: 1, name: "原样品", sample_type: "溶液", compound_id: null, amount: "1.20000000", unit: "mL", concentration: "0.12345678", concentration_unit: "M", notes: null }
    let sent: Record<string, unknown> | null = null
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      if (String(input) === `/api/samples/${sample.id}` && init?.method === "PATCH") {
        sent = JSON.parse(String(init.body)) as Record<string, unknown>
        return respond({ ...sample, ...sent, version: 2 })
      }
      if (String(input) === `/api/samples/${sample.id}`) return respond(sample)
      return respond(empty)
    })
    render(<MemoryRouter initialEntries={[`/samples/${sample.id}`]}><Routes><Route path="/samples/:id" element={<SampleEditor />} /></Routes></MemoryRouter>)
    await waitFor(() => expect(screen.getByRole("textbox", { name: "数量" })).toHaveValue("1.2"))
    expect(screen.getByRole("textbox", { name: "浓度" })).toHaveValue("0.12345678")
    await userEvent.clear(screen.getByRole("textbox", { name: "名称" }))
    await userEvent.type(screen.getByRole("textbox", { name: "名称" }), "新样品")
    await userEvent.click(screen.getByRole("button", { name: "保存修改" }))
    await waitFor(() => expect(sent).not.toBeNull())
    expect(sent).toMatchObject({ name: "新样品", amount: "1.2", concentration: "0.12345678" })
  })
})
