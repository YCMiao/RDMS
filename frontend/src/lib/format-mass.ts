/** Round values for reading without changing the stored decimal value. */
export function formatDecimal(value: string | number | null | undefined, maxFractionDigits = 2): string {
  if (value === null || value === undefined || value === "") return ""
  const number = Number(value)
  if (!Number.isFinite(number)) return String(value)
  return new Intl.NumberFormat("en-US", {
    useGrouping: false,
    minimumFractionDigits: 0,
    maximumFractionDigits: maxFractionDigits,
  }).format(number)
}

/** Remove database padding in edit fields while preserving every nonzero digit. */
export function formatDecimalInput(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") return ""
  const text = String(value)
  if (/^-?0(?:\.0+)?[eE][+-]?\d+$/.test(text)) return "0"
  if (!/^-?\d+(\.\d+)?$/.test(text) || !text.includes(".")) return text
  const [whole, fraction] = text.split(".")
  const trimmed = fraction.replace(/0+$/, "")
  return trimmed ? `${whole}.${trimmed}` : whole
}

export const formatMass = formatDecimal
