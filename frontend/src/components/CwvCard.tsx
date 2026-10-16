"use client";

import { cwvVerdict } from "@/lib/perf";
import type { PerfSummary } from "@/lib/types";

const dot: Record<string, string> = {
  good: "bg-emerald-400",
  "needs-improvement": "bg-amber-400",
  poor: "bg-red-400",
  unknown: "bg-zinc-600",
};

function fmtMs(v: number | null): string {
  if (v == null) return "—";
  return v >= 1000 ? `${(v / 1000).toFixed(2)} s` : `${Math.round(v)} ms`;
}

export default function CwvCard({ perf }: { perf: PerfSummary | null }) {
  if (!perf) {
    return (
      <div className="card text-sm">
        <h3 className="font-semibold">Core Web Vitals</h3>
        <p className="mt-2 text-zinc-500">
          Sin datos de PageSpeed. Configura <code className="text-zinc-300">GOOGLE_PAGESPEED_API_KEY</code> para
          medir LCP/CLS/INP (lab + CrUX).
        </p>
      </div>
    );
  }

  const rows = [
    { label: "LCP", hint: "≤2.5 s", value: perf.field.lcp_p75_ms ?? perf.lab.lcp_ms, fmt: fmtMs, key: "lcp" as const, src: perf.field.lcp_p75_ms != null ? "campo" : "lab" },
    { label: "CLS", hint: "≤0.10", value: perf.field.cls_p75 ?? perf.lab.cls, fmt: (v: number | null) => (v == null ? "—" : v.toFixed(3)), key: "cls" as const, src: perf.field.cls_p75 != null ? "campo" : "lab" },
    { label: "INP", hint: "≤200 ms", value: perf.field.inp_p75_ms ?? perf.lab.inp_ms, fmt: fmtMs, key: "inp" as const, src: perf.field.inp_p75_ms != null ? "campo" : "lab" },
    { label: "TTFB", hint: "≤800 ms", value: perf.lab.ttfb_ms, fmt: fmtMs, key: "ttfb" as const, src: "lab" },
  ];

  return (
    <div className="card text-sm">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">Core Web Vitals · móvil</h3>
        {perf.lab.score_0_100 != null && (
          <span className="text-xs text-zinc-400">Performance {perf.lab.score_0_100}/100</span>
        )}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {rows.map((r) => {
          const v = cwvVerdict(r.key, r.value);
          return (
            <div key={r.label} className="rounded-lg border border-line/60 p-2.5">
              <div className="flex items-center gap-1.5">
                <span className={`h-2 w-2 rounded-full ${dot[v]}`} />
                <span className="text-xs text-zinc-500">{r.label} · {r.src}</span>
              </div>
              <p className="mt-1 text-lg font-semibold tabular-nums text-zinc-100">{r.fmt(r.value)}</p>
              <p className="text-[11px] text-zinc-500">óptimo {r.hint}</p>
            </div>
          );
        })}
      </div>
      {perf.opportunities.length > 0 && (
        <div className="mt-3">
          <p className="text-xs uppercase tracking-wider text-zinc-500">Oportunidades de mejora</p>
          <ul className="mt-1.5 space-y-1 text-xs text-zinc-300">
            {perf.opportunities.slice(0, 5).map((o) => (
              <li key={o.id} className="flex justify-between gap-2 rounded border border-line/60 px-2 py-1.5">
                <span className="truncate" title={o.title}>{o.title}</span>
                <span className="shrink-0 tabular-nums text-amber-300">−{fmtMs(o.savings_ms)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
