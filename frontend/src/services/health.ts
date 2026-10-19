export type HealthStatus = "checking" | "ready" | "unavailable"

export async function checkHealth(): Promise<HealthStatus> {
  if (import.meta.env.MODE === "demo") return "ready"
  try {
    const response = await fetch("/api/health/ready", { headers: { Accept: "application/json" } })
    if (!response.ok) return "unavailable"
    const payload = (await response.json()) as { status?: string }
    return payload.status === "ok" ? "ready" : "unavailable"
  } catch {
    return "unavailable"
  }
}
