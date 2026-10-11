import type { ReactNode } from "react"
import { Button } from "./ui/button"

export function Pagination({ page, total, size, onPage, label, disabled = false }: {
  page: number; total: number; size: number; onPage: (page: number) => void; label?: ReactNode; disabled?: boolean
}) {
  return <nav className="page-nav" aria-label="分页"><span>{label ?? `第 ${page} 页 · 共 ${total} 条`}</span><Button type="button" variant="outline" disabled={disabled || page <= 1} onClick={() => onPage(page - 1)}>上一页</Button><Button type="button" variant="outline" disabled={disabled || page * size >= total} onClick={() => onPage(page + 1)}>下一页</Button></nav>
}
