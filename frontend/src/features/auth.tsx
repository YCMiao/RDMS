import { useEffect, useState } from "react"
import type { FormEvent, ReactNode } from "react"
import { useLocation, useNavigate } from "react-router-dom"
import { Microscope } from "lucide-react"

import { ApiError, request } from "../services/records"

export type Account = { id: string; username: string; display_name: string }

export function AuthGate({ children }: { children: (account: Account, logout: () => Promise<void>) => ReactNode }) {
  const [account, setAccount] = useState<Account | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [revision, setRevision] = useState(0)
  const [mode, setMode] = useState<"login" | "register">("login")
  const [busy, setBusy] = useState(false)
  const [username, setUsername] = useState("")
  const [name, setName] = useState("")
  const [password, setPassword] = useState("")
  const [confirmation, setConfirmation] = useState("")
  const location = useLocation()
  const navigate = useNavigate()

  useEffect(() => {
    let alive = true
    request<Account>("/auth/me").then(user => { if (alive) setAccount(user) }).catch(cause => {
      if (alive && (!(cause instanceof ApiError) || cause.status !== 401)) setError(cause instanceof Error ? cause.message : "连接服务失败")
    }).finally(() => { if (alive) setLoading(false) })
    const expired = () => { setAccount(null); setPassword(""); setError("登录已失效，请重新登录") }
    window.addEventListener("rdms-session-expired", expired)
    return () => { alive = false; window.removeEventListener("rdms-session-expired", expired) }
  }, [revision])

  async function submit(event: FormEvent) {
    event.preventDefault()
    setError("")
    if (mode === "register" && password !== confirmation) { setError("两次输入的密码不一致"); return }
    setBusy(true)
    try {
      const user = await request<Account>(`/auth/${mode}`, { method: "POST", body: JSON.stringify({ username, password, ...(mode === "register" ? { display_name: name } : {}) }) })
      setPassword(""); setConfirmation(""); setAccount(user)
      if (location.pathname === "/login" || location.pathname === "/register") navigate("/", { replace: true })
    } catch (cause) { setError(cause instanceof Error ? cause.message : "请求失败") }
    finally { setBusy(false) }
  }

  async function logout() {
    setBusy(true)
    try {
      await request<void>("/auth/logout", { method: "POST" })
      setAccount(null); setPassword(""); setConfirmation(""); setError(""); setMode("login")
      navigate("/", { replace: true })
    } catch (cause) { setError(cause instanceof Error ? cause.message : "退出失败，请重试") }
    finally { setBusy(false) }
  }

  if (loading) return <main className="auth-screen"><p role="status">正在检查登录状态…</p></main>
  if (account) return <>{error && <p className="auth-banner" role="alert">{error}</p>}{children(account, logout)}</>
  return <main className="auth-screen">
    <section className="auth-card" aria-labelledby="auth-title">
      <div className="auth-brand"><Microscope size={26} /><span>RDMS <small>研究数据管理</small></span></div>
      <h1 id="auth-title">{mode === "login" ? "登录你的研究空间" : "创建你的研究空间"}</h1>
      <p className="auth-intro">{mode === "login" ? "继续整理实验、化合物与原始记录。" : "每个账号拥有独立的实验与文件，注册后即可开始。"}</p>
      <form onSubmit={event => void submit(event)}>
        {mode === "register" && <label>姓名或昵称<input autoComplete="nickname" value={name} onChange={event => setName(event.target.value)} maxLength={80} required /></label>}
        <label>账号<input autoComplete="username" value={username} onChange={event => setUsername(event.target.value)} minLength={3} maxLength={40} pattern="[a-zA-Z0-9][a-zA-Z0-9_.\-]{2,39}" required autoCapitalize="none" spellCheck={false} /></label>
        {mode === "register" && <small>3–40 位英文字母、数字、点、下划线或连字符。</small>}
        <label>密码<input type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} value={password} onChange={event => setPassword(event.target.value)} minLength={12} maxLength={128} required /></label>
        {mode === "register" && <><small>至少 12 个字符，建议使用易记的长密码。</small><label>确认密码<input type="password" autoComplete="new-password" value={confirmation} onChange={event => setConfirmation(event.target.value)} minLength={12} maxLength={128} required /></label></>}
        {error && <p role="alert" className="auth-error">{error}</p>}
        <button className="auth-submit" disabled={busy}>{busy ? "正在处理…" : mode === "login" ? "登录" : "注册并进入"}</button>
      </form>
      <button type="button" className="auth-switch" disabled={busy} onClick={() => { setMode(mode === "login" ? "register" : "login"); setError(""); setPassword(""); setConfirmation("") }}>{mode === "login" ? "还没有账号？创建账号" : "已有账号？返回登录"}</button>
      {error && <button type="button" className="auth-switch" onClick={() => { setError(""); setLoading(true); setRevision(value => value + 1) }}>重新连接</button>}
    </section>
  </main>
}

export function AccountSettings({ account }: { account: Account }) {
  const [current, setCurrent] = useState("")
  const [next, setNext] = useState("")
  const [confirmation, setConfirmation] = useState("")
  const [message, setMessage] = useState("")
  const [busy, setBusy] = useState(false)
  async function submit(event: FormEvent) {
    event.preventDefault(); setMessage("")
    if (next !== confirmation) { setMessage("两次输入的新密码不一致"); return }
    setBusy(true)
    try {
      await request<void>("/auth/password", { method: "POST", body: JSON.stringify({ current_password: current, new_password: next }) })
      setCurrent(""); setNext(""); setConfirmation(""); setMessage("密码已修改，其他设备上的登录已失效。")
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : "修改失败") }
    finally { setBusy(false) }
  }
  return <section className="auth-account"><h2>账号与密码</h2><p>{account.display_name} · {account.username}</p><form onSubmit={event => void submit(event)}>
    <label>当前密码<input type="password" autoComplete="current-password" value={current} onChange={event => setCurrent(event.target.value)} required maxLength={128} /></label>
    <label>新密码<input type="password" autoComplete="new-password" value={next} onChange={event => setNext(event.target.value)} required minLength={12} maxLength={128} /></label>
    <label>确认新密码<input type="password" autoComplete="new-password" value={confirmation} onChange={event => setConfirmation(event.target.value)} required minLength={12} maxLength={128} /></label>
    {message && <p role="status">{message}</p>}<button disabled={busy}>{busy ? "正在修改…" : "修改密码"}</button>
  </form></section>
}
