"use client";

import type { CrawlSummary, TechSummary } from "@/lib/types";

function Badge({ ok, yes, no }: { ok: boolean | null; yes: string; no: string }) {
  if (ok == null) return <span className="chip bg-zinc-800 text-zinc-400">sin datos</span>;
  return ok ? (
    <span className="chip bg-emerald-950 text-emerald-300 border border-emerald-800">{yes}</span>
  ) : (
    <span className="chip bg-red-950 text-red-300 border border-red-800">{no}</span>
  );
}

interface Props {
  tech: TechSummary;
  crawl: CrawlSummary;
}

/** Rastreo, indexabilidad, HTTPS, analítica, schemas y AI-readiness. */
export default function CrawlTechCard({ tech, crawl }: Props) {
  return (
    <div className="card text-sm">
      <h3 className="font-semibold">Rastreo y tecnología</h3>

      <div className="mt-3 flex flex-wrap gap-1.5">
        <Badge ok={tech.is_https} yes="HTTPS" no="HTTP" />
        <Badge
          ok={crawl.indexability.verdict === "indexable"}
          yes="Indexable"
          no="No indexable"
        />
        <Badge ok={crawl.robots.found ? crawl.robots.allows_page : null} yes="robots OK" no="robots bloquea" />
        <Badge
          ok={!crawl.sitemap.checked ? null : crawl.sitemap.url_included !== false}
          yes="en sitemap"
          no="fuera de sitemap"
        />
        <Badge ok={crawl.ai_readiness.ready} yes="AI-ready" no="no AI-ready" />
        <span title="Indicios on-page (mapa, teléfono, dirección, schema). La confirmación exacta de la ficha requiere Places API.">
          <Badge ok={tech.local.has_local_presence} yes="Presencia local: Sí" no="Presencia local: No" />
        </span>
      </div>

      {crawl.indexability.reasons.length > 0 && (
        <p className="mt-2 text-xs text-red-300">Bloqueos: {crawl.indexability.reasons.join(" · ")}</p>
      )}

      <dl className="mt-3 space-y-1.5 text-xs">
        <div className="flex gap-2">
          <dt className="w-24 shrink-0 text-zinc-500">Analítica</dt>
          <dd className="text-zinc-200">
            {tech.analytics.length === 0 ? "— no detectada" : tech.analytics.map((a) => a.provider).join(", ")}
          </dd>
        </div>
        <div className="flex gap-2">
          <dt className="w-24 shrink-0 text-zinc-500">Schemas</dt>
          <dd className="text-zinc-200">
            {tech.schema_types.length === 0 ? "— ninguno" : tech.schema_types.join(", ")}
          </dd>
        </div>
        {tech.hreflang.length > 0 && (
          <div className="flex gap-2">
            <dt className="w-24 shrink-0 text-zinc-500">Hreflang</dt>
            <dd className="text-zinc-200">{tech.hreflang.map((h) => h.lang).join(", ")}</dd>
          </div>
        )}
        {crawl.robots.sitemaps_declared.length > 0 && (
          <div className="flex gap-2">
            <dt className="w-24 shrink-0 text-zinc-500">Sitemaps</dt>
            <dd className="truncate text-zinc-200" title={crawl.robots.sitemaps_declared.join(" ")}>
              {crawl.robots.sitemaps_declared.join(", ")}
            </dd>
          </div>
        )}
        {crawl.robots.blocks_ai_bots.length > 0 && (
          <div className="flex gap-2">
            <dt className="w-24 shrink-0 text-zinc-500">IA bloqueada</dt>
            <dd className="text-amber-300">{crawl.robots.blocks_ai_bots.join(", ")}</dd>
          </div>
        )}
      </dl>
    </div>
  );
}
