import type { AuditIssue } from "@/lib/types";

const chipStyle: Record<string, string> = {
  ok: "bg-emerald-950 text-emerald-300 border border-emerald-800",
  warning: "bg-amber-950 text-amber-300 border border-amber-800",
  critical: "bg-red-950 text-red-300 border border-red-800",
};

const dot: Record<string, string> = {
  ok: "bg-emerald-400",
  warning: "bg-amber-400",
  critical: "bg-red-400",
};

export default function IssuesList({ issues }: { issues: AuditIssue[] }) {
  return (
    <div className="card">
      <h3 className="text-sm font-semibold">Diagnósticos</h3>
      <div className="mt-3 space-y-2">
        {issues.map((iss, i) => (
          <div key={i} className="rounded-lg border border-line/70 p-2.5 text-sm">
            <div className="flex items-center gap-2">
              <span className={`h-2 w-2 rounded-full ${dot[iss.severity] ?? "bg-zinc-500"}`} />
              <span className={`chip ${chipStyle[iss.severity] ?? "bg-zinc-800 text-zinc-300"}`}>
                {iss.severity === "ok" ? "OK" : iss.severity === "warning" ? "Aviso" : "Crítico"}
              </span>
              <span className="font-medium text-zinc-100">{iss.title}</span>
              <span className="ml-auto text-[11px] uppercase text-zinc-500">{iss.category}</span>
            </div>
            <p className="mt-1 text-xs text-zinc-400">{iss.message}</p>
          </div>
        ))}
        {issues.length === 0 && <p className="text-sm text-zinc-500">Sin diagnósticos.</p>}
      </div>
    </div>
  );
}
