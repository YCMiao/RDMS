import { defineConfig } from "@playwright/test"

export default defineConfig({
  testDir: "./e2e-demo",
  timeout: 30_000,
  workers: 1,
  reporter: "list",
  use: { offline: true, viewport: { width: 1440, height: 900 }, reducedMotion: "reduce", screenshot: "only-on-failure", trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }, // WebKit offline emulation rejects even file://. The container itself has no network.
    { name: "webkit", use: { browserName: "webkit", offline: false } }],
})
