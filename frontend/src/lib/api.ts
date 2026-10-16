import type { AuditResponse, AuditSummary } from "./types";
import type { Locale } from "./locale";

// Same-origin por defecto (deploy único en Vercel). Si se define
// NEXT_PUBLIC_API_URL, las llamadas van contra ese backend externo.
const BASE = process.env.NEXT_PUBLIC_API_URL ?? "";

async function handle<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let detail = `Error ${res.status}`;
    try {
      const body = await res.json();
      detail = body.detail ?? body.message ?? detail;
    } catch {
      try {
        detail = await res.text();
      } catch {
        /* noop */
      }
    }
    throw new Error(detail);
  }
  return res.json() as Promise<T>;
}

export async function auditUrl(url: string, include_ai = true, locale: Locale = "en"): Promise<AuditResponse> {
  const res = await fetch(`${BASE}/api/v1/audit/url`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url, include_ai, locale }),
  });
  return handle<AuditResponse>(res);
}

export async function fetchHistory(limit = 10): Promise<AuditSummary[]> {
  const res = await fetch(`${BASE}/api/v1/audit/history?limit=${limit}`, {
    cache: "no-store",
  });
  return handle<AuditSummary[]>(res);
}

export async function fetchAudit(id: string): Promise<AuditResponse> {
  const res = await fetch(`${BASE}/api/v1/audit/${id}`, { cache: "no-store" });
  return handle<AuditResponse>(res);
}

export async function rerunAi(id: string, locale: Locale = "en"): Promise<AuditResponse> {
  const res = await fetch(`${BASE}/api/v1/audit/${id}/ai-rerun`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ locale }),
  });
  return handle<AuditResponse>(res);
}

export async function deleteAudit(id: string): Promise<void> {
  const res = await fetch(`${BASE}/api/v1/audit/${id}`, { method: "DELETE" });
  await handle<unknown>(res);
}
