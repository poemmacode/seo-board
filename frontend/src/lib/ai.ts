import type { AIAnalysisResult, HeadingItem } from "./types";
import type { Locale } from "./locale";
import { srv, fill } from "./srv";

export interface AnalyzeInput {
  url: string;
  title: string | null;
  description: string | null;
  headings: HeadingItem[];
  contentSnippet: string;
  wordCount: number;
}

function env(name: string, fallback = ""): string {
  return process.env[name] ?? fallback;
}

export async function analyzeAudit(input: AnalyzeInput, locale: Locale = "en"): Promise<AIAnalysisResult> {
  const A = srv(locale).ai;
  const SYSTEM_PROMPT = A.system;
  const provider = (env("AI_PROVIDER", "openai") || "openai").toLowerCase();
  const { url, title, description, headings, contentSnippet, wordCount } = input;

  const hSummary = headings
    .slice(0, 15)
    .map((h) => `${h.level}: ${h.text}`)
    .join("\n");

  const userPrompt =
    `${A.userIntro}\n` +
    fill(A.userUrl, { v: url }) + `\n` +
    fill(A.userTitle, { n: (title ?? "").length, v: title || A.noValue }) + `\n` +
    fill(A.userDesc, { n: (description ?? "").length, v: description || A.noValue }) + `\n` +
    fill(A.userWords, { n: wordCount }) + `\n` +
    `${A.userHeadings}\n${hSummary || A.userNoHeadings}\n\n` +
    `${A.userSnippet}\n"""${contentSnippet.slice(0, 2000)}"""\n\n` +
    A.userStrict;

  if (provider === "openai" && !env("OPENAI_API_KEY")) {
    return heuristicAnalysis(url, title, wordCount, "openai", locale);
  }
  if (provider === "anthropic" && !env("ANTHROPIC_API_KEY")) {
    return heuristicAnalysis(url, title, wordCount, "anthropic", locale);
  }

  try {
    const raw =
      provider === "anthropic"
        ? await callAnthropic(userPrompt, SYSTEM_PROMPT)
        : await callOpenAICompatible(userPrompt, SYSTEM_PROMPT);
    return parseAIJson(raw);
  } catch (e) {
    const reason = e instanceof Error ? e.message.slice(0, 80) : String(e).slice(0, 80);
    return heuristicAnalysis(url, title, wordCount, `fallback (error: ${reason})`, locale);
  }
}

async function callOpenAICompatible(userPrompt: string, systemPrompt: string): Promise<string> {
  const provider = (env("AI_PROVIDER", "openai") || "openai").toLowerCase();
  const baseUrl =
    provider === "ollama"
      ? env("OLLAMA_BASE_URL", "http://localhost:11434/v1")
      : env("OPENAI_BASE_URL", "https://api.openai.com/v1");
  const apiKey = provider === "ollama" ? "ollama" : env("OPENAI_API_KEY");
  const model = env("AI_MODEL", "gpt-4o-mini");

  const body: Record<string, unknown> = {
    model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    temperature: 0.2,
  };
  if (model.toLowerCase().includes("gpt")) {
    body.response_format = { type: "json_object" };
  }

  const res = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) {
    throw new Error(`Proveedor IA respondió ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  return data.choices?.[0]?.message?.content ?? "{}";
}

async function callAnthropic(userPrompt: string, systemPrompt: string): Promise<string> {
  const configured = env("AI_MODEL", "");
  const model = configured.toLowerCase().includes("claude")
    ? configured
    : "claude-3-5-haiku-20241022";

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": env("ANTHROPIC_API_KEY"),
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: 1500,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
      temperature: 0.2,
    }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) {
    throw new Error(`Anthropic respondió ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  const data = (await res.json()) as {
    content?: Array<{ type?: string; text?: string }>;
  };
  return (data.content ?? [])
    .filter((b) => typeof b.text === "string")
    .map((b) => b.text as string)
    .join("");
}

function parseAIJson(raw: string): AIAnalysisResult {
  let text = raw.trim();
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (fenced) text = fenced[1].trim();
  return JSON.parse(text) as AIAnalysisResult;
}

function heuristicAnalysis(
  url: string,
  title: string | null,
  wordCount: number,
  reason: string,
  locale: Locale = "en"
): AIAnalysisResult {
  const A = srv(locale).ai;
  const t = title || (locale === "es" ? "Página sin título" : "Untitled page");
  const thinRisk = wordCount < 250 ? A.heurLevelHigh : wordCount > 600 ? A.heurLevelLow : A.heurLevelMod;
  return {
    search_intent: /guia|guide|blog/i.test(url) ? A.heurIntentInfo : A.heurIntentComm,
    intent_explanation: fill(A.heurPrefix, { reason }) + A.heurExpl,
    title_suggestions: [
      fill(A.heurTitle1, { t: t.slice(0, 45) }),
      fill(A.heurTitle2, { t: t.slice(0, 40) }),
    ],
    description_suggestions: [
      fill(A.heurDesc1, { t: t.slice(0, 40) }),
      fill(A.heurDesc2, { t: t.slice(0, 35) }),
    ],
    content_evaluation: {
      thin_content_risk: fill(A.heurThin, { level: thinRisk, n: wordCount }),
      cannibalization_notes: A.heurCannib,
      strengths: [
        A.heurStrength1,
        fill(A.heurStrength2, { n: wordCount }),
      ],
    },
    geo_aeo_recommendations: [A.heurGeo1, A.heurGeo2, A.heurGeo3],
  };
}
