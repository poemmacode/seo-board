import type { AIAnalysisResult, HeadingItem } from "./types";

const SYSTEM_PROMPT = `Eres un Arquitecto SEO Senior y especialista en Optimización para Motores de Respuesta (GEO/AEO).
Tu labor es analizar los datos de extracción on-page de una URL y proporcionar un informe estratégico en formato JSON estricto.

Debes responder ÚNICAMENTE con un objeto JSON válido, sin bloques de markdown adicionales (sin \`\`\`json ... \`\`\` ni comentarios), siguiendo esta estructura exacta:
{
  "search_intent": "Informacional | Comercial | Transaccional | Navegacional",
  "intent_explanation": "Explicación concisa (1-2 frases) del porqué de esta intención según el contenido analizado",
  "title_suggestions": [
    "Sugerencia 1 de Título optimizado (45-60 caracteres, con keyword y gancho de CTR)",
    "Sugerencia 2 alternativa enfocada en búsqueda semántica o de intención directa"
  ],
  "description_suggestions": [
    "Sugerencia 1 de Meta Descripción atractiva con llamada a la acción clara (130-155 caracteres)",
    "Sugerencia 2 orientada a resolver la intención del usuario para snippets enriquecidos"
  ],
  "content_evaluation": {
    "thin_content_risk": "Bajo | Moderado | Alto - motivo",
    "cannibalization_notes": "Advertencia breve sobre posibles riesgos de canibalización semántica",
    "strengths": [
      "Punto fuerte 1 del contenido",
      "Punto fuerte 2 del contenido"
    ]
  },
  "geo_aeo_recommendations": [
    "Recomendación 1 accionable para AEO (estructuración en listas, respuestas directas en párrafos iniciales, etc.)",
    "Recomendación 2 para citas de IA (Perplexity, ChatGPT Search, Gemini)",
    "Recomendación 3 de datos estructurados o formato conversacional"
  ]
}
`;

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

export async function analyzeAudit(input: AnalyzeInput): Promise<AIAnalysisResult> {
  const provider = (env("AI_PROVIDER", "openai") || "openai").toLowerCase();
  const { url, title, description, headings, contentSnippet, wordCount } = input;

  const hSummary = headings
    .slice(0, 15)
    .map((h) => `${h.level}: ${h.text}`)
    .join("\n");

  const userPrompt =
    `Analiza la siguiente página web:\n` +
    `- URL: ${url}\n` +
    `- Título actual (${(title ?? "").length} caracteres): ${title || "NO TIENE"}\n` +
    `- Meta Descripción (${(description ?? "").length} caracteres): ${description || "NO TIENE"}\n` +
    `- Total de palabras: ${wordCount}\n` +
    `- Estructura de Encabezados principales:\n${hSummary || "Sin encabezados detectados"}\n\n` +
    `- Fragmento de contenido textual:\n"""${contentSnippet.slice(0, 2000)}"""\n\n` +
    `Genera la respuesta en JSON estricto.`;

  if (provider === "openai" && !env("OPENAI_API_KEY")) {
    return heuristicAnalysis(url, title, wordCount, "openai");
  }
  if (provider === "anthropic" && !env("ANTHROPIC_API_KEY")) {
    return heuristicAnalysis(url, title, wordCount, "anthropic");
  }

  try {
    const raw =
      provider === "anthropic"
        ? await callAnthropic(userPrompt)
        : await callOpenAICompatible(userPrompt);
    return parseAIJson(raw);
  } catch (e) {
    const reason = e instanceof Error ? e.message.slice(0, 80) : String(e).slice(0, 80);
    return heuristicAnalysis(url, title, wordCount, `fallback (error: ${reason})`);
  }
}

async function callOpenAICompatible(userPrompt: string): Promise<string> {
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
      { role: "system", content: SYSTEM_PROMPT },
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

async function callAnthropic(userPrompt: string): Promise<string> {
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
      system: SYSTEM_PROMPT,
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
  reason: string
): AIAnalysisResult {
  const t = title || "Página sin título";
  const thinRisk = wordCount < 250 ? "Alto" : wordCount > 600 ? "Bajo" : "Moderado";
  return {
    search_intent: /guia|blog/i.test(url) ? "Informacional" : "Comercial",
    intent_explanation:
      `[Modo heurístico / Configurar ${reason} en variables de entorno]: ` +
      `La URL y el vocabulario extraído sugieren una intención orientada a búsqueda temática.`,
    title_suggestions: [
      `${t.slice(0, 45)} | Guía Definitiva y Consejos Clave`,
      `Mejores Prácticas: ${t.slice(0, 40)} (Edición Actualizada)`,
    ],
    description_suggestions: [
      `Descubre todo sobre ${t.slice(0, 40)}. Guía completa con ejemplos prácticos, respuestas rápidas y análisis detallado.`,
      `¿Buscas optimizar ${t.slice(0, 35)}? Aprende las claves esenciales para mejorar tus resultados paso a paso.`,
    ],
    content_evaluation: {
      thin_content_risk: `${thinRisk} (${wordCount} palabras detectadas)`,
      cannibalization_notes:
        "Asegurar que cada URL del dominio atienda a una palabra clave única en su H1 y Title.",
      strengths: [
        "Estructura identificable en el DOM",
        `Volumen de texto legible de ${wordCount} palabras`,
      ],
    },
    geo_aeo_recommendations: [
      "Formato Q&A: Añade una sección de Preguntas Frecuentes directas con schema FAQPage para ser citado por Perplexity y ChatGPT.",
      "Párrafo de Respuesta Inmediata: Inicia las secciones principales con una definición de 40-50 palabras antes de profundizar.",
      "Datos Estructurados Ricos: Implementa JSON-LD (Article, Product o Organization) para alimentar motores de búsqueda generativa.",
    ],
  };
}
