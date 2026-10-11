import type { CompoundInput } from "../services/records"
import type { components } from "../types/api.generated"
type Role = components["schemas"]["ComponentFields"]["role"]
export const reactantRoles: [Role, string][] = [["substrate", "底物"], ["reagent", "试剂"], ["catalyst", "催化剂"], ["ligand", "配体"], ["base", "碱"], ["solvent", "溶剂"], ["additive", "添加剂"]]
export function validCas(value: string) {
  if (!/^\d{2,7}-\d{2}-\d$/.test(value)) return false
  const digits = value.replaceAll("-", "")
  return [...digits.slice(0, -1)].reverse().reduce((sum, digit, index) => sum + Number(digit) * (index + 1), 0) % 10 === Number(digits.at(-1))
}

export function casCompoundInput(candidate: components["schemas"]["ReagentCandidate"]): CompoundInput {
  return {
    name: candidate.name?.trim() || null, codename: null,
    molecular_formula: candidate.molecular_formula?.trim() || null,
    molecular_weight: candidate.molecular_weight || null,
    cas_number: candidate.cas_number, cas_source: candidate.source,
    notes: `资料来源：${candidate.source_url}`, tag_ids: [],
    structure_molfile: candidate.structure_molfile || null,
  }
}
