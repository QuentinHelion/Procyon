"use client";

import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";

type Severity = "INFO" | "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
type VulnStatus = "TODO" | "IN_PROGRESS" | "DONE";
type VulnSource = "MANUAL" | "IMPORT";

type Template = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  parserId: string;
  fileHint: string;
  isBuiltIn: boolean;
};

type Vuln = {
  id: string;
  title: string;
  description: string | null;
  severity: Severity;
  status: VulnStatus;
  source: VulnSource;
  externalRef: string | null;
  dueAt: string | null;
  acknowledgedAt: string | null;
  metadata: unknown;
  createdAt: string;
  updatedAt: string;
  importBatch: null | {
    template: { name: string; slug: string };
  };
};

const COLUMNS: { status: VulnStatus; label: string; hint: string }[] = [
  { status: "TODO", label: "À traiter", hint: "Comme la liste « Planifié » dans To Do" },
  { status: "IN_PROGRESS", label: "En cours", hint: "Analyse ou remédiation en cours" },
  { status: "DONE", label: "Terminé", hint: "Clos ou accepté" },
];

const SEVERITY_ORDER: Severity[] = ["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"];

const severityStyle: Record<Severity, string> = {
  CRITICAL: "bg-red-600/15 text-red-700 dark:text-red-300",
  HIGH: "bg-orange-500/15 text-orange-800 dark:text-orange-200",
  MEDIUM: "bg-amber-500/15 text-amber-900 dark:text-amber-100",
  LOW: "bg-sky-500/15 text-sky-900 dark:text-sky-100",
  INFO: "bg-zinc-500/10 text-[var(--muted)]",
};

const severityLabel: Record<Severity, string> = {
  CRITICAL: "Critique",
  HIGH: "Élevée",
  MEDIUM: "Moyenne",
  LOW: "Faible",
  INFO: "Info",
};

/** Bordure gauche carte = gravité immédiate */
const severityAccent: Record<Severity, string> = {
  CRITICAL: "border-l-4 border-l-red-500",
  HIGH: "border-l-4 border-l-amber-500",
  MEDIUM: "border-l-4 border-l-yellow-500",
  LOW: "border-l-4 border-l-sky-500",
  INFO: "border-l-4 border-l-slate-400 dark:border-l-slate-500",
};

function ColumnIcon({ status }: { status: VulnStatus }) {
  const c = "h-4 w-4 text-[var(--accent)]";
  if (status === "TODO") {
    return (
      <svg className={c} fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24" aria-hidden>
        <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
      </svg>
    );
  }
  if (status === "IN_PROGRESS") {
    return (
      <svg className={c} fill="currentColor" viewBox="0 0 24 24" aria-hidden>
        <path
          fillRule="evenodd"
          d="M4.5 5.653c0-1.427 1.529-2.33 2.779-1.643l11.54 6.347c1.295.712 1.295 2.573 0 3.286L7.279 20.99c-1.25.687-2.779-.217-2.779-1.643V5.653z"
          clipRule="evenodd"
        />
      </svg>
    );
  }
  return (
    <svg className={c} fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function isVulnStatus(id: string | number): id is VulnStatus {
  return id === "TODO" || id === "IN_PROGRESS" || id === "DONE";
}

function KanbanDroppableList({
  status,
  children,
}: {
  status: VulnStatus;
  children: ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  return (
    <ul
      ref={setNodeRef}
      className={`mt-2 flex flex-1 flex-col gap-2.5 overflow-y-auto p-2 transition-[background-color,box-shadow] ${
        isOver ? "rounded-xl bg-[var(--accent-subtle)]/50 ring-2 ring-[var(--accent)]/35" : ""
      }`}
    >
      {children}
    </ul>
  );
}

function DashboardDraggableVulnCard({
  v,
  patchAcknowledge,
  patchStatus,
  removeVuln,
  setError,
}: {
  v: Vuln;
  patchAcknowledge: (id: string, acknowledged: boolean) => Promise<void>;
  patchStatus: (id: string, status: VulnStatus) => Promise<void>;
  removeVuln: (id: string) => Promise<void>;
  setError: (msg: string | null) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: v.id,
    data: { status: v.status },
  });
  const style = { transform: CSS.Translate.toString(transform) };

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={`overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-sm)] ${severityAccent[v.severity]} ${
        isDragging ? "opacity-40" : ""
      }`}
    >
      <div className="flex">
        <button
          type="button"
          className="touch-manipulation shrink-0 cursor-grab border-r border-[var(--border)]/70 bg-[var(--surface-muted)]/60 px-2 pt-3 text-[var(--muted)] hover:bg-[var(--surface-muted)] hover:text-[var(--text)] active:cursor-grabbing"
          aria-label="Glisser la carte vers une autre colonne"
          {...listeners}
          {...attributes}
        >
          <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24" aria-hidden>
            <circle cx="9" cy="6" r="1.5" />
            <circle cx="15" cy="6" r="1.5" />
            <circle cx="9" cy="12" r="1.5" />
            <circle cx="15" cy="12" r="1.5" />
            <circle cx="9" cy="18" r="1.5" />
            <circle cx="15" cy="18" r="1.5" />
          </svg>
        </button>
        <div className="min-w-0 flex-1 px-3.5 pb-3 pt-3">
          <div className="flex items-start justify-between gap-2">
            <span
              className={`inline-flex shrink-0 rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${severityStyle[v.severity]}`}
            >
              {severityLabel[v.severity]}
            </span>
            <span className="rounded-md bg-[var(--column)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--muted)]">
              {v.source === "IMPORT" ? "Scan importé" : "Saisie manuelle"}
            </span>
          </div>
          {v.status !== "DONE" && !v.acknowledgedAt ? (
            <div className="mt-2 flex items-start gap-2 rounded-lg border border-amber-500/25 bg-amber-500/[0.08] px-2.5 py-2 dark:bg-amber-500/10">
              <svg
                className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                viewBox="0 0 24 24"
                aria-hidden
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
                />
              </svg>
              <p className="text-[11px] font-medium leading-snug text-amber-950 dark:text-amber-100">
                Action requise : enregistrer la <strong>prise de connaissance</strong> avant traitement.
              </p>
            </div>
          ) : v.acknowledgedAt ? (
            <p className="mt-2 flex items-center gap-1.5 text-[10px] text-[var(--muted)]">
              <svg className="h-3.5 w-3.5 text-[var(--accent)]" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Acquittée le{" "}
              {new Date(v.acknowledgedAt).toLocaleString("fr-FR", {
                dateStyle: "short",
                timeStyle: "short",
              })}
            </p>
          ) : null}
          <p className="mt-2.5 text-sm font-semibold leading-snug text-[var(--text)]">{v.title}</p>
          {v.description ? (
            <p className="mt-1.5 line-clamp-3 text-xs leading-relaxed text-[var(--muted)]">{v.description}</p>
          ) : null}
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-[var(--muted)]">
            {v.dueAt ? (
              <span className="inline-flex items-center gap-1 font-medium text-[var(--accent)]">
                <svg className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5a2.25 2.25 0 002.25-2.25m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5a2.25 2.25 0 012.25 2.25v7.5" />
                </svg>
                {new Date(v.dueAt).toLocaleDateString("fr-FR", {
                  weekday: "short",
                  day: "numeric",
                  month: "short",
                })}
              </span>
            ) : null}
            {v.importBatch?.template ? <span className="truncate">{v.importBatch.template.name}</span> : null}
          </div>
          <div
            className="mt-4 flex flex-col gap-2 border-t border-[var(--border)] pt-3"
            onPointerDown={(e) => e.stopPropagation()}
          >
            {v.status !== "DONE" && !v.acknowledgedAt ? (
              <button
                type="button"
                onClick={() => void patchAcknowledge(v.id, true)}
                className="w-full rounded-lg bg-gradient-to-r from-amber-500/90 to-amber-600/90 px-3 py-2 text-center text-xs font-semibold text-amber-950 shadow-sm transition hover:from-amber-500 hover:to-amber-600 dark:from-amber-400/90 dark:to-amber-500/90 dark:text-amber-950"
              >
                J’ai pris connaissance de l’alerte
              </button>
            ) : v.status !== "DONE" && v.acknowledgedAt ? (
              <button
                type="button"
                onClick={() => void patchAcknowledge(v.id, false)}
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-2 text-center text-xs font-medium text-[var(--muted)] transition hover:text-[var(--text)]"
              >
                Annuler l’acquittement
              </button>
            ) : null}
            <div className="flex flex-wrap gap-1.5">
              {COLUMNS.filter((c) => c.status !== v.status).map((c) => (
                <button
                  key={c.status}
                  type="button"
                  onClick={() => void patchStatus(v.id, c.status)}
                  className="rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] px-2.5 py-1.5 text-[11px] font-medium text-[var(--text)] transition hover:border-[var(--accent)] hover:bg-[var(--accent-subtle)]"
                >
                  {c.label}
                </button>
              ))}
              <button
                type="button"
                onClick={() => void removeVuln(v.id).catch((err) => setError(String(err)))}
                className="ml-auto rounded-lg px-2.5 py-1.5 text-[11px] font-medium text-red-600 hover:bg-red-500/10 dark:text-red-400"
              >
                Supprimer
              </button>
            </div>
          </div>
        </div>
      </div>
    </li>
  );
}

async function parseJson<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(typeof err.error === "string" ? err.error : res.statusText);
  }
  return res.json() as Promise<T>;
}

export function Dashboard() {
  const [vulns, setVulns] = useState<Vuln[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [addOpen, setAddOpen] = useState(false);
  const [addTitle, setAddTitle] = useState("");
  const [addDesc, setAddDesc] = useState("");
  const [addSeverity, setAddSeverity] = useState<Severity>("MEDIUM");
  const [addDue, setAddDue] = useState("");

  const [importSlug, setImportSlug] = useState("");
  const [importBusy, setImportBusy] = useState(false);
  const [importMsg, setImportMsg] = useState<string | null>(null);

  const [tplOpen, setTplOpen] = useState(false);
  const [tplName, setTplName] = useState("");
  const [tplSlug, setTplSlug] = useState("");
  const [tplParser, setTplParser] = useState("generic_csv");
  const [tplDesc, setTplDesc] = useState("");
  const [tplHint, setTplHint] = useState("*.csv");

  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  const load = useCallback(async () => {
    setError(null);
    try {
      const [v, t] = await Promise.all([
        parseJson<Vuln[]>(await fetch("/api/vulnerabilities")),
        parseJson<Template[]>(await fetch("/api/templates")),
      ]);
      setVulns(v);
      setTemplates(t);
      setImportSlug((prev) => prev || (t[0]?.slug ?? ""));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur de chargement");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const byStatus = useMemo(() => {
    const m = new Map<VulnStatus, Vuln[]>();
    for (const c of COLUMNS) m.set(c.status, []);
    for (const v of vulns) {
      const list = m.get(v.status);
      if (list) list.push(v);
    }
    for (const c of COLUMNS) {
      m.set(
        c.status,
        (m.get(c.status) ?? []).sort(
          (a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity),
        ),
      );
    }
    return m;
  }, [vulns]);

  const stats = useMemo(() => {
    const open = vulns.filter((v) => v.status !== "DONE");
    const unacked = open.filter((v) => !v.acknowledgedAt).length;
    const criticalOpen = open.filter((v) => v.severity === "CRITICAL").length;
    return {
      total: vulns.length,
      open: open.length,
      unacked,
      criticalOpen,
    };
  }, [vulns]);

  async function patchStatus(id: string, status: VulnStatus) {
    const res = await fetch(`/api/vulnerabilities/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    const updated = await parseJson<Vuln>(res);
    setVulns((prev) => prev.map((x) => (x.id === id ? updated : x)));
  }

  async function patchAcknowledge(id: string, acknowledged: boolean) {
    const res = await fetch(`/api/vulnerabilities/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ acknowledgedAt: acknowledged ? true : null }),
    });
    const updated = await parseJson<Vuln>(res);
    setVulns((prev) => prev.map((x) => (x.id === id ? updated : x)));
  }

  async function removeVuln(id: string) {
    const res = await fetch(`/api/vulnerabilities/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(typeof err.error === "string" ? err.error : "Suppression impossible");
    }
    setVulns((prev) => prev.filter((x) => x.id !== id));
  }

  async function submitAdd(e: React.FormEvent) {
    e.preventDefault();
    const dueIso =
      addDue.trim() === ""
        ? undefined
        : new Date(`${addDue}T12:00:00`).toISOString();
    if (addDue.trim() !== "" && Number.isNaN(new Date(dueIso!).getTime())) {
      setError("Date d’échéance invalide");
      return;
    }
    const res = await fetch("/api/vulnerabilities", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: addTitle,
        description: addDesc || undefined,
        severity: addSeverity,
        status: "TODO",
        ...(dueIso !== undefined ? { dueAt: dueIso } : {}),
      }),
    });
    const created = await parseJson<Vuln>(res);
    setVulns((prev) => [created, ...prev]);
    setAddOpen(false);
    setAddTitle("");
    setAddDesc("");
    setAddSeverity("MEDIUM");
    setAddDue("");
  }

  async function onImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !importSlug) return;
    setImportBusy(true);
    setImportMsg(null);
    try {
      const fd = new FormData();
      fd.set("file", file);
      fd.set("templateSlug", importSlug);
      const res = await fetch("/api/import", { method: "POST", body: fd });
      const data = await parseJson<{ created: number; updated: number; total: number }>(res);
      setImportMsg(`${data.created} créée(s), ${data.updated} mise(s) à jour (${data.total} au total).`);
      await load();
    } catch (err) {
      setImportMsg(err instanceof Error ? err.message : "Import échoué");
    } finally {
      setImportBusy(false);
    }
  }

  async function submitTemplate(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: tplName,
        slug: tplSlug,
        parserId: tplParser,
        description: tplDesc || undefined,
        fileHint: tplHint,
      }),
    });
    await parseJson<Template>(res);
    setTplOpen(false);
    setTplName("");
    setTplSlug("");
    setTplDesc("");
    setTplParser("generic_csv");
    setTplHint("*.csv");
    await load();
  }

  return (
    <div className="mx-auto max-w-[1480px] px-5 py-8 lg:px-10 lg:py-10">
      <header className="mb-8 flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--accent)]">
            Vue opérationnelle
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-[var(--text)] sm:text-3xl">
            Tableau de bord
          </h1>
          <p className="mt-2 max-w-lg text-sm leading-relaxed text-[var(--muted)]">
            Priorisez, acquittez et faites avancer les fiches — la gravité est sur le bord gauche. Glissez une
            carte depuis la poignée à gauche pour changer la colonne (statut).
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setAddOpen(true)}
            className="ui-btn-primary inline-flex items-center gap-2 px-4 py-2.5 text-sm shadow-sm"
          >
            <svg className="h-4 w-4 opacity-90" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Nouvelle fiche
          </button>
          <button
            type="button"
            onClick={() => setTplOpen(true)}
            className="ui-btn-secondary inline-flex items-center gap-2 px-4 py-2.5 text-sm"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25" />
            </svg>
            Modèle d’import
          </button>
        </div>
      </header>

      {!loading ? (
        <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="ui-card flex flex-col justify-center px-4 py-3.5">
            <p className="text-[11px] font-medium uppercase tracking-wide text-[var(--muted)]">Total</p>
            <p className="mt-0.5 text-2xl font-bold tabular-nums text-[var(--text)]">{stats.total}</p>
          </div>
          <div className="ui-card flex flex-col justify-center px-4 py-3.5">
            <p className="text-[11px] font-medium uppercase tracking-wide text-[var(--muted)]">Ouvertes</p>
            <p className="mt-0.5 text-2xl font-bold tabular-nums text-[var(--accent)]">{stats.open}</p>
          </div>
          <div className="ui-card flex flex-col justify-center border-amber-500/20 bg-amber-500/[0.06] px-4 py-3.5 dark:bg-amber-500/10">
            <p className="text-[11px] font-medium uppercase tracking-wide text-amber-800 dark:text-amber-200/90">
              À acquitter
            </p>
            <p className="mt-0.5 text-2xl font-bold tabular-nums text-amber-900 dark:text-amber-100">
              {stats.unacked}
            </p>
          </div>
          <div className="ui-card flex flex-col justify-center border-red-500/15 bg-red-500/[0.04] px-4 py-3.5 dark:bg-red-500/10">
            <p className="text-[11px] font-medium uppercase tracking-wide text-red-800/90 dark:text-red-200/80">
              Critiques ouvertes
            </p>
            <p className="mt-0.5 text-2xl font-bold tabular-nums text-red-700 dark:text-red-300">
              {stats.criticalOpen}
            </p>
          </div>
        </div>
      ) : null}

      <section className="ui-card relative mb-8 overflow-hidden p-5 lg:p-6">
        <div className="pointer-events-none absolute inset-y-0 right-0 w-32 bg-gradient-to-l from-[var(--accent-subtle)] to-transparent opacity-60" />
        <div className="relative flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="flex items-center gap-2 text-sm font-bold text-[var(--text)]">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--accent-subtle)] text-[var(--accent)]">
                <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                </svg>
              </span>
              Importer un rapport
            </h2>
            <p className="mt-2 max-w-xl text-xs leading-relaxed text-[var(--muted)]">
              Sélectionnez un modèle (PingCastle, CSV…), déposez le fichier : les vulnérabilités sont créées
              ou mises à jour automatiquement.
            </p>
          </div>
          <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center lg:w-auto">
            <select
              value={importSlug}
              onChange={(e) => setImportSlug(e.target.value)}
              className="ui-input w-full min-w-[12rem] px-3 py-2.5 text-sm lg:max-w-xs"
            >
              {templates.map((t) => (
                <option key={t.id} value={t.slug}>
                  {t.name} ({t.fileHint})
                </option>
              ))}
            </select>
            <label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-[var(--radius-md)] border border-dashed border-[var(--border-strong)] bg-[var(--surface-muted)] px-4 py-2.5 text-sm font-semibold text-[var(--text)] transition hover:border-[var(--accent)] hover:bg-[var(--accent-subtle)] sm:shrink-0">
              <svg className="h-4 w-4 text-[var(--accent)]" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M18.375 12.739l-7.693 7.693a4.5 4.5 0 01-6.364-6.364l10.94-10.94A3 3 0 1119.5 7.372L8.552 18.32m.009-.01l-.01.01m6.713-6.713l3-3" />
              </svg>
              <input
                type="file"
                className="hidden"
                disabled={importBusy || !importSlug}
                onChange={onImportFile}
              />
              {importBusy ? "Import en cours…" : "Parcourir les fichiers"}
            </label>
          </div>
        </div>
        {importMsg ? (
          <p className="relative mt-3 rounded-lg bg-[var(--column)] px-3 py-2 text-sm text-[var(--text)]">
            {importMsg}
          </p>
        ) : null}
      </section>

      {error ? (
        <p className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-800 dark:text-red-200">
          {error}
        </p>
      ) : null}

      {loading ? (
        <p className="text-sm text-[var(--muted)]">Chargement…</p>
      ) : (
        <DndContext
          sensors={sensors}
          onDragStart={({ active }) => setActiveDragId(String(active.id))}
          onDragCancel={() => setActiveDragId(null)}
          onDragEnd={(event) => {
            setActiveDragId(null);
            const { active, over } = event;
            if (!over || !isVulnStatus(over.id)) return;
            const vid = String(active.id);
            const item = vulns.find((x) => x.id === vid);
            if (!item || item.status === over.id) return;
            void patchStatus(vid, over.id).catch((e) =>
              setError(e instanceof Error ? e.message : String(e)),
            );
          }}
        >
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            {COLUMNS.map((col) => {
              const count = (byStatus.get(col.status) ?? []).length;
              return (
                <div
                  key={col.status}
                  className="flex min-h-[460px] flex-col rounded-2xl border border-[var(--border)] bg-[var(--surface-muted)]/80 p-1 shadow-[var(--shadow-sm)] backdrop-blur-sm dark:bg-[var(--surface-muted)]/40"
                >
                  <div className="flex items-start justify-between gap-2 rounded-xl bg-[var(--surface)]/90 px-4 py-3 dark:bg-[var(--surface)]/60">
                    <div className="flex min-w-0 items-start gap-3">
                      <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--accent-subtle)] text-[var(--accent)]">
                        <ColumnIcon status={col.status} />
                      </span>
                      <div>
                        <h2 className="text-sm font-bold text-[var(--text)]">{col.label}</h2>
                        <p className="mt-0.5 text-[11px] leading-snug text-[var(--muted)]">{col.hint}</p>
                      </div>
                    </div>
                    <span className="shrink-0 rounded-full bg-[var(--column)] px-2.5 py-0.5 text-center text-xs font-bold tabular-nums text-[var(--text)] ring-1 ring-[var(--border)]">
                      {count}
                    </span>
                  </div>
                  <KanbanDroppableList status={col.status}>
                    {(byStatus.get(col.status) ?? []).map((v) => (
                      <DashboardDraggableVulnCard
                        key={v.id}
                        v={v}
                        patchAcknowledge={patchAcknowledge}
                        patchStatus={patchStatus}
                        removeVuln={removeVuln}
                        setError={setError}
                      />
                    ))}
                  </KanbanDroppableList>
                </div>
              );
            })}
          </div>
          <DragOverlay dropAnimation={null}>
            {activeDragId ? (
              (() => {
                const av = vulns.find((x) => x.id === activeDragId);
                if (!av) return null;
                return (
                  <div
                    className={`max-w-[min(100vw-2rem,320px)] rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 shadow-xl ring-1 ring-black/5 dark:ring-white/10 ${severityAccent[av.severity]}`}
                  >
                    <p className="line-clamp-2 text-xs font-semibold text-[var(--text)]">{av.title}</p>
                  </div>
                );
              })()
            ) : null}
          </DragOverlay>
        </DndContext>
      )}

      {addOpen ? (
        <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/45 p-4 backdrop-blur-[2px] sm:items-center">
          <div
            className="ui-card w-full max-w-md p-6 shadow-xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="add-title"
          >
            <h2 id="add-title" className="text-lg font-bold text-[var(--text)]">
              Nouvelle vulnérabilité
            </h2>
            <form onSubmit={submitAdd} className="mt-4 flex flex-col gap-3">
              <label className="text-xs font-medium text-[var(--muted)]">
                Titre
                <input
                  required
                  value={addTitle}
                  onChange={(e) => setAddTitle(e.target.value)}
                  className="ui-input mt-1 w-full px-3 py-2.5 text-sm"
                />
              </label>
              <label className="text-xs font-medium text-[var(--muted)]">
                Description
                <textarea
                  value={addDesc}
                  onChange={(e) => setAddDesc(e.target.value)}
                  rows={3}
                  className="ui-input mt-1 w-full px-3 py-2.5 text-sm"
                />
              </label>
              <label className="text-xs font-medium text-[var(--muted)]">
                Sévérité
                <select
                  value={addSeverity}
                  onChange={(e) => setAddSeverity(e.target.value as Severity)}
                  className="ui-input mt-1 w-full px-3 py-2.5 text-sm"
                >
                  {SEVERITY_ORDER.map((s) => (
                    <option key={s} value={s}>
                      {severityLabel[s]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs font-medium text-[var(--muted)]">
                Échéance (optionnel)
                <input
                  type="date"
                  value={addDue}
                  onChange={(e) => setAddDue(e.target.value)}
                  className="ui-input mt-1 w-full px-3 py-2.5 text-sm"
                />
              </label>
              <div className="mt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setAddOpen(false)}
                  className="ui-btn-secondary px-4 py-2.5 text-sm text-[var(--muted)]"
                >
                  Annuler
                </button>
                <button type="submit" className="ui-btn-primary px-5 py-2.5 text-sm shadow-sm">
                  Créer
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {tplOpen ? (
        <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/45 p-4 backdrop-blur-[2px] sm:items-center">
          <div
            className="ui-card w-full max-w-md p-6 shadow-xl"
            role="dialog"
            aria-modal="true"
          >
            <h2 className="text-lg font-bold text-[var(--text)]">Nouveau modèle de scan</h2>
            <p className="mt-1 text-xs text-[var(--muted)]">
              Un modèle associe un nom convivial à un parseur déjà implémenté. Pour un nouvel outil,
              ajoutez un parseur dans le code puis enregistrez son identifiant ici.
            </p>
            <form onSubmit={submitTemplate} className="mt-4 flex flex-col gap-3">
              <label className="text-xs font-medium text-[var(--muted)]">
                Nom affiché
                <input
                  required
                  value={tplName}
                  onChange={(e) => setTplName(e.target.value)}
                  className="ui-input mt-1 w-full px-3 py-2.5 text-sm"
                />
              </label>
              <label className="text-xs font-medium text-[var(--muted)]">
                Slug (unique, minuscules)
                <input
                  required
                  value={tplSlug}
                  onChange={(e) => setTplSlug(e.target.value.toLowerCase())}
                  placeholder="mon-outil-export"
                  className="ui-input mt-1 w-full px-3 py-2.5 text-sm"
                />
              </label>
              <label className="text-xs font-medium text-[var(--muted)]">
                Parseur
                <select
                  value={tplParser}
                  onChange={(e) => {
                    setTplParser(e.target.value);
                    setTplHint(e.target.value === "pingcastle_xml" ? "*.xml" : "*.csv");
                  }}
                  className="ui-input mt-1 w-full px-3 py-2.5 text-sm"
                >
                  <option value="pingcastle_xml">PingCastle (XML)</option>
                  <option value="generic_csv">CSV générique</option>
                </select>
              </label>
              <label className="text-xs font-medium text-[var(--muted)]">
                Indication fichier
                <input
                  value={tplHint}
                  onChange={(e) => setTplHint(e.target.value)}
                  className="ui-input mt-1 w-full px-3 py-2.5 text-sm"
                />
              </label>
              <label className="text-xs font-medium text-[var(--muted)]">
                Description
                <textarea
                  value={tplDesc}
                  onChange={(e) => setTplDesc(e.target.value)}
                  rows={2}
                  className="ui-input mt-1 w-full px-3 py-2.5 text-sm"
                />
              </label>
              <div className="mt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setTplOpen(false)}
                  className="ui-btn-secondary px-4 py-2.5 text-sm text-[var(--muted)]"
                >
                  Annuler
                </button>
                <button type="submit" className="ui-btn-primary px-5 py-2.5 text-sm shadow-sm">
                  Enregistrer
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
