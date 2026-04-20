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
type VulnStatus = "TODO" | "IN_PROGRESS" | "DONE" | "ARCHIVE";
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
  { status: "ARCHIVE", label: "Acquitté", hint: "Alertes acquittées et inactives" },
];

const SEVERITY_ORDER: Severity[] = ["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"];
const KANBAN_VISIBLE_COLUMNS_KEY = "procyon-kanban-visible-columns";
const KANBAN_COLUMN_FILTERS_KEY = "procyon-kanban-column-filters";
const KANBAN_VISIBLE_METRICS_KEY = "procyon-kanban-visible-metrics";
type MetricCardId = "total" | "open" | "inProgress" | "criticalOpen" | "acknowledged";
const SENTINELONE_TEMPLATE_SLUG = "sentinelone-ispm-api";
const KANBAN_CATEGORY_FILTERS_KEY = "procyon-kanban-category-filters";
const KANBAN_SORT_KEY = "procyon-kanban-sort";
type ImportPreviewAction = "create" | "update" | "skip";
type ImportPreviewItem = {
  title: string;
  severity: Severity;
  externalRef: string | null;
  action: ImportPreviewAction;
};
type VulnCategory = "MANUAL" | "PINGCASTLE" | "GENERIC_CSV" | "SENTINELONE_ISPM" | "OTHER";
type KanbanSort = "severity_desc" | "severity_asc" | "created_desc" | "created_asc" | "due_asc" | "due_desc";

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
  if (status === "ARCHIVE") {
    return (
      <svg className={c} fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24" aria-hidden>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 7.5h18M6 7.5v11.25A2.25 2.25 0 008.25 21h7.5A2.25 2.25 0 0018 18.75V7.5M9.75 11.25h4.5" />
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
  return id === "TODO" || id === "IN_PROGRESS" || id === "DONE" || id === "ARCHIVE";
}

function vulnCategory(v: Vuln): VulnCategory {
  if (v.source === "MANUAL") return "MANUAL";
  const meta = (v.metadata && typeof v.metadata === "object" ? v.metadata : {}) as Record<string, unknown>;
  const templateSlug =
    typeof meta.templateSlug === "string" ? meta.templateSlug : "";
  const provider = typeof meta.provider === "string" ? meta.provider : "";
  if (provider === "sentinelone_ispm" || templateSlug === SENTINELONE_TEMPLATE_SLUG) return "SENTINELONE_ISPM";
  if (templateSlug === "pingcastle-xml") return "PINGCASTLE";
  if (templateSlug === "generic-csv") return "GENERIC_CSV";
  return "OTHER";
}

const CATEGORY_LABEL: Record<VulnCategory, string> = {
  MANUAL: "Manuel",
  PINGCASTLE: "PingCastle",
  GENERIC_CSV: "CSV générique",
  SENTINELONE_ISPM: "SentinelOne ISPM",
  OTHER: "Autre import",
};

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
  onEdit,
}: {
  v: Vuln;
  patchAcknowledge: (id: string, acknowledged: boolean) => Promise<void>;
  patchStatus: (id: string, status: VulnStatus) => Promise<void>;
  onEdit: (v: Vuln) => void;
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
            <div className="flex items-center gap-1.5">
              <span className="rounded-md bg-[var(--column)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--muted)]">
                {v.source === "IMPORT" ? "Scan importé" : "Saisie manuelle"}
              </span>
              <button
                type="button"
                onClick={() => onEdit(v)}
                className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface-muted)] text-[var(--muted)] transition hover:border-[var(--accent)] hover:bg-[var(--accent-subtle)] hover:text-[var(--text)]"
                aria-label="Modifier la fiche"
              >
                <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M16.862 4.487 19.5 7.125m-2.638-2.638L9.75 14.25 7.5 16.5l-.75 2.25 2.25-.75 2.25-2.25 7.112-7.113a1.875 1.875 0 0 0 0-2.651 1.875 1.875 0 0 0-2.651 0Z"
                  />
                </svg>
              </button>
            </div>
          </div>
          {v.acknowledgedAt ? (
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
            <p className="mt-1.5 whitespace-pre-line break-words text-xs leading-relaxed text-[var(--muted)]">{v.description}</p>
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
            {v.status === "ARCHIVE" ? (
              <button
                type="button"
                onClick={() => void patchAcknowledge(v.id, false)}
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-2 text-center text-xs font-medium text-[var(--muted)] transition hover:text-[var(--text)]"
              >
                Réactiver l’alerte
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
            <label className="flex items-center gap-2 text-[11px] text-[var(--muted)]">
              <span className="shrink-0">Statut</span>
              <select
                value={v.status}
                onChange={(e) => void patchStatus(v.id, e.target.value as VulnStatus)}
                className="ui-input min-w-0 flex-1 px-2 py-1.5 text-[11px]"
              >
                {COLUMNS.map((c) => (
                  <option key={c.status} value={c.status}>
                    {c.label}
                  </option>
                ))}
              </select>
            </label>
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

  const [editOpen, setEditOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Vuln | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editSeverity, setEditSeverity] = useState<Severity>("MEDIUM");
  const [editStatus, setEditStatus] = useState<VulnStatus>("TODO");
  const [editDue, setEditDue] = useState("");
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const [importSlug, setImportSlug] = useState("");
  const [importBusy, setImportBusy] = useState(false);
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [s1TenantUrl, setS1TenantUrl] = useState("");
  const [s1Token, setS1Token] = useState("");
  const [s1SiteIds, setS1SiteIds] = useState("");
  const [s1Busy, setS1Busy] = useState(false);
  const [selectedImportFile, setSelectedImportFile] = useState<File | null>(null);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [importPreviewKind, setImportPreviewKind] = useState<"file" | "sentinelone" | null>(null);
  const [importPreviewItems, setImportPreviewItems] = useState<ImportPreviewItem[]>([]);
  const [importPreviewTotal, setImportPreviewTotal] = useState(0);
  const [importPreviewCreateCount, setImportPreviewCreateCount] = useState(0);
  const [importPreviewSecondaryCount, setImportPreviewSecondaryCount] = useState(0);
  const isSentineloneImport = importSlug === SENTINELONE_TEMPLATE_SLUG;

  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  useEffect(() => {
    if (!addOpen && !editOpen && !importOpen && !deleteConfirmOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (deleteConfirmOpen) {
        setDeleteConfirmOpen(false);
        return;
      }
      if (importOpen) {
        setImportOpen(false);
        return;
      }
      if (editOpen) {
        setEditOpen(false);
        setEditTarget(null);
        return;
      }
      if (addOpen) setAddOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [addOpen, deleteConfirmOpen, editOpen, importOpen]);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [v, t] = await Promise.all([
        parseJson<Vuln[]>(await fetch("/api/vulnerabilities")),
        parseJson<Template[]>(await fetch("/api/templates")),
      ]);
      setVulns(v);
      setTemplates(t);
      setImportSlug((prev) => prev || (t[0]?.slug ?? SENTINELONE_TEMPLATE_SLUG));
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
    return m;
  }, [vulns]);

  const stats = useMemo(() => {
    const open = vulns.filter((v) => v.status !== "DONE" && v.status !== "ARCHIVE");
    const inProgress = vulns.filter((v) => v.status === "IN_PROGRESS").length;
    const criticalOpen = open.filter((v) => v.severity === "CRITICAL").length;
    return {
      total: vulns.length,
      open: open.length,
      inProgress,
      criticalOpen,
    };
  }, [vulns]);

  const [visibleStatuses, setVisibleStatuses] = useState<Record<VulnStatus, boolean>>({
    TODO: true,
    IN_PROGRESS: true,
    DONE: true,
    ARCHIVE: false,
  });
  const [showColumnSettings, setShowColumnSettings] = useState(false);
  const [showMetricsSettings, setShowMetricsSettings] = useState(false);
  const [columnSeverityFilters, setColumnSeverityFilters] = useState<
    Record<VulnStatus, Record<Severity, boolean>>
  >({
    TODO: { CRITICAL: true, HIGH: true, MEDIUM: true, LOW: true, INFO: true },
    IN_PROGRESS: { CRITICAL: true, HIGH: true, MEDIUM: true, LOW: true, INFO: true },
    DONE: { CRITICAL: true, HIGH: true, MEDIUM: true, LOW: true, INFO: true },
    ARCHIVE: { CRITICAL: true, HIGH: true, MEDIUM: true, LOW: true, INFO: true },
  });
  const [visibleMetrics, setVisibleMetrics] = useState<Record<MetricCardId, boolean>>({
    total: true,
    open: true,
    inProgress: true,
    criticalOpen: true,
    acknowledged: true,
  });
  const [categoryFilters, setCategoryFilters] = useState<Record<VulnCategory, boolean>>({
    MANUAL: true,
    PINGCASTLE: true,
    GENERIC_CSV: true,
    SENTINELONE_ISPM: true,
    OTHER: true,
  });
  const [kanbanSort, setKanbanSort] = useState<KanbanSort>("severity_desc");

  useEffect(() => {
    try {
      const rawColumns = localStorage.getItem(KANBAN_VISIBLE_COLUMNS_KEY);
      if (rawColumns) {
        const parsed = JSON.parse(rawColumns) as Partial<Record<VulnStatus, boolean>>;
        const next: Record<VulnStatus, boolean> = {
          TODO: parsed.TODO ?? true,
          IN_PROGRESS: parsed.IN_PROGRESS ?? true,
          DONE: parsed.DONE ?? true,
          ARCHIVE: parsed.ARCHIVE ?? false,
        };
        if (Object.values(next).some(Boolean)) setVisibleStatuses(next);
      }
    } catch {
      // ignore corrupted localStorage
    }

    try {
      const rawFilters = localStorage.getItem(KANBAN_COLUMN_FILTERS_KEY);
      if (rawFilters) {
        const parsed = JSON.parse(rawFilters) as Partial<Record<VulnStatus, Partial<Record<Severity, boolean>>>>;
        const defaultFilter: Record<Severity, boolean> = {
          CRITICAL: true,
          HIGH: true,
          MEDIUM: true,
          LOW: true,
          INFO: true,
        };
        const merged: Record<VulnStatus, Record<Severity, boolean>> = {
          TODO: { ...defaultFilter, ...(parsed.TODO ?? {}) },
          IN_PROGRESS: { ...defaultFilter, ...(parsed.IN_PROGRESS ?? {}) },
          DONE: { ...defaultFilter, ...(parsed.DONE ?? {}) },
          ARCHIVE: { ...defaultFilter, ...(parsed.ARCHIVE ?? {}) },
        };
        setColumnSeverityFilters(merged);
      }
    } catch {
      // ignore corrupted localStorage
    }

    try {
      const rawMetrics = localStorage.getItem(KANBAN_VISIBLE_METRICS_KEY);
      if (rawMetrics) {
        const parsed = JSON.parse(rawMetrics) as Partial<Record<MetricCardId, boolean>>;
        const next: Record<MetricCardId, boolean> = {
          total: parsed.total ?? true,
          open: parsed.open ?? true,
          inProgress: parsed.inProgress ?? true,
          criticalOpen: parsed.criticalOpen ?? true,
          acknowledged: parsed.acknowledged ?? true,
        };
        if (Object.values(next).some(Boolean)) setVisibleMetrics(next);
      }
    } catch {
      // ignore corrupted localStorage
    }

    try {
      const rawCategories = localStorage.getItem(KANBAN_CATEGORY_FILTERS_KEY);
      if (rawCategories) {
        const parsed = JSON.parse(rawCategories) as Partial<Record<VulnCategory, boolean>>;
        const next: Record<VulnCategory, boolean> = {
          MANUAL: parsed.MANUAL ?? true,
          PINGCASTLE: parsed.PINGCASTLE ?? true,
          GENERIC_CSV: parsed.GENERIC_CSV ?? true,
          SENTINELONE_ISPM: parsed.SENTINELONE_ISPM ?? true,
          OTHER: parsed.OTHER ?? true,
        };
        if (Object.values(next).some(Boolean)) setCategoryFilters(next);
      }
    } catch {
      // ignore corrupted localStorage
    }

    try {
      const rawSort = localStorage.getItem(KANBAN_SORT_KEY);
      if (
        rawSort === "severity_desc" ||
        rawSort === "severity_asc" ||
        rawSort === "created_desc" ||
        rawSort === "created_asc" ||
        rawSort === "due_asc" ||
        rawSort === "due_desc"
      ) {
        setKanbanSort(rawSort);
      }
    } catch {
      // ignore corrupted localStorage
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(KANBAN_VISIBLE_COLUMNS_KEY, JSON.stringify(visibleStatuses));
  }, [visibleStatuses]);

  useEffect(() => {
    localStorage.setItem(KANBAN_COLUMN_FILTERS_KEY, JSON.stringify(columnSeverityFilters));
  }, [columnSeverityFilters]);

  useEffect(() => {
    localStorage.setItem(KANBAN_VISIBLE_METRICS_KEY, JSON.stringify(visibleMetrics));
  }, [visibleMetrics]);
  useEffect(() => {
    localStorage.setItem(KANBAN_CATEGORY_FILTERS_KEY, JSON.stringify(categoryFilters));
  }, [categoryFilters]);
  useEffect(() => {
    localStorage.setItem(KANBAN_SORT_KEY, kanbanSort);
  }, [kanbanSort]);

  const acknowledgedCount = useMemo(() => vulns.filter((v) => v.status === "ARCHIVE").length, [vulns]);

  function toggleMetricVisibility(metric: MetricCardId) {
    setVisibleMetrics((prev) => {
      const next = { ...prev, [metric]: !prev[metric] };
      if (!Object.values(next).some(Boolean)) return prev;
      return next;
    });
  }

  function toggleCategoryFilter(category: VulnCategory) {
    setCategoryFilters((prev) => {
      const next = { ...prev, [category]: !prev[category] };
      if (!Object.values(next).some(Boolean)) return prev;
      return next;
    });
  }

  function compareVulns(a: Vuln, b: Vuln): number {
    if (kanbanSort === "severity_desc") {
      return SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity);
    }
    if (kanbanSort === "severity_asc") {
      return SEVERITY_ORDER.indexOf(b.severity) - SEVERITY_ORDER.indexOf(a.severity);
    }
    if (kanbanSort === "created_asc") {
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    }
    if (kanbanSort === "created_desc") {
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    }
    if (kanbanSort === "due_asc") {
      const ad = a.dueAt ? new Date(a.dueAt).getTime() : Number.POSITIVE_INFINITY;
      const bd = b.dueAt ? new Date(b.dueAt).getTime() : Number.POSITIVE_INFINITY;
      return ad - bd;
    }
    const ad = a.dueAt ? new Date(a.dueAt).getTime() : Number.NEGATIVE_INFINITY;
    const bd = b.dueAt ? new Date(b.dueAt).getTime() : Number.NEGATIVE_INFINITY;
    return bd - ad;
  }

  function toggleSeverityForColumn(status: VulnStatus, severity: Severity) {
    setColumnSeverityFilters((prev) => {
      const next = {
        ...prev,
        [status]: {
          ...prev[status],
          [severity]: !prev[status][severity],
        },
      };
      if (!Object.values(next[status]).some(Boolean)) return prev;
      return next;
    });
  }

  function toggleStatusVisibility(status: VulnStatus) {
    setVisibleStatuses((prev) => {
      const next = { ...prev, [status]: !prev[status] };
      if (!next.TODO && !next.IN_PROGRESS && !next.DONE && !next.ARCHIVE) {
        return prev;
      }
      return next;
    });
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

  async function confirmDeleteFromEdit() {
    if (!editTarget || deleteBusy) return;
    setDeleteBusy(true);
    setError(null);
    try {
      await removeVuln(editTarget.id);
      setDeleteConfirmOpen(false);
      setEditOpen(false);
      setEditTarget(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Suppression impossible");
    } finally {
      setDeleteBusy(false);
    }
  }

  function openEdit(v: Vuln) {
    setEditTarget(v);
    setEditTitle(v.title);
    setEditDesc(v.description ?? "");
    setEditSeverity(v.severity);
    setEditStatus(v.status);
    setEditDue(v.dueAt ? new Date(v.dueAt).toISOString().slice(0, 10) : "");
    setEditOpen(true);
  }

  async function submitEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editTarget) return;
    const dueIso =
      editDue.trim() === ""
        ? null
        : new Date(`${editDue}T12:00:00`).toISOString();
    if (editDue.trim() !== "" && Number.isNaN(new Date(dueIso!).getTime())) {
      setError("Date d’échéance invalide");
      return;
    }
    const payload: Partial<Vuln> & { dueAt?: string | null } = {
      title: editTitle,
      description: editDesc || null,
      severity: editSeverity,
      status: editStatus,
    };
    if (editDue.trim() === "") {
      payload.dueAt = null;
    } else {
      payload.dueAt = dueIso;
    }
    const res = await fetch(`/api/vulnerabilities/${editTarget.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const updated = await parseJson<Vuln>(res);
    setVulns((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
    setEditOpen(false);
    setEditTarget(null);
  }

  function onImportFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    e.target.value = "";
    setSelectedImportFile(file);
    setImportMsg(null);
    setImportPreviewKind(null);
    setImportPreviewItems([]);
    setImportPreviewTotal(0);
    setImportPreviewCreateCount(0);
    setImportPreviewSecondaryCount(0);
  }

  async function previewImportFile() {
    if (!selectedImportFile || !importSlug || isSentineloneImport) return;
    setPreviewBusy(true);
    setImportMsg(null);
    try {
      const fd = new FormData();
      fd.set("file", selectedImportFile);
      fd.set("templateSlug", importSlug);
      const res = await fetch("/api/import/preview", { method: "POST", body: fd });
      const data = await parseJson<{
        total: number;
        createCount: number;
        updateCount: number;
        skipCount: number;
        items: ImportPreviewItem[];
      }>(res);
      setImportPreviewKind("file");
      setImportPreviewItems(data.items);
      setImportPreviewTotal(data.total);
      setImportPreviewCreateCount(data.createCount);
      setImportPreviewSecondaryCount(data.updateCount + data.skipCount);
      setImportMsg(
        `Prévisualisation: ${data.createCount} création(s), ${data.updateCount} mise(s) à jour, ${data.skipCount} doublon(s), ${data.total} total.`,
      );
    } catch (err) {
      setImportMsg(err instanceof Error ? err.message : "Prévisualisation échouée");
    } finally {
      setPreviewBusy(false);
    }
  }

  async function confirmImportFile() {
    if (!selectedImportFile || !importSlug || isSentineloneImport) return;
    setImportBusy(true);
    setImportMsg(null);
    try {
      const fd = new FormData();
      fd.set("file", selectedImportFile);
      fd.set("templateSlug", importSlug);
      const res = await fetch("/api/import", { method: "POST", body: fd });
      const data = await parseJson<{ created: number; updated: number; skipped: number; total: number }>(res);
      setImportMsg(
        `${data.created} créée(s), ${data.updated} mise(s) à jour, ${data.skipped} doublon(s) ignoré(s) (${data.total} au total).`,
      );
      setSelectedImportFile(null);
      setImportPreviewKind(null);
      setImportPreviewItems([]);
      setImportPreviewTotal(0);
      setImportPreviewCreateCount(0);
      setImportPreviewSecondaryCount(0);
      await load();
    } catch (err) {
      setImportMsg(err instanceof Error ? err.message : "Import échoué");
    } finally {
      setImportBusy(false);
    }
  }

  async function previewSentinelOneIspm(e: React.FormEvent) {
    e.preventDefault();
    const tenantUrl = s1TenantUrl.trim();
    const token = s1Token.trim();
    const siteIds = s1SiteIds.trim();
    if (!tenantUrl || !token || !siteIds) {
      setImportMsg("URL tenant, token et siteIds sont requis.");
      return;
    }

    setS1Busy(true);
    setImportMsg(null);
    try {
      const res = await fetch("/api/import/sentinelone-ispm/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantUrl, token, siteIds }),
      });
      const data = await parseJson<{
        total: number;
        createCount: number;
        skipCount: number;
        items: ImportPreviewItem[];
      }>(res);
      setImportPreviewKind("sentinelone");
      setImportPreviewItems(data.items);
      setImportPreviewTotal(data.total);
      setImportPreviewCreateCount(data.createCount);
      setImportPreviewSecondaryCount(data.skipCount);
      setImportMsg(
        `Prévisualisation: ${data.createCount} création(s), ${data.skipCount} doublon(s), ${data.total} total.`,
      );
    } catch (err) {
      setImportMsg(err instanceof Error ? err.message : "Prévisualisation SentinelOne échouée");
    } finally {
      setS1Busy(false);
    }
  }

  async function confirmSentinelOneIspmImport() {
    const tenantUrl = s1TenantUrl.trim();
    const token = s1Token.trim();
    const siteIds = s1SiteIds.trim();
    if (!tenantUrl || !token || !siteIds) {
      setImportMsg("URL tenant, token et siteIds sont requis.");
      return;
    }
    setS1Busy(true);
    setImportMsg(null);
    try {
      const res = await fetch("/api/import/sentinelone-ispm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantUrl, token, siteIds }),
      });
      const data = await parseJson<{ created: number; skipped: number; total: number }>(res);
      setImportMsg(
        `${data.created} créée(s), ${data.skipped} ignorée(s) (doublons), ${data.total} alerte(s) traitée(s).`,
      );
      setImportPreviewKind(null);
      setImportPreviewItems([]);
      setImportPreviewTotal(0);
      setImportPreviewCreateCount(0);
      setImportPreviewSecondaryCount(0);
      setS1TenantUrl("");
      setS1Token("");
      setS1SiteIds("");
      await load();
    } catch (err) {
      setImportMsg(err instanceof Error ? err.message : "Import SentinelOne échoué");
    } finally {
      setS1Busy(false);
    }
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
        </div>
        <div className="relative flex shrink-0 flex-wrap items-start gap-2">
          <button
            type="button"
            onClick={() => setAddOpen(true)}
            className="ui-btn-primary inline-flex items-center gap-2 px-3 py-2 text-xs font-semibold shadow-sm"
          >
            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Ajouter une tâche
          </button>
          <button
            type="button"
            onClick={() => setImportOpen(true)}
            className="ui-btn-secondary inline-flex items-center gap-2 px-3 py-2 text-xs font-semibold shadow-sm"
          >
            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={1.9} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 8.25 12 3.75m0 0L7.5 8.25M12 3.75V15" />
            </svg>
            Importer
          </button>
          <button
            type="button"
            onClick={() => setShowColumnSettings((v) => !v)}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface-muted)] text-[var(--muted)] shadow-sm transition hover:border-[var(--accent)] hover:bg-[var(--accent-subtle)] hover:text-[var(--text)]"
            aria-label="Paramètres d’affichage des colonnes"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.7} viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.72 7.72 0 0 1 0 .255c-.008.378.137.75.43.991l1.003.827c.424.35.534.954.26 1.43l-1.296 2.247a1.125 1.125 0 0 1-1.37.491l-1.216-.456c-.356-.133-.751-.072-1.076.124a6.52 6.52 0 0 1-.22.128c-.332.183-.582.495-.644.869l-.214 1.281c-.09.543-.56.94-1.11.94h-2.593c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49L3.21 15.36a1.125 1.125 0 0 1 .26-1.43l1.004-.828c.292-.24.437-.613.43-.991a7.72 7.72 0 0 1 0-.255c.007-.38-.138-.751-.43-.992L3.47 9.037a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.217.456c.355.133.75.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.28Z"
              />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
            </svg>
          </button>
          {showColumnSettings ? (
            <div className="absolute right-0 top-11 z-20 w-64 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-3 shadow-xl">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">
                Colonnes visibles
              </p>
              <div className="mt-2 flex flex-col gap-1.5">
                {COLUMNS.map((c) => (
                  <label
                    key={c.status}
                    className="inline-flex cursor-pointer items-center gap-2 text-[11px] text-[var(--muted)]"
                  >
                    <input
                      type="checkbox"
                      checked={visibleStatuses[c.status]}
                      onChange={() => toggleStatusVisibility(c.status)}
                      className="h-3.5 w-3.5 rounded border-[var(--border)]"
                    />
                    <span>{c.label}</span>
                  </label>
                ))}
              </div>
              <div className="mt-3 border-t border-[var(--border)] pt-2">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">
                  Catégories visibles
                </p>
                <div className="mt-2 flex flex-col gap-1.5">
                  {(Object.keys(CATEGORY_LABEL) as VulnCategory[]).map((category) => (
                    <label
                      key={category}
                      className="inline-flex cursor-pointer items-center gap-2 text-[11px] text-[var(--muted)]"
                    >
                      <input
                        type="checkbox"
                        checked={categoryFilters[category]}
                        onChange={() => toggleCategoryFilter(category)}
                        className="h-3.5 w-3.5 rounded border-[var(--border)]"
                      />
                      <span>{CATEGORY_LABEL[category]}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div className="mt-3 border-t border-[var(--border)] pt-2">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">Tri</p>
                <select
                  value={kanbanSort}
                  onChange={(e) => setKanbanSort(e.target.value as KanbanSort)}
                  className="ui-input mt-1 w-full px-2 py-1.5 text-[11px]"
                >
                  <option value="severity_desc">Criticité (haute - basse)</option>
                  <option value="severity_asc">Criticité (basse - haute)</option>
                  <option value="created_desc">Date de création (récent - ancien)</option>
                  <option value="created_asc">Date de création (ancien - récent)</option>
                  <option value="due_asc">Échéance (proche - lointaine)</option>
                  <option value="due_desc">Échéance (lointaine - proche)</option>
                </select>
              </div>
            </div>
          ) : null}
        </div>
      </header>

      {!loading ? (
        <div className="relative mb-8">
          <button
            type="button"
            onClick={() => setShowMetricsSettings((v) => !v)}
            className="absolute -top-2 right-0 z-10 inline-flex h-7 w-7 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface-muted)] text-[var(--muted)] shadow-sm transition hover:border-[var(--accent)] hover:bg-[var(--accent-subtle)] hover:text-[var(--text)]"
            aria-label="Personnaliser les indicateurs"
            title="Personnaliser les indicateurs"
          >
            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={1.7} viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.72 7.72 0 0 1 0 .255c-.008.378.137.75.43.991l1.003.827c.424.35.534.954.26 1.43l-1.296 2.247a1.125 1.125 0 0 1-1.37.491l-1.216-.456c-.356-.133-.751-.072-1.076.124a6.52 6.52 0 0 1-.22.128c-.332.183-.582.495-.644.869l-.214 1.281c-.09.543-.56.94-1.11.94h-2.593c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49L3.21 15.36a1.125 1.125 0 0 1 .26-1.43l1.004-.828c.292-.24.437-.613.43-.991a7.72 7.72 0 0 1 0-.255c.007-.38-.138-.751-.43-.992L3.47 9.037a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.217.456c.355.133.75.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.28Z"
              />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
            </svg>
          </button>
          {showMetricsSettings ? (
            <div className="absolute right-0 top-7 z-20 w-56 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-3 shadow-xl">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">Indicateurs visibles</p>
              <div className="mt-2 flex flex-col gap-1.5">
                <label className="inline-flex cursor-pointer items-center gap-2 text-[11px] text-[var(--muted)]">
                  <input type="checkbox" checked={visibleMetrics.total} onChange={() => toggleMetricVisibility("total")} className="h-3.5 w-3.5 rounded border-[var(--border)]" />
                  <span>Total</span>
                </label>
                <label className="inline-flex cursor-pointer items-center gap-2 text-[11px] text-[var(--muted)]">
                  <input type="checkbox" checked={visibleMetrics.open} onChange={() => toggleMetricVisibility("open")} className="h-3.5 w-3.5 rounded border-[var(--border)]" />
                  <span>Ouvertes</span>
                </label>
                <label className="inline-flex cursor-pointer items-center gap-2 text-[11px] text-[var(--muted)]">
                  <input type="checkbox" checked={visibleMetrics.inProgress} onChange={() => toggleMetricVisibility("inProgress")} className="h-3.5 w-3.5 rounded border-[var(--border)]" />
                  <span>En cours</span>
                </label>
                <label className="inline-flex cursor-pointer items-center gap-2 text-[11px] text-[var(--muted)]">
                  <input type="checkbox" checked={visibleMetrics.criticalOpen} onChange={() => toggleMetricVisibility("criticalOpen")} className="h-3.5 w-3.5 rounded border-[var(--border)]" />
                  <span>Critiques ouvertes</span>
                </label>
                <label className="inline-flex cursor-pointer items-center gap-2 text-[11px] text-[var(--muted)]">
                  <input type="checkbox" checked={visibleMetrics.acknowledged} onChange={() => toggleMetricVisibility("acknowledged")} className="h-3.5 w-3.5 rounded border-[var(--border)]" />
                  <span>Acquittées</span>
                </label>
              </div>
            </div>
          ) : null}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {visibleMetrics.total ? (
              <div className="ui-card flex flex-col justify-center px-4 py-3.5">
                <p className="text-[11px] font-medium uppercase tracking-wide text-[var(--muted)]">Total</p>
                <p className="mt-0.5 text-2xl font-bold tabular-nums text-[var(--text)]">{stats.total}</p>
              </div>
            ) : null}
            {visibleMetrics.open ? (
              <div className="ui-card flex flex-col justify-center px-4 py-3.5">
                <p className="text-[11px] font-medium uppercase tracking-wide text-[var(--muted)]">Ouvertes</p>
                <p className="mt-0.5 text-2xl font-bold tabular-nums text-[var(--accent)]">{stats.open}</p>
              </div>
            ) : null}
            {visibleMetrics.inProgress ? (
              <div className="ui-card flex flex-col justify-center border-sky-500/20 bg-sky-500/[0.06] px-4 py-3.5 dark:bg-sky-500/10">
                <p className="text-[11px] font-medium uppercase tracking-wide text-sky-800 dark:text-sky-200/90">
                  En cours
                </p>
                <p className="mt-0.5 text-2xl font-bold tabular-nums text-sky-900 dark:text-sky-100">
                  {stats.inProgress}
                </p>
              </div>
            ) : null}
            {visibleMetrics.criticalOpen ? (
              <div className="ui-card flex flex-col justify-center border-red-500/15 bg-red-500/[0.04] px-4 py-3.5 dark:bg-red-500/10">
                <p className="text-[11px] font-medium uppercase tracking-wide text-red-800/90 dark:text-red-200/80">
                  Critiques ouvertes
                </p>
                <p className="mt-0.5 text-2xl font-bold tabular-nums text-red-700 dark:text-red-300">
                  {stats.criticalOpen}
                </p>
              </div>
            ) : null}
            {visibleMetrics.acknowledged ? (
              <div className="ui-card flex flex-col justify-center px-4 py-3.5">
                <p className="text-[11px] font-medium uppercase tracking-wide text-[var(--muted)]">Acquittées</p>
                <p className="mt-0.5 text-2xl font-bold tabular-nums text-[var(--text)]">{acknowledgedCount}</p>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}


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
          <div
            className="grid gap-6 transition-all duration-300 ease-out"
            style={{
              gridTemplateColumns: `repeat(${Math.max(
                1,
                COLUMNS.filter((col) => visibleStatuses[col.status]).length,
              )}, minmax(0, 1fr))`,
            }}
          >
            {COLUMNS.filter((col) => visibleStatuses[col.status]).map((col) => {
              const filteredColumnItems = (byStatus.get(col.status) ?? [])
                .filter((v) => columnSeverityFilters[col.status][v.severity])
                .filter((v) => categoryFilters[vulnCategory(v)])
                .sort(compareVulns);
              const count = filteredColumnItems.length;
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
                        <details className="relative mt-1">
                          <summary className="inline-flex list-none cursor-pointer items-center gap-1 rounded-md border border-[var(--border)] bg-[var(--surface-muted)] px-2 py-1 text-[10px] font-medium text-[var(--muted)]">
                            Filtres
                          </summary>
                          <div className="absolute left-0 z-20 mt-1 w-44 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-2 shadow-xl">
                            <p className="mb-1 text-[10px] uppercase tracking-wide text-[var(--muted)]">Criticités</p>
                            <div className="space-y-1.5">
                              {SEVERITY_ORDER.map((sev) => (
                                <label key={sev} className="flex items-center gap-2 text-[10px] text-[var(--muted)]">
                                  <input
                                    type="checkbox"
                                    checked={columnSeverityFilters[col.status][sev]}
                                    onChange={() => toggleSeverityForColumn(col.status, sev)}
                                    className="h-3 w-3 rounded border-[var(--border)]"
                                  />
                                  <span>{severityLabel[sev]}</span>
                                </label>
                              ))}
                            </div>
                          </div>
                        </details>
                      </div>
                    </div>
                    <span className="shrink-0 rounded-full bg-[var(--column)] px-2.5 py-0.5 text-center text-xs font-bold tabular-nums text-[var(--text)] ring-1 ring-[var(--border)]">
                      {count}
                    </span>
                  </div>
                  <KanbanDroppableList status={col.status}>
                    {filteredColumnItems.map((v) => (
                      <DashboardDraggableVulnCard
                        key={v.id}
                        v={v}
                        patchAcknowledge={patchAcknowledge}
                        patchStatus={patchStatus}
                        onEdit={openEdit}
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

      {editOpen && editTarget ? (
        <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/45 p-4 backdrop-blur-[2px] sm:items-center">
          <div
            className="ui-card w-full max-w-md p-6 shadow-xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="edit-title"
          >
            <h2 id="edit-title" className="text-lg font-bold text-[var(--text)]">
              Modifier la vulnérabilité
            </h2>
            <form onSubmit={submitEdit} className="mt-4 flex flex-col gap-3">
              <label className="text-xs font-medium text-[var(--muted)]">
                Titre
                <input
                  required
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="ui-input mt-1 w-full px-3 py-2.5 text-sm"
                />
              </label>
              <label className="text-xs font-medium text-[var(--muted)]">
                Description
                <textarea
                  value={editDesc}
                  onChange={(e) => setEditDesc(e.target.value)}
                  rows={3}
                  className="ui-input mt-1 w-full px-3 py-2.5 text-sm"
                />
              </label>
              <label className="text-xs font-medium text-[var(--muted)]">
                Sévérité
                <select
                  value={editSeverity}
                  onChange={(e) => setEditSeverity(e.target.value as Severity)}
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
                Catégorie
                <select
                  value={editStatus}
                  onChange={(e) => setEditStatus(e.target.value as VulnStatus)}
                  className="ui-input mt-1 w-full px-3 py-2.5 text-sm"
                >
                  {COLUMNS.map((c) => (
                    <option key={c.status} value={c.status}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs font-medium text-[var(--muted)]">
                Échéance (optionnel)
                <input
                  type="date"
                  value={editDue}
                  onChange={(e) => setEditDue(e.target.value)}
                  className="ui-input mt-1 w-full px-3 py-2.5 text-sm"
                />
              </label>
              <div className="mt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setDeleteConfirmOpen(true)}
                  className="mr-auto rounded-lg border border-red-500/35 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-700 transition hover:bg-red-500/15 dark:text-red-300"
                >
                  Supprimer
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEditOpen(false);
                    setEditTarget(null);
                    setDeleteConfirmOpen(false);
                  }}
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
      {deleteConfirmOpen && editTarget ? (
        <div className="fixed inset-0 z-[95] flex items-end justify-center bg-black/55 p-4 backdrop-blur-[2px] sm:items-center">
          <div className="ui-card w-full max-w-sm p-5 shadow-xl" role="dialog" aria-modal="true" aria-labelledby="delete-title">
            <h3 id="delete-title" className="text-base font-bold text-[var(--text)]">
              Confirmer la suppression
            </h3>
            <p className="mt-2 text-sm text-[var(--muted)]">
              Cette action va supprimer définitivement la tâche <span className="font-semibold text-[var(--text)]">&quot;{editTarget.title}&quot;</span>.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteConfirmOpen(false)}
                disabled={deleteBusy}
                className="ui-btn-secondary px-4 py-2 text-sm text-[var(--muted)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={() => void confirmDeleteFromEdit()}
                disabled={deleteBusy}
                className="rounded-lg border border-red-500/35 bg-red-500/10 px-4 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-500/15 disabled:cursor-not-allowed disabled:opacity-50 dark:text-red-300"
              >
                {deleteBusy ? "Suppression..." : "Confirmer"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

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
      {importOpen ? (
        <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/45 p-4 backdrop-blur-[2px] sm:items-center">
          <div
            className="ui-card w-full max-w-md overflow-hidden p-6 shadow-xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="import-title"
          >
            <h2 id="import-title" className="text-lg font-bold text-[var(--text)]">
              Importer un rapport
            </h2>
            <div className="mt-4 flex flex-col gap-3">
              <label className="text-xs font-medium text-[var(--muted)]">
                Modèle d’import
                <select
                  value={importSlug}
                  onChange={(e) => {
                    setImportSlug(e.target.value);
                    setImportMsg(null);
                    setSelectedImportFile(null);
                    setImportPreviewKind(null);
                    setImportPreviewItems([]);
                    setImportPreviewTotal(0);
                    setImportPreviewCreateCount(0);
                    setImportPreviewSecondaryCount(0);
                  }}
                  className="ui-input mt-1 w-full px-3 py-2.5 text-sm"
                >
                  {templates.map((t) => (
                    <option key={t.id} value={t.slug}>
                      {t.name.toLowerCase().includes(`(${t.fileHint.toLowerCase()})`) ? t.name : `${t.name} (${t.fileHint})`}
                    </option>
                  ))}
                </select>
              </label>
              {!isSentineloneImport ? (
                <>
                  <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
                    <label className="inline-flex min-w-0 flex-1 cursor-pointer items-center justify-center gap-2 rounded-[var(--radius-md)] border border-dashed border-[var(--border-strong)] bg-[var(--surface-muted)] px-4 py-2.5 text-sm font-semibold text-[var(--text)] transition hover:border-[var(--accent)] hover:bg-[var(--accent-subtle)]">
                      <svg className="h-4 w-4 text-[var(--accent)]" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M18.375 12.739l-7.693 7.693a4.5 4.5 0 01-6.364-6.364l10.94-10.94A3 3 0 1119.5 7.372L8.552 18.32m.009-.01l-.01.01m6.713-6.713l3-3" />
                      </svg>
                      <input
                        type="file"
                        className="hidden"
                        disabled={importBusy || previewBusy || !importSlug}
                        onChange={onImportFileSelected}
                      />
                      <span className="max-w-[13rem] truncate sm:max-w-[15rem]">
                        {selectedImportFile ? selectedImportFile.name : "Choisir un fichier"}
                      </span>
                    </label>
                    <button
                      type="button"
                      onClick={() => void previewImportFile()}
                      disabled={!selectedImportFile || !importSlug || previewBusy || importBusy}
                      className="ui-btn-secondary inline-flex shrink-0 items-center gap-2 px-3 py-2 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {previewBusy ? "Prévisualisation..." : "Prévisualiser"}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const header = "title,severity,description,externalRef\n";
                        const exampleLine =
                          'Compte administrateur dormant,MEDIUM,"Compte admin sans connexion depuis 90 jours",ADM-001\n';
                        const blob = new Blob([header + exampleLine], { type: "text/csv;charset=utf-8" });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement("a");
                        a.href = url;
                        a.download = "modele_import_vulnerabilites.csv";
                        document.body.appendChild(a);
                        a.click();
                        document.body.removeChild(a);
                        URL.revokeObjectURL(url);
                      }}
                      className="ui-btn-secondary inline-flex shrink-0 items-center gap-2 px-3 py-2 text-xs font-semibold"
                    >
                      <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5M12 16.5 7.5 12M12 16.5V3"
                        />
                      </svg>
                      Télécharger le template
                    </button>
                  </div>
                  {importPreviewKind === "file" ? (
                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={() => void confirmImportFile()}
                        disabled={importBusy || !selectedImportFile}
                        className="ui-btn-primary px-3 py-2 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {importBusy ? "Import..." : "Valider l'import fichier"}
                      </button>
                    </div>
                  ) : null}
                </>
              ) : null}
              {isSentineloneImport ? (
                <form onSubmit={previewSentinelOneIspm} className="mt-2 rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] p-3">
                <p className="text-xs font-semibold text-[var(--text)]">Import SentinelOne ISPM</p>
                <div className="mt-2 grid gap-2">
                  <input
                    type="url"
                    value={s1TenantUrl}
                    onChange={(e) => setS1TenantUrl(e.target.value)}
                    className="ui-input w-full px-3 py-2 text-xs"
                    placeholder="URL tenant (ex: https://xxx.sentinelone.net)"
                    autoComplete="off"
                  />
                  <input
                    type="password"
                    value={s1Token}
                    onChange={(e) => setS1Token(e.target.value)}
                    className="ui-input w-full px-3 py-2 text-xs"
                    placeholder="API token"
                    autoComplete="off"
                  />
                  <input
                    type="text"
                    value={s1SiteIds}
                    onChange={(e) => setS1SiteIds(e.target.value)}
                    className="ui-input w-full px-3 py-2 text-xs"
                    placeholder="siteIds (ex: 12345 ou 12345,67890)"
                    autoComplete="off"
                  />
                </div>
                <div className="mt-2 flex justify-end gap-2">
                  <button type="submit" disabled={s1Busy} className="ui-btn-secondary px-3 py-2 text-xs font-semibold">
                    {s1Busy ? "Prévisualisation..." : "Prévisualiser SentinelOne"}
                  </button>
                  {importPreviewKind === "sentinelone" ? (
                    <button
                      type="button"
                      onClick={() => void confirmSentinelOneIspmImport()}
                      disabled={s1Busy}
                      className="ui-btn-primary px-3 py-2 text-xs font-semibold"
                    >
                      {s1Busy ? "Import..." : "Valider l'import SentinelOne"}
                    </button>
                  ) : null}
                </div>
                </form>
              ) : null}
              {importPreviewKind ? (
                <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] p-3">
                  <div className="mb-2 flex items-center justify-between text-xs">
                    <p className="font-semibold text-[var(--text)]">Prévisualisation</p>
                    <p className="text-[var(--muted)]">
                      {importPreviewCreateCount} création(s), {importPreviewSecondaryCount}{" "}
                      {importPreviewKind === "file" ? "mise(s) à jour" : "doublon(s)"}, {importPreviewTotal} total
                    </p>
                  </div>
                  <ul className="max-h-56 space-y-1 overflow-auto">
                    {importPreviewItems.map((item, idx) => (
                      <li
                        key={`${item.externalRef ?? "no-ref"}-${idx}`}
                        className="flex items-center justify-between rounded border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-[11px]"
                      >
                        <span className="truncate text-[var(--text)]">
                          {item.title} <span className="text-[var(--muted)]">({severityLabel[item.severity]})</span>
                        </span>
                        <span
                          className={`ml-2 shrink-0 rounded px-1.5 py-0.5 ${
                            item.action === "create"
                              ? "bg-emerald-500/15 text-emerald-700"
                              : item.action === "update"
                                ? "bg-amber-500/15 text-amber-800"
                                : "bg-zinc-500/15 text-[var(--muted)]"
                          }`}
                        >
                          {item.action === "create" ? "Créer" : item.action === "update" ? "Mettre à jour" : "Ignorer"}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {importMsg ? (
                <p className="rounded-lg bg-[var(--column)] px-3 py-2 text-sm text-[var(--text)]">{importMsg}</p>
              ) : null}
              <div className="mt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setImportOpen(false);
                    setImportMsg(null);
                    setS1TenantUrl("");
                    setS1Token("");
                    setS1SiteIds("");
                    setSelectedImportFile(null);
                    setImportPreviewKind(null);
                    setImportPreviewItems([]);
                    setImportPreviewTotal(0);
                    setImportPreviewCreateCount(0);
                    setImportPreviewSecondaryCount(0);
                  }}
                  className="ui-btn-secondary px-4 py-2.5 text-sm text-[var(--muted)]"
                >
                  Fermer
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
