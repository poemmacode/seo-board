"use client";

import { useEffect, useState } from "react";
import ScoreRing from "@/components/ScoreRing";
import type { Project } from "@/lib/types";

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/v1/projects", { cache: "no-store" })
      .then((r) => {
        if (!r.ok) throw new Error(`Error ${r.status}`);
        return r.json();
      })
      .then(setProjects)
      .catch((e) => setError(e instanceof Error ? e.message : "No se pudieron cargar los proyectos."));
  }, []);

  return (
    <main className="mx-auto max-w-7xl p-4 sm:p-6">
      <header className="mb-4">
        <h1 className="text-xl font-bold tracking-tight">
          SEOBoard <span className="text-zinc-500 font-normal">— Proyectos</span>
        </h1>
        <p className="text-xs text-zinc-500">
          Un proyecto por dominio raíz · cada auditoría queda como histórico
        </p>
      </header>

      {error && <p className="mb-4 text-sm text-red-300">{error}</p>}

      {projects.length === 0 && !error && (
        <div className="card text-sm text-zinc-500">
          Aún no hay proyectos. Audita una URL y se creará automáticamente.
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
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
    </main>
  );
}
