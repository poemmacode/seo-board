import type { AuditIssue } from "./types";

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

export function scoreLabel(score: number): string {
  if (score >= 80) return "Óptimo";
  if (score >= 50) return "Mejorable";
  return "Crítico";
}

/** 100 = página perfecta. Cada crítica resta 25, cada aviso 10. Rango 1–100. */
export function calculateScoreFromCounts(critical: number, warning: number): SeoScore {
  const raw = 100 - critical * CRITICAL_PENALTY - warning * WARNING_PENALTY;
  const score = Math.min(100, Math.max(1, Math.round(raw)));
  return {
    score,
    tone: scoreTone(score),
    label: scoreLabel(score),
    critical,
    warning,
  };
}

export function calculateScoreFromIssues(issues: AuditIssue[]): SeoScore {
  let critical = 0;
  let warning = 0;
  for (const i of issues) {
    if (i.severity === "critical") critical++;
    else if (i.severity === "warning") warning++;
  }
  return calculateScoreFromCounts(critical, warning);
}
