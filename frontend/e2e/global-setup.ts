import { request } from "@playwright/test"
import type { FullConfig } from "@playwright/test"

export default async function setup(config: FullConfig) {
  const api = await request.newContext({ baseURL: config.projects[0].use.baseURL, extraHTTPHeaders: { "X-RDMS-Request": "1" } })
  const response = await api.post("/api/auth/register", { data: { username: "browser-owner", password: "browser-owner-password", display_name: "浏览器测试" } })
  if (response.status() !== 201) throw new Error(`Test account registration failed: ${response.status()}`)
  await api.storageState({ path: "/tmp/rdms-browser-owner.json" })
  await api.dispose()
}
