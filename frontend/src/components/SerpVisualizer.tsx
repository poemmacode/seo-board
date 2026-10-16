"use client";

import { useEffect, useState } from "react";
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

function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url.replace(/^https?:\/\//, "").split("/")[0] || "ejemplo.com";
  }
}

/** Previsualiza cómo se vería la página en Google y al compartir (Open Graph). */
export default function SerpVisualizer({ audit }: Props) {
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

  const domain = domainOf(url || "https://ejemplo.com/pagina");
  const initial = (domain[0] ?? "E").toUpperCase();
  const shownTitle = title || "Título de la página — aparecerá aquí";
  const shownDesc =
    description || "La meta descripción aparecerá aquí. Escribe arriba para previsualizar el snippet.";
  const clippedTitle = shownTitle.length > TITLE_MAX ? `${shownTitle.slice(0, TITLE_MAX - 1)}…` : shownTitle;
  const clippedDesc = shownDesc.length > DESC_MAX ? `${shownDesc.slice(0, DESC_MAX - 1)}…` : shownDesc;
  const image = uploadPreview ?? imageUrl.trim();

  return (
    <div className="grid gap-4 lg:grid-cols-[340px_1fr]">
      <div className="card h-fit space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Datos de la página</h3>
          <div className="flex gap-2">
            <button className="btn-ghost" onClick={importFromAudit} disabled={!audit}>
              Importar auditoría
            </button>
            <button className="btn-ghost" onClick={clear}>
              Limpiar
            </button>
          </div>
        </div>
        <label className="block text-xs text-zinc-400">
          Título (title)
          <input
            className="input-dark mt-1"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Guía definitiva de SEO on-page 2026"
            maxLength={120}
          />
          <span className={`mt-1 block text-[11px] ${tone(title.length, 45, 65)}`}>
            {title.length} caracteres · óptimo 45–65
          </span>
        </label>
        <label className="block text-xs text-zinc-400">
          URL
          <input
            className="input-dark mt-1"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://ejemplo.com/guia-seo"
            inputMode="url"
            spellCheck={false}
          />
        </label>
        <label className="block text-xs text-zinc-400">
          Meta descripción
          <textarea
            className="input-dark mt-1 min-h-20"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Aprende a optimizar…"
            maxLength={320}
          />
          <span className={`mt-1 block text-[11px] ${tone(description.length, 120, 160)}`}>
            {description.length} caracteres · óptimo 120–160
          </span>
        </label>
        <label className="block text-xs text-zinc-400">
          Imagen OG (URL)
          <input
            className="input-dark mt-1"
            value={imageUrl}
            onChange={(e) => setImageUrl(e.target.value)}
            placeholder="https://ejemplo.com/og.jpg"
            inputMode="url"
            spellCheck={false}
          />
        </label>
        <label className="block text-xs text-zinc-400">
          …o subir imagen
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
              {d === "desktop" ? "Escritorio" : "Móvil"}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-4">
        <div className="card">
          <h3 className="text-sm font-semibold">Google · {device === "desktop" ? "Escritorio" : "Móvil"}</h3>
          <div className={`mt-3 rounded-lg bg-[#202124] p-4 ${device === "mobile" ? "mx-auto max-w-[360px]" : ""}`}>
            <div className="flex items-center gap-2.5">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-zinc-600 text-sm text-white">
                {initial}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-xs text-[#dadce0]">{domain}</span>
                <span className="block truncate text-[11px] text-[#bdc1c6]">
                  {(url || "https://ejemplo.com/pagina").replace(/^https?:\/\//, "")}
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
                Google recortará el texto marcado con "…" — acórtalo para controlar el mensaje.
              </p>
            )}
          </div>
        </div>

        <div className="card">
          <h3 className="text-sm font-semibold">Al compartir · Open Graph</h3>
          <div className="mt-3 max-w-[520px] overflow-hidden rounded-lg border border-line bg-ink">
            {image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={image} alt="Vista previa OG" className="aspect-[1.91/1] w-full object-cover" />
            ) : (
              <div className="flex aspect-[1.91/1] w-full items-center justify-center text-xs text-zinc-600">
                Sin imagen — añade una URL o sube un archivo (recomendado 1200×630)
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
