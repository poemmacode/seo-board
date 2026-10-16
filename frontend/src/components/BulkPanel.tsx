"use client";

import { useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import ScoreRing from "./ScoreRing";
import { auditUrl } from "@/lib/api";
import { calculateScoreFromIssues } from "@/lib/score";
import { resolveLocale } from "@/lib/locale";
import { Link } from "@/i18n/navigation";
import type { AuditResponse } from "@/lib/types";

interface Row {
  url: string;
  status: "pending" | "running" | "ok" | "error";
  audit?: AuditResponse;
  error?: string;
}

const CONCURRENCY = 3;
const MAX_URLS = 20;

function parseUrls(raw: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const chunk of raw.split(/[\n,]+/)) {
    const u = chunk.trim();
    if (!u || seen.has(u.toLowerCase())) continue;
    seen.add(u.toLowerCase());
    out.push(u);
  }
  return out.slice(0, MAX_URLS);
}

/** Bulk audit: runs N audits with limited concurrency and compares results. */
export default function BulkPanel() {
  const t = useTranslations("bulk");
  const locale = resolveLocale(useLocale());
  const [input, setInput] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [running, setRunning] = useState(false);
  const cancelRef = useRef(false);

  const start = async () => {
    const urls = parseUrls(input);
    if (urls.length === 0 || running) return;
    cancelRef.current = false;
    setRunning(true);
    setRows(urls.map((url) => ({ url, status: "pending" as const })));

    let next = 0;
    const patch = (url: string, p: Partial<Row>) =>
      setRows((prev) => prev.map((r) => (r.url === url ? { ...r, ...p } : r)));

    const worker = async () => {
      while (!cancelRef.current) {
        const i = next++;
        if (i >= urls.length) return;
        const url = urls[i];
        patch(url, { status: "running" });
        try {
          const audit = await auditUrl(url, false, locale);
          patch(url, { status: "ok", audit });
        } catch (e) {
          patch(url, { status: "error", error: e instanceof Error ? e.message : "Error" });
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, urls.length) }, worker));
    setRunning(false);
  };

  const done = rows.filter((r) => r.status === "ok").length;
  const total = rows.length;

  const exportCsv = () => {
    const lines = ["url,score,criticas,avisos,palabras,estado"];
    for (const r of rows) {
      const s = r.audit ? calculateScoreFromIssues(r.audit.issues) : null;
      lines.push(
        [
          `"${r.url.replace(/"/g, '""')}"`,
          s?.score ?? "",
          s?.critical ?? "",
          s?.warning ?? "",
          r.audit?.content_stats.word_count ?? "",
          r.status,
        ].join(",")
      );
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "seoboard-bulk.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="space-y-4">
      <div className="card">
        <h3 className="text-sm font-semibold">{t("hint", { max: MAX_URLS })}</h3>
        <textarea
          className="input-dark mt-2 min-h-28 font-mono text-xs"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={t("placeholder")}
          spellCheck={false}
        />
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button className="btn-primary" onClick={start} disabled={running || parseUrls(input).length === 0}>
            {running ? t("running", { done, total }) : t("run")}
          </button>
          {running && (
            <button className="btn-ghost" onClick={() => (cancelRef.current = true)}>
              {t("cancel")}
            </button>
          )}
          {total > 0 && !running && (
            <button className="btn-ghost" onClick={exportCsv}>
              {t("export")}
            </button>
          )}
          <span className="text-xs text-zinc-500">{t("noAiNote")}</span>
        </div>
        {running && (
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-zinc-800">
            <div
              className="h-full bg-emerald-400 transition-all"
              style={{ width: `${total ? Math.round((done / total) * 100) : 0}%` }}
            />
          </div>
        )}
      </div>

      {total > 0 && (
        <div className="card">
          <h3 className="text-sm font-semibold">{t("comparison", { done, total })}</h3>
          <div className="mt-3 space-y-2">
            {rows.map((r) => {
              const s = r.audit ? calculateScoreFromIssues(r.audit.issues) : null;
              return (
                <div
                  key={r.url}
                  className="flex flex-wrap items-center gap-3 rounded-lg border border-line/70 p-2.5 text-xs"
                >
                  {s ? (
                    <ScoreRing score={s.score} size={40} />
                  ) : (
                    <span className="flex h-10 w-10 items-center justify-center text-zinc-600">
                      {r.status === "running" ? "…" : "—"}
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-zinc-100" title={r.url}>
                      {r.url}
                    </span>
                    <span className="block text-zinc-500">
                      {r.status === "pending" && t("queued")}
                      {r.status === "running" && t("auditingRow")}
                      {r.status === "error" && <span className="text-red-300">{r.error}</span>}
                      {s && t("stats", { critical: s.critical, warning: s.warning, words: r.audit?.content_stats.word_count ?? 0 })}
                    </span>
                  </span>
                  {r.audit && (
                    <span className="flex gap-1.5">
                      <Link className="btn-ghost" href={{ pathname: "/", query: { audit: r.audit.id } }}>
                        {t("view")}
                      </Link>
                      {r.audit.project_slug && (
                        <Link className="btn-ghost" href={`/proyectos/${r.audit.project_slug}`}>
                          {t("project")}
                        </Link>
                      )}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
