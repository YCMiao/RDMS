import { expect, test } from "@playwright/test"

test("首页保留侧栏、同页跳转和配色，离开后清理动画", async ({ page, context }) => {
  const errors: string[] = []
  page.on("pageerror", error => errors.push(error.message))
  await page.emulateMedia({ reducedMotion: "reduce", colorScheme: "light" })
  await page.goto("/")
  await expect(page.getByRole("heading", { name: /研究数据\s*管理系统/ })).toBeVisible()
  const sidebar = page.locator(".sidebar")
  expect((await sidebar.boundingBox())!.x).toBe(0)
  await expect(page.locator(".home-scene canvas")).toHaveAttribute("data-motion", "paused")
  await expect(page.locator('a[target="_blank"]')).toHaveCount(0)
  const canvas = page.locator(".home-scene canvas")
  const initial = await canvas.evaluate(el => (el as HTMLCanvasElement).toDataURL())
  const area = (await page.locator(".home-orbit-control").boundingBox())!
  await page.mouse.move(area.x + area.width * .75, area.y + area.height * .5)
  await page.mouse.down()
  await page.mouse.move(area.x + area.width * .65, area.y + area.height * .75, { steps: 8 })
  await page.mouse.up()
  expect(await canvas.evaluate(el => (el as HTMLCanvasElement).toDataURL())).not.toBe(initial)
  await expect(page.locator(".home-orbit-control")).toHaveCSS("outline-style", "none")
  // Retain a reference to the removed canvas; it must stop drawing after navigation.
  await canvas.evaluate(el => { (window as unknown as { oldCanvas: HTMLCanvasElement }).oldCanvas = el as HTMLCanvasElement })
  await page.getByRole("link", { name: "进入实验室" }).click()
  await expect(page).toHaveURL(/\/experiments$/)
  await expect(page.getByRole("heading", { name: "实验记录本" })).toBeVisible()
  await expect(canvas).toHaveCount(0)
  const oldImage = await page.evaluate(() => (window as unknown as { oldCanvas: HTMLCanvasElement }).oldCanvas.toDataURL())
  await page.emulateMedia({ reducedMotion: "no-preference" })
  await page.mouse.move(800, 500)
  await page.waitForTimeout(200)
  expect(await page.evaluate(() => (window as unknown as { oldCanvas: HTMLCanvasElement }).oldCanvas.toDataURL())).toBe(oldImage)
  const accentBefore = await sidebar.evaluate(el => getComputedStyle(el).getPropertyValue("--copper"))
  await page.getByRole("radio", { name: "靛蓝", exact: true }).check()
  expect(await sidebar.evaluate(el => getComputedStyle(el).getPropertyValue("--copper"))).not.toBe(accentBefore)
  await page.reload()
  await expect(page.getByRole("radio", { name: "靛蓝", exact: true })).toBeChecked()
  await page.getByRole("link", { name: "总览", exact: true }).click()
  await expect(canvas).toHaveAttribute("data-motion", "running")
  await page.emulateMedia({ colorScheme: "dark" })
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark")
  await page.getByRole("link", { name: "搜索记录", exact: true }).click()
  await expect(page).toHaveURL(/\/search$/)
  expect(context.pages()).toHaveLength(1)
  expect(errors).toEqual([])
})

test("首页五色双主题与窄屏外观控制", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" })
  await page.setViewportSize({ width: 1440, height: 960 })
  await page.goto("/")
  for (const theme of ["浅色", "深色"]) {
    await page.getByRole("button", { name: `使用${theme}主题` }).click()
    for (const color of ["青绿", "靛蓝", "紫罗兰", "琥珀", "玫瑰"]) {
      await page.getByRole("radio", { name: color, exact: true }).check()
      await page.screenshot({ path: `test-results/home-${theme}-${color}.png` })
    }
  }
  for (const width of [768, 390, 320]) {
    await page.setViewportSize({ width, height: 844 })
    await expect(page.getByRole("heading", { name: /研究数据\s*管理系统/ })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.getByLabel("外观设置", { exact: true }).click()
    await page.getByRole("radio", { name: "青绿", exact: true }).check()
    await page.getByRole("button", { name: "使用浅色主题" }).click()
    const panel = (await page.locator(".mobile-appearance .appearance-controls").boundingBox())!
    expect(panel.x).toBeGreaterThanOrEqual(0)
    expect(panel.x + panel.width).toBeLessThanOrEqual(width)
    await page.getByLabel("外观设置", { exact: true }).click()
    await page.screenshot({ path: `test-results/home-${width}.png`, fullPage: true })
  }
})
