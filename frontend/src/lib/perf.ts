import type { AuditIssue } from "./types";
import type { Locale } from "./locale";
import { srv, fill } from "./srv";

/**
 * Core Web Vitals vía PageSpeed Insights API (lab + field/CrUX).
 * Sin GOOGLE_PAGESPEED_API_KEY devuelve null y la auditoría sigue sin CWV.
 */

export interface PerfLab {
  lcp_ms: number | null;
  cls: number | null;
  inp_ms: number | null;
  fcp_ms: number | null;
  ttfb_ms: number | null;
  score_0_100: number | null;
}

export interface PerfField {
  lcp_p75_ms: number | null;
  cls_p75: number | null;
  inp_p75_ms: number | null;
  overall: "FAST" | "AVERAGE" | "SLOW" | string | null;
}

export interface PerfOpportunity {
  id: string;
  title: string;
  savings_ms: number;
}

export interface PerfSummary {
  strategy: "mobile";
  lab: PerfLab;
  field: PerfField;
  opportunities: PerfOpportunity[];
  fetched_at: string;
}

const PSI_TIMEOUT_MS = 50_000;

// Umbrales oficiales de Google (good / poor)
const T = {
  lcp: { good: 2500, poor: 4000 },
  cls: { good: 0.1, poor: 0.25 },
  inp: { good: 200, poor: 500 },
  ttfb: { good: 800, poor: 1800 },
};

export function cwvVerdict(
  metric: "lcp" | "cls" | "inp" | "ttfb",
  value: number | null
): "good" | "needs-improvement" | "poor" | "unknown" {
  if (value == null) return "unknown";
  const t = T[metric];
  if (value <= t.good) return "good";
  if (value >= t.poor) return "poor";
  return "needs-improvement";
}

export async function fetchPerfSummary(pageUrl: string): Promise<PerfSummary | null> {
  const apiKey = process.env.GOOGLE_PAGESPEED_API_KEY;
  if (!apiKey) return null;

  const endpoint =
    `https://www.googleapis.com/pagespeedonline/v5/runPagespeed` +
    `?url=${encodeURIComponent(pageUrl)}&strategy=mobile&category=performance&key=${apiKey}`;

  let res: Response;
  try {
    res = await fetch(endpoint, { signal: AbortSignal.timeout(PSI_TIMEOUT_MS) });
  } catch (e) {
    console.error(`[PSI] red/timeout: ${e instanceof Error ? e.message : String(e)}`);
    return null;
  }
  if (!res.ok) {
    let hint = "";
    try {
      hint = (await res.text()).slice(0, 300);
    } catch {
      /* noop */
    }
    console.error(`[PSI] HTTP ${res.status}: ${hint}`);
    return null;
  }

  let data: Record<string, unknown>;
  try {
    data = (await res.json()) as Record<string, unknown>;
  } catch {
    return null;
  }

  const lr = (data.lighthouseResult ?? {}) as Record<string, unknown>;
  const audits = (lr.audits ?? {}) as Record<string, { numericValue?: number; displayValue?: string; title?: string; details?: { overallSavingsMs?: number } }>;
  const num = (id: string): number | null => {
    const v = audits[id]?.numericValue;
    return typeof v === "number" ? Math.round(v * 10) / 10 : null;
  };

  const categories = (lr.categories ?? {}) as Record<string, { score?: number }>;
  const perfScore = typeof categories.performance?.score === "number" ? Math.round(categories.performance.score * 100) : null;

  const opportunities: PerfOpportunity[] = Object.entries(audits)
    .filter(([, a]) => typeof a.details?.overallSavingsMs === "number" && (a.details?.overallSavingsMs ?? 0) >= 100)
    .map(([id, a]) => ({
      id,
      title: a.title ?? id,
      savings_ms: Math.round(a.details?.overallSavingsMs ?? 0),
    }))
    .sort((a, b) => b.savings_ms - a.savings_ms)
    .slice(0, 8);

  const le = (data.loadingExperience ?? {}) as { overall_category?: string; metrics?: Record<string, { percentile?: number; category?: string }> };
  const fieldMetric = (key: string): number | null => {
    const p = le.metrics?.[key]?.percentile;
    return typeof p === "number" ? Math.round(p * 10) / 10 : null;
  };

  return {
    strategy: "mobile",
    lab: {
      lcp_ms: num("largest-contentful-paint"),
      cls: num("cumulative-layout-shift"),
      inp_ms: num("interaction-to-next-paint"),
      fcp_ms: num("first-contentful-paint"),
      ttfb_ms: num("server-response-time"),
      score_0_100: perfScore,
    },
    field: {
      lcp_p75_ms: fieldMetric("LARGEST_CONTENTFUL_PAINT_MS"),
      cls_p75: fieldMetric("CUMULATIVE_LAYOUT_SHIFT_SCORE"),
      inp_p75_ms: fieldMetric("INTERACTION_TO_NEXT_PAINT_MS"),
      overall: le.overall_category ?? null,
    },
    opportunities,
    fetched_at: new Date().toISOString(),
  };
}

/** Issues derivadas de CWV. Field (CrUX) manda; lab como respaldo. */
export function perfIssues(perf: PerfSummary | null, locale: Locale = "en"): AuditIssue[] {
  const S = srv(locale).perf;
  if (!perf) {
    return [
      {
        category: "Performance",
        severity: "warning",
        title: S.unmeasuredTitle,
        message: S.unmeasuredMsg,
      },
    ];
  }
  const issues: AuditIssue[] = [];
  const pick = (field: number | null, lab: number | null) => field ?? lab;

  const rows: { key: "lcp" | "cls" | "inp" | "ttfb"; label: string; value: number | null; unit: string }[] = [
    { key: "lcp", label: "LCP", value: pick(perf.field.lcp_p75_ms, perf.lab.lcp_ms), unit: "ms" },
    { key: "cls", label: "CLS", value: pick(perf.field.cls_p75, perf.lab.cls), unit: "" },
    { key: "inp", label: "INP", value: pick(perf.field.inp_p75_ms, perf.lab.inp_ms), unit: "ms" },
    { key: "ttfb", label: "TTFB", value: perf.lab.ttfb_ms, unit: "ms" },
  ];

  for (const r of rows) {
    const v = cwvVerdict(r.key, r.value);
    const shown = r.value == null ? S.noValue : `${r.value}${r.unit ? ` ${r.unit}` : ""}`;
    if (v === "good") {
      issues.push({
        category: "Performance",
        severity: "ok",
        title: fill(S.metricOkTitle, { label: r.label, v: shown }),
        message: fill(S.metricOkMsg, { label: r.label }),
      });
    } else if (v === "needs-improvement") {
      issues.push({
        category: "Performance",
        severity: "warning",
        title: fill(S.metricWarnTitle, { label: r.label, v: shown }),
        message: fill(S.metricWarnMsg, { label: r.label }),
      });
    } else if (v === "poor") {
      issues.push({
        category: "Performance",
        severity: "critical",
        title: fill(S.metricPoorTitle, { label: r.label, v: shown }),
        message: fill(S.metricPoorMsg, { label: r.label }),
      });
    }
  }
  return issues;
}
