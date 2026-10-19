import { useEffect, useState } from "react"

export const palettes = ["teal", "indigo", "violet", "amber", "rose"] as const
export type Palette = typeof palettes[number]

export function usePalette() {
  const [palette, setPalette] = useState<Palette>(() => {
    try {
      const saved = import.meta.env.MODE === "demo" ? null : localStorage.getItem("rdms-palette")
      return palettes.find(value => value === saved) ?? "teal"
    } catch { return "teal" }
  })
  useEffect(() => {
    document.documentElement.dataset.palette = palette
    if (import.meta.env.MODE === "demo") return
    try { localStorage.setItem("rdms-palette", palette) } catch { /* Optional preference. */ }
  }, [palette])
  return { palette, setPalette }
}
