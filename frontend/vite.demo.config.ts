import { readFileSync, writeFileSync, rmSync, readdirSync } from "node:fs"
import { resolve } from "node:path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig, type Plugin } from "vite"

// Inline only after Vite has finished all chunk and import transformations.
function singleDocument(): Plugin {
  return {
    name: "rdms-single-document",
    enforce: "post",
    writeBundle(options, bundle) {
      const directory = resolve(options.dir!)
      let source = readFileSync(resolve(directory, "index.html"), "utf8")
      const licenseRoots = new Set<string>()
      for (const [name, item] of Object.entries(bundle)) {
        if (item.type === "chunk") {
          for (const id of Object.keys(item.modules)) {
            const match = id.replaceAll("\0", "").match(/^(.*\/node_modules\/(?:@[^/]+\/)?[^/]+)\//)
            if (match) licenseRoots.add(match[1])
          }
          const code = readFileSync(resolve(directory, name), "utf8")
          source = source.replace(/<script\b[^>]*\bsrc="[^"]+"[^>]*><\/script>/, () => `<script type="module">${code.replace(/<\/script/gi, "<\\/script")}</script>`)
          rmSync(resolve(directory, name))
        } else if (name.endsWith(".css")) {
          source = source.replace(/<link\b[^>]*\brel="stylesheet"[^>]*>/, () => `<style>${String(item.source).replace(/<\/style/gi, "<\\/style")}</style>`)
          rmSync(resolve(directory, name))
        }
      }
      const licenses = [...licenseRoots].sort().map(root => {
        const name = root.split("/node_modules/").at(-1)
        const file = readdirSync(root).find(name => /^licen[cs]e(?:\.(?:md|txt))?$/i.test(name))
        // Both Radix packages declare the same MIT-licensed primitives repository.
        const license = file ? resolve(root, file) : name === "@radix-ui/react-compose-refs" ? resolve(root, "../react-slot/LICENSE") : null
        if (!license) throw new Error(`Missing dependency license: ${root}`)
        return `${name}\n${readFileSync(license, "utf8")}`
      }).join("\n\n")
      source = source.replace("</head>", () => `<script type="text/plain" id="rdms-licenses">${licenses.replace(/<\/script/gi, "<\\/script")}</script>\n  </head>`)
      // Also block accidental future API, font, or CDN additions.
      source = source.replace("<head>", `<head>\n    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; connect-src 'none'; form-action 'none'; base-uri 'none'; object-src 'none'">`)
      if (/__VITE_PRELOAD__|<script[^>]+src=|<link[^>]+href=/.test(source)) throw new Error("Demo contains unresolved assets")
      writeFileSync(resolve(directory, "RDMS-Demo.html"), source)
      rmSync(resolve(directory, "index.html"))
    },
  }
}
export default defineConfig({
  plugins: [react(), tailwindcss(), singleDocument()],
  base: "./",
  build: { outDir: "../demo/dist", emptyOutDir: true, cssCodeSplit: false, modulePreload: false, rollupOptions: { output: { inlineDynamicImports: true } } },
})
