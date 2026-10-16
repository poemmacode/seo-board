"use client";

import { useCallback, useEffect, useState } from "react";
import ScoreRing from "@/components/ScoreRing";
import { scoreTone } from "@/lib/score";
import type { AuditSummary, Project } from "@/lib/types";

const barColor: Record<string, string> = {
  ok: "bg-emerald-400",
  warn: "bg-amber-400",
  bad: "bg-red-400",
};

export default function ProjectDetailPage({ params }: { params: { slug: string } }) {
  const [project, setProject] = useState<Project | null>(null);
  const [audits, setAudits] = useState<AuditSummary[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/v1/projects/${params.slug}`, { cache: "no-store" });
      if (res.status === 404) {
        setError("Proyecto no encontrado.");
        return;
      }
      if (!res.ok) throw new Error(`Error ${res.status}`);
      const body = (await res.json()) as { project: Project; audits: AuditSummary[] };
      setProject(body.project);
      setAudits(body.audits);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cargar el proyecto.");
    }
  }, [params.slug]);

  useEffect(() => {
    load();
  }, [load]);

  const handleDelete = async (id: string) => {
    try {
      await fetch(`/api/v1/audit/${id}`, { method: "DELETE" });
      await load();
    } catch {
      /* noop */
    }
  };

  const evolution = [...audits].reverse();

  return (
    <main className="mx-auto max-w-7xl p-4 sm:p-6">
      <a href="/proyectos" className="text-xs text-zinc-400 hover:text-zinc-200">
        ← Proyectos
      </a>
      {error && <p className="mt-4 text-sm text-red-300">{error}</p>}

      {project && (
        <>
          <div className="card mt-3 flex items-center gap-4">
            <ScoreRing score={project.last_score ?? 1} size={96} />
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-lg font-bold">{project.domain}</h1>
              <p className="mt-1 text-xs text-zinc-500">
                {project.audits_count} auditoría(s)
                {project.last_audit_at
                  ? ` · última el ${new Date(project.last_audit_at).toLocaleString("es")}`
                  : ""}
              </p>
              <a href="/" className="btn-ghost mt-3 inline-block">
                Nueva auditoría
              </a>
            </div>
          </div>

          {evolution.length > 1 && (
            <div className="card mt-4">
              <h3 className="text-sm font-semibold">Evolución del score</h3>
              <div className="mt-3 flex h-24 items-end gap-1.5">
                {evolution.map((a) => (
                  <div
                    key={a.id}
                    title={`${a.score} · ${new Date(a.created_at).toLocaleString("es")}`}
                    className={`min-w-3 flex-1 rounded-t ${barColor[scoreTone(a.score)]}`}
                    style={{ height: `${a.score}%` }}
                  />
                ))}
              </div>
            </div>
          )}

          <div className="card mt-4">
            <h3 className="text-sm font-semibold">Historial de auditorías</h3>
            <div className="mt-3 space-y-2">
              {audits.length === 0 && (
                <p className="text-xs text-zinc-500">Sin auditorías en este proyecto.</p>
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
                      {new Date(a.created_at).toLocaleString("es")} · {a.status_code} ·{" "}
                      {a.issues_critical_count} críticas · {a.issues_warning_count} avisos
                    </span>
                  </span>
                  <span className="flex gap-1.5">
                    <a className="btn-ghost" href={`/?audit=${a.id}`}>
                      Ver
                    </a>
                    <a
                      className="btn-ghost"
                      href={`/proyectos/${project.slug}/auditorias/${a.id}/print`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      PDF
                    </a>
                    <button className="btn-ghost" onClick={() => handleDelete(a.id)}>
                      Eliminar
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
