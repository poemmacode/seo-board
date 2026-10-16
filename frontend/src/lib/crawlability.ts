import type { AuditIssue } from "./types";
import type { Locale } from "./locale";
import { srv, fill } from "./srv";

/**
 * Crawleabilidad profunda: robots.txt, sitemap.xml, veredicto de
 * indexabilidad y preparación para motores de respuesta (AI crawlers).
 */

const AI_BOTS = ["GPTBot", "ChatGPT-User", "Google-Extended", "CCBot", "anthropic-ai", "PerplexityBot"];

const FETCH_TIMEOUT_MS = 10_000;
const MAX_SITEMAP_BYTES = 2_000_000;
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) " +
  "AppleWebKit/537.36 (KHTML, like Gecko) " +
  "Chrome/128.0.0.0 Safari/537.36 (compatible; SEOBoardBot/1.0)";

export interface CrawlSummary {
  robots: {
    found: boolean;
    allows_page: boolean | null;
    blocks_ai_bots: string[];
    ai_bots_allowed: string[];
    sitemaps_declared: string[];
  };
  sitemap: {
    checked: boolean;
    sitemap_url: string | null;
    url_included: boolean | null;
    urls_count: number | null;
  };
  indexability: { verdict: "indexable" | "blocked"; reasons: string[] };
  ai_readiness: { ready: boolean; notes: string[] };
}

interface Rule {
  allow: boolean;
  path: string;
}

async function fetchText(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT },
      redirect: "follow",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    if (buf.byteLength > MAX_SITEMAP_BYTES) return null;
    return new TextDecoder().decode(buf.slice(0, MAX_SITEMAP_BYTES));
  } catch {
    return null;
  }
}

function parseRobotsGroups(txt: string): Map<string, Rule[]> {
  const groups = new Map<string, Rule[]>();
  let currentAgents: string[] = [];
  let hasRules = false;
  const flush = () => {
    currentAgents = [];
    hasRules = false;
  };
  for (const rawLine of txt.split("\n")) {
    const line = rawLine.split("#")[0].trim();
    if (!line) continue;
    const m = line.match(/^([A-Za-z-]+)\s*:\s*(.*)$/);
    if (!m) continue;
    const field = m[1].toLowerCase();
    const value = m[2].trim();
    if (field === "user-agent") {
      if (hasRules) flush();
      const key = value.toLowerCase();
      if (!groups.has(key)) groups.set(key, []);
      currentAgents.push(key);
    } else if ((field === "allow" || field === "disallow") && currentAgents.length > 0) {
      if (value === "") continue;
      for (const a of currentAgents) groups.get(a)?.push({ allow: field === "allow", path: value });
      hasRules = true;
    }
  }
  return groups;
}

/** Coincidencia de regla robots con * y $ (simplificada pero fiel en la práctica). */
function ruleMatches(rulePath: string, urlPath: string): boolean {
  const anchored = rulePath.endsWith("$");
  const pattern = anchored ? rulePath.slice(0, -1) : rulePath;
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  const re = new RegExp(`^${escaped}${anchored ? "$" : ""}`);
  return re.test(urlPath);
}

/** true si el grupo de `agent` (o `*` como fallback) permite `path`. */
function isAllowed(groups: Map<string, Rule[]>, agent: string, path: string): boolean {
  const rules = groups.get(agent.toLowerCase()) ?? groups.get("*") ?? [];
  let decision: boolean | null = null;
  let longest = -1;
  for (const r of rules) {
    if (ruleMatches(r.path, path) && r.path.length > longest) {
      longest = r.path.length;
      decision = r.allow;
    }
  }
  return decision ?? true;
}

const norm = (u: string) => u.replace(/\/$/, "");

export interface CrawlInput {
  pageUrl: string;
  isNoindex: boolean;
  canonicalUrl: string | null;
  schemaTypes: string[];
  wordCount: number;
}

export async function analyzeCrawlability(
  input: CrawlInput,
  locale: Locale = "en"
): Promise<{ summary: CrawlSummary; issues: AuditIssue[] }> {
  const S = srv(locale).crawl;
  const { pageUrl, isNoindex, canonicalUrl, schemaTypes, wordCount } = input;
  const origin = new URL(pageUrl).origin;
  const path = new URL(pageUrl).pathname + new URL(pageUrl).search;

  const empty: CrawlSummary = {
    robots: { found: false, allows_page: null, blocks_ai_bots: [], ai_bots_allowed: [], sitemaps_declared: [] },
    sitemap: { checked: false, sitemap_url: null, url_included: null, urls_count: null },
    indexability: { verdict: "indexable", reasons: [] },
    ai_readiness: { ready: false, notes: [] },
  };
  const issues: AuditIssue[] = [];

  // 1. robots.txt
  const robotsTxt = await fetchText(`${origin}/robots.txt`);
  if (robotsTxt == null) {
    issues.push({
      category: "Indexing",
      severity: "warning",
      title: S.robotsUnreachableTitle,
      message: S.robotsUnreachableMsg,
    });
  } else {
    const groups = parseRobotsGroups(robotsTxt);
    const allows = isAllowed(groups, "*", path);
    const blocksAi: string[] = [];
    const allowsAi: string[] = [];
    for (const bot of AI_BOTS) {
      if (isAllowed(groups, bot, path)) allowsAi.push(bot);
      else blocksAi.push(bot);
    }
    const sitemaps = [...robotsTxt.matchAll(/^\s*Sitemap\s*:\s*(\S+)/gim)].map((m) => m[1]);
    empty.robots = { found: true, allows_page: allows, blocks_ai_bots: blocksAi, ai_bots_allowed: allowsAi, sitemaps_declared: sitemaps };

    if (!allows) {
      issues.push({
        category: "Indexing",
        severity: "critical",
        title: S.robotsBlocksTitle,
        message: S.robotsBlocksMsg,
      });
    } else {
      issues.push({
        category: "Indexing",
        severity: "ok",
        title: S.robotsOkTitle,
        message: S.robotsOkMsg,
      });
    }
  }

  // 2. sitemap.xml
  const candidates = [...empty.robots.sitemaps_declared, `${origin}/sitemap.xml`].slice(0, 3);
  for (const sm of candidates) {
    const xml = await fetchText(sm);
    if (xml == null || !/<urlset|<sitemapindex/i.test(xml)) continue;
    const locs = [...xml.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/gi)].map((m) => m[1].trim());
    const isIndex = /<sitemapindex/i.test(xml);
    const urlLocs = isIndex ? [] : locs.filter((l) => !l.endsWith(".xml"));
    empty.sitemap = {
      checked: true,
      sitemap_url: sm,
      url_included: isIndex ? null : urlLocs.some((l) => norm(l) === norm(pageUrl)),
      urls_count: isIndex ? locs.length : urlLocs.length,
    };
    break;
  }
  if (empty.sitemap.checked) {
    if (empty.sitemap.url_included === false) {
      issues.push({
        category: "Indexing",
        severity: "warning",
        title: S.sitemapMissingTitle,
        message: fill(S.sitemapMissingMsg, { url: empty.sitemap.sitemap_url ?? "" }),
      });
    } else if (empty.sitemap.url_included === true) {
      issues.push({
        category: "Indexing",
        severity: "ok",
        title: S.sitemapOkTitle,
        message: fill(S.sitemapOkMsg, { n: empty.sitemap.urls_count ?? "?", url: empty.sitemap.sitemap_url ?? "" }),
      });
    }
  }

  // 3. Veredicto de indexabilidad
  const reasons: string[] = [];
  if (isNoindex) reasons.push(S.reasonNoindex);
  if (empty.robots.allows_page === false) reasons.push(S.reasonRobots);
  if (canonicalUrl && norm(canonicalUrl) !== norm(pageUrl)) reasons.push(fill(S.reasonCanonical, { url: canonicalUrl }));
  empty.indexability = { verdict: reasons.length > 0 ? "blocked" : "indexable", reasons };
  if (reasons.length > 0) {
    issues.push({
      category: "Indexing",
      severity: "critical",
      title: S.notIndexableTitle,
      message: fill(S.notIndexableMsg, { reasons: reasons.join(" · ") }),
    });
  }

  // 4. AI-readiness
  const notes: string[] = [];
  if (empty.robots.blocks_ai_bots.length > 0) notes.push(fill(S.aiNoteBlocked, { bots: empty.robots.blocks_ai_bots.join(", ") }));
  if (schemaTypes.length === 0) notes.push(S.aiNoteNoSchema);
  if (wordCount < 300) notes.push(fill(S.aiNoteThin, { n: wordCount }));
  const ready = empty.robots.blocks_ai_bots.length === 0 && schemaTypes.length > 0 && wordCount >= 300;
  empty.ai_readiness = { ready, notes };
  issues.push({
    category: "AI-Ready",
    severity: ready ? "ok" : "warning",
    title: ready ? S.aiReadyOkTitle : S.aiPartialTitle,
    message: ready
      ? S.aiReadyOkMsg
      : fill(S.aiPartialMsg, { notes: notes.join(" · ") || S.aiNoteGeneric }),
  });

  return { summary: empty, issues };
}
