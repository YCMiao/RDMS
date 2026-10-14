import { ChevronDown, KeyRound, LogOut } from "lucide-react"
import { useEffect, useId, useRef, useState } from "react"
import type { KeyboardEvent } from "react"
import { createPortal } from "react-dom"

import { AccountPasswordDialog } from "./auth"
import type { Account } from "./auth"

export function AccountMenu({ account, logout, mobile = false }: { account: Account; logout: () => Promise<void>; mobile?: boolean }) {
  const [open, setOpen] = useState(false)
  const [passwordOpen, setPasswordOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const menu = useRef<HTMLDivElement>(null)
  const id = useId()

  useEffect(() => {
    if (!open) return
    menu.current?.querySelector<HTMLButtonElement>("button")?.focus()
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false) }
    document.addEventListener("pointerdown", outside)
    return () => document.removeEventListener("pointerdown", outside)
  }, [open])

  function keyboard(event: KeyboardEvent) {
    const items = Array.from(menu.current?.querySelectorAll<HTMLButtonElement>("button") ?? [])
    const current = items.indexOf(document.activeElement as HTMLButtonElement)
    if (event.key === "Escape") { event.preventDefault(); setOpen(false); trigger.current?.focus() }
    if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key) && items.length) {
      event.preventDefault()
      const next = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : (current + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length
      items[next]?.focus()
    }
  }

  async function exit() {
    setBusy(true)
    try { await logout() }
    finally { setBusy(false); setOpen(false) }
  }

  return <>
    <div ref={root} className={`account-menu${mobile ? " mobile-account" : ""}`} onKeyDown={keyboard} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setOpen(false) }}>
      <button ref={trigger} type="button" className="account-trigger" aria-label={`账号菜单：${account.display_name}`} aria-haspopup="menu" aria-expanded={open} aria-controls={id} onClick={() => setOpen(value => !value)} onKeyDown={event => { if (event.key === "ArrowDown" && !open) { event.preventDefault(); setOpen(true) } }}>
        <span className="account-avatar" aria-hidden="true">{Array.from(account.display_name)[0]?.toUpperCase()}</span><span className="account-label">{account.display_name}</span><ChevronDown size={14} aria-hidden="true" />
      </button>
      {open && <div ref={menu} id={id} className="account-options" role="menu" aria-label="账号功能">
        <div className="account-identity" role="presentation"><strong>{account.display_name}</strong><small>@{account.username}</small></div>
        <button type="button" role="menuitem" onClick={() => { setOpen(false); setPasswordOpen(true) }}><KeyRound size={16} aria-hidden="true" />修改密码</button>
        <button type="button" role="menuitem" disabled={busy} onClick={() => void exit()}><LogOut size={16} aria-hidden="true" />{busy ? "正在退出…" : "退出登录"}</button>
      </div>}
    </div>
    {passwordOpen && createPortal(<AccountPasswordDialog account={account} onClose={() => { setPasswordOpen(false); const visible = Array.from(document.querySelectorAll<HTMLButtonElement>(".account-trigger")).find(button => button.offsetParent !== null); (visible ?? trigger.current)?.focus() }} />, document.body)}
  </>
}
