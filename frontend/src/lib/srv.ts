import en from "../../messages/en.json";
import es from "../../messages/es.json";
import type { Locale } from "./locale";

type Dict = typeof en;

const dicts: Record<Locale, Dict> = { en, es };

/** Catálogo de textos de servidor (issues, APIs, IA) con tipos estrictos. */
export function srv(locale: Locale): Dict["srv"] {
  return (dicts[locale] ?? en).srv;
}

/** Rellena {vars} en plantillas. Subconjunto ICU suficiente para este uso. */
export function fill(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template;
  let s = template;
  for (const [k, v] of Object.entries(vars)) {
    s = s.split(`{${k}}`).join(String(v));
  }
  return s;
}
