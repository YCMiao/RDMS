import {
  Atom,
  Boxes,
  FlaskConical,
  FolderArchive,
  LayoutDashboard,
  Microscope,
  Moon,
  Search,
  Settings,
  Sun,
} from "lucide-react"
import { useEffect, useState } from "react"
import { Link, NavLink, Route, Routes, useNavigate } from "react-router-dom"

import { Button } from "./components/ui/button"
import { EmptyPanel } from "./components/empty-panel"
import { ExperimentsPage } from "./features/notebooks"
import { RecordEditor, RecordList, TagManager } from "./features/records"
import { CompoundImportPage } from "./features/compound-chemistry"
import { SamplesPage, SampleEditor } from "./features/lab"
import { FilesPage, FileEditor } from "./features/files"
import { SearchPage } from "./features/discovery"
import { useTheme } from "./hooks/use-theme"
import { checkHealth, type HealthStatus } from "./services/health"
import { request } from "./services/records"
import type { components } from "./types/api.generated"

type DashboardData = components["schemas"]["DashboardOut"]

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

function Dashboard({ status }: { status: HealthStatus }) {
  const [data, setData] = useState<DashboardData | null>(null)
  const [error, setError] = useState("")
  useEffect(() => { void request<DashboardData>("/dashboard").then(setData).catch(reason => setError(reason instanceof Error ? reason.message : "总览读取失败")) }, [])
  return (
    <main className="dashboard">
      <section className="intro-grid">
        <div>
          <span className="eyebrow">Research Data Management System</span>
          <h1>研究数据管理系统</h1>
          <p className="lede">
            保存实验、化合物、样品、反应与原始文件，并沿着关联查找证据。
          </p>
        </div>
        {status === "unavailable" && (
          <p role="alert">服务暂不可用，请重试</p>
        )}
      </section>

      <section className="runway" aria-label="有效记录统计">
        {error && <p role="alert">{error}</p>}
        {!data && !error && <p>正在载入总览…</p>}
        {data && ([
          ["实验", data.experiment_count, "/experiments"],
          ["化合物", data.compound_count, "/compounds"],
          ["样品", data.sample_count, "/samples"],
        ] as const).map(([label, count, path]) => <article key={label}><span>{label}</span><h2>{count}</h2><Link className="text-link" to={path}>查看{label}</Link></article>)}
      </section>

      {data && <section className="intro-grid"><article className="relation-section"><h2>最近实验</h2>{data.recent_experiments.length ? data.recent_experiments.map(item => <p key={item.id}><Link to={`/experiments/${item.id}`}>{item.experiment_code} · {item.title}</Link></p>) : <EmptyPanel icon={FlaskConical} title="还没有实验" description="创建实验后，最近记录会显示在这里。" />}</article><article className="relation-section"><h2>最近文件</h2>{data.recent_files.length ? data.recent_files.map(item => <p key={item.id}><Link to={`/files/${item.id}`}>{item.original_filename}</Link></p>) : <EmptyPanel icon={FolderArchive} title="还没有文件" description="为实验上传原始文件后，会显示在这里。" />}</article></section>}

      <section className="next-panel">
        <div>
          <span className="eyebrow">开始记录</span>
          <h2>从一条实验开始</h2>
          <p>建立实验、添加化合物，并保存它们之间的关联。</p>
        </div>
        <Button asChild variant="outline">
          <Link to="/experiments/new">创建实验</Link>
        </Button>
      </section>
    </main>
  )
}

export default function App() {
  const [status, setStatus] = useState<HealthStatus>("checking")
  const [search, setSearch] = useState("")
  const navigate = useNavigate()
  const { theme, setTheme } = useTheme()

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
            <NavLink key={path} to={path} end={path === "/"}>
              <Icon size={18} strokeWidth={1.7} />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-footer">
          <span className="utility-label">主题</span>
          <div className="theme-switcher" aria-label="主题选择">
            <button
              type="button"
              className={theme === "light" ? "active" : ""}
              onClick={() => setTheme("light")}
              aria-label="使用浅色主题"
            >
              <Sun size={15} />
            </button>
            <button
              type="button"
              className={theme === "system" ? "active" : ""}
              onClick={() => setTheme("system")}
            >
              自动
            </button>
            <button
              type="button"
              className={theme === "dark" ? "active" : ""}
              onClick={() => setTheme("dark")}
              aria-label="使用深色主题"
            >
              <Moon size={15} />
            </button>
          </div>
        </div>
      </aside>
      <div className="content-shell">
        <header className="topbar">
          <form className="search-shell" role="search" onSubmit={event => { event.preventDefault(); if (search.trim()) navigate(`/search?q=${encodeURIComponent(search.trim())}`) }}>
            <Search size={17} />
            <input aria-label="全局搜索" maxLength={200} value={search} onChange={event => setSearch(event.target.value)} placeholder="搜索实验、化合物或编号" />
            <button type="submit">搜索</button>
          </form>
        </header>
        <Routes>
          <Route path="/" element={<Dashboard status={status} />} />
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
