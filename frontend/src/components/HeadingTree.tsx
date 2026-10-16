"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import type { HeadingItem, HeadingsSummary } from "@/lib/types";

interface Props {
  headings: HeadingItem[];
  summary: HeadingsSummary;
}

export default function HeadingTree({ headings, summary }: Props) {
  const t = useTranslations("headings");
  const [open, setOpen] = useState(true);

  return (
    <div className="card">
      <button
        className="flex w-full items-center justify-between text-left"
        onClick={() => setOpen((v) => !v)}
      >
        <h3 className="text-sm font-semibold">
          {t("title")}
          <span className="ml-2 text-xs font-normal text-zinc-500">
            {t("counts", { h1: summary.h1_count, h2: summary.h2_count, h3: summary.h3_count })}
          </span>
        </h3>
        <span className="text-zinc-500">{open ? "▾" : "▸"}</span>
      </button>
      {open && (
        <ul className="mt-3 max-h-72 space-y-1 overflow-auto text-sm">
          {headings.length === 0 && (
            <li className="text-zinc-500">{t("empty")}</li>
          )}
          {headings.map((h, i) => (
            <li
              key={i}
              className="flex gap-2 rounded border border-line/60 px-2 py-1"
              style={{ marginLeft: h.level === "H1" ? 0 : h.level === "H2" ? 12 : 24 }}
            >
              <span
                className={
                  h.level === "H1"
                    ? "font-bold text-emerald-300"
                    : h.level === "H2"
                      ? "font-semibold text-sky-300"
                      : "text-zinc-400"
                }
              >
                {h.level}
              </span>
              <span className="truncate text-zinc-200" title={h.text}>
                {h.text}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
