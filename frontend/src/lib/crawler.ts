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
  analytics_summary: { detected: { provider: string; evidence: string }[] };
  local_presence: { has_local_presence: boolean; signals: string[] };
  hreflang: { lang: string; href: string }[];
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
    redirectedToHttps: normalized.toLowerCase().startsWith("http://") && finalUrl.toLowerCase().startsWith("https://"),
  });
}

interface ParseInput {
  html: string;
  baseUrl: string;
  statusCode: number;
  latencyMs: number;
  isRedirect: boolean;
  redirectUrl: string | null;
  redirectedToHttps: boolean;
}

export function parseHtml(input: ParseInput): ExtractedAudit {
  const { html, baseUrl, statusCode, latencyMs, isRedirect, redirectUrl, redirectedToHttps } = input;
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

  // 6b. Analítica, presencia local y hreflang
  const analytics_summary = { detected: detectAnalytics($) };
  const local_presence = detectLocalPresence($, structured_data.detected_types);
  const hreflang: ExtractedAudit["hreflang"] = [];
  $('link[rel="alternate"][hreflang]').each((_, el) => {
    const lang = ($(el).attr("hreflang") ?? "").trim();
    const href = ($(el).attr("href") ?? "").trim();
    if (lang && href) hreflang.push({ lang, href: resolveUrl(href, baseUrl) ?? href });
  });

  // 7. Diagnósticos
  const issues = calculateIssues({
    pageUrl: baseUrl,
    redirectedToHttps,
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
    analytics: analytics_summary.detected,
    schema_types: structured_data.detected_types,
    local_presence: local_presence.has_local_presence,
    local_signals: local_presence.signals,
    hreflang,
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
    analytics_summary,
    local_presence,
    hreflang,
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

const ANALYTICS_SIGNATURES: { provider: string; patterns: RegExp[] }[] = [
  { provider: "Google Analytics 4", patterns: [/googletagmanager\.com\/gta?g\.js/i, /gtag\(\s*['"]config['"]/i] },
  { provider: "Universal Analytics", patterns: [/google-analytics\.com\/analytics\.js/i] },
  { provider: "Google Tag Manager", patterns: [/googletagmanager\.com\/gtm\.js/i, /googletagmanager\.com\/ns\.html/i] },
  { provider: "Meta Pixel", patterns: [/connect\.facebook\.net\/[^'"]*fbevents/i, /fbq\(\s*['"]init['"]/i] },
  { provider: "Hotjar", patterns: [/hotjar\.com/i] },
  { provider: "Microsoft Clarity", patterns: [/clarity\.ms/i] },
  { provider: "Matomo", patterns: [/matomo\.js/i, /piwik\.js/i] },
  { provider: "Plausible", patterns: [/plausible\.io\/js/i] },
  { provider: "Segment", patterns: [/cdn\.segment\.(com|io)/i] },
  { provider: "Mixpanel", patterns: [/cdn\.mxpnl\.com|mixpanel/i] },
  { provider: "LinkedIn Insight", patterns: [/snap\.licdn\.com|linkedin.*insight/i] },
  { provider: "TikTok Pixel", patterns: [/analytics\.tiktok\.com/i] },
];

function detectAnalytics($: ReturnType<typeof load>): { provider: string; evidence: string }[] {
  const haystacks: string[] = [];
  $("script[src]").each((_, el) => {
    const src = ($(el).attr("src") ?? "").trim();
    if (src) haystacks.push(`src:${src}`);
  });
  let budget = 40_000;
  $("script:not([src])").each((_, el) => {
    if (budget <= 0) return;
    const text = ($(el).html() ?? "").slice(0, budget);
    if (text.trim()) haystacks.push(`inline:${text.slice(0, 200)}`);
    budget -= text.length;
  });
  const found: { provider: string; evidence: string }[] = [];
  const seen = new Set<string>();
  for (const sig of ANALYTICS_SIGNATURES) {
    if (seen.has(sig.provider)) continue;
    const line = haystacks.find((h) => sig.patterns.some((p) => p.test(h)));
    if (line) {
      seen.add(sig.provider);
      found.push({ provider: sig.provider, evidence: line.slice(0, 140) });
    }
  }
  return found;
}

/**
 * Indicios de presencia local (posible ficha Google Business Profile).
 * Heurística on-page gratuita: NO confirma la ficha; la verificación exacta
 * requiere Places API. 1 señal fuerte o 2 débiles = presencia probable.
 */
function detectLocalPresence(
  $: ReturnType<typeof load>,
  schemaTypes: string[]
): { has_local_presence: boolean; signals: string[] } {
  const strong: string[] = [];
  const weak: string[] = [];

  const localSchema = schemaTypes.filter((t) =>
    /localbusiness|store|restaurant|hotel|dentist|plumber|electrician|organization/i.test(t)
  );
  const hasAddressInSchema = localSchema.length > 0;
  if (hasAddressInSchema) strong.push(`Schema ${localSchema.slice(0, 3).join(", ")}`);

  let mapsHit = false;
  $("iframe[src], a[href]").each((_, el) => {
    const href = ($(el).attr("src") ?? $(el).attr("href") ?? "").toLowerCase();
    if (/google\.com\/maps|maps\.google\.|goo\.gl\/maps|\/maps\/embed/.test(href)) mapsHit = true;
  });
  if (mapsHit) strong.push("Mapa de Google embebido/enlazado");

  let hasTel = false;
  $("a[href^='tel:']").each(() => {
    hasTel = true;
  });
  if (hasTel) weak.push("Teléfono de contacto");

  let hasGeoMeta = false;
  $("meta").each((_, el) => {
    const name = ($(el).attr("name") ?? $(el).attr("property") ?? "").toLowerCase();
    if (/^(geo\.|icbm$)/.test(name)) hasGeoMeta = true;
  });
  if (hasGeoMeta) weak.push("Metas geo/ICBM");

  let hasPostal = false;
  $("[itemtype]").each((_, el) => {
    if (($(el).attr("itemtype") ?? "").toLowerCase().includes("postaladdress")) hasPostal = true;
  });
  if (hasPostal) weak.push("Dirección postal (microdata)");

  const signals = [...strong, ...weak];
  return { has_local_presence: strong.length >= 1 || weak.length >= 2, signals };
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
  pageUrl: string;
  redirectedToHttps: boolean;
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
  analytics: { provider: string; evidence: string }[];
  schema_types: string[];
  local_presence: boolean;
  local_signals: string[];
  hreflang: { lang: string; href: string }[];
}

function calculateIssues(input: IssueInput): AuditIssue[] {
  const issues: AuditIssue[] = [];
  const {
    pageUrl,
    redirectedToHttps,
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
    analytics,
    schema_types,
    local_presence,
    local_signals,
    hreflang,
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

  // HTTPS: Google lo exige como señal de confianza y ranking
  let protocol = "";
  try {
    protocol = new URL(pageUrl).protocol;
  } catch {
    protocol = "";
  }
  if (protocol === "http:") {
    issues.push({
      category: "Security",
      severity: "critical",
      title: "La página se sirve por HTTP",
      message: "Sin HTTPS los navegadores marcan la página como no segura y Google penaliza el ranking. Migra a HTTPS con certificado válido y redirección 301.",
    });
  } else if (redirectedToHttps) {
    issues.push({
      category: "Security",
      severity: "warning",
      title: "Redirige HTTP → HTTPS",
      message: "La versión HTTP redirige a HTTPS. Actualiza enlaces internos y canonical a la versión HTTPS para evitar saltos.",
    });
  } else if (protocol === "https:") {
    issues.push({
      category: "Security",
      severity: "ok",
      title: "HTTPS activo",
      message: "La página se sirve con cifrado HTTPS.",
    });
  }

  // Canonical que apunta fuera: posible duplicado o consolidación no deseada
  if (canonical_url && stripTrailingSlash(canonical_url) !== stripTrailingSlash(pageUrl)) {
    issues.push({
      category: "Indexing",
      severity: "warning",
      title: "Canonical apunta a otra URL",
      message: `El canonical (${canonical_url}) difiere de la URL auditada. Solo es correcto si quieres consolidar el ranking en esa otra URL.`,
    });
  }

  // Analítica y medición
  if (analytics.length === 0) {
    issues.push({
      category: "Tracking",
      severity: "warning",
      title: "Sin scripts de analítica detectados",
      message: "No se encontró GA4, GTM, Pixel ni otra herramienta de medición. Sin datos no hay optimización posible.",
    });
  } else {
    issues.push({
      category: "Tracking",
      severity: "ok",
      title: `Medición activa: ${analytics.map((a) => a.provider).join(", ")}`,
      message: `Se detectaron ${analytics.length} herramienta(s) de analítica en la página.`,
    });
  }

  // Datos estructurados Schema.org
  if (schema_types.length === 0) {
    issues.push({
      category: "Schemas",
      severity: "warning",
      title: "Sin datos estructurados (Schema.org)",
      message: "No hay JSON-LD. Añade schemas (Article, FAQPage, Product…) para rich results y citas en motores de respuesta.",
    });
  } else {
    issues.push({
      category: "Schemas",
      severity: "ok",
      title: `${schema_types.length} tipo(s) Schema.org: ${schema_types.slice(0, 4).join(", ")}`,
      message: "Datos estructurados presentes para rich results y GEO/AEO.",
    });
  }

  // Hreflang (solo informa cuando existe)
  if (hreflang.length > 0) {
    issues.push({
      category: "Indexing",
      severity: "ok",
      title: `${hreflang.length} etiqueta(s) hreflang`,
      message: `Idiomas/regiones: ${hreflang.map((h) => h.lang).slice(0, 6).join(", ")}.`,
    });
  }

  // Presencia local (indicios de ficha Google Business Profile)
  if (local_presence) {
    issues.push({
      category: "Local",
      severity: "ok",
      title: "Presencia local detectada (posible ficha GBP)",
      message: `Indicios: ${local_signals.slice(0, 4).join(" · ")}. La confirmación exacta de la ficha requiere verificación con Places API.`,
    });
  } else {
    issues.push({
      category: "Local",
      severity: "warning",
      title: "Sin señales de presencia local",
      message: "No hay teléfono, dirección, mapa ni schema LocalBusiness. Si el negocio atiende una zona, añade NAP + mapa + schema y verifica la ficha de Google Business Profile.",
    });
  }

  return issues;
}
