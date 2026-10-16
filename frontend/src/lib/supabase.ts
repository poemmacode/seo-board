import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Cliente Supabase para uso exclusivo en servidor (Route Handlers).
 * Nunca importar desde componentes cliente: las env vars no son NEXT_PUBLIC.
 */
let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (client) return client;
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error(
      "Faltan SUPABASE_URL y SUPABASE_PUBLISHABLE_KEY en las variables de entorno."
    );
  }
  client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client;
}

export interface AuditRow {
  id: string;
  url: string;
  domain: string;
  status_code: number;
  response_time_ms: number;
  canonical_url: string | null;
  is_redirect: boolean;
  redirect_url: string | null;
  title: string | null;
  title_length: number;
  description: string | null;
  description_length: number;
  robots_meta: string | null;
  viewport_meta: string | null;
  open_graph: Record<string, string>;
  headings: Array<{ level: string; text: string }>;
  headings_summary: {
    h1_count: number;
    h2_count: number;
    h3_count: number;
    missing_h1: boolean;
    multiple_h1: boolean;
    h1_items: string[];
  };
  images_summary: {
    total: number;
    missing_alt_count: number;
    missing_alt_samples: Array<{ src: string; alt?: string | null }>;
  };
  links_summary: {
    internal_count: number;
    external_count: number;
    sample_internal: string[];
    sample_external: string[];
  };
  structured_data: {
    schemas_count: number;
    detected_types: string[];
    items: Array<Record<string, unknown>>;
  };
  content_stats: { word_count: number; reading_time_min: number; text_snippet: string };
  issues: Array<{ category: string; severity: string; title: string; message: string }>;
  ai_analysis: {
    search_intent: string;
    intent_explanation: string;
    title_suggestions: string[];
    description_suggestions: string[];
    content_evaluation: Record<string, unknown>;
    geo_aeo_recommendations: string[];
  } | null;
  created_at: string;
}
