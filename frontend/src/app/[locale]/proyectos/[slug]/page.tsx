"use client";

import { useCallback, useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import ScoreRing from "@/components/ScoreRing";
import TopNav from "@/components/TopNav";
import { scoreTone } from "@/lib/score";
import { formatDateTime } from "@/lib/format";
import { resolveLocale } from "@/lib/locale";
import { Link } from "@/i18n/navigation";
import type { AuditSummary, Project } from "@/lib/types";

const barColor: Record<string, string> = {
  ok: "bg-emerald-400",
  warn: "bg-amber-400",
  bad: "bg-red-400",
};

export default function ProjectDetailPage({ params }: { params: { slug: string } }) {
  const t = useTranslations("projects");
  const tTop = useTranslations("topNav");
  const locale = resolveLocale(useLocale());
  const [project, setProject] = useState<Project | null>(null);
  const [audits, setAudits] = useState<AuditSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/v1/projects/${params.slug}`, { cache: "no-store" });
      if (res.status === 404) {
        setError(t("notFound"));
        return;
      }
      if (!res.ok) throw new Error(`Error ${res.status}`);
      const body = (await res.json()) as { project: Project; audits: AuditSummary[] };
      setProject(body.project);
      setAudits(body.audits);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("notFound"));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.slug]);

  useEffect(() => {
    load();
  }, [load]);

  const handleDelete = async (id: string) => {
    if (!window.confirm(t("confirm"))) return;
    setDeleteError(null);
    setDeletingId(id);
    try {
      const res = await fetch(`/api/v1/audit/${id}`, { method: "DELETE" });
      if (!res.ok) {
        let detail = `Error ${res.status}`;
        try {
          detail = ((await res.json()) as { detail?: string }).detail ?? detail;
        } catch {
          /* noop */
        }
        throw new Error(detail);
      }
      await load();
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : t("deleteError"));
    } finally {
      setDeletingId(null);
    }
  };

  const evolution = [...audits].reverse();

  return (
    <main className="mx-auto max-w-7xl p-4 sm:p-6">
      <TopNav
        trail={[
          { label: tTop("projects"), href: "/proyectos" },
          { label: project?.domain ?? params.slug },
        ]}
      />
      {error && <p className="mt-4 text-sm text-red-300">{error}</p>}

      {project && (
        <>
          <div className="card mt-3 flex items-center gap-4">
            <ScoreRing score={project.last_score ?? 1} size={96} />
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-lg font-bold">{project.domain}</h1>
              <p className="mt-1 text-xs text-zinc-500">
                {t("auditsCount", { count: project.audits_count })}
                {project.last_audit_at ? ` ${t("lastAudit", { date: formatDateTime(project.last_audit_at, locale) })}` : ""}
              </p>
              <Link href="/" className="btn-ghost mt-3 inline-block">
                {t("newAudit")}
              </Link>
            </div>
          </div>

          {evolution.length > 1 && (
            <div className="card mt-4">
              <h3 className="text-sm font-semibold">{t("evolution")}</h3>
              <div className="mt-3 flex h-24 items-end gap-1.5">
                {evolution.map((a) => (
                  <div
                    key={a.id}
                    title={`${a.score} · ${formatDateTime(a.created_at, locale)}`}
                    className={`min-w-3 flex-1 rounded-t ${barColor[scoreTone(a.score)]}`}
                    style={{ height: `${a.score}%` }}
                  />
                ))}
              </div>
            </div>
          )}

          <div className="card mt-4">
            <h3 className="text-sm font-semibold">{t("historyTitle")}</h3>
            {deleteError && <p className="mt-2 text-xs text-red-300">{deleteError}</p>}
            <div className="mt-3 space-y-2">
              {audits.length === 0 && (
                <p className="text-xs text-zinc-500">{t("emptyAudits")}</p>
              )}
              {audits.map((a) => (
                <div
                  key={a.id}
                  className="flex flex-wrap items-center gap-3 rounded-lg border border-line/70 p-2.5 text-xs"
                >
                  <ScoreRing score={a.score} size={40} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-zinc-100" title={a.url}>
                      {a.url}
                    </span>
                    <span className="block text-zinc-500">
                      {t("rowStats", {
                        date: formatDateTime(a.created_at, locale),
                        status: a.status_code,
                        critical: a.issues_critical_count,
                        warning: a.issues_warning_count,
                      })}
                    </span>
                  </span>
                  <span className="flex gap-1.5">
                    <Link className="btn-ghost" href={{ pathname: "/", query: { audit: a.id } }}>
                      {t("view")}
                    </Link>
                    <Link
                      className="btn-ghost"
                      href={`/proyectos/${project.slug}/auditorias/${a.id}/print`}
                      target="_blank"
                    >
                      {t("pdf")}
                    </Link>
                    <button
                      className="btn-ghost disabled:opacity-50"
                      disabled={deletingId === a.id}
                      onClick={() => handleDelete(a.id)}
                    >
                      {deletingId === a.id ? t("deleting") : t("delete")}
                    </button>
                  </span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </main>
  );
}
