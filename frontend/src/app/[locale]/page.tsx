"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
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
import ProjectsPanel from "@/components/ProjectsPanel";
import LocaleSwitcher from "@/components/LocaleSwitcher";
import { Link } from "@/i18n/navigation";
import { auditUrl, fetchAudit, fetchHistory, rerunAi, deleteAudit } from "@/lib/api";
import { calculateScoreFromIssues } from "@/lib/score";
import { resolveLocale } from "@/lib/locale";
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

type Section = "audit" | "bulk" | "proyectos" | "serp";
type ReportTab = "resumen" | "diagnosticos" | "encabezados" | "contenido" | "ia";

const REPORT_TAB_IDS: ReportTab[] = ["resumen", "diagnosticos", "encabezados", "contenido", "ia"];
const SECTION_IDS: Section[] = ["audit", "bulk", "proyectos", "serp"];

const sectionLabel: Record<Section, "audit" | "bulk" | "projects" | "serp"> = {
  audit: "audit",
  bulk: "bulk",
  proyectos: "projects",
  serp: "serp",
};

const scoreChip: Record<string, string> = {
  ok: "bg-emerald-950 text-emerald-300 border border-emerald-800",
  warn: "bg-amber-950 text-amber-300 border border-amber-800",
  bad: "bg-red-950 text-red-300 border border-red-800",
};

export default function Home() {
  const tHero = useTranslations("hero");
  const tNav = useTranslations("nav");
  const tReport = useTranslations("report");
  const tContent = useTranslations("content");
  const locale = resolveLocale(useLocale());
  const [loading, setLoading] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [current, setCurrent] = useState<AuditResponse | null>(null);
  const [history, setHistory] = useState<AuditSummary[]>([]);
  const [section, setSection] = useState<Section>("audit");
  const [reportTab, setReportTab] = useState<ReportTab>("resumen");

  const score = useMemo(
    () => (current ? calculateScoreFromIssues(current.issues, locale) : null),
    [current, locale]
  );

  const loadHistory = useCallback(async () => {
    try {
      setHistory(await fetchHistory(10));
    } catch (e) {
      console.error("[history]", e instanceof Error ? e.message : e);
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
        setError(e instanceof Error ? e.message : tReport("errors.load"));
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleAnalyze = async (url: string, includeAi: boolean) => {
    setLoading(true);
    setError(null);
    try {
      const data = await auditUrl(url, includeAi, locale);
      setCurrent(data);
      setReportTab("resumen");
      await loadHistory();
    } catch (e) {
      setError(e instanceof Error ? e.message : tReport("errors.analyze"));
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
      setError(e instanceof Error ? e.message : tReport("errors.load"));
    }
  };

  const handleRerun = async () => {
    if (!current) return;
    setRegenerating(true);
    setError(null);
    try {
      const data = await rerunAi(current.id, locale);
      setCurrent(data);
      await loadHistory();
    } catch (e) {
      setError(e instanceof Error ? e.message : tReport("errors.rerun"));
    } finally {
      setRegenerating(false);
    }
  };

  const handleDelete = async (id: string) => {
    await deleteAudit(id);
    if (current?.id === id) setCurrent(null);
    await loadHistory();
  };

  return (
    <main className="mx-auto max-w-7xl p-4 sm:p-6">
      <div className="mb-2 flex justify-end">
        <LocaleSwitcher />
      </div>
      <header className="mb-6 text-center">
        <div className="mb-2 flex items-center justify-center gap-1.5" aria-hidden="true">
          {["SEO", "GEO", "AEO"].map((t) => (
            <span
              key={t}
              className="rounded-full border border-emerald-800 bg-emerald-950 px-2.5 py-0.5 text-[11px] font-semibold tracking-widest text-emerald-300"
            >
              {t}
            </span>
          ))}
        </div>
        <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">
          <span className="bg-gradient-to-r from-emerald-300 via-teal-200 to-sky-300 bg-clip-text text-transparent">
            {tHero("brand")}
          </span>{" "}
          <span className="text-zinc-100">{tHero("title")}</span>
        </h1>
      </header>

      <nav className="mb-4 flex gap-1 overflow-x-auto rounded-xl border border-line bg-panel p-1" aria-label="Sections">
        {SECTION_IDS.map((s) => (
          <button
            key={s}
            onClick={() => setSection(s)}
            aria-current={section === s ? "page" : undefined}
            className={`flex-1 whitespace-nowrap rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              section === s ? "bg-zinc-100 text-zinc-900" : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
            }`}
          >
            {tNav(sectionLabel[s])}
          </button>
        ))}
      </nav>

      {section === "serp" ? (
        <SerpVisualizer audit={current} />
      ) : section === "bulk" ? (
        <BulkPanel />
      ) : section === "proyectos" ? (
        <ProjectsPanel />
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
                  {tReport("empty")}
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
                        {tReport("counts", { domain: current.domain, critical: score.critical, warning: score.warning })}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        <button
                          className="btn-ghost"
                          onClick={() => handleAnalyze(current.url, true)}
                          disabled={loading}
                        >
                          {loading ? tReport("reauditing") : tReport("reaudit")}
                        </button>
                        {current.project_slug && (
                          <Link className="btn-ghost" href={`/proyectos/${current.project_slug}`}>
                            {tReport("viewProject")}
                          </Link>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col gap-3 sm:flex-row">
                    <nav
                      className="flex gap-1 overflow-x-auto rounded-xl border border-line bg-panel p-1 sm:w-40 sm:shrink-0 sm:flex-col"
                      aria-label="Report"
                    >
                      {REPORT_TAB_IDS.map((id) => (
                        <button
                          key={id}
                          onClick={() => setReportTab(id)}
                          aria-current={reportTab === id ? "true" : undefined}
                          className={`flex items-center justify-between gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-left text-sm transition-colors sm:w-full ${
                            reportTab === id
                              ? "bg-zinc-100 font-medium text-zinc-900"
                              : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
                          }`}
                        >
                          {tReport(`tabs.${id}`)}
                          {id === "diagnosticos" && score.critical > 0 && (
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
                            label={tReport("cards.http")}
                            value={String(current.status_code)}
                            hint={current.domain}
                            tone={current.status_code === 200 ? "ok" : "bad"}
                          />
                          <ScoreCard
                            label={tReport("cards.responseTime")}
                            value={`${Math.round(current.response_time_ms)} ms`}
                            hint={current.is_redirect ? tReport("cards.redirect", { url: current.redirect_url ?? "" }) : tReport("cards.noRedirect")}
                            tone={current.response_time_ms > 2000 ? "bad" : current.response_time_ms > 800 ? "warn" : "ok"}
                          />
                          <ScoreCard
                            label={tReport("cards.words")}
                            value={String(current.content_stats.word_count)}
                            hint={tReport("cards.minRead", { min: current.content_stats.reading_time_min })}
                            tone={current.content_stats.word_count < 250 ? "warn" : "ok"}
                          />
                          <ScoreCard
                            label={tReport("cards.title", { n: current.title_length })}
                            value={current.title ?? tReport("cards.noTitle")}
                            hint={current.title_length >= 45 && current.title_length <= 65 ? tReport("cards.optimal") : tReport("cards.reviewTitle")}
                            tone={titleTone(current.title_length)}
                          />
                          <ScoreCard
                            label={tReport("cards.description", { n: current.description_length })}
                            value={current.description ?? tReport("cards.noDescription")}
                            hint={current.description_length >= 120 && current.description_length <= 160 ? tReport("cards.optimal") : tReport("cards.reviewDesc")}
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
                            <h3 className="font-semibold">{tContent("imagesTitle")}</h3>
                            <p className="mt-2 text-zinc-300">
                              {tContent("imagesStats", { total: current.images_summary.total, missing: current.images_summary.missing_alt_count })}
                            </p>
                            <p className="text-zinc-300">
                              {tContent("linksStats", { internal: current.links_summary.internal_count, external: current.links_summary.external_count })}
                            </p>
                            <p className="mt-2 text-xs text-zinc-500">
                              {tContent("canonical", { v: current.canonical_url ?? "—" })} · {tContent("robots", { v: current.robots_meta ?? "—" })}
                            </p>
                            {current.structured_data.detected_types.length > 0 && (
                              <p className="mt-1 text-xs text-zinc-400">
                                {tContent("schema", { v: current.structured_data.detected_types.join(", ") })}
                              </p>
                            )}
                          </div>
                          <div className="card text-sm">
                            <h3 className="font-semibold">{tContent("ogTitle")}</h3>
                            {Object.keys(current.open_graph).length === 0 ? (
                              <p className="mt-2 text-zinc-500">{tContent("ogEmpty")}</p>
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
