import { createHash } from "node:crypto"
import { expect, test } from "@playwright/test"

test("科研记录从创建、文件字节到删除恢复的真实闭环", async ({ page, request }) => {
  const title = `浏览器闭环实验 ${Date.now()}`
  const compoundName = `联苯-${Date.now()}`
  const original = Buffer.from("RDMS E2E original bytes\nUTF-8 中文\n")
  const digest = createHash("sha256").update(original).digest("hex")

  await page.goto("/compounds")
  await page.getByRole("button", { name: "新建化合物" }).click()
  const dialog = page.getByRole("dialog", { name: "新建化合物" })
  await dialog.getByRole("textbox", { name: /名称/ }).fill(compoundName)
  await dialog.getByRole("textbox", { name: "SMILES" }).fill("c1ccccc1-c2ccccc2")
  await dialog.getByRole("button", { name: "创建并分配编号" }).click()
  await expect(page).toHaveURL(/\/compounds\/[0-9a-f-]+$/)
  const compoundId = page.url().split("/").at(-1)!
  await expect(page.getByRole("heading", { name: compoundName })).toBeVisible()

  await page.goto("/experiments/new")
  await page.getByRole("textbox", { name: /标题/ }).fill(title)
  await page.getByLabel(/日期/).fill("2026-09-24")
  await page.getByRole("textbox", { name: "目的" }).fill("验证完整科研记录闭环")
  await page.getByRole("button", { name: "创建并分配编号" }).click()
  await expect(page).toHaveURL(/\/experiments\/[0-9a-f-]+$/)
  const experimentId = page.url().split("/").at(-1)!
  await expect(page.getByRole("heading", { name: title })).toBeVisible()

  await page.goto("/samples")
  const sampleSection = page.locator("section.relation-section").filter({ has: page.getByRole("heading", { name: "创建样品" }) })
  await sampleSection.getByLabel(/所属实验/).selectOption(experimentId)
  await sampleSection.getByLabel(/样品类型/).fill("原液")
  await sampleSection.getByLabel("名称").fill("闭环样品")
  await sampleSection.getByRole("combobox", { name: "化合物", exact: true }).selectOption(compoundId)
  await sampleSection.getByRole("button", { name: "创建样品" }).click()
  await expect(page.getByText("闭环样品")).toBeVisible()

  await page.goto(`/experiments/${experimentId}`)
  const lab = page.locator("section.relation-section").filter({ has: page.getByRole("heading", { name: "反应记录" }) })
  await lab.getByLabel("新反应名称").fill("闭环反应")
  await lab.getByRole("button", { name: "创建反应" }).click()
  const reaction = lab.getByRole("article").filter({ has: page.getByRole("heading", { name: "闭环反应" }) })
  await expect(reaction).toBeVisible()
  await reaction.getByRole("combobox", { name: "化合物", exact: true }).selectOption(compoundId)
  await reaction.getByLabel("角色").selectOption("product")
  await reaction.getByLabel("收率 %").fill("72.50")
  await reaction.getByRole("button", { name: "添加组分" }).click()
  await expect(reaction.getByText("72.50000000")).toBeVisible()

  const files = page.locator("section.relation-section").filter({ has: page.getByRole("heading", { name: "原始文件" }) })
  await files.getByLabel("选择原始文件").setInputFiles({ name: "闭环原件.txt", mimeType: "text/plain", buffer: original })
  await files.getByRole("button", { name: /上传 1 个文件/ }).click()
  await expect(files.getByText(/闭环原件.txt：已保存/)).toBeVisible()
  await expect(files.getByRole("link", { name: "闭环原件.txt" })).toBeVisible()
  const fileLink = files.getByRole("link", { name: "闭环原件.txt" })
  const fileId = (await fileLink.getAttribute("href"))!.split("/").at(-1)!
  const fileResponse = await request.get(`/api/files/${fileId}`)
  expect(fileResponse.ok()).toBeTruthy()
  const fileData = await fileResponse.json()
  expect(fileData.sha256).toBe(digest)
  const download = await request.get(fileData.download_url)
  expect(download.ok()).toBeTruthy()
  expect(await download.body()).toEqual(original)

  await page.getByRole("textbox", { name: "全局搜索" }).fill(title)
  await page.getByRole("search").getByRole("button", { name: "搜索" }).click()
  await expect(page).toHaveURL(/\/search\?q=/)
  await expect(page.getByRole("heading", { name: "实验 · 1" })).toBeVisible()
  await page.getByRole("row").filter({ hasText: title }).getByRole("link").click()
  await page.getByRole("button", { name: "生成摘要" }).click()
  await expect(page.locator("pre.summary-preview")).toContainText("闭环反应")
  await expect(page.locator("pre.summary-preview")).toContainText("闭环原件.txt")

  page.once("dialog", dialog => dialog.accept())
  await page.getByRole("button", { name: "删除记录" }).click()
  await expect(page.getByRole("heading", { name: "记录已移入回收状态" })).toBeVisible()
  expect((await request.get(`/api/experiments/${experimentId}`)).status()).toBe(404)
  await page.getByRole("button", { name: "恢复记录" }).click()
  await expect(page.getByRole("heading", { name: title })).toBeVisible()
  expect((await request.get(`/api/experiments/${experimentId}`)).status()).toBe(200)
  expect((await request.get(fileData.download_url)).ok()).toBeTruthy()
})

test("两种桌面尺寸和主题、空状态与键盘焦点", async ({ page }) => {
  for (const [width, height] of [[1280, 800], [1440, 900]]) {
    await page.setViewportSize({ width, height })
    await page.goto("/")
    await expect(page.getByRole("navigation", { name: "主导航" })).toBeVisible()
    await page.getByRole("button", { name: "使用深色主题" }).click()
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark")
    await page.goto("/experiments")
    await expect(page.getByRole("table")).toBeVisible()
    const primaryContrast = await page.getByRole("link", { name: "新建实验" }).evaluate(element => {
      const style = getComputedStyle(element)
      return { foreground: style.color, background: style.backgroundColor }
    })
    expect(primaryContrast.foreground).not.toBe(primaryContrast.background)
    await page.screenshot({ path: `test-results/ui-${width}-dark.png`, fullPage: true })
    await page.getByRole("button", { name: "使用浅色主题" }).click()
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light")
    await page.keyboard.press("Tab")
    await expect(page.locator(":focus-visible")).toHaveCount(1)
    await page.screenshot({ path: `test-results/ui-${width}.png`, fullPage: true })
  }
  await page.goto("/search")
  await expect(page.getByText("输入关键词开始搜索。")).toBeVisible()
  await page.route("**/api/dashboard", route => route.abort())
  await page.goto("/")
  await expect(page.getByRole("alert")).toBeVisible()
})

test("长文本可读且过期版本不会覆盖新数据", async ({ page, request }) => {
  const longTitle = "长标题界面验收".repeat(25)
  const longSmiles = "C1=CC=CC=C1".repeat(60)
  const compoundResponse = await request.post("/api/compounds", { data: { name: "长结构文本验收", smiles: longSmiles } })
  expect(compoundResponse.status()).toBe(201)
  const compound = await compoundResponse.json()
  const experimentResponse = await request.post("/api/experiments", { data: { title: longTitle, date: "2026-09-24" } })
  expect(experimentResponse.status()).toBe(201)
  const experiment = await experimentResponse.json()

  for (const width of [1280, 1440]) {
    await page.setViewportSize({ width, height: width === 1280 ? 800 : 900 })
    await page.goto(`/experiments/${experiment.id}`)
    await expect(page.getByRole("heading", { name: longTitle })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
    await page.goto(`/compounds/${compound.id}`)
    await expect(page.getByRole("textbox", { name: "SMILES" })).toHaveValue(longSmiles)
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
  }

  await page.goto(`/experiments/${experiment.id}`)
  await page.getByRole("textbox", { name: "目的" }).fill("未保存的本地内容")
  const external = await request.patch(`/api/experiments/${experiment.id}`, { data: { expected_version: 1, title: longTitle, objective: "其他会话的新内容" } })
  expect(external.status()).toBe(200)
  await page.getByRole("button", { name: "保存修改" }).click()
  await expect(page.getByRole("alert")).toContainText(/修改|冲突|版本/)
  expect((await (await request.get(`/api/experiments/${experiment.id}`)).json()).objective).toBe("其他会话的新内容")
  await expect(page.getByRole("textbox", { name: "目的" })).toHaveValue("未保存的本地内容")
})
