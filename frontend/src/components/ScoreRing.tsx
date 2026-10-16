"use client";

import { scoreTone, type ScoreTone } from "@/lib/score";

const stroke: Record<ScoreTone, string> = {
  ok: "#34d399",
  warn: "#fbbf24",
  bad: "#f87171",
};

const text: Record<ScoreTone, string> = {
  ok: "text-emerald-300",
  warn: "text-amber-300",
  bad: "text-red-300",
};

interface Props {
  score: number;
  size?: number;
}

/** Círculo de score SEO 1–100 con semáforo verde/amarillo/rojo. */
export default function ScoreRing({ score, size = 120 }: Props) {
  const tone = scoreTone(score);
  const sw = Math.max(6, Math.round(size / 12));
  const r = (size - sw) / 2;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - score / 100);

  return (
    <div
      className="relative inline-flex shrink-0 items-center justify-center"
      style={{ width: size, height: size }}
      role="img"
      aria-label={`Score SEO ${score} de 100`}
    >
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#232838" strokeWidth={sw} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={stroke[tone]}
          strokeWidth={sw}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
        />
      </svg>
      <span
        className={`absolute font-bold tabular-nums ${text[tone]}`}
        style={{ fontSize: Math.round(size * 0.26) }}
      >
        {score}
      </span>
    </div>
  );
}
