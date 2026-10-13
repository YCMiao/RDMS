import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { afterEach, describe, expect, it, vi } from "vitest"

import { AuthGate } from "./auth"

function mount() {
  return render(<MemoryRouter><AuthGate>{(account, logout) => <><p>{account.display_name}的空间</p><button onClick={() => void logout()}>退出登录</button></>}</AuthGate></MemoryRouter>)
}

function json(body: unknown, status = 200) { return new Response(JSON.stringify(body), { status }) }

describe("account access", () => {
  afterEach(() => vi.restoreAllMocks())
  it("protects the workspace and validates confirmation before registration", async () => {
    const fetcher = vi.spyOn(globalThis, "fetch").mockResolvedValue(json({ error: { message: "请先登录" } }, 401))
    mount()
    expect(screen.queryByText(/的空间/)).not.toBeInTheDocument()
    await screen.findByRole("heading", { name: "登录你的研究空间" })
    fireEvent.click(screen.getByRole("button", { name: "还没有账号？创建账号" }))
    fireEvent.change(screen.getByLabelText("姓名或昵称"), { target: { value: "研究者" } })
    fireEvent.change(screen.getByLabelText("账号"), { target: { value: "researcher" } })
    fireEvent.change(screen.getByLabelText("密码", { exact: true }), { target: { value: "long-password-one" } })
    fireEvent.change(screen.getByLabelText("确认密码"), { target: { value: "long-password-two" } })
    fireEvent.submit(screen.getByRole("button", { name: "注册并进入" }).closest("form")!)
    expect(screen.getByRole("alert")).toHaveTextContent("两次输入的密码不一致")
    expect(fetcher).toHaveBeenCalledTimes(1)
    fetcher.mockResolvedValue(json({ id: "one", username: "researcher", display_name: "研究者" }))
    fireEvent.change(screen.getByLabelText("确认密码"), { target: { value: "long-password-one" } })
    fireEvent.submit(screen.getByRole("button", { name: "注册并进入" }).closest("form")!)
    await screen.findByText("研究者的空间")
    expect(fetcher).toHaveBeenLastCalledWith("/api/auth/register", expect.objectContaining({ method: "POST", headers: expect.objectContaining({ "X-RDMS-Request": "1" }) }))
  })

  it("restores a session and only clears it after successful logout", async () => {
    const fetcher = vi.spyOn(globalThis, "fetch").mockResolvedValue(json({ id: "one", username: "researcher", display_name: "研究者" }))
    mount()
    await screen.findByText("研究者的空间")
    fetcher.mockRejectedValue(new Error("offline"))
    fireEvent.click(screen.getByRole("button", { name: "退出登录" }))
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("连接服务失败"))
    expect(screen.getByText("研究者的空间")).toBeInTheDocument()
    fetcher.mockResolvedValue(new Response(null, { status: 204 }))
    fireEvent.click(screen.getByRole("button", { name: "退出登录" }))
    await screen.findByRole("heading", { name: "登录你的研究空间" })
    expect(screen.queryByText("研究者的空间")).not.toBeInTheDocument()
  })

  it("returns to login when an authenticated request reports session expiry", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(json({ id: "one", username: "researcher", display_name: "研究者" }))
    mount()
    await screen.findByText("研究者的空间")
    fireEvent(window, new Event("rdms-session-expired"))
    await screen.findByRole("heading", { name: "登录你的研究空间" })
    expect(screen.getByRole("alert")).toHaveTextContent("登录已失效")
  })
})
