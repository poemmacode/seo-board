import { parse as parseDomain } from "psl";
import type { SupabaseClient } from "@supabase/supabase-js";

/** Dominio raíz eTLD+1: sub.dominio.com.mx -> dominio.com.mx */
export function rootDomain(hostname: string): string {
  const clean = hostname.toLowerCase().replace(/^www\./, "");
  const parsed = parseDomain(clean);
  if (!parsed.error && parsed.domain) return parsed.domain;
  const parts = clean.split(".");
  return parts.length > 2 ? parts.slice(-2).join(".") : clean;
}

export function domainSlug(domain: string): string {
  return domain
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export interface ProjectRef {
  id: string;
  slug: string;
}

/** Upsert del proyecto por dominio raíz. Nunca bloquea la auditoría: devuelve null si falla. */
export async function upsertProject(client: SupabaseClient, pageUrl: string): Promise<ProjectRef | null> {
  try {
    const hostname = new URL(pageUrl).hostname;
    const root = rootDomain(hostname);
    const { data, error } = await client
      .from("projects")
      .upsert({ slug: domainSlug(root), domain: root, root_domain: root }, { onConflict: "domain" })
      .select("id,slug")
      .single();
    if (error || !data) return null;
    return { id: (data as { id: string }).id, slug: (data as { slug: string }).slug };
  } catch {
    return null;
  }
}

export async function updateProjectStats(
  client: SupabaseClient,
  projectId: string,
  score: number
): Promise<void> {
  try {
    const { data } = await client.from("projects").select("audits_count").eq("id", projectId).single();
    const count = ((data as { audits_count?: number } | null)?.audits_count ?? 0) + 1;
    await client
      .from("projects")
      .update({ audits_count: count, last_score: score, last_audit_at: new Date().toISOString() })
      .eq("id", projectId);
  } catch {
    /* best-effort */
  }
}
