import type { ReactNode } from "react"

/** Format atom/group counts only; keep leading coefficients and source text intact. */
export function ChemicalFormula({ value, fallback = "—" }: { value?: string | null; fallback?: string }) {
  if (!value) return <>{fallback}</>
  const parts: ReactNode[] = []
  const counts = /([A-Za-z)\]])(\d+)/g
  let offset = 0
  for (const match of value.matchAll(counts)) {
    const start = match.index + match[1].length
    parts.push(value.slice(offset, start), <sub key={start}>{match[2]}</sub>)
    offset = start + match[2].length
  }
  parts.push(value.slice(offset))
  return <span className="chemical-formula">{parts}</span>
}
