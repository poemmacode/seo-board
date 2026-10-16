"use client";

import { useState } from "react";

interface Props {
  loading: boolean;
  onSubmit: (url: string, includeAi: boolean) => void;
}

export default function AuditForm({ loading, onSubmit }: Props) {
  const [url, setUrl] = useState("");
  const [includeAi, setIncludeAi] = useState(true);

  return (
    <form
      className="flex flex-col gap-3 sm:flex-row sm:items-center"
      onSubmit={(e) => {
        e.preventDefault();
        if (url.trim()) onSubmit(url.trim(), includeAi);
      }}
    >
      <input
        className="input-dark flex-1"
        placeholder="https://ejemplo.com/pagina-a-auditar"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        inputMode="url"
        spellCheck={false}
      />
      <label className="flex items-center gap-2 text-xs text-zinc-400 whitespace-nowrap">
        <input
          type="checkbox"
          checked={includeAi}
          onChange={(e) => setIncludeAi(e.target.checked)}
          className="accent-zinc-100"
        />
        Incluir IA
      </label>
      <button type="submit" disabled={loading || !url.trim()} className="btn-primary">
        {loading ? "Analizando…" : "Analizar"}
      </button>
    </form>
  );
}
