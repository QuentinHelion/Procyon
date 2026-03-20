"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchReportPreview, ReportPreviewModal } from "@/components/ReportPreviewModal";

export type ReportRow = {
  id: string;
  fileName: string | null;
  storedPath: string | null;
  hasFile: boolean;
  itemCount: number;
  createdAt: string;
  template: { name: string; slug: string };
};

async function parseJson<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(typeof err.error === "string" ? err.error : res.statusText);
  }
  return res.json() as Promise<T>;
}

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleString("fr-FR", {
      dateStyle: "short",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

export function ReportsArchiveView() {
  const [reports, setReports] = useState<ReportRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [preview, setPreview] = useState<{
    open: boolean;
    title: string;
    text?: string;
    binary?: boolean;
  }>({ open: false, title: "" });

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const data = await parseJson<ReportRow[]>(await fetch("/api/reports"));
      setReports(data);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Chargement impossible");
      setReports([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!preview.open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPreview((p) => ({ ...p, open: false }));
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [preview.open]);

  async function consult(r: ReportRow) {
    if (!r.hasFile) return;
    try {
      const result = await fetchReportPreview(r.id, r.fileName);
      setPreview({ open: true, ...result });
    } catch (e) {
      setPreview({
        open: true,
        title: r.fileName ?? "Rapport",
        text: e instanceof Error ? e.message : "Erreur",
      });
    }
  }

  return (
    <>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Rapports archivés</h1>
          <p className="mt-1 max-w-2xl text-sm text-[var(--muted)]">
            Copie de chaque fichier importé conservée sur le serveur (répertoire défini par{" "}
            <code className="rounded bg-[var(--column)] px-1 text-xs">REPORTS_DIR</code>, par défaut{" "}
            <code className="rounded bg-[var(--column)] px-1 text-xs">data/reports</code>).
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="self-start rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-2 text-sm font-medium hover:bg-[var(--column)]"
        >
          Actualiser
        </button>
      </div>

      {err ? (
        <p className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-800 dark:text-red-200">
          {err}
        </p>
      ) : null}

      {loading ? (
        <p className="text-sm text-[var(--muted)]">Chargement…</p>
      ) : reports?.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">Aucun import enregistré pour l’instant.</p>
      ) : (
        <ul className="space-y-3">
          {reports?.map((r) => (
            <li
              key={r.id}
              className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-sm"
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-[var(--text)]">
                    {r.fileName ?? "Sans nom"}
                  </p>
                  <p className="mt-1 text-xs text-[var(--muted)]">
                    Modèle : {r.template.name} · {formatDate(r.createdAt)} · {r.itemCount} vulnérabilité(s)
                    liée(s)
                  </p>
                  {!r.hasFile ? (
                    <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">
                      Fichier non conservé (import antérieur à l’archivage ou erreur d’écriture).
                    </p>
                  ) : null}
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={!r.hasFile}
                    onClick={() => void consult(r)}
                    className="rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Consulter
                  </button>
                  <a
                    href={r.hasFile ? `/api/reports/${r.id}/file?download=1` : undefined}
                    className={`inline-flex items-center rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-xs font-medium ${
                      !r.hasFile ? "pointer-events-none opacity-40" : "hover:bg-[var(--column)]"
                    }`}
                    {...(r.hasFile ? { download: true } : {})}
                  >
                    Télécharger
                  </a>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      <ReportPreviewModal
        open={preview.open}
        title={preview.title}
        text={preview.text}
        binary={preview.binary}
        onClose={() => setPreview((p) => ({ ...p, open: false }))}
      />
    </>
  );
}
