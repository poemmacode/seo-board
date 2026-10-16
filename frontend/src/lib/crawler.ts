import { load } from "cheerio";
import type {
  AuditIssue,
  ContentStats,
  HeadingItem,
  ImagesSummary,
  LinksSummary,
  StructuredDataSummary,
} from "./types";

export class CrawlerException extends Error {
  statusCode?: number;
  constructor(message: string, statusCode?: number) {
    super(message);
    this.name = "CrawlerException";
    this.statusCode = statusCode;
  }
}

const CRAWLER_TIMEOUT_MS = 15_000;
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) " +
  "AppleWebKit/537.36 (KHTML, like Gecko) " +
  "Chrome/128.0.0.0 Safari/537.36 (compatible; SEOBoardBot/1.0)";

export interface ExtractedAudit {
  url: string;
  domain: string;
  status_code: number;
  response_time_ms: number;
  canonical_url: string | null;
  is_redirect: boolean;
  redirect_url: string | null;
  title: string | null;
  title_length: number;
  description: string | null;
  description_length: number;
  robots_meta: string | null;
  viewport_meta: string | null;
  open_graph: Record<string, string>;
  headings: HeadingItem[];
  headings_summary: {
    h1_count: number;
    h2_count: number;
    h3_count: number;
    missing_h1: boolean;
    multiple_h1: boolean;
    h1_items: string[];
  };
  images_summary: ImagesSummary;
  links_summary: LinksSummary;
  structured_data: StructuredDataSummary;
  content_stats: ContentStats;
  issues: AuditIssue[];
}

export function normalizeUrl(raw: string): string {
  const url = raw.trim();
  if (!/^https?:\/\//i.test(url)) return `https://${url}`;
  return url;
}

const stripTrailingSlash = (u: string) => u.replace(/\/$/, "");

export async function fetchAndExtract(rawUrl: string): Promise<ExtractedAudit> {
  const normalized = normalizeUrl(rawUrl);
  let parsed: URL;
  try {
    parsed = new URL(normalized);
  } catch {
    throw new CrawlerException(`URL inválida: "${rawUrl}"`, 422);
  }
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new CrawlerException("Solo se admiten URLs http(s).", 422);
  }

  const started = Date.now();
  let response: Response;
  try {
    response = await fetch(normalized, {
      headers: {
        "User-Agent": USER_AGENT,
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "es-ES,es;q=0.9,en;q=0.8",
        "Cache-Control": "no-cache",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(CRAWLER_TIMEOUT_MS),
    });
  } catch (e) {
    if (e instanceof DOMException && e.name === "TimeoutError") {
      throw new CrawlerException(
        `Tiempo de espera agotado al rastrear ${normalized} (>15s)`,
        504
      );
    }
    throw new CrawlerException(
      `Error de red al conectar con ${normalized}: ${e instanceof Error ? e.message : String(e)}`,
      502
    );
  }
  const latencyMs = Math.round((Date.now() - started) * 100) / 100;

  const contentType = (response.headers.get("content-type") ?? "").toLowerCase();
  if (!contentType.includes("text/html") && !contentType.includes("application/xhtml+xml")) {
    throw new CrawlerException(
      `El recurso no es un documento HTML (Content-Type recibido: '${contentType || "desconocido"}')`,
      response.status
    );
  }

  const html = await response.text();
  const finalUrl = response.url || normalized;
  const isRedirect = stripTrailingSlash(finalUrl) !== stripTrailingSlash(normalized);

  return parseHtml({
    html,
    baseUrl: finalUrl,
    statusCode: response.status,
    latencyMs,
    isRedirect,
    redirectUrl: isRedirect ? finalUrl : null,
  });
}

interface ParseInput {
  html: string;
  baseUrl: string;
  statusCode: number;
  latencyMs: number;
  isRedirect: boolean;
  redirectUrl: string | null;
}

export function parseHtml(input: ParseInput): ExtractedAudit {
  const { html, baseUrl, statusCode, latencyMs, isRedirect, redirectUrl } = input;
  const domain = new URL(baseUrl).hostname;
  const $ = load(html);

  // 1. Metadatos
  const title = $("title").first().text().trim() || null;
  const title_length = title ? title.length : 0;

  const descMeta = $("meta")
    .filter((_, el) => ($(el).attr("name") ?? "").toLowerCase() === "description")
    .first();
  const description = (descMeta.attr("content") ?? "").trim() || null;
  const description_length = description ? description.length : 0;

  const robotsMeta = $("meta")
    .filter((_, el) => ($(el).attr("name") ?? "").toLowerCase() === "robots")
    .first();
  const robots_meta = (robotsMeta.attr("content") ?? "").trim() || null;

  const viewportMeta = $("meta")
    .filter((_, el) => ($(el).attr("name") ?? "").toLowerCase() === "viewport")
    .first();
  const viewport_meta = (viewportMeta.attr("content") ?? "").trim() || null;

  const canonicalLink = $("link")
    .filter((_, el) => ($(el).attr("rel") ?? "").toLowerCase() === "canonical")
    .first();
  const canonicalRaw = (canonicalLink.attr("href") ?? "").trim() || null;
  const canonical_url = canonicalRaw ? resolveUrl(canonicalRaw, baseUrl) : null;

  const open_graph: Record<string, string> = {};
  $("meta").each((_, el) => {
    const prop = ($(el).attr("property") ?? "").toLowerCase();
    const val = $(el).attr("content") ?? "";
    if (prop.startsWith("og:") && val) open_graph[prop] = val;
  });

  // 2. Encabezados en orden del DOM
  const headings: HeadingItem[] = [];
  let h1_count = 0;
  let h2_count = 0;
  let h3_count = 0;
  const h1_items: string[] = [];
  $("h1, h2, h3, h4, h5, h6").each((_, el) => {
    const level = (el.tagName ?? "").toUpperCase();
    const text = $(el).text().replace(/\s+/g, " ").trim();
    if (!text) return;
    headings.push({ level, text });
    if (level === "H1") {
      h1_count++;
      h1_items.push(text);
    } else if (level === "H2") {
      h2_count++;
    } else if (level === "H3") {
      h3_count++;
    }
  });
  const headings_summary = {
    h1_count,
    h2_count,
    h3_count,
    missing_h1: h1_count === 0,
    multiple_h1: h1_count > 1,
    h1_items,
  };

  // 3. Imágenes
  const imgEls = $("img").toArray();
  let missing_alt_count = 0;
  const missing_alt_samples: ImagesSummary["missing_alt_samples"] = [];
  for (const el of imgEls) {
    const srcRaw = $(el).attr("src") || $(el).attr("data-src") || "";
    const alt = $(el).attr("alt");
    if (alt == null || alt.trim() === "") {
      missing_alt_count++;
      if (missing_alt_samples.length < 15 && srcRaw) {
        missing_alt_samples.push({ src: resolveUrl(srcRaw, baseUrl) ?? srcRaw, alt });
      }
    }
  }
  const images_summary: ImagesSummary = {
    total: imgEls.length,
    missing_alt_count,
    missing_alt_samples,
  };

  // 4. Enlaces internos vs externos
  const internal = new Set<string>();
  const external = new Set<string>();
  $("a[href]").each((_, el) => {
    const href = ($(el).attr("href") ?? "").trim();
    if (!href || /^(#|javascript:|mailto:|tel:)/i.test(href)) return;
    let abs: URL;
    try {
      abs = new URL(href, baseUrl);
    } catch {
      return;
    }
    if (!["http:", "https:"].includes(abs.protocol)) return;
    const host = abs.hostname;
    if (host === domain || host.endsWith(`.${domain}`)) internal.add(abs.href);
    else external.add(abs.href);
  });
  const links_summary: LinksSummary = {
    internal_count: internal.size,
    external_count: external.size,
    sample_internal: [...internal].slice(0, 10),
    sample_external: [...external].slice(0, 10),
  };

  // 5. JSON-LD
  const detected_types: string[] = [];
  const schemaItems: Record<string, unknown>[] = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    const raw = $(el).html() ?? "";
    if (!raw.trim()) return;
    try {
      const data: unknown = JSON.parse(raw);
      const dicts = Array.isArray(data) ? data : [data];
      for (const item of dicts) {
        if (item && typeof item === "object" && !Array.isArray(item)) {
          const rec = item as Record<string, unknown>;
          schemaItems.push(rec);
          extractTypes(rec, detected_types);
        }
      }
    } catch {
      /* JSON-LD con sintaxis inválida: se ignora de forma segura */
    }
  });
  const structured_data: StructuredDataSummary = {
    schemas_count: schemaItems.length,
    detected_types: [...new Set(detected_types)],
    items: schemaItems.slice(0, 5),
  };

  // 6. Contenido y palabras
  const content_stats = extractContentStats(html);

  // 7. Diagnósticos
  const issues = calculateIssues({
    statusCode,
    latencyMs,
    title,
    title_length,
    description,
    description_length,
    canonical_url,
    viewport_meta,
    robots_meta,
    headings_summary,
    images_summary,
    content_stats,
  });

  return {
    url: baseUrl,
    domain,
    status_code: statusCode,
    response_time_ms: latencyMs,
    canonical_url,
    is_redirect: isRedirect,
    redirect_url: redirectUrl,
    title,
    title_length,
    description,
    description_length,
    robots_meta,
    viewport_meta,
    open_graph,
    headings,
    headings_summary,
    images_summary,
    links_summary,
    structured_data,
    content_stats,
    issues,
  };
}

function resolveUrl(href: string, base: string): string | null {
  try {
    return new URL(href, base).href;
  } catch {
    return null;
  }
}

function extractTypes(item: Record<string, unknown>, acc: string[]): void {
  const t = item["@type"];
  if (typeof t === "string") acc.push(t);
  else if (Array.isArray(t)) for (const v of t) acc.push(String(v));
  const graph = item["@graph"];
  if (Array.isArray(graph)) {
    for (const sub of graph) {
      if (sub && typeof sub === "object" && !Array.isArray(sub)) {
        extractTypes(sub as Record<string, unknown>, acc);
      }
    }
  }
}

function extractContentStats(html: string): ContentStats {
  const $t = load(html);
  $t("script, style, nav, noscript, svg, header, footer").remove();
  const main = $t("main").first().length
    ? $t("main").first()
    : $t("article").first().length
      ? $t("article").first()
      : $t("body");
  const rawText = (main.text() ?? "").replace(/\s+/g, " ").trim();
  const words = rawText.match(/[\p{L}\p{N}_]+/gu) ?? [];
  const word_count = words.length;
  const reading_time_min = Math.round((word_count / 200) * 10) / 10;
  return {
    word_count,
    reading_time_min,
    text_snippet: words.slice(0, 250).join(" "),
  };
}

interface IssueInput {
  statusCode: number;
  latencyMs: number;
  title: string | null;
  title_length: number;
  description: string | null;
  description_length: number;
  canonical_url: string | null;
  viewport_meta: string | null;
  robots_meta: string | null;
  headings_summary: ExtractedAudit["headings_summary"];
  images_summary: ImagesSummary;
  content_stats: ContentStats;
}

function calculateIssues(input: IssueInput): AuditIssue[] {
  const issues: AuditIssue[] = [];
  const {
    statusCode,
    latencyMs,
    title,
    title_length,
    description,
    description_length,
    canonical_url,
    viewport_meta,
    robots_meta,
    headings_summary,
    images_summary,
    content_stats,
  } = input;

  if (statusCode !== 200) {
    issues.push({
      category: "Indexing",
      severity: statusCode >= 400 ? "critical" : "warning",
      title: `Código de respuesta HTTP ${statusCode}`,
      message: `La URL respondió con código ${statusCode}. Se esperaba 200 OK para indexación óptima.`,
    });
  } else {
    issues.push({
      category: "Indexing",
      severity: "ok",
      title: "Estado HTTP 200 OK",
      message: "La página responde correctamente con código 200.",
    });
  }

  if (latencyMs > 2000) {
    issues.push({
      category: "Performance",
      severity: "critical",
      title: "Tiempo de respuesta muy lento",
      message: `La página tardó ${latencyMs} ms en responder (> 2.0s). Podría afectar el rastreo y Core Web Vitals.`,
    });
  } else if (latencyMs > 800) {
    issues.push({
      category: "Performance",
      severity: "warning",
      title: "Tiempo de respuesta moderado",
      message: `La página tardó ${latencyMs} ms. Se recomienda reducir el TTFB por debajo de 800 ms.`,
    });
  } else {
    issues.push({
      category: "Performance",
      severity: "ok",
      title: "Tiempo de respuesta rápido",
      message: `Excelente latencia de servidor (${latencyMs} ms).`,
    });
  }

  if (!title) {
    issues.push({
      category: "Meta",
      severity: "critical",
      title: "Falta la etiqueta <title>",
      message: "La página no tiene título definido, elemento vital para el ranking y CTR en Google.",
    });
  } else if (title_length < 30) {
    issues.push({
      category: "Meta",
      severity: "warning",
      title: "Título demasiado corto",
      message: `El título tiene solo ${title_length} caracteres. La longitud recomendada es entre 45 y 65 caracteres.`,
    });
  } else if (title_length > 65) {
    issues.push({
      category: "Meta",
      severity: "warning",
      title: "Título demasiado largo",
      message: `El título tiene ${title_length} caracteres y probablemente sea recortado en las SERPs (máx recomendado ~60-65).`,
    });
  } else {
    issues.push({
      category: "Meta",
      severity: "ok",
      title: "Longitud de título óptima",
      message: `El título tiene una longitud ideal (${title_length} caracteres).`,
    });
  }

  if (!description) {
    issues.push({
      category: "Meta",
      severity: "warning",
      title: "Falta la meta descripción",
      message: "No se encontró etiqueta meta description. Aunque no es factor de ranking directo, define el snippet en las SERPs.",
    });
  } else if (description_length < 70) {
    issues.push({
      category: "Meta",
      severity: "warning",
      title: "Meta descripción corta",
      message: `La descripción tiene ${description_length} caracteres. Se recomienda entre 120 y 160 caracteres.`,
    });
  } else if (description_length > 165) {
    issues.push({
      category: "Meta",
      severity: "warning",
      title: "Meta descripción demasiado larga",
      message: `La descripción tiene ${description_length} caracteres y podría ser truncada en resultados de búsqueda.`,
    });
  } else {
    issues.push({
      category: "Meta",
      severity: "ok",
      title: "Meta descripción óptima",
      message: `Longitud balanceada para snippets de búsqueda (${description_length} caracteres).`,
    });
  }

  if (headings_summary.missing_h1) {
    issues.push({
      category: "Headers",
      severity: "critical",
      title: "Falta encabezado H1",
      message: "La página carece de un encabezado principal <h1> para definir el tema del contenido.",
    });
  } else if (headings_summary.multiple_h1) {
    issues.push({
      category: "Headers",
      severity: "warning",
      title: "Múltiples encabezados H1 detectados",
      message: `Se encontraron ${headings_summary.h1_count} etiquetas H1. Aunque HTML5 lo permite, se recomienda un único H1 temático claro.`,
    });
  } else {
    issues.push({
      category: "Headers",
      severity: "ok",
      title: "Estructura H1 correcta",
      message: "Se detectó un único encabezado H1 principal.",
    });
  }

  if (images_summary.missing_alt_count > 0) {
    issues.push({
      category: "Images",
      severity: images_summary.missing_alt_count > 5 ? "critical" : "warning",
      title: `${images_summary.missing_alt_count} imágenes sin atributo ALT`,
      message: "Las imágenes sin texto alternativo perjudican la accesibilidad web y el SEO de Google Imágenes.",
    });
  } else if (images_summary.total > 0) {
    issues.push({
      category: "Images",
      severity: "ok",
      title: "Todas las imágenes tienen atributo ALT",
      message: `Las ${images_summary.total} imágenes analizadas cuentan con descripción alternativa.`,
    });
  }

  if (!canonical_url) {
    issues.push({
      category: "Indexing",
      severity: "warning",
      title: "Falta etiqueta Canonical",
      message: "No se encontró <link rel='canonical'> para prevenir problemas de contenido duplicado.",
    });
  } else {
    issues.push({
      category: "Indexing",
      severity: "ok",
      title: "Etiqueta Canonical presente",
      message: `URL canónica configurada: ${canonical_url}`,
    });
  }

  if (!viewport_meta) {
    issues.push({
      category: "Indexing",
      severity: "critical",
      title: "Falta etiqueta meta Viewport",
      message: "Sin meta viewport, la página no se adaptará correctamente a dispositivos móviles.",
    });
  }

  if (content_stats.word_count < 250) {
    issues.push({
      category: "Meta",
      severity: "warning",
      title: "Riesgo de Thin Content (< 250 palabras)",
      message: `Se detectaron únicamente ${content_stats.word_count} palabras de texto en el cuerpo principal.`,
    });
  }

  if (robots_meta && robots_meta.toLowerCase().includes("noindex")) {
    issues.push({
      category: "Indexing",
      severity: "warning",
      title: "Directiva 'noindex' detectada",
      message: `La directiva robots '${robots_meta}' impide que los motores de búsqueda indexen esta página.`,
    });
  }

  return issues;
}
