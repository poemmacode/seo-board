interface Props {
  label: string;
  value: string;
  hint?: string;
  tone?: "ok" | "warn" | "bad" | "neutral";
}

const tones: Record<string, string> = {
  ok: "border-emerald-800",
  warn: "border-amber-800",
  bad: "border-red-800",
  neutral: "border-line",
};

export default function ScoreCard({ label, value, hint, tone = "neutral" }: Props) {
  return (
    <div className={`card ${tones[tone]}`}>
      <p className="text-[11px] uppercase tracking-wider text-zinc-500">{label}</p>
      <p className="mt-1 truncate text-lg font-semibold" title={value}>
        {value}
      </p>
      {hint && <p className="mt-1 text-xs text-zinc-400">{hint}</p>}
    </div>
  );
}
