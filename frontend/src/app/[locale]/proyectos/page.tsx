"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import ScoreRing from "@/components/ScoreRing";
import TopNav from "@/components/TopNav";
import { formatDate } from "@/lib/format";
import { resolveLocale } from "@/lib/locale";
import { Link } from "@/i18n/navigation";
import type { Project } from "@/lib/types";

export default function ProjectsPage() {
  const t = useTranslations("projects");
  const tTop = useTranslations("topNav");
  const locale = resolveLocale(useLocale());
  const [projects, setProjects] = useState<Project[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/v1/projects", { cache: "no-store" })
      .then((r) => {
        if (!r.ok) throw new Error(`Error ${r.status}`);
        return r.json();
      })
      .then((data) => setProjects(data as Project[]))
      .catch((e) => setError(e instanceof Error ? e.message : t("empty")));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main className="mx-auto max-w-7xl p-4 sm:p-6">
      <TopNav trail={[{ label: tTop("projects") }]} />
      <header className="mb-4">
        <h1 className="text-xl font-bold tracking-tight">{t("title")}</h1>
        <p className="text-xs text-zinc-500">{t("subtitle")}</p>
      </header>

      {error && <p className="mb-4 text-sm text-red-300">{error}</p>}

      {projects.length === 0 && !error && (
        <div className="card text-sm text-zinc-500">{t("empty")}</div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {projects.map((p) => (
          <Link key={p.id} href={`/proyectos/${p.slug}`} className="card flex items-center gap-3 hover:border-zinc-500">
            <ScoreRing score={p.last_score ?? 1} size={56} />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium text-zinc-100">{p.domain}</span>
              <span className="block text-xs text-zinc-500">
                {t("auditsCount", { count: p.audits_count })}
                {p.last_audit_at ? ` · ${formatDate(p.last_audit_at, locale)}` : ""}
              </span>
            </span>
          </Link>
        ))}
      </div>
    </main>
  );
}
