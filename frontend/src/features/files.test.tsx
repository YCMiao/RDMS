import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter } from "react-router-dom"
import { afterEach, describe, expect, it, vi } from "vitest"

import { FileUploader } from "./files"

describe("file uploader", () => {
  afterEach(() => vi.restoreAllMocks())

  it("sends each selected file separately without a JSON content type", async () => {
    const calls: { body: FormData; contentType: string | undefined }[] = []
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      if (String(input).startsWith("/api/samples?")) return new Response(JSON.stringify({ items: [], total: 0, page: 1, page_size: 100 }))
      if (init?.method === "POST") {
        calls.push({ body: init.body as FormData, contentType: (init.headers as Record<string, string>)["Content-Type"] })
        return new Response(JSON.stringify({ original_filename: "saved.txt", file_size: 3 }), { status: 201 })
      }
      return new Response("{}")
    })
    const changed = vi.fn()
    render(<MemoryRouter><FileUploader experimentId="e7f7c424-6ed2-4084-944d-d9dc7c02a995" onUploaded={changed} /></MemoryRouter>)
    const input = screen.getByLabelText("选择原始文件") as HTMLInputElement
    await userEvent.upload(input, [new File(["one"], "one.txt"), new File(["two"], "two.txt")])
    fireEvent.submit(input.closest("form")!)
    await waitFor(() => expect(calls).toHaveLength(2))
    expect(calls.map(call => (call.body.get("file") as File).name)).toEqual(["one.txt", "two.txt"])
    expect(calls.every(call => call.contentType === undefined)).toBe(true)
    expect(changed).toHaveBeenCalledTimes(2)
  })
})
