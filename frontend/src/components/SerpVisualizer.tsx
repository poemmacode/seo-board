"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import type { AuditResponse } from "@/lib/types";

interface Props {
  audit: AuditResponse | null;
}

type Device = "desktop" | "mobile";

const TITLE_MAX = 60;
const DESC_MAX = 160;

function tone(len: number, min: number, max: number): string {
  if (len === 0) return "text-zinc-500";
  if (len >= min && len <= max) return "text-emerald-300";
  return "text-amber-300";
}

function domainOf(url: string, fallback: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url.replace(/^https?:\/\//, "").split("/")[0] || fallback;
  }
}

/** Previews how the page would look on Google and when shared (Open Graph). */
export default function SerpVisualizer({ audit }: Props) {
  const t = useTranslations("serp");
  const locale = useLocale();
  const fallbackDomain = locale === "es" ? "ejemplo.com" : "example.com";
  const fallbackUrl = locale === "es" ? "https://ejemplo.com/pagina" : "https://example.com/page";
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [description, setDescription] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [uploadPreview, setUploadPreview] = useState<string | null>(null);
  const [device, setDevice] = useState<Device>("desktop");

  useEffect(() => {
    return () => {
      if (uploadPreview) URL.revokeObjectURL(uploadPreview);
    };
  }, [uploadPreview]);

  const importFromAudit = () => {
    if (!audit) return;
    setTitle(audit.title ?? "");
    setUrl(audit.url);
    setDescription(audit.description ?? "");
    const ogImage = audit.open_graph["og:image"] ?? "";
    if (ogImage) setImageUrl(ogImage);
  };

  const clear = () => {
    setTitle("");
    setUrl("");
    setDescription("");
    setImageUrl("");
    if (uploadPreview) URL.revokeObjectURL(uploadPreview);
    setUploadPreview(null);
  };

  const onFile = (f: File | undefined) => {
    if (!f) return;
    if (uploadPreview) URL.revokeObjectURL(uploadPreview);
    setUploadPreview(URL.createObjectURL(f));
  };

  const domain = domainOf(url || fallbackUrl, fallbackDomain);
  const initial = (domain[0] ?? "E").toUpperCase();
  const shownTitle = title || t("titleFallback");
  const shownDesc = description || t("descFallback");
  const clippedTitle = shownTitle.length > TITLE_MAX ? `${shownTitle.slice(0, TITLE_MAX - 1)}…` : shownTitle;
  const clippedDesc = shownDesc.length > DESC_MAX ? `${shownDesc.slice(0, DESC_MAX - 1)}…` : shownDesc;
  const image = uploadPreview ?? imageUrl.trim();

  return (
    <div className="grid gap-4 lg:grid-cols-[340px_1fr]">
      <div className="card h-fit space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">{t("dataTitle")}</h3>
          <div className="flex gap-2">
            <button className="btn-ghost" onClick={importFromAudit} disabled={!audit}>
              {t("import")}
            </button>
            <button className="btn-ghost" onClick={clear}>
              {t("clear")}
            </button>
          </div>
        </div>
        <label className="block text-xs text-zinc-400">
          {t("titleLabel")}
          <input
            className="input-dark mt-1"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t("titlePlaceholder")}
            maxLength={120}
          />
          <span className={`mt-1 block text-[11px] ${tone(title.length, 45, 65)}`}>
            {t("titleHint", { n: title.length })}
          </span>
        </label>
        <label className="block text-xs text-zinc-400">
          {t("urlLabel")}
          <input
            className="input-dark mt-1"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder={t("urlPlaceholder")}
            inputMode="url"
            spellCheck={false}
          />
        </label>
        <label className="block text-xs text-zinc-400">
          {t("descLabel")}
          <textarea
            className="input-dark mt-1 min-h-20"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t("descPlaceholder")}
            maxLength={320}
          />
          <span className={`mt-1 block text-[11px] ${tone(description.length, 120, 160)}`}>
            {t("descHint", { n: description.length })}
          </span>
        </label>
        <label className="block text-xs text-zinc-400">
          {t("ogUrlLabel")}
          <input
            className="input-dark mt-1"
            value={imageUrl}
            onChange={(e) => setImageUrl(e.target.value)}
            placeholder={t("urlPlaceholder").replace(/\/[^/]*$/, "/og.jpg")}
            inputMode="url"
            spellCheck={false}
          />
        </label>
        <label className="block text-xs text-zinc-400">
          {t("uploadLabel")}
          <input
            type="file"
            accept="image/*"
            className="mt-1 block w-full text-xs text-zinc-300"
            onChange={(e) => onFile(e.target.files?.[0])}
          />
        </label>
        <div className="flex gap-2 pt-1">
          {(["desktop", "mobile"] as Device[]).map((d) => (
            <button
              key={d}
              onClick={() => setDevice(d)}
              className={`btn-ghost ${device === d ? "border-zinc-400 bg-zinc-800 text-zinc-100" : ""}`}
            >
              {d === "desktop" ? t("desktop") : t("mobile")}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-4">
        <div className="card">
          <h3 className="text-sm font-semibold">{t("googleTitle", { device: device === "desktop" ? t("desktop") : t("mobile") })}</h3>
          <div className={`mt-3 rounded-lg bg-[#202124] p-4 ${device === "mobile" ? "mx-auto max-w-[360px]" : ""}`}>
            <div className="flex items-center gap-2.5">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-zinc-600 text-sm text-white">
                {initial}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-xs text-[#dadce0]">{domain}</span>
                <span className="block truncate text-[11px] text-[#bdc1c6]">
                  {(url || fallbackUrl).replace(/^https?:\/\//, "")}
                </span>
              </span>
            </div>
            <p className="mt-1.5 cursor-pointer truncate text-lg leading-snug text-[#8ab4f8] hover:underline">
              {clippedTitle}
            </p>
            <p className="mt-1 text-[13px] leading-relaxed text-[#bdc1c6] [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2] overflow-hidden">
              {clippedDesc}
            </p>
            {(title.length > TITLE_MAX || description.length > DESC_MAX) && (
              <p className="mt-2 text-[11px] text-amber-300">
                {t("clipWarn")}
              </p>
            )}
          </div>
        </div>

        <div className="card">
          <h3 className="text-sm font-semibold">{t("ogCardTitle")}</h3>
          <div className="mt-3 max-w-[520px] overflow-hidden rounded-lg border border-line bg-ink">
            {image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={image} alt={t("ogImageAlt")} className="aspect-[1.91/1] w-full object-cover" />
            ) : (
              <div className="flex aspect-[1.91/1] w-full items-center justify-center text-xs text-zinc-600">
                {t("noImage")}
              </div>
            )}
            <div className="p-3">
              <p className="truncate text-[11px] uppercase text-zinc-500">{domain}</p>
              <p className="mt-0.5 truncate text-sm font-semibold text-zinc-100">{shownTitle}</p>
              <p className="mt-0.5 truncate text-xs text-zinc-400">{shownDesc}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
