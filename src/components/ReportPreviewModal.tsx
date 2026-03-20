"use client";

type Props = {
  open: boolean;
  title: string;
  text?: string;
  binary?: boolean;
  onClose: () => void;
};

export function ReportPreviewModal({ open, title, text, binary, onClose }: Props) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/50 p-4 sm:items-center">
      <div className="flex max-h-[90vh] w-full max-w-4xl flex-col rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-xl">
        <div className="flex items-center justify-between gap-2 border-b border-[var(--border)] px-4 py-3">
          <h3 className="truncate text-sm font-semibold">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-3 py-1 text-sm text-[var(--muted)] hover:bg-[var(--column)]"
          >
            Fermer
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto p-4">
          {binary ? (
            <p className="text-sm text-[var(--muted)]">
              Aperçu non disponible pour ce type de fichier. Utilisez <strong>Télécharger</strong>.
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
  const title = fileName ?? "Rapport";
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
    text: raw.length > max ? raw.slice(0, max) + "\n\n… (tronqué pour l’affichage)" : raw,
  };
}
