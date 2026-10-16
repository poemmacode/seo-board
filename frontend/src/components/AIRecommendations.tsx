"use client";

import { useState } from "react";
import type { AIAnalysisResult } from "@/lib/types";

interface Props {
  data?: AIAnalysisResult | null;
  regenerating: boolean;
  onRegenerate: () => void;
}

export default function AIRecommendations({ data, regenerating, onRegenerate }: Props) {
  const [copied, setCopied] = useState<string | null>(null);

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(text.slice(0, 24));
      setTimeout(() => setCopied(null), 1500);
    } catch {
      /* clipboard no disponible */
    }
  };

  return (
    <div className="card">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Recomendaciones IA</h3>
        <button onClick={onRegenerate} disabled={regenerating} className="btn-ghost">
          {regenerating ? "Regenerando…" : "Regenerar"}
        </button>
      </div>

      {!data && (
        <p className="mt-2 text-sm text-zinc-500">
          Sin análisis IA para esta auditoría. Pulsa Regenerar para generarlo.
        </p>
      )}

      {data && (
        <div className="mt-3 space-y-4 text-sm">
          <div>
            <p className="text-xs uppercase tracking-wider text-zinc-500">
              Intención: <span className="text-zinc-200">{data.search_intent}</span>
            </p>
            <p className="mt-1 text-zinc-300">{data.intent_explanation}</p>
          </div>

          <div>
            <p className="font-medium text-zinc-100">Títulos sugeridos</p>
            <ul className="mt-1 space-y-1.5">
              {data.title_suggestions.map((t, i) => (
                <li key={i} className="flex items-start gap-2 rounded border border-line/60 p-2">
                  <span className="flex-1 text-zinc-200">{t}</span>
                  <button className="btn-ghost" onClick={() => copy(t)}>
                    {copied && t.startsWith(copied) ? "Copiado" : "Copiar"}
                  </button>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <p className="font-medium text-zinc-100">Meta descripciones sugeridas</p>
            <ul className="mt-1 space-y-1.5">
              {data.description_suggestions.map((d, i) => (
                <li key={i} className="flex items-start gap-2 rounded border border-line/60 p-2">
                  <span className="flex-1 text-zinc-200">{d}</span>
                  <button className="btn-ghost" onClick={() => copy(d)}>
                    {copied && d.startsWith(copied) ? "Copiado" : "Copiar"}
                  </button>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <p className="font-medium text-zinc-100">AEO / GEO (3 acciones)</p>
            <ol className="mt-1 list-decimal space-y-1 pl-5 text-zinc-300">
              {data.geo_aeo_recommendations.map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ol>
          </div>
        </div>
      )}
    </div>
  );
}
