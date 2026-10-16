"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import LocaleSwitcher from "./LocaleSwitcher";

interface Crumb {
  label: string;
  href?: string;
}

/** Breadcrumbs Home › Projects › … + language switcher. */
export default function TopNav({ trail }: { trail: Crumb[] }) {
  const t = useTranslations("topNav");
  return (
    <div className="mb-4 flex items-center justify-between gap-2">
      <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5 text-xs text-zinc-400">
        <Link href="/" className="hover:text-zinc-200">
          {t("home")}
        </Link>
        {trail.map((c, i) => (
          <span key={i} className="flex min-w-0 items-center gap-1.5">
            <span className="text-zinc-600">›</span>
            {c.href ? (
              <Link href={c.href} className="truncate hover:text-zinc-200">
                {c.label}
              </Link>
            ) : (
              <span className="truncate text-zinc-500">{c.label}</span>
            )}
          </span>
        ))}
      </nav>
      <LocaleSwitcher />
    </div>
  );
}
