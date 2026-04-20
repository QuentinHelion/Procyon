"use client";

import { useCallback, useEffect, useState } from "react";
import { useLocale } from "@/components/LocaleProvider";
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

function formatDate(iso: string, locale: "fr" | "en") {
  try {
    return new Date(iso).toLocaleString(locale === "fr" ? "fr-FR" : "en-US", {
      dateStyle: "short",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

export function ReportsArchiveView() {
  const { locale } = useLocale();
  const t = (en: string, fr: string) => (locale === "fr" ? fr : en);
  const [reports, setReports] = useState<ReportRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [deleteBusyId, setDeleteBusyId] = useState<string | null>(null);
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
      setErr(e instanceof Error ? e.message : locale === "fr" ? "Chargement impossible" : "Unable to load reports");
      setReports([]);
    } finally {
      setLoading(false);
    }
  }, [locale]);

  useEffect(() => {
    void load();
  }, [load]);

  async function consult(r: ReportRow) {
    if (!r.hasFile) return;
    try {
      const result = await fetchReportPreview(r.id, r.fileName);
      setPreview({ open: true, ...result });
    } catch (e) {
      setPreview({
        open: true,
        title: r.fileName ?? t("Report", "Rapport"),
        text: e instanceof Error ? e.message : t("Error", "Erreur"),
      });
    }
  }

  async function removeReport(r: ReportRow) {
    const ok = window.confirm(
      locale === "fr"
        ? `Supprimer le rapport "${r.fileName ?? "Sans nom"}" ?`
        : `Delete report "${r.fileName ?? "Untitled"}"?`,
    );
    if (!ok) return;
    setDeleteBusyId(r.id);
    setErr(null);
    try {
      const res = await fetch(`/api/reports/${r.id}`, { method: "DELETE" });
      await parseJson<{ ok: boolean }>(res);
      setReports((prev) => (prev ?? []).filter((x) => x.id !== r.id));
    } catch (e) {
      setErr(e instanceof Error ? e.message : t("Delete failed", "Suppression impossible"));
    } finally {
      setDeleteBusyId(null);
    }
  }

  return (
    <>
      <div className="mb-10 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--accent)]">
            {t("Archive", "Archives")}
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-[var(--text)] sm:text-3xl">
            {t("Imported reports", "Rapports importés")}
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[var(--muted)]">
            {t("Copies stored on server (", "Copies conservées sur le serveur (")}
            <code className="rounded-md bg-[var(--column)] px-1.5 py-0.5 text-xs font-mono text-[var(--text)]">
              REPORTS_DIR
            </code>
            {t(", default ", ", défaut ")}
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
          {t("Refresh", "Actualiser")}
        </button>
      </div>

      {err ? (
        <p className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-800 dark:text-red-200">
          {err}
        </p>
      ) : null}

      {loading ? (
        <p className="text-sm text-[var(--muted)]">{t("Loading...", "Chargement…")}</p>
      ) : reports?.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">{t("No import recorded yet.", "Aucun import enregistré pour l’instant.")}</p>
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
                    {r.fileName ?? t("Untitled", "Sans nom")}
                  </p>
                  <p className="mt-1 text-xs text-[var(--muted)]">
                    {t("Template:", "Modèle :")} {r.template.name} · {formatDate(r.createdAt, locale)} · {r.itemCount}{" "}
                    {t("linked vulnerability(ies)", "vulnérabilité(s) liée(s)")}
                  </p>
                  {!r.hasFile ? (
                    <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">
                      {t(
                        "File not retained (import predates archiving or write error).",
                        "Fichier non conservé (import antérieur à l’archivage ou erreur d’écriture).",
                      )}
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
                    {t("Preview", "Consulter")}
                  </button>
                  <a
                    href={r.hasFile ? `/api/reports/${r.id}/file?download=1` : undefined}
                    className={`ui-btn-secondary inline-flex items-center px-3 py-2 text-xs font-semibold ${
                      !r.hasFile ? "pointer-events-none opacity-40" : ""
                    }`}
                    {...(r.hasFile ? { download: true } : {})}
                  >
                    {t("Download", "Télécharger")}
                  </a>
                  <button
                    type="button"
                    onClick={() => void removeReport(r)}
                    disabled={deleteBusyId === r.id}
                    className="inline-flex items-center justify-center rounded-lg border border-red-500/30 bg-red-500/10 px-2.5 py-2 text-red-700 transition hover:bg-red-500/15 disabled:cursor-not-allowed disabled:opacity-40 dark:text-red-300"
                    title={t("Delete report", "Supprimer le rapport")}
                    aria-label={t("Delete report", "Supprimer le rapport")}
                  >
                    <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24" aria-hidden>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 7h12m-9 0V5.75A1.75 1.75 0 0 1 10.75 4h2.5A1.75 1.75 0 0 1 15 5.75V7m-7 0 1 11a2 2 0 0 0 2 1.8h2a2 2 0 0 0 2-1.8l1-11M10 11v5m4-5v5" />
                    </svg>
                  </button>
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
