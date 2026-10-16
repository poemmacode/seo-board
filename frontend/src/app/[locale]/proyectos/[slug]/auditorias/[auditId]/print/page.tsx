import { notFound } from "next/navigation";
import { getTranslations, unstable_setRequestLocale } from "next-intl/server";
import PrintButton from "@/components/PrintButton";
import { getSupabase, type AuditRow } from "@/lib/supabase";
import { rowToResponse } from "@/lib/audit-map";
import { calculateScoreFromCounts } from "@/lib/score";
import { formatDate } from "@/lib/format";
import type { Locale } from "@/lib/locale";
import type { AuditIssue } from "@/lib/types";

export const dynamic = "force-dynamic";

const CTA_SERVICE = process.env.NEXT_PUBLIC_CTA_SERVICE ?? "SEO Optimization Service";
const CTA_CONTACT = process.env.NEXT_PUBLIC_CTA_CONTACT ?? "contact@yourdomain.com";
const CTA_WEB = process.env.NEXT_PUBLIC_CTA_WEB ?? "www.yourdomain.com";

const BUCKET_KEYS = [
  { key: "indexing", categories: ["Indexing", "Security"] },
  { key: "onpage", categories: ["Meta", "Headers", "Tracking"] },
  { key: "perf", categories: ["Performance"] },
  { key: "links", categories: ["Images"] },
  { key: "schemas", categories: ["Schemas", "AI-Ready"] },
  { key: "local", categories: ["Local"] },
] as const;

function groupIssues(
  issues: AuditIssue[],
  titles: Record<string, string>
): { bucket: string; items: AuditIssue[] }[] {
  return BUCKET_KEYS.map((b) => ({
    bucket: titles[b.key] ?? b.key,
    items: issues.filter((i) => (b.categories as readonly string[]).includes(i.category)),
  })).filter((g) => g.items.length > 0);
}

const sevStyle: Record<string, string> = {
  ok: "pill-ok",
  warning: "pill-warn",
  critical: "pill-bad",
  info: "pill-info",
};

export default async function AuditPrintPage({
  params,
}: {
  params: { slug: string; auditId: string; locale: string };
}) {
  const locale = (params.locale === "es" ? "es" : "en") as Locale;
  unstable_setRequestLocale(locale);
  const t = await getTranslations("print");
  const ti = await getTranslations("issues");
  const supabase = getSupabase();
  const { data: project } = await supabase.from("projects").select("*").eq("slug", params.slug).single();
  const { data: audit } = await supabase.from("audits").select("*").eq("id", params.auditId).single();
  if (!audit) notFound();

  const full = rowToResponse(audit as AuditRow);
  const critical = full.issues.filter((i) => i.severity === "critical");
  const warning = full.issues.filter((i) => i.severity === "warning");
  const ok = full.issues.filter((i) => i.severity === "ok");
  const score = calculateScoreFromCounts(critical.length, warning.length, locale).score;
  const date = formatDate(full.created_at, locale);
  const bucketTitles: Record<string, string> = {
    indexing: t("buckets.indexing"),
    onpage: t("buckets.onpage"),
    perf: t("buckets.perf"),
    links: t("buckets.links"),
    schemas: t("buckets.schemas"),
    local: t("buckets.local"),
  };
  const sevLabel: Record<string, string> = {
    ok: ti("labels.ok"),
    warning: ti("labels.warning"),
    critical: ti("labels.critical"),
    info: ti("labels.info"),
  };
  const groups = groupIssues(full.issues, bucketTitles);
  const fixes = [...critical, ...warning];

  return (
    <>
      <style>{`
        @page { size: A4; margin: 16mm 14mm; }
        * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        .print-sheet { font-family: system-ui, -apple-system, "Segoe UI", sans-serif; color: #111; background: #fff; }
        .toolbar { max-width: 210mm; margin: 0 auto; padding: 16px; display: flex; gap: 12px; align-items: center; }
        .sheet { max-width: 210mm; margin: 0 auto; }
          .cover { border: 2px solid #111; border-radius: 12px; padding: 28px; }
          .brand { font-size: 13px; letter-spacing: 2px; text-transform: uppercase; color: #555; }
          .domain { font-size: 30px; font-weight: 800; margin: 6px 0; word-break: break-all; }
          .meta { color: #555; font-size: 13px; }
          .score-row { display: flex; gap: 24px; align-items: center; margin-top: 18px; }
          .ring { width: 110px; height: 110px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 38px; font-weight: 800; border: 10px solid; }
          .impact { font-size: 14px; line-height: 1.6; }
          .semaforo { display: flex; gap: 12px; margin-top: 18px; }
          .sema { flex: 1; border-radius: 10px; padding: 12px; text-align: center; border: 1px solid #ddd; }
          .sema .n { font-size: 30px; font-weight: 800; }
          .sema-ok { background: #e9f9ef; } .sema-warn { background: #fdf3dd; } .sema-bad { background: #fdecec; }
          h2 { font-size: 18px; margin: 26px 0 10px; border-bottom: 2px solid #111; padding-bottom: 4px; }
          .finding { border: 1px solid #ddd; border-radius: 8px; padding: 10px 12px; margin: 8px 0; break-inside: avoid; }
          .finding h4 { margin: 0 0 4px; font-size: 14px; }
          .finding p { margin: 0; font-size: 12.5px; color: #333; line-height: 1.5; }
          .pill { display: inline-block; font-size: 11px; font-weight: 700; border-radius: 999px; padding: 2px 10px; margin-right: 8px; }
          .pill-ok { background: #d7f2e0; color: #0c6b32; } .pill-warn { background: #fbeecb; color: #8a5a00; } .pill-bad { background: #fbdcdc; color: #a31212; } .pill-info { background: #dbeafe; color: #1d4ed8; }
          .fix { break-inside: avoid; border-left: 4px solid #111; padding: 8px 12px; margin: 8px 0; background: #f7f7f7; border-radius: 0 8px 8px 0; }
          .cta { margin-top: 22px; border: 2px solid #111; border-radius: 12px; padding: 20px; text-align: center; break-inside: avoid; }
          .footer { margin-top: 18px; font-size: 11px; color: #777; text-align: center; }
          @media print {
            .toolbar { display: none !important; }
            body { background: #fff !important; }
            .print-sheet { background: #fff; }
          }
        `}</style>

        <div className="print-sheet">
        <div className="toolbar">
          <PrintButton />
          <span style={{ fontSize: 12, color: "#555" }}>
            {t("toolbarHint")}
          </span>
        </div>

        <main className="sheet">
          <section className="cover">
            <p className="brand">{t("brand")}</p>
            <h1 className="domain">{full.domain}</h1>
            <p className="meta">
              {(project as { domain?: string } | null)?.domain ?? full.domain} · {full.url} · {date}
            </p>
            <div className="score-row">
              <div
                className="ring"
                style={{ borderColor: score >= 80 ? "#16a34a" : score >= 50 ? "#d97706" : "#dc2626" }}
              >
                {score}
              </div>
              <p className="impact">
                <strong>{t("impactIntro", { score })}</strong>{" "}
                {critical.length > 0
                  ? t("impactCritical", { critical: critical.length, warning: warning.length })
                  : warning.length > 0
                    ? t("impactWarning", { warning: warning.length })
                    : t("impactOk")}
              </p>
            </div>
            <div className="semaforo">
              <div className="sema sema-bad"><div className="n">{critical.length}</div><div>{t("semaCritical")}</div></div>
              <div className="sema sema-warn"><div className="n">{warning.length}</div><div>{t("semaWarnings")}</div></div>
              <div className="sema sema-ok"><div className="n">{ok.length}</div><div>{t("semaPassed")}</div></div>
            </div>
          </section>

          <h2>{t("findings")}</h2>
          {groups.map((g) => (
            <section key={g.bucket}>
              <h3 style={{ fontSize: 15, margin: "16px 0 4px" }}>{g.bucket}</h3>
              {g.items.map((it, i) => (
                <div className="finding" key={i}>
                  <h4>
                    <span className={`pill ${sevStyle[it.severity] ?? ""}`}>{sevLabel[it.severity] ?? it.severity}</span>
                    {it.title}
                  </h4>
                  <p>{it.message}</p>
                </div>
              ))}
            </section>
          ))}

          <h2>{t("remediation")}</h2>
          {fixes.length === 0 && <p>{t("noActions")}</p>}
          {fixes.map((it, i) => (
            <div className="fix" key={i}>
              <strong>
                {i + 1}. [{it.severity === "critical" ? t("fixCritical") : t("fixWarning")}] {it.title}
              </strong>
              <p style={{ margin: "4px 0 0", fontSize: 12.5 }}>{it.message}</p>
            </div>
          ))}

          <section className="cta">
            <h3 style={{ margin: "0 0 6px" }}>{CTA_SERVICE}</h3>
            <p style={{ fontSize: 13 }}>
              {t("ctaBody", { count: fixes.length, contact: CTA_CONTACT, web: CTA_WEB })}
            </p>
          </section>

          <p className="footer">
            {t("footer", { date, url: full.url })}
          </p>
        </main>
        </div>
    </>
  );
}
