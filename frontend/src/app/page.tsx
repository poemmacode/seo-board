"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import AuditForm from "@/components/AuditForm";
import ScoreCard from "@/components/ScoreCard";
import ScoreRing from "@/components/ScoreRing";
import HeadingTree from "@/components/HeadingTree";
import IssuesList from "@/components/IssuesList";
import CwvCard from "@/components/CwvCard";
import CrawlTechCard from "@/components/CrawlTechCard";
import AIRecommendations from "@/components/AIRecommendations";
import HistorySidebar from "@/components/HistorySidebar";
import SerpVisualizer from "@/components/SerpVisualizer";
import BulkPanel from "@/components/BulkPanel";
import { auditUrl, fetchAudit, fetchHistory, rerunAi, deleteAudit } from "@/lib/api";
import { calculateScoreFromIssues } from "@/lib/score";
import type { AuditResponse, AuditSummary } from "@/lib/types";

function titleTone(len: number): "ok" | "warn" | "bad" {
  if (len === 0) return "bad";
  if (len >= 45 && len <= 65) return "ok";
  return "warn";
}

function descTone(len: number): "ok" | "warn" | "bad" {
  if (len === 0) return "warn";
  if (len >= 120 && len <= 160) return "ok";
  return "warn";
}

type Section = "audit" | "bulk" | "serp";
type ReportTab = "resumen" | "diagnosticos" | "encabezados" | "contenido" | "ia";

const REPORT_TABS: { id: ReportTab; label: string }[] = [
  { id: "resumen", label: "Resumen" },
  { id: "diagnosticos", label: "Diagnósticos" },
  { id: "encabezados", label: "Encabezados" },
  { id: "contenido", label: "Contenido" },
  { id: "ia", label: "IA" },
];

const scoreChip: Record<string, string> = {
  ok: "bg-emerald-950 text-emerald-300 border border-emerald-800",
  warn: "bg-amber-950 text-amber-300 border border-amber-800",
  bad: "bg-red-950 text-red-300 border border-red-800",
};

export default function Home() {
  const [loading, setLoading] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [current, setCurrent] = useState<AuditResponse | null>(null);
  const [history, setHistory] = useState<AuditSummary[]>([]);
  const [section, setSection] = useState<Section>("audit");
  const [reportTab, setReportTab] = useState<ReportTab>("resumen");

  const score = useMemo(
    () => (current ? calculateScoreFromIssues(current.issues) : null),
    [current]
  );

  const loadHistory = useCallback(async () => {
    try {
      setHistory(await fetchHistory(10));
    } catch {
      /* backend aún no disponible: se ignora silenciosamente */
    }
  }, []);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("audit");
    if (!id) return;
    (async () => {
      try {
        setCurrent(await fetchAudit(id));
        setReportTab("resumen");
      } catch (e) {
        setError(e instanceof Error ? e.message : "No se pudo cargar la auditoría.");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleAnalyze = async (url: string, includeAi: boolean) => {
    setLoading(true);
    setError(null);
    try {
      const data = await auditUrl(url, includeAi);
      setCurrent(data);
      setReportTab("resumen");
      await loadHistory();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error desconocido al auditar.");
    } finally {
      setLoading(false);
    }
  };

  const handleSelect = async (id: string) => {
    setError(null);
    try {
      setCurrent(await fetchAudit(id));
      setReportTab("resumen");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cargar la auditoría.");
    }
  };

  const handleRerun = async () => {
    if (!current) return;
    setRegenerating(true);
    setError(null);
    try {
      const data = await rerunAi(current.id);
      setCurrent(data);
      await loadHistory();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo regenerar el análisis IA.");
    } finally {
      setRegenerating(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteAudit(id);
      if (current?.id === id) setCurrent(null);
      await loadHistory();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo eliminar.");
    }
  };

  return (
    <main className="mx-auto max-w-7xl p-4 sm:p-6">
      <header className="mb-4">
        <h1 className="text-xl font-bold tracking-tight">
          SEOBoard <span className="text-zinc-500 font-normal">— Auditoría On-Page</span>
        </h1>
        <p className="text-xs text-zinc-500">
          Suite interna · Módulo 1 · Keywords / SERP / Competidores en roadmap
        </p>
      </header>

      <nav className="mb-4 flex gap-1 rounded-xl border border-line bg-panel p-1" aria-label="Secciones">
        {(["audit", "bulk", "serp"] as Section[]).map((s) => (
          <button
            key={s}
            onClick={() => setSection(s)}
            aria-current={section === s ? "page" : undefined}
            className={`flex-1 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              section === s ? "bg-zinc-100 text-zinc-900" : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
            }`}
          >
            {s === "audit" ? "Auditoría" : s === "bulk" ? "Bulk" : "SERP Visualizer"}
          </button>
        ))}
        <a
          href="/proyectos"
          className="flex-1 rounded-lg px-4 py-2 text-center text-sm font-medium text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
        >
          Proyectos
        </a>
      </nav>

      {section === "serp" ? (
        <SerpVisualizer audit={current} />
      ) : section === "bulk" ? (
        <BulkPanel />
      ) : (
        <>
          <div className="card mb-4">
            <AuditForm loading={loading} onSubmit={handleAnalyze} />
            {error && <p className="mt-2 text-sm text-red-300">{error}</p>}
          </div>

          <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
            <section className="min-w-0 space-y-4">
              {!current && (
                <div className="card text-sm text-zinc-500">
                  Introduce una URL y pulsa Analizar para ver el informe técnico completo.
                </div>
              )}

              {current && score && (
                <>
                  <div className="card flex items-center gap-4">
                    <ScoreRing score={score.score} size={96} />
                    <div className="min-w-0 flex-1">
                      <span className={`chip ${scoreChip[score.tone]}`}>{score.label}</span>
                      <p className="mt-2 truncate text-sm font-medium text-zinc-100" title={current.url}>
                        {current.url}
                      </p>
                      <p className="mt-1 text-xs text-zinc-500">
                        {current.domain} · {score.critical} críticas · {score.warning} avisos
                        {current.project_slug && (
                          <a className="ml-2 text-zinc-300 underline hover:text-white" href={`/proyectos/${current.project_slug}`}>
                            Ver proyecto →
                          </a>
                        )}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-col gap-3 sm:flex-row">
                    <nav
                      className="flex gap-1 overflow-x-auto rounded-xl border border-line bg-panel p-1 sm:w-40 sm:shrink-0 sm:flex-col"
                      aria-label="Informe"
                    >
                      {REPORT_TABS.map((t) => (
                        <button
                          key={t.id}
                          onClick={() => setReportTab(t.id)}
                          aria-current={reportTab === t.id ? "true" : undefined}
                          className={`flex items-center justify-between gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-left text-sm transition-colors sm:w-full ${
                            reportTab === t.id
                              ? "bg-zinc-100 font-medium text-zinc-900"
                              : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
                          }`}
                        >
                          {t.label}
                          {t.id === "diagnosticos" && score.critical > 0 && (
                            <span className="rounded-full bg-red-950 px-2 py-0.5 text-[11px] font-semibold text-red-300">
                              {score.critical}
                            </span>
                          )}
                        </button>
                      ))}
                    </nav>

                    <div className="min-w-0 flex-1">
                      {reportTab === "resumen" && (
                        <>
                        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                          <ScoreCard
                            label="Estado HTTP"
                            value={String(current.status_code)}
                            hint={current.domain}
                            tone={current.status_code === 200 ? "ok" : "bad"}
                          />
                          <ScoreCard
                            label="Tiempo respuesta"
                            value={`${Math.round(current.response_time_ms)} ms`}
                            hint={current.is_redirect ? `Redirect → ${current.redirect_url}` : "Sin redirección"}
                            tone={current.response_time_ms > 2000 ? "bad" : current.response_time_ms > 800 ? "warn" : "ok"}
                          />
                          <ScoreCard
                            label="Palabras"
                            value={String(current.content_stats.word_count)}
                            hint={`${current.content_stats.reading_time_min} min lectura`}
                            tone={current.content_stats.word_count < 250 ? "warn" : "ok"}
                          />
                          <ScoreCard
                            label={`Título (${current.title_length})`}
                            value={current.title ?? "— sin título —"}
                            hint={current.title_length >= 45 && current.title_length <= 65 ? "Longitud óptima" : "Revisar longitud (45–65)"}
                            tone={titleTone(current.title_length)}
                          />
                          <ScoreCard
                            label={`Descripción (${current.description_length})`}
                            value={current.description ?? "— sin descripción —"}
                            hint={current.description_length >= 120 && current.description_length <= 160 ? "Longitud óptima" : "Revisar longitud (120–160)"}
                            tone={descTone(current.description_length)}
                          />
                        </div>
                        <div className="mt-3">
                          <CwvCard perf={current.perf_summary} />
                        </div>
                        </>
                      )}

                      {reportTab === "diagnosticos" && <IssuesList issues={current.issues} />}

                      {reportTab === "encabezados" && (
                        <HeadingTree headings={current.headings} summary={current.headings_summary} />
                      )}

                      {reportTab === "contenido" && (
                        <div className="space-y-4">
                        <CrawlTechCard tech={current.tech_summary} crawl={current.crawl_summary} />
                        <div className="grid gap-4 md:grid-cols-2">
                          <div className="card text-sm">
                            <h3 className="font-semibold">Imágenes y enlaces</h3>
                            <p className="mt-2 text-zinc-300">
                              {current.images_summary.total} imágenes · {current.images_summary.missing_alt_count} sin ALT
                            </p>
                            <p className="text-zinc-300">
                              {current.links_summary.internal_count} internos · {current.links_summary.external_count} externos
                            </p>
                            <p className="mt-2 text-xs text-zinc-500">
                              Canonical: {current.canonical_url ?? "—"} · Robots: {current.robots_meta ?? "—"}
                            </p>
                            {current.structured_data.detected_types.length > 0 && (
                              <p className="mt-1 text-xs text-zinc-400">
                                Schema: {current.structured_data.detected_types.join(", ")}
                              </p>
                            )}
                          </div>
                          <div className="card text-sm">
                            <h3 className="font-semibold">OpenGraph</h3>
                            {Object.keys(current.open_graph).length === 0 ? (
                              <p className="mt-2 text-zinc-500">Sin etiquetas og:* detectadas.</p>
                            ) : (
                              <dl className="mt-2 space-y-1 text-xs">
                                {Object.entries(current.open_graph).map(([k, v]) => (
                                  <div key={k} className="flex gap-2">
                                    <dt className="w-24 shrink-0 text-zinc-500">{k}</dt>
                                    <dd className="truncate text-zinc-200" title={v}>{v}</dd>
                                  </div>
                                ))}
                              </dl>
                            )}
                          </div>
                        </div>
                        </div>
                      )}

                      {reportTab === "ia" && (
                        <AIRecommendations
                          data={current.ai_analysis}
                          regenerating={regenerating}
                          onRegenerate={handleRerun}
                        />
                      )}
                    </div>
                  </div>
                </>
              )}
            </section>

            <HistorySidebar
              items={history}
              activeId={current?.id}
              onSelect={handleSelect}
              onDelete={handleDelete}
            />
          </div>
        </>
      )}
    </main>
  );
}
