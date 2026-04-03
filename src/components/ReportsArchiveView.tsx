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
      <div className="mb-10 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--accent)]">
            Archives
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-[var(--text)] sm:text-3xl">
            Rapports importés
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[var(--muted)]">
            Copies conservées sur le serveur (
            <code className="rounded-md bg-[var(--column)] px-1.5 py-0.5 text-xs font-mono text-[var(--text)]">
              REPORTS_DIR
            </code>
            , défaut{" "}
            <code className="rounded-md bg-[var(--column)] px-1.5 py-0.5 text-xs font-mono text-[var(--text)]">
              data/reports
            </code>
            ).
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="ui-btn-secondary self-start px-4 py-2.5 text-sm font-semibold"
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
            <li key={r.id} className="ui-card p-5 transition hover:border-[var(--border-strong)]">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <button
                  type="button"
                  className="min-w-0 text-left"
                  disabled={!r.hasFile}
                  onClick={() => (r.hasFile ? void consult(r) : undefined)}
                >
                  <p className="truncate text-sm font-semibold text-[var(--text)] underline decoration-dotted underline-offset-2 disabled:cursor-default disabled:no-underline">
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
                </button>
                <div className="flex shrink-0 flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={!r.hasFile}
                    onClick={() => void consult(r)}
                    className="ui-btn-secondary px-3 py-2 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Consulter
                  </button>
                  <a
                    href={r.hasFile ? `/api/reports/${r.id}/file?download=1` : undefined}
                    className={`ui-btn-secondary inline-flex items-center px-3 py-2 text-xs font-semibold ${
                      !r.hasFile ? "pointer-events-none opacity-40" : ""
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
