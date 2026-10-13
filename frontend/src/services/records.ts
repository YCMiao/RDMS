import type { components } from "../types/api.generated"

export type Experiment = components["schemas"]["ExperimentOut"]
export type Compound = components["schemas"]["CompoundOut"]
export type Tag = components["schemas"]["TagOut"]
export type ExperimentInput = components["schemas"]["ExperimentFields"]
export type CompoundInput = components["schemas"]["CompoundFields"]
export type Relation = components["schemas"]["RelationOut"]
export type ExperimentRelation = components["schemas"]["ExperimentRelationOut"]
export type Page<T> = { items: T[]; page: number; page_size: number; total: number }

type ApiErrorBody = { error?: { message?: string; fields?: { field: string; message: string }[] } }

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly fields: { field: string; message: string }[] = [],
  ) {
    super(message)
  }
}

export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response
  try {
    response = await fetch(`/api${path}`, {
      ...init,
      headers: { Accept: "application/json", "X-RDMS-Request": "1", ...(init?.body && !(init.body instanceof FormData) ? { "Content-Type": "application/json" } : {}), ...init?.headers },
    })
  } catch {
    throw new ApiError("连接服务失败，请确认 RDMS 正在运行", 0)
  }
  if (!response.ok) {
    if (response.status === 401 && !path.startsWith("/auth/")) window.dispatchEvent(new Event("rdms-session-expired"))
    const body = (await response.json().catch(() => ({}))) as ApiErrorBody
    const message = body.error?.message ?? `请求失败（${response.status}）`
    throw new ApiError(response.status === 409 && !path.startsWith("/auth/") ? `${message}。如正在编辑，请复制内容后刷新。` : message, response.status, body.error?.fields ?? [])
  }
  return response.status === 204 ? (undefined as T) : ((await response.json()) as T)
}

export function query(parameters: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(parameters)) {
    if (value !== undefined && value !== "") search.set(key, String(value))
  }
  return search.toString()
}
