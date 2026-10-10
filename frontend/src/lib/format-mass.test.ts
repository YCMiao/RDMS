import { describe, expect, it } from "vitest"

import { formatDecimal, formatDecimalInput, formatMass } from "./format-mass"

describe("mass display precision", () => {
  it("rounds molecular weight to at most two decimal places", () => {
    expect(formatMass("46.06900000", 2)).toBe("46.07")
    expect(formatMass("154.20000000", 2)).toBe("154.2")
    expect(formatMass("18.00000000", 2)).toBe("18")
  })

  it("rounds exact mass to at most four places without adding zeros", () => {
    expect(formatMass("46.04186400", 4)).toBe("46.0419")
    expect(formatMass("46.10000000", 4)).toBe("46.1")
    expect(formatMass("100.00000000", 4)).toBe("100")
    expect(formatMass(null, 4)).toBe("")
  })

  it("shows ordinary values with at most two decimals and no padding", () => {
    expect(formatDecimal("25.00000000")).toBe("25")
    expect(formatDecimal("1.20000000")).toBe("1.2")
    expect(formatDecimal("42.34500000")).toBe("42.35")
    expect(formatDecimal("0.00000000")).toBe("0")
  })

  it("removes database padding in edit fields without rounding the stored value", () => {
    expect(formatDecimalInput("1.20000000")).toBe("1.2")
    expect(formatDecimalInput("1.23456789")).toBe("1.23456789")
    expect(formatDecimalInput("25.00000000")).toBe("25")
    expect(formatDecimalInput("0E-8")).toBe("0")
    expect(formatDecimalInput("1E-8")).toBe("1E-8")
    expect(formatDecimalInput(null)).toBe("")
  })
})
