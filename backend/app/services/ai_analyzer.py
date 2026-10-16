import json
import re
from typing import Dict, Any, Optional
from app.core.config import settings
from app.models.schemas import AIAnalysisResult


SYSTEM_PROMPT = """Eres un Arquitecto SEO Senior y especialista en Optimización para Motores de Respuesta (GEO/AEO).
Tu labor es analizar los datos de extracción on-page de una URL y proporcionar un informe estratégico en formato JSON estricto.

Debes responder ÚNICAMENTE con un objeto JSON válido, sin bloques de markdown adicionales (sin ```json ... ``` ni comentarios), siguiendo esta estructura exacta:
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
"""


class AIAnalyzerService:
    """
    Servicio agnóstico para análisis SEO mediante LLMs.
    Soporta OpenAI, Anthropic y modelos locales / compatibles (Ollama, vLLM, etc.).
    """

    async def analyze(
        self,
        url: str,
        title: Optional[str],
        description: Optional[str],
        headings_tree: list,
        content_snippet: str,
        word_count: int
    ) -> AIAnalysisResult:
        provider = (settings.AI_PROVIDER or "openai").lower()

        # Resumen estructurado para el prompt
        h_summary = [f"{h.get('level')}: {h.get('text')}" for h in headings_tree[:15]]
        headings_text = "\n".join(h_summary) if h_summary else "Sin encabezados detectados"

        user_prompt = f"""Analiza la siguiente página web:
- URL: {url}
- Título actual ({len(title or '')} caracteres): {title or 'NO TIENE'}
- Meta Descripción ({len(description or '')} caracteres): {description or 'NO TIENE'}
- Total de palabras: {word_count}
- Estructura de Encabezados principales:
{headings_text}

- Fragmento de contenido textual:
\"\"\"{content_snippet[:2000]}\"\"\"

Genera la respuesta en JSON estricto."""

        # Comprobación de claves y fallback informativo si no están configuradas
        if provider == "openai" and not settings.OPENAI_API_KEY:
            return self._generate_simulated_analysis(url, title, description, word_count, "openai")
        if provider == "anthropic" and not settings.ANTHROPIC_API_KEY:
            return self._generate_simulated_analysis(url, title, description, word_count, "anthropic")

        try:
            raw_response = ""
            if provider in ("openai", "openai_compatible", "ollama"):
                raw_response = await self._call_openai_compatible(user_prompt)
            elif provider == "anthropic":
                raw_response = await self._call_anthropic(user_prompt)
            else:
                raw_response = await self._call_openai_compatible(user_prompt)

            parsed = self._extract_json(raw_response)
            return AIAnalysisResult(**parsed)
        except Exception as e:
            # Fallback seguro en caso de corte de cuota o error temporal de API
            fallback = self._generate_simulated_analysis(
                url, title, description, word_count, f"fallback (error: {str(e)[:80]})"
            )
            return fallback

    async def _call_openai_compatible(self, user_prompt: str) -> str:
        from openai import AsyncOpenAI

        base_url = settings.OPENAI_BASE_URL
        api_key = settings.OPENAI_API_KEY

        if settings.AI_PROVIDER == "ollama":
            base_url = settings.OLLAMA_BASE_URL
            api_key = "ollama"

        client = AsyncOpenAI(api_key=api_key or "sk-dummy", base_url=base_url)

        response = await client.chat.completions.create(
            model=settings.AI_MODEL,
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": user_prompt}
            ],
            temperature=0.2,
            response_format={"type": "json_object"} if "gpt" in settings.AI_MODEL.lower() else None
        )
        return response.choices[0].message.content or "{}"

    async def _call_anthropic(self, user_prompt: str) -> str:
        from anthropic import AsyncAnthropic

        client = AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)
        response = await client.messages.create(
            model=settings.AI_MODEL if "claude" in settings.AI_MODEL else "claude-3-5-haiku-20241022",
            max_tokens=1500,
            system=SYSTEM_PROMPT,
            messages=[
                {"role": "user", "content": user_prompt}
            ],
            temperature=0.2
        )
        # Extraer texto de la respuesta
        text_blocks = [b.text for b in response.content if hasattr(b, "text")]
        return "".join(text_blocks)

    def _extract_json(self, raw: str) -> Dict[str, Any]:
        raw = raw.strip()
        # Si viene envuelto en markdown
        match = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", raw)
        if match:
            raw = match.group(1).strip()
        return json.loads(raw)

    def _generate_simulated_analysis(
        self,
        url: str,
        title: Optional[str],
        description: Optional[str],
        word_count: int,
        reason: str
    ) -> AIAnalysisResult:
        """
        Genera sugerencias calculadas heuristicamente si las credenciales de IA
        aún no han sido suministradas por el usuario en .env.
        """
        t = title or "Página sin título"
        thin_risk = "Alto" if word_count < 250 else "Bajo" if word_count > 600 else "Moderado"

        return AIAnalysisResult(
            search_intent="Informacional" if "guia" in url.lower() or "blog" in url.lower() else "Comercial",
            intent_explanation=(
                f"[Modo heurístico / Configurar {reason} en .env]: "
                f"La URL y el vocabulario extraído sugieren una intención orientada a búsqueda temática."
            ),
            title_suggestions=[
                f"{t[:45]} | Guía Definitiva y Consejos Clave",
                f"Mejores Prácticas: {t[:40]} (Edición Actualizada)"
            ],
            description_suggestions=[
                f"Descubre todo sobre {t[:40]}. Guía completa con ejemplos prácticos, respuestas rápidas y análisis detallado.",
                f"¿Buscas optimizar {t[:35]}? Aprende las claves esenciales para mejorar tus resultados paso a paso."
            ],
            content_evaluation={
                "thin_content_risk": f"{thin_risk} ({word_count} palabras detectadas)",
                "cannibalization_notes": "Asegurar que cada URL del dominio atienda a una palabra clave única en su H1 y Title.",
                "strengths": [
                    "Estructura identificable en el DOM",
                    f"Volumen de texto legible de {word_count} palabras"
                ]
            },
            geo_aeo_recommendations=[
                "Formato Q&A: Añade una sección de Preguntas Frecuentes directas con schema FAQPage para ser citado por Perplexity y ChatGPT.",
                "Párrafo de Respuesta Inmediata: Inicia las secciones principales con una definición de 40-50 palabras antes de profundizar.",
                "Datos Estructurados Ricos: Implementa JSON-LD (Article, Product o Organization) para alimentar motores de búsqueda generativa."
            ]
        )


ai_analyzer_service = AIAnalyzerService()
