import { render, screen, waitFor } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { afterEach, describe, expect, it, vi } from "vitest"

import App from "./App"

describe("application shell", () => {
  afterEach(() => vi.restoreAllMocks())

  it("shows the real service readiness state", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async input =>
      new Response(JSON.stringify(String(input) === "/api/dashboard"
        ? { experiment_count: 0, compound_count: 0, sample_count: 0, recent_experiments: [], recent_files: [] }
        : { status: "ok" }), { status: 200, headers: { "Content-Type": "application/json" } }),
    )

    render(
      <MemoryRouter>
        <App />
      </MemoryRouter>,
    )

    expect(screen.getByRole("navigation", { name: "主导航" })).toBeInTheDocument()
    await waitFor(() => expect(screen.getByText("系统就绪")).toBeInTheDocument())
  })

  it("shows an empty experiment list from the API", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input)
      if (url.startsWith("/api/experiments?")) return new Response(JSON.stringify({ items: [], page: 1, page_size: 25, total: 0 }), { status: 200 })
      if (url.startsWith("/api/tags?")) return new Response(JSON.stringify({ items: [], page: 1, page_size: 100, total: 0 }), { status: 200 })
      return new Response(JSON.stringify({ status: "ok" }), { status: 200 })
    })

    render(
      <MemoryRouter initialEntries={["/experiments"]}>
        <App />
      </MemoryRouter>,
    )

    expect(screen.getByRole("heading", { name: "实验记录" })).toBeInTheDocument()
    await waitFor(() => expect(screen.getByText("这里还没有记录")).toBeInTheDocument())
  })
})
