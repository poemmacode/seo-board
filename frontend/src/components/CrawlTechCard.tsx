"use client";

import { useTranslations } from "next-intl";
import type { CrawlSummary, TechSummary } from "@/lib/types";

function Badge({ ok, yes, no, none }: { ok: boolean | null; yes: string; no: string; none: string }) {
  if (ok == null) return <span className="chip bg-zinc-800 text-zinc-400">{none}</span>;
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

/** Crawling, indexability, HTTPS, analytics, schemas and AI-readiness. */
export default function CrawlTechCard({ tech, crawl }: Props) {
  const t = useTranslations("content");
  const none = t("badgeNoData");
  return (
    <div className="card text-sm">
      <h3 className="font-semibold">{t("techTitle")}</h3>

      <div className="mt-3 flex flex-wrap gap-1.5">
        <Badge ok={tech.is_https} yes={t("badgeHttps")} no={t("badgeHttp")} none={none} />
        <Badge
          ok={crawl.indexability.verdict === "indexable"}
          yes={t("badgeIndexable")}
          no={t("badgeBlocked")}
          none={none}
        />
        <Badge ok={crawl.robots.found ? crawl.robots.allows_page : null} yes={t("badgeRobotsOk")} no={t("badgeRobotsBlocked")} none={none} />
        <Badge
          ok={!crawl.sitemap.checked ? null : crawl.sitemap.url_included !== false}
          yes={t("badgeSitemapIn")}
          no={t("badgeSitemapOut")}
          none={none}
        />
        <Badge ok={crawl.ai_readiness.ready} yes={t("badgeAiReady")} no={t("badgeAiNotReady")} none={none} />
        <span title={t("localHint")}>
          <Badge ok={tech.local.has_local_presence} yes={t("badgeLocalYes")} no={t("badgeLocalNo")} none={none} />
        </span>
      </div>

      {crawl.indexability.reasons.length > 0 && (
        <p className="mt-2 text-xs text-red-300">{t("blocks", { v: crawl.indexability.reasons.join(" · ") })}</p>
      )}

      <dl className="mt-3 space-y-1.5 text-xs">
        <div className="flex gap-2">
          <dt className="w-24 shrink-0 text-zinc-500">{t("rowAnalytics")}</dt>
          <dd className="text-zinc-200">
            {tech.analytics.length === 0 ? t("analyticsNone") : tech.analytics.map((a) => a.provider).join(", ")}
          </dd>
        </div>
        <div className="flex gap-2">
          <dt className="w-24 shrink-0 text-zinc-500">{t("rowSchemas")}</dt>
          <dd className="text-zinc-200">
            {tech.schema_types.length === 0 ? t("schemasNone") : tech.schema_types.join(", ")}
          </dd>
        </div>
        {tech.hreflang.length > 0 && (
          <div className="flex gap-2">
            <dt className="w-24 shrink-0 text-zinc-500">{t("rowHreflang")}</dt>
            <dd className="text-zinc-200">{tech.hreflang.map((h) => h.lang).join(", ")}</dd>
          </div>
        )}
        {crawl.robots.sitemaps_declared.length > 0 && (
          <div className="flex gap-2">
            <dt className="w-24 shrink-0 text-zinc-500">{t("rowSitemaps")}</dt>
            <dd className="truncate text-zinc-200" title={crawl.robots.sitemaps_declared.join(" ")}>
              {crawl.robots.sitemaps_declared.join(", ")}
            </dd>
          </div>
        )}
        {crawl.robots.blocks_ai_bots.length > 0 && (
          <div className="flex gap-2">
            <dt className="w-24 shrink-0 text-zinc-500">{t("rowAiBlocked")}</dt>
            <dd className="text-amber-300">{crawl.robots.blocks_ai_bots.join(", ")}</dd>
          </div>
        )}
      </dl>
    </div>
  );
}
