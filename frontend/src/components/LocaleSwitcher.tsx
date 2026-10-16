"use client";

import { useLocale, useTranslations } from "next-intl";

/** Alterna EN ↔ ES conservando la ruta (recarga completa, fiable en rutas dinámicas). */
export default function LocaleSwitcher() {
  const locale = useLocale();
  const t = useTranslations("locale");
  const target = locale === "en" ? "es" : "en";

  const onClick = () => {
    const { pathname, search, hash } = window.location;
    const stripped = pathname.replace(/^\/(en|es)(?=\/|$)/, "") || "/";
    const next = target === "en" ? stripped : `/es${stripped === "/" ? "" : stripped}`;
    document.cookie = `NEXT_LOCALE=${target}; path=/; max-age=31536000`;
    window.location.assign(next + search + hash);
  };

  return (
    <button
      onClick={onClick}
      title={t("switchTo")}
      aria-label={t("switchTo")}
      className="btn-ghost shrink-0 font-semibold tracking-wider"
    >
      {target === "es" ? t("switchToEs") : t("switchToEn")}
    </button>
  );
}
