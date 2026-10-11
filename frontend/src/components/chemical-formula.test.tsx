import { render } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { ChemicalFormula } from "./chemical-formula"

describe("chemical formula display", () => {
  it.each([
    ["C12H22O11", ["12", "22", "11"]],
    ["Ca(OH)2", ["2"]],
    ["CuSO4·5H2O", ["4", "2"]],
    ["2H2O", ["2"]],
    ["[Fe(CN)6]^3-", ["6"]],
    ["NaCl", []],
  ])("formats counts without changing source text: %s", (value, counts) => {
    const { container } = render(<ChemicalFormula value={value} />)
    expect(container.textContent).toBe(value)
    expect([...container.querySelectorAll("sub")].map(node => node.textContent)).toEqual(counts)
  })
  it("handles missing formulas and renders markup as plain text", () => {
    const { container, rerender } = render(<ChemicalFormula value={null} />)
    expect(container.textContent).toBe("—")
    rerender(<ChemicalFormula value="<img src=x>H2O" />)
    expect(container.querySelector("img")).toBeNull()
    expect(container.textContent).toBe("<img src=x>H2O")
  })
})
