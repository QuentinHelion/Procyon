"use client";

import { useEffect } from "react";
import { useLocale } from "@/components/LocaleProvider";

type Props = {
  open: boolean;
  title: string;
  text?: string;
  binary?: boolean;
  onClose: () => void;
};

export function ReportPreviewModal({ open, title, text, binary, onClose }: Props) {
  const { locale } = useLocale();
  const t = (en: string, fr: string) => (locale === "fr" ? fr : en);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, open]);

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-[110] flex items-end justify-center bg-black/50 p-4 backdrop-blur-[2px] sm:items-center"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="ui-card flex max-h-[90vh] w-full max-w-4xl flex-col shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="report-preview-title">
        <div className="flex items-center justify-between gap-2 border-b border-[var(--border)] px-4 py-3">
          <h3 id="report-preview-title" className="truncate text-sm font-semibold">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-3 py-1 text-sm text-[var(--muted)] hover:bg-[var(--column)]"
            aria-label={t("Close preview", "Fermer la prévisualisation")}
            autoFocus
          >
            {t("Close", "Fermer")}
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto p-4">
          {binary ? (
            <p className="text-sm text-[var(--muted)]">
              {t("Preview is not available for this file type. Use ", "Aperçu non disponible pour ce type de fichier. Utilisez ")}
              <strong>{t("Download", "Télécharger")}</strong>.
            </p>
          ) : (
            <pre className="whitespace-pre-wrap break-words font-mono text-xs text-[var(--text)]">
              {text ?? ""}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}

export async function fetchReportPreview(
  reportId: string,
  fileName: string | null,
): Promise<{ title: string; text?: string; binary?: boolean }> {
  const title = fileName ?? "Report";
  const res = await fetch(`/api/reports/${reportId}/file`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(typeof err.error === "string" ? err.error : res.statusText);
  }
  const ct = res.headers.get("Content-Type") ?? "";
  const textual =
    ct.includes("xml") || ct.includes("text") || ct.includes("json") || ct.includes("csv");
  if (!textual) {
    return { title, binary: true };
  }
  const raw = await res.text();
  const max = 800_000;
  return {
    title,
    text: raw.length > max ? raw.slice(0, max) + "\n\n… (truncated for preview)" : raw,
  };
}
