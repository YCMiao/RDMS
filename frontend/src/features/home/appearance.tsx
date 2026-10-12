import { Moon, Sun } from "lucide-react"
import { useId } from "react"
import { palettes, type Palette } from "../../hooks/use-palette"

type Theme = "system" | "light" | "dark"
const names = { teal: "青绿", indigo: "靛蓝", violet: "紫罗兰", amber: "琥珀", rose: "玫瑰" }
export function Appearance({ theme, setTheme, palette, setPalette }: {
  theme: Theme; setTheme: (value: Theme) => void; palette: Palette; setPalette: (value: Palette) => void
}) {
  const id = useId()
  return <div className="appearance-controls">
    <span className="utility-label">主题</span>
    <div className="theme-switcher" aria-label="主题选择">
      <button type="button" aria-label="使用浅色主题" aria-pressed={theme === "light"} className={theme === "light" ? "active" : ""} onClick={() => setTheme("light")}><Sun size={15} /></button>
      <button type="button" aria-pressed={theme === "system"} className={theme === "system" ? "active" : ""} onClick={() => setTheme("system")}>自动</button>
      <button type="button" aria-label="使用深色主题" aria-pressed={theme === "dark"} className={theme === "dark" ? "active" : ""} onClick={() => setTheme("dark")}><Moon size={15} /></button>
    </div>
    <fieldset className="app-palette"><legend className="utility-label">主色调</legend><div>
      {palettes.map(value => <label key={value} title={names[value]}>
        <input type="radio" name={`palette-${id}`} value={value} aria-label={names[value]} checked={palette === value} onChange={() => setPalette(value)} />
        <span className={`app-swatch swatch-${value}`} aria-hidden="true" />
      </label>)}
    </div></fieldset>
  </div>
}
