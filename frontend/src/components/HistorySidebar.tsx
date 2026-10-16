"use client";

import type { AuditSummary } from "@/lib/types";
import { calculateScoreFromCounts } from "@/lib/score";
import ScoreRing from "./ScoreRing";

interface Props {
  items: AuditSummary[];
  activeId?: string | null;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
}

export default function HistorySidebar({ items, activeId, onSelect, onDelete }: Props) {
  return (
    <aside className="card h-fit lg:sticky lg:top-4">
      <h3 className="text-sm font-semibold">Historial (últimas 10)</h3>
      <div className="mt-3 space-y-2">
        {items.length === 0 && (
          <p className="text-xs text-zinc-500">Aún no hay auditorías.</p>
        )}
        {items.map((h) => (
          <div
            key={h.id}
            className={`rounded-lg border p-2 text-xs ${
              activeId === h.id ? "border-zinc-400 bg-zinc-800" : "border-line/70"
            }`}
          >
            <button className="flex w-full items-center gap-2 text-left" onClick={() => onSelect(h.id)}>
              <ScoreRing
                score={
                  h.score ?? calculateScoreFromCounts(h.issues_critical_count, h.issues_warning_count).score
                }
                size={36}
              />
              <span className="min-w-0 flex-1">
                <p className="truncate font-medium text-zinc-100" title={h.url}>
                  {h.domain}
                </p>
                <p className="truncate text-zinc-500" title={h.url}>
                  {h.url}
                </p>
                <p className="mt-1 text-zinc-400">
                  {h.status_code} · {Math.round(h.response_time_ms)}ms · {h.word_count} palabras
                  {h.issues_critical_count > 0 && (
                    <span className="text-red-300"> · {h.issues_critical_count} críticas</span>
                  )}
                </p>
              </span>
            </button>
            <button
              className="mt-1 text-zinc-600 hover:text-red-300"
              onClick={() => onDelete(h.id)}
            >
              Eliminar
            </button>
          </div>
        ))}
      </div>
    </aside>
  );
}
