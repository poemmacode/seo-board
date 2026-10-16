"use client";

import { useTranslations } from "next-intl";

export default function PrintButton() {
  const t = useTranslations("print");
  return (
    <button onClick={() => window.print()} className="btn-primary print:hidden">
      {t("button")}
    </button>
  );
}
