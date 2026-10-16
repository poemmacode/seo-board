export interface HeadingItem {
  level: string;
  text: string;
}

export interface HeadingsSummary {
  h1_count: number;
  h2_count: number;
  h3_count: number;
  missing_h1: boolean;
  multiple_h1: boolean;
  h1_items: string[];
}

export interface ImageIssueItem {
  src: string;
  alt?: string | null;
}

export interface ImagesSummary {
  total: number;
  missing_alt_count: number;
  missing_alt_samples: ImageIssueItem[];
}

export interface LinksSummary {
  internal_count: number;
  external_count: number;
  sample_internal: string[];
  sample_external: string[];
}

export interface StructuredDataSummary {
  schemas_count: number;
  detected_types: string[];
  items: Record<string, unknown>[];
}

export interface ContentStats {
  word_count: number;
  reading_time_min: number;
  text_snippet: string;
}

export interface AuditIssue {
  category: string;
  severity: "ok" | "warning" | "critical" | string;
  title: string;
  message: string;
}

export interface AIAnalysisResult {
  search_intent: string;
  intent_explanation: string;
  title_suggestions: string[];
  description_suggestions: string[];
  content_evaluation: Record<string, unknown>;
  geo_aeo_recommendations: string[];
}

export interface AuditResponse {
  id: string;
  url: string;
  domain: string;
  status_code: number;
  response_time_ms: number;
  canonical_url?: string | null;
  is_redirect: boolean;
  redirect_url?: string | null;
  title?: string | null;
  title_length: number;
  description?: string | null;
  description_length: number;
  robots_meta?: string | null;
  viewport_meta?: string | null;
  open_graph: Record<string, string>;
  headings: HeadingItem[];
  headings_summary: HeadingsSummary;
  images_summary: ImagesSummary;
  links_summary: LinksSummary;
  structured_data: StructuredDataSummary;
  content_stats: ContentStats;
  issues: AuditIssue[];
  ai_analysis?: AIAnalysisResult | null;
  created_at: string;
}

export interface AuditSummary {
  id: string;
  url: string;
  domain: string;
  status_code: number;
  response_time_ms: number;
  title?: string | null;
  word_count: number;
  score: number;
  issues_critical_count: number;
  issues_warning_count: number;
  has_ai_analysis: boolean;
  created_at: string;
}
