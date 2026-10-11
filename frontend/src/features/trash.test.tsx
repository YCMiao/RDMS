import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, expect, it, vi } from "vitest"

import { TrashPanel } from "./trash"

afterEach(() => vi.restoreAllMocks())

it("shows restore dependencies and submits the deleted row version", async () => {
  const calls: { url: string; method?: string; body?: string }[] = []
  const items = [
    { id: "blocked", type: "experiment", label: "缺少化合物", deleted_at: "2026-09-23T00:00:00Z", version: 2, parent_active: true, restore_block_reason: "请先恢复关联的化合物", restore_url: "/api/experiments/blocked/restore" },
    { id: "ready", type: "experiment", label: "可恢复实验", deleted_at: "2026-09-23T00:00:00Z", version: 3, parent_active: true, restore_block_reason: null, restore_url: "/api/experiments/ready/restore" },
  ]
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    calls.push({ url: String(input), method: init?.method, body: String(init?.body || "") })
    if (String(input).startsWith("/api/notebooks")) return new Response(JSON.stringify({ items: [{ id: "target-book", code: "NB001", name: "已有实验", archived: false }], total: 1 }))
    if (init?.method === "POST") {
      items.pop()
      return new Response(JSON.stringify({ id: "ready" }))
    }
    return new Response(JSON.stringify({ items, total: items.length, page: 1, page_size: 20 }))
  })
  render(<TrashPanel />)
  await waitFor(() => expect(screen.getByText("可恢复实验")).toBeInTheDocument())
  expect(screen.getByText("请先恢复关联的化合物")).toBeInTheDocument()
  expect(screen.getByRole("button", { name: "查看化合物回收站" })).toBeInTheDocument()
  expect(screen.getAllByRole("button", { name: "恢复" })[0]).toBeDisabled()
  await userEvent.selectOptions(screen.getByLabelText("记录本", { exact: true }), "target-book")
  await userEvent.click(screen.getAllByRole("button", { name: "恢复" })[1])
  await waitFor(() => expect(screen.queryByText("可恢复实验")).not.toBeInTheDocument())
  expect(calls).toContainEqual({ url: "/api/experiments/ready/restore", method: "POST", body: '{"expected_version":3,"notebook_id":"target-book"}' })
  await userEvent.click(screen.getByRole("button", { name: "查看化合物回收站" }))
  await waitFor(() => expect(calls.some(call => call.url.includes("type=compound"))).toBe(true))
})
