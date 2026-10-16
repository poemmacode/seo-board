import { notFound } from "next/navigation";
import PrintButton from "@/components/PrintButton";
import { getSupabase, type AuditRow } from "@/lib/supabase";
import { rowToResponse } from "@/lib/audit-map";
import { calculateScoreFromCounts } from "@/lib/score";
import type { AuditIssue } from "@/lib/types";

export const dynamic = "force-dynamic";

const CTA_SERVICE = process.env.NEXT_PUBLIC_CTA_SERVICE ?? "Servicio de Optimización SEO";
const CTA_CONTACT = process.env.NEXT_PUBLIC_CTA_CONTACT ?? "contacto@tudominio.com";
const CTA_WEB = process.env.NEXT_PUBLIC_CTA_WEB ?? "www.tudominio.com";

const BUCKETS: { title: string; categories: string[] }[] = [
  { title: "Indexación y HTTP", categories: ["Indexing", "Security"] },
  { title: "Metadatos, On-Page y medición", categories: ["Meta", "Headers", "Tracking"] },
  { title: "Performance y Core Web Vitals", categories: ["Performance"] },
  { title: "Enlaces e Imágenes", categories: ["Images"] },
  { title: "Datos estructurados y AI-ready", categories: ["Schemas", "AI-Ready"] },
  { title: "SEO local y GBP", categories: ["Local"] },
];

function groupIssues(issues: AuditIssue[]): { bucket: string; items: AuditIssue[] }[] {
  return BUCKETS.map((b) => ({
    bucket: b.title,
    items: issues.filter((i) => b.categories.includes(i.category)),
  })).filter((g) => g.items.length > 0);
}

const sevStyle: Record<string, string> = {
  ok: "pill-ok",
  warning: "pill-warn",
  critical: "pill-bad",
};

export default async function AuditPrintPage({
  params,
}: {
  params: { slug: string; auditId: string };
}) {
  const supabase = getSupabase();
  const { data: project } = await supabase.from("projects").select("*").eq("slug", params.slug).single();
  const { data: audit } = await supabase.from("audits").select("*").eq("id", params.auditId).single();
  if (!audit) notFound();

  const full = rowToResponse(audit as AuditRow);
  const critical = full.issues.filter((i) => i.severity === "critical");
  const warning = full.issues.filter((i) => i.severity === "warning");
  const ok = full.issues.filter((i) => i.severity === "ok");
  const score = calculateScoreFromCounts(critical.length, warning.length).score;
  const date = new Date(full.created_at).toLocaleDateString("es", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const groups = groupIssues(full.issues);
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
          .pill-ok { background: #d7f2e0; color: #0c6b32; } .pill-warn { background: #fbeecb; color: #8a5a00; } .pill-bad { background: #fbdcdc; color: #a31212; }
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
            Usa “Guardar como PDF” en el diálogo de impresión · Activa gráficos de fondo para conservar los colores
          </span>
        </div>

        <main className="sheet">
          <section className="cover">
            <p className="brand">SEOBoard · Auditoría técnica</p>
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
                <strong>Health Score {score}/100.</strong>{" "}
                {critical.length > 0
                  ? `Se detectaron ${critical.length} problema(s) crítico(s) que bloquean indexación, rendimiento o confianza, más ${warning.length} aviso(s) de mejora. Corregir los críticos suele traducirse en mejor rastreo, más visibilidad y mayor conversión.`
                  : warning.length > 0
                    ? `Sin bloqueos críticos. Quedan ${warning.length} aviso(s) de mejora para consolidar el posicionamiento y la experiencia.`
                    : "Sin problemas detectados. La página cumple las comprobaciones técnicas de la auditoría."}
              </p>
            </div>
            <div className="semaforo">
              <div className="sema sema-bad"><div className="n">{critical.length}</div><div>Críticos</div></div>
              <div className="sema sema-warn"><div className="n">{warning.length}</div><div>Advertencias</div></div>
              <div className="sema sema-ok"><div className="n">{ok.length}</div><div>Aprobados</div></div>
            </div>
          </section>

          <h2>Hallazgos por categoría</h2>
          {groups.map((g) => (
            <section key={g.bucket}>
              <h3 style={{ fontSize: 15, margin: "16px 0 4px" }}>{g.bucket}</h3>
              {g.items.map((it, i) => (
                <div className="finding" key={i}>
                  <h4>
                    <span className={`pill ${sevStyle[it.severity] ?? ""}`}>{it.severity}</span>
                    {it.title}
                  </h4>
                  <p>{it.message}</p>
                </div>
              ))}
            </section>
          ))}

          <h2>Propuesta de remediación (por prioridad)</h2>
          {fixes.length === 0 && <p>Sin acciones pendientes.</p>}
          {fixes.map((it, i) => (
            <div className="fix" key={i}>
              <strong>
                {i + 1}. [{it.severity === "critical" ? "CRÍTICO" : "AVISO"}] {it.title}
              </strong>
              <p style={{ margin: "4px 0 0", fontSize: 12.5 }}>{it.message}</p>
            </div>
          ))}

          <section className="cta">
            <h3 style={{ margin: "0 0 6px" }}>{CTA_SERVICE}</h3>
            <p style={{ fontSize: 13 }}>
              Encargue la corrección de estos {fixes.length} punto(s) al equipo especialista y mida la mejora en la
              próxima auditoría. Contacto: {CTA_CONTACT} · {CTA_WEB}
            </p>
          </section>

          <p className="footer">
            Informe generado por SEOBoard el {date} · {full.url}
          </p>
        </main>
        </div>
    </>
  );
}
