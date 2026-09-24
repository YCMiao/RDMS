/** Format a mass for reading without changing the stored decimal value. */
export function formatMass(value: string | number | null | undefined, maxFractionDigits: number): string {
  if (value === null || value === undefined || value === "") return ""
  const number = Number(value)
  if (!Number.isFinite(number)) return String(value)
  return new Intl.NumberFormat("en-US", {
    useGrouping: false,
    minimumFractionDigits: 0,
    maximumFractionDigits: maxFractionDigits,
  }).format(number)
}
