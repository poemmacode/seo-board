"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import type { AuditSummary } from "@/lib/types";
import { calculateScoreFromCounts } from "@/lib/score";
import ScoreRing from "./ScoreRing";

interface Props {
  items: AuditSummary[];
  activeId?: string | null;
  onSelect: (id: string) => void;
  onDelete: (id: string) => Promise<void>;
}

export default function HistorySidebar({ items, activeId, onSelect, onDelete }: Props) {
  const t = useTranslations("history");
  const ts = useTranslations("score");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleDelete = async (id: string) => {
    if (!window.confirm(t("confirm"))) return;
    setError(null);
    setDeletingId(id);
    try {
      await onDelete(id);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("error"));
    } finally {
      setDeletingId(null);
    }
  };
  return (
    <aside className="card h-fit lg:sticky lg:top-4">
      <h3 className="text-sm font-semibold">{t("title")}</h3>
      {error && <p className="mt-2 text-xs text-red-300">{error}</p>}
      <div className="mt-3 space-y-2">
        {items.length === 0 && (
          <p className="text-xs text-zinc-500">{t("empty")}</p>
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
                  {h.status_code} · {Math.round(h.response_time_ms)}ms · {h.word_count} {ts("words")}
                  {h.issues_critical_count > 0 && (
                    <span className="text-red-300"> {t("criticalSuffix", { count: h.issues_critical_count })}</span>
                  )}
                </p>
              </span>
            </button>
            <button
              className="mt-1 text-zinc-600 hover:text-red-300 disabled:opacity-50"
              disabled={deletingId === h.id}
              onClick={() => handleDelete(h.id)}
            >
              {deletingId === h.id ? t("deleting") : t("delete")}
            </button>
          </div>
        ))}
      </div>
    </aside>
  );
}
