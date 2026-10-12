import { ArrowRight, Search } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { Link } from "react-router-dom"
import type { HealthStatus } from "../../services/health"
import { createSpaceScene } from "./space-scene"

export function HomePage({ status }: { status: HealthStatus }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const control = useRef<HTMLDivElement>(null)
  const [available, setAvailable] = useState(true)
  useEffect(() => {
    if (!canvas.current || !control.current) return
    const scene = createSpaceScene(canvas.current, control.current)
    if (!scene) { setAvailable(false); return }
    const preference = matchMedia("(prefers-reduced-motion: reduce)")
    const syncMotion = () => scene.setPaused(preference.matches)
    preference.addEventListener("change", syncMotion)
    const observer = new MutationObserver(() => scene.setAppearance())
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "data-palette"] })
    syncMotion()
    return () => { preference.removeEventListener("change", syncMotion); observer.disconnect(); scene.dispose() }
  }, [])
  return <main className="home-page" id="home-main">
    <div className="home-scene" aria-hidden="true"><canvas ref={canvas} /><div className="home-vignette" /></div>
    <div ref={control} hidden={!available} className="home-orbit-control" role="group" tabIndex={0} aria-label="拖拽旋转粒子圆盘，也可使用方向键" />
    <section className="home-copy" aria-labelledby="home-title">
      <p className="home-eyebrow"><span />RESEARCH DATA MANAGEMENT SYSTEM</p>
      <h1 id="home-title">研究数据<br /><span>管理系统</span></h1>
      <div className="home-actions">
        <Link className="home-primary" to="/experiments">进入实验室<ArrowRight size={20} /></Link>
        <Link className="home-search" to="/search"><Search size={17} />搜索记录</Link>
      </div>
      {status === "unavailable" && <p className="home-health" role="alert">服务暂不可用，请重试</p>}
    </section>
  </main>
}
