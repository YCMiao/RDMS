import { describe, expect, it } from "vitest"

import { formatMass } from "./format-mass"

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
})
