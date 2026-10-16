import type { Locale } from "./locale";

function safe(iso: string | null | undefined, opts: Intl.DateTimeFormatOptions, locale: Locale): string {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat(locale, opts).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function formatDate(iso: string | null | undefined, locale: Locale): string {
  return safe(iso, { day: "numeric", month: "short", year: "numeric" }, locale);
}

export function formatDateTime(iso: string | null | undefined, locale: Locale): string {
  return safe(
    iso,
    { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" },
    locale
  );
}
