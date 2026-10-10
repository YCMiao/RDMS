import { describe, expect, it } from "vitest"
import { productYield } from "./yield"

describe("mass yield", () => {
  it("calculates molar stoichiometry and equivalent mass units, including zero and over 100", () => {
    expect(productYield("960", "mg", 300, 2, "2").value).toBe("80")
    expect(productYield(".96", "g", 300, 2, "2").value).toBe("80")
    expect(productYield("960000", "µg", 300, 2, "2").value).toBe("80")
    expect(productYield("0", "mg", 300, 2, "2").value).toBe("0")
    expect(productYield("1440", "mg", 300, 2, "2")).toMatchObject({ value: "120", message: expect.stringContaining("超过 100%") })
  })
  it("requires positive inputs and never infers mass from volume", () => {
    for (const value of [productYield("1", "mg", 300, null, "1"), productYield("1", "mg", 0, 1, "1"), productYield("1", "mg", 300, 1, "0"), productYield("1", "mL", 300, 1, "1")]) {
      expect(value.value).toBeUndefined()
      expect(value.message).toBeTruthy()
    }
  })
})
