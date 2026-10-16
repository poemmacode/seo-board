"use client";

import { useCallback, useEffect, useState } from "react";
import AuditForm from "@/components/AuditForm";
import ScoreCard from "@/components/ScoreCard";
import HeadingTree from "@/components/HeadingTree";
import IssuesList from "@/components/IssuesList";
import AIRecommendations from "@/components/AIRecommendations";
import HistorySidebar from "@/components/HistorySidebar";
import { auditUrl, fetchAudit, fetchHistory, rerunAi, deleteAudit } from "@/lib/api";
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

export default function Home() {
  const [loading, setLoading] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [current, setCurrent] = useState<AuditResponse | null>(null);
  const [history, setHistory] = useState<AuditSummary[]>([]);

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

  const handleAnalyze = async (url: string, includeAi: boolean) => {
    setLoading(true);
    setError(null);
    try {
      const data = await auditUrl(url, includeAi);
      setCurrent(data);
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

      <div className="card mb-4">
        <AuditForm loading={loading} onSubmit={handleAnalyze} />
        {error && <p className="mt-2 text-sm text-red-300">{error}</p>}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
        <section className="space-y-4">
          {!current && (
            <div className="card text-sm text-zinc-500">
              Introduce una URL y pulsa Analizar para ver el informe técnico completo.
            </div>
          )}

          {current && (
            <>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
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

              <IssuesList issues={current.issues} />

              <HeadingTree headings={current.headings} summary={current.headings_summary} />

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

              <AIRecommendations
                data={current.ai_analysis}
                regenerating={regenerating}
                onRegenerate={handleRerun}
              />
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
    </main>
  );
}
