"use client";

import { useEffect, useState } from "react";
import ScoreRing from "./ScoreRing";
import type { Project } from "@/lib/types";

/** Lista de proyectos sin salir de la página principal. */
export default function ProjectsPanel() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/v1/projects", { cache: "no-store" })
      .then((r) => {
        if (!r.ok) throw new Error(`Error ${r.status}`);
        return r.json();
      })
      .then((data) => setProjects(data as Project[]))
      .catch((e) => setError(e instanceof Error ? e.message : "No se pudieron cargar los proyectos."))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="card text-sm text-zinc-500">Cargando proyectos…</div>;
  if (error) return <div className="card text-sm text-red-300">{error}</div>;
  if (projects.length === 0) {
    return (
      <div className="card text-sm text-zinc-500">
        Aún no hay proyectos. Audita una URL y se creará automáticamente.
      </div>
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {projects.map((p) => (
        <a key={p.id} href={`/proyectos/${p.slug}`} className="card flex items-center gap-3 hover:border-zinc-500">
          <ScoreRing score={p.last_score ?? 1} size={56} />
          <span className="min-w-0 flex-1">
            <span className="block truncate font-medium text-zinc-100">{p.domain}</span>
            <span className="block text-xs text-zinc-500">
              {p.audits_count} auditoría(s)
              {p.last_audit_at ? ` · ${new Date(p.last_audit_at).toLocaleDateString("es")}` : ""}
            </span>
          </span>
        </a>
      ))}
    </div>
  );
}
