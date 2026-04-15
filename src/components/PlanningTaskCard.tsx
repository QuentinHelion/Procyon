"use client";

import Link from "next/link";
import { toLocalDateKey } from "@/lib/planning-buckets";

export type PlanningVuln = {
  id: string;
  title: string;
  description: string | null;
  severity: "INFO" | "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  status: "TODO" | "IN_PROGRESS" | "DONE" | "ARCHIVE";
  dueAt: string | null;
  acknowledgedAt: string | null;
};

const severityLabel: Record<PlanningVuln["severity"], string> = {
  CRITICAL: "Critique",
  HIGH: "Élevée",
  MEDIUM: "Moyenne",
  LOW: "Faible",
  INFO: "Info",
};

const severityClass: Record<PlanningVuln["severity"], string> = {
  CRITICAL: "bg-red-600/15 text-red-700 dark:text-red-300",
  HIGH: "bg-orange-500/15 text-orange-800 dark:text-orange-200",
  MEDIUM: "bg-amber-500/15 text-amber-900 dark:text-amber-100",
  LOW: "bg-sky-500/15 text-sky-900 dark:text-sky-100",
  INFO: "bg-zinc-500/10 text-[var(--muted)]",
};

function toDateInputValue(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return toLocalDateKey(d);
}

type Props = {
  v: PlanningVuln;
  compact?: boolean;
  onPatchDue: (id: string, dateStr: string) => void;
  onPatchStatus: (id: string, status: PlanningVuln["status"]) => void;
  onPatchAck: (id: string, acknowledged: boolean) => void;
};

export function PlanningTaskCard({
  v,
  compact,
  onPatchDue,
  onPatchStatus,
  onPatchAck,
}: Props) {
  const dateVal = toDateInputValue(v.dueAt);
  const unacked = v.status !== "DONE" && v.status !== "ARCHIVE" && !v.acknowledgedAt;

  return (
    <div
      className={`rounded-[var(--radius-md)] border bg-[var(--surface)] p-3.5 shadow-[var(--shadow-sm)] ${
        unacked ? "border-amber-500/45 shadow-[0_0_0_1px_rgba(245,158,11,0.12)]" : "border-[var(--border)]"
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex rounded px-2 py-0.5 text-[10px] font-semibold uppercase ${severityClass[v.severity]}`}
            >
              {severityLabel[v.severity]}
            </span>
            <span className="text-[10px] text-[var(--muted)]">{v.status === "ARCHIVE" ? "ARCHIVÉE" : v.status.replace("_", " ")}</span>
            {unacked ? (
              <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-bold uppercase text-amber-800 dark:text-amber-200">
                Non acquittée
              </span>
            ) : v.acknowledgedAt ? (
              <span className="text-[9px] text-[var(--muted)]">
                Acquittée{" "}
                {new Date(v.acknowledgedAt).toLocaleDateString("fr-FR", {
                  day: "numeric",
                  month: "short",
                })}
              </span>
            ) : null}
          </div>
          <p className={`mt-1 font-medium text-[var(--text)] ${compact ? "text-xs line-clamp-2" : "text-sm"}`}>
            {v.title}
          </p>
          {!compact && v.description ? (
            <p className="mt-1 line-clamp-2 text-xs text-[var(--muted)]">{v.description}</p>
          ) : null}
        </div>
        <div className="flex flex-col items-stretch gap-1 sm:items-end">
          {!compact ? (
            <label className="flex items-center gap-2 text-[10px] text-[var(--muted)]">
              Échéance
              <input
                type="date"
                value={dateVal}
                onChange={(e) => onPatchDue(v.id, e.target.value)}
                className="rounded border border-[var(--border)] bg-[var(--bg)] px-2 py-1 text-xs text-[var(--text)]"
              />
            </label>
          ) : (
            <span className="text-[10px] text-[var(--muted)]">
              {v.dueAt
                ? new Date(v.dueAt).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })
                : "—"}
            </span>
          )}
          <div className="flex flex-wrap gap-1">
            {v.status !== "DONE" && v.status !== "ARCHIVE" ? (
              v.acknowledgedAt ? (
                <button
                  type="button"
                  onClick={() => onPatchAck(v.id, false)}
                  className="rounded border border-[var(--border)] px-2 py-0.5 text-[10px] hover:bg-[var(--column)]"
                >
                  Révoquer acquittement
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => onPatchAck(v.id, true)}
                  className="rounded border border-amber-600/40 bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-900 dark:text-amber-100"
                >
                  Acquitter
                </button>
              )
            ) : null}
            {v.status !== "IN_PROGRESS" && v.status !== "ARCHIVE" ? (
              <button
                type="button"
                onClick={() => onPatchStatus(v.id, "IN_PROGRESS")}
                className="rounded border border-[var(--border)] px-2 py-0.5 text-[10px] hover:bg-[var(--column)]"
              >
                En cours
              </button>
            ) : null}
            {v.status !== "DONE" && v.status !== "ARCHIVE" ? (
              <button
                type="button"
                onClick={() => onPatchStatus(v.id, "DONE")}
                className="rounded border border-[var(--border)] px-2 py-0.5 text-[10px] hover:bg-[var(--column)]"
              >
                Terminer
              </button>
            ) : v.status === "ARCHIVE" ? (
              <button
                type="button"
                onClick={() => onPatchStatus(v.id, "TODO")}
                className="rounded border border-[var(--border)] px-2 py-0.5 text-[10px] hover:bg-[var(--column)]"
              >
                Réactiver
              </button>
            ) : (
              <button
                type="button"
                onClick={() => onPatchStatus(v.id, "TODO")}
                className="rounded border border-[var(--border)] px-2 py-0.5 text-[10px] hover:bg-[var(--column)]"
              >
                Rouvrir
              </button>
            )}
            <Link
              href="/"
              className="rounded border border-transparent px-2 py-0.5 text-[10px] text-[var(--accent)] hover:underline"
            >
              Tableau
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
