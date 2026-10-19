import {
  Atom,
  Boxes,
  FlaskConical,
  FolderArchive,
  LayoutDashboard,
  Microscope,
  Search,
  Settings,
} from "lucide-react"
import { useEffect, useState } from "react"
import { Link, NavLink, Route, Routes, useNavigate } from "react-router-dom"

import { ExperimentsPage } from "./features/notebooks"
import { RecordEditor, RecordList, TagManager } from "./features/records"
import { CompoundImportPage } from "./features/compound-chemistry"
import { SamplesPage, SampleEditor } from "./features/lab"
import { FilesPage, FileEditor } from "./features/files"
import { SearchPage } from "./features/discovery"
import { useTheme } from "./hooks/use-theme"
import { checkHealth, type HealthStatus } from "./services/health"
import { HomePage } from "./features/home/home-page"
import { Appearance } from "./features/home/appearance"
import { AuthGate, type Account } from "./features/auth"
import { AccountMenu } from "./features/account-menu"
import { usePalette } from "./hooks/use-palette"

const navigation = [
  { label: "总览", path: "/", icon: LayoutDashboard },
  { label: "实验", path: "/experiments", icon: FlaskConical },
  { label: "化合物", path: "/compounds", icon: Atom },
  { label: "样品", path: "/samples", icon: Boxes },
  { label: "文件", path: "/files", icon: FolderArchive },
  { label: "搜索", path: "/search", icon: Search },
  { label: "设置", path: "/settings", icon: Settings },
]

function Placeholder({ title }: { title: string }) {
  return (
    <section className="empty-state" aria-labelledby="placeholder-title">
      <span className="eyebrow">找不到页面</span>
      <h1 id="placeholder-title">{title}</h1>
      <p>请检查地址，或从左侧导航选择要查看的内容。</p>
      <Link className="text-link" to="/">
        返回系统状态
      </Link>
    </section>
  )
}

export default function App() {
  if (import.meta.env.MODE === "demo") return <AuthenticatedApp account={{ id: "offline", username: "researcher", display_name: "研究员" }} logout={async () => { window.location.hash = "/"; window.location.reload() }} />
  return <AuthGate>{(account, logout) => <AuthenticatedApp key={account.id} account={account} logout={logout} />}</AuthGate>
}

function AuthenticatedApp({ account, logout }: { account: Account; logout: () => Promise<void> }) {
  const [status, setStatus] = useState<HealthStatus>("checking")
  const [search, setSearch] = useState("")
  const navigate = useNavigate()
  const { theme, setTheme } = useTheme()
  const { palette, setPalette } = usePalette()
  const appearance = { theme, setTheme, palette, setPalette }

  useEffect(() => {
    void checkHealth().then(setStatus)
  }, [])

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link className="brand" to="/" aria-label="RDMS 首页">
          <span className="brand-mark">
            <Microscope size={21} strokeWidth={1.7} />
          </span>
          <span>
            <strong>RDMS</strong>
            <small>研究数据管理</small>
          </span>
        </Link>
        <nav aria-label="主导航">
          {navigation.map(({ label, path, icon: Icon }) => (
            <NavLink key={path} to={path} aria-label={label} end={path === "/"}>
              <Icon size={18} strokeWidth={1.7} />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-footer">
          <AccountMenu account={account} logout={logout} />
          <Appearance {...appearance} />
        </div>
      </aside>
      <div className="content-shell">
        <header className="topbar">
          <form className="search-shell" role="search" onSubmit={event => { event.preventDefault(); if (search.trim()) navigate(`/search?q=${encodeURIComponent(search.trim())}`) }}>
            <Search size={17} />
            <input aria-label="全局搜索" maxLength={200} value={search} onChange={event => setSearch(event.target.value)} placeholder="搜索实验、化合物或编号" />
            <button type="submit">搜索</button>
          </form>
          <AccountMenu account={account} logout={logout} mobile />
          <details className="mobile-appearance"><summary aria-label="外观设置"><Settings size={18} /></summary><Appearance {...appearance} /></details>
        </header>
        <Routes>
          <Route path="/" element={<HomePage status={status} />} />
          <Route path="/experiments" element={<ExperimentsPage />} />
          <Route path="/experiments/new" element={<RecordEditor kind="experiments" />} />
          <Route path="/experiments/:id" element={<RecordEditor kind="experiments" />} />
          <Route path="/compounds" element={<RecordList key="compounds" kind="compounds" />} />
          <Route path="/compounds/import" element={<CompoundImportPage />} />
          <Route path="/compounds/new" element={<RecordEditor kind="compounds" />} />
          <Route path="/compounds/:id" element={<RecordEditor kind="compounds" />} />
          <Route path="/settings" element={<TagManager />} />
          <Route path="/samples" element={<SamplesPage />} />
          <Route path="/samples/:id" element={<SampleEditor />} />
          <Route path="/files" element={<FilesPage />} />
          <Route path="/files/:id" element={<FileEditor />} />
          <Route path="/search" element={<SearchPage />} />
          <Route path="*" element={<Placeholder title="页面不存在" />} />
        </Routes>
      </div>
    </div>
  )
}
