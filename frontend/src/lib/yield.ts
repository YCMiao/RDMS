export const massToMg: Record<string, number> = { mg: 1, g: 1000, kg: 1000000, ug: .001, "µg": .001, "μg": .001 }

export function productYield(amount: string, unit: string, mw: number, limitingMmol: number | null, ratio: string): { value?: string; message?: string } {
  if (!(limitingMmol && limitingMmol > 0)) return { message: "请先勾选限制反应物，并填写其 mmol 或质量与分子量。" }
  if (!(mw > 0) || !Number.isFinite(mw)) return { message: "请填写产物分子量。" }
  if (!(Number(ratio) > 0) || !Number.isFinite(Number(ratio))) return { message: "计量比须大于 0。" }
  if (!amount.trim()) return {}
  if (!massToMg[unit]) return { message: "计算收率需使用质量单位。" }
  const result = Number(amount) * massToMg[unit] / (limitingMmol * Number(ratio) * mw) * 100
  if (!Number.isFinite(result) || result < 0 || result >= 1e12) return { message: "请检查产物质量和计量比。" }
  return { value: result.toFixed(8).replace(/\.?0+$/, "") || "0", ...(result > 100 ? { message: "收率超过 100%，请检查质量和计量比。" } : {}) }
}
