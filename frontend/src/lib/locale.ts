export type Locale = "en" | "es";

export const LOCALES: Locale[] = ["en", "es"];
export const DEFAULT_LOCALE: Locale = "en";

export function resolveLocale(v: unknown): Locale {
  return v === "es" ? "es" : "en";
}

/** Locale para rutas API: ?lang=, si no Accept-Language, si no inglés. */
export function localeFromRequest(req: Request): Locale {
  try {
    const url = new URL(req.url);
    const q = url.searchParams.get("lang");
    if (q === "es" || q === "en") return q;
    const first = (req.headers.get("accept-language") ?? "").split(",")[0]?.trim().toLowerCase() ?? "";
    if (first === "es" || first.startsWith("es-")) return "es";
  } catch {
    /* noop */
  }
  return DEFAULT_LOCALE;
}
