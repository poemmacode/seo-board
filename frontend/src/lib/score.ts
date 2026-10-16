import type { AuditIssue } from "./types";
import type { Locale } from "./locale";
import { srv } from "./srv";

export type ScoreTone = "ok" | "warn" | "bad";

export interface SeoScore {
  score: number;
  tone: ScoreTone;
  label: string;
  critical: number;
  warning: number;
}

const CRITICAL_PENALTY = 25;
const WARNING_PENALTY = 10;

export function scoreTone(score: number): ScoreTone {
  if (score >= 80) return "ok";
  if (score >= 50) return "warn";
  return "bad";
}

export function scoreLabel(score: number, locale: Locale = "en"): string {
  const s = srv(locale).score;
  if (score >= 80) return s.optimal;
  if (score >= 50) return s.improvable;
  return s.critical;
}

/** 100 = página perfecta. Cada crítica resta 25, cada aviso 10. Rango 1–100. */
export function calculateScoreFromCounts(critical: number, warning: number, locale: Locale = "en"): SeoScore {
  const raw = 100 - critical * CRITICAL_PENALTY - warning * WARNING_PENALTY;
  const score = Math.min(100, Math.max(1, Math.round(raw)));
  return {
    score,
    tone: scoreTone(score),
    label: scoreLabel(score, locale),
    critical,
    warning,
  };
}

export function calculateScoreFromIssues(issues: AuditIssue[], locale: Locale = "en"): SeoScore {
  let critical = 0;
  let warning = 0;
  for (const i of issues) {
    if (i.severity === "critical") critical++;
    else if (i.severity === "warning") warning++;
  }
  return calculateScoreFromCounts(critical, warning);
}
