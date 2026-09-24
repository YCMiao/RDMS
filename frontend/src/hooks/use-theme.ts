import { useEffect, useState } from "react"

type Theme = "system" | "light" | "dark"

const STORAGE_KEY = "rdms-theme"

function applyTheme(theme: Theme) {
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches
  document.documentElement.dataset.theme = theme === "system" ? (prefersDark ? "dark" : "light") : theme
}

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY)
    return saved === "light" || saved === "dark" ? saved : "system"
  })

  useEffect(() => {
    applyTheme(theme)
    const media = window.matchMedia("(prefers-color-scheme: dark)")
    const syncSystem = () => theme === "system" && applyTheme("system")
    media.addEventListener("change", syncSystem)
    return () => media.removeEventListener("change", syncSystem)
  }, [theme])

  function setTheme(next: Theme) {
    setThemeState(next)
    if (next === "system") window.localStorage.removeItem(STORAGE_KEY)
    else window.localStorage.setItem(STORAGE_KEY, next)
  }

  return { theme, setTheme }
}
