"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useLocale } from "@/components/LocaleProvider";

type Severity = "INFO" | "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
type VulnStatus = "TODO" | "IN_PROGRESS" | "DONE" | "ARCHIVE";

type Vuln = {
  id: string;
  title: string;
  severity: Severity;
  status: VulnStatus;
  createdAt: string;
  dueAt: string | null;
  acknowledgedAt: string | null;
};

type WidgetId =
  | "kpi_overview"
  | "deadlines_window"
  | "status_breakdown"
  | "severity_breakdown"
  | "trend_chart"
  | "open_pie"
  | "inprogress_pie";

type WidgetDef = {
  id: WidgetId;
  title: string;
  description: string;
};

type TrendGranularity = "day" | "week" | "month";
type TrendPreset = "7d" | "30d" | "90d" | "365d" | "custom";
type DeadlineUnit = "days" | "months";

const WIDGETS: WidgetDef[] = [
  { id: "kpi_overview", title: "Global KPIs", description: "Volume, open, in progress, critical." },
  { id: "deadlines_window", title: "Upcoming Deadlines", description: "Custom window by days or months." },
  { id: "status_breakdown", title: "Status Breakdown", description: "Alerts count by status." },
  { id: "severity_breakdown", title: "Severity Breakdown", description: "Alerts count by severity." },
  { id: "trend_chart", title: "Trend Over Time", description: "Evolution by severity with filters." },
  { id: "open_pie", title: "Open by Type", description: "Donut of open alerts by severity." },
  { id: "inprogress_pie", title: "In Progress by Type", description: "Donut of in-progress alerts by severity." },
];

const DEFAULT_LAYOUT: WidgetId[] = [
  "kpi_overview",
  "deadlines_window",
  "trend_chart",
  "open_pie",
  "inprogress_pie",
  "status_breakdown",
  "severity_breakdown",
];

const severityOrder: Severity[] = ["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"];

const severityLabelEn: Record<Severity, string> = {
  CRITICAL: "Critical",
  HIGH: "High",
  MEDIUM: "Medium",
  LOW: "Low",
  INFO: "Info",
};
const severityLabelFr: Record<Severity, string> = {
  CRITICAL: "Critique",
  HIGH: "Elevee",
  MEDIUM: "Moyenne",
  LOW: "Faible",
  INFO: "Info",
};

const severityColor: Record<Severity, string> = {
  CRITICAL: "#ef4444",
  HIGH: "#f97316",
  MEDIUM: "#eab308",
  LOW: "#0ea5e9",
  INFO: "#64748b",
};

const statusLabelEn: Record<VulnStatus, string> = {
  TODO: "To Do",
  IN_PROGRESS: "In Progress",
  DONE: "Done",
  ARCHIVE: "Acknowledged",
};
const statusLabelFr: Record<VulnStatus, string> = {
  TODO: "A traiter",
  IN_PROGRESS: "En cours",
  DONE: "Terminees",
  ARCHIVE: "Acquittees",
};

async function parseJson<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(typeof err.error === "string" ? err.error : res.statusText);
  }
  return res.json() as Promise<T>;
}

export function MonitoringOverview() {
  const { locale } = useLocale();
  const t = (en: string, fr: string) => (locale === "fr" ? fr : en);
  const severityLabel = locale === "fr" ? severityLabelFr : severityLabelEn;
  const statusLabel = locale === "fr" ? statusLabelFr : statusLabelEn;

  const [items, setItems] = useState<Vuln[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [layout, setLayout] = useState<WidgetId[]>(DEFAULT_LAYOUT);
  const [hidden, setHidden] = useState<WidgetId[]>([]);
  const [editMode, setEditMode] = useState(false);
  const [draggingWidgetId, setDraggingWidgetId] = useState<WidgetId | null>(null);
  const [dragOverWidgetId, setDragOverWidgetId] = useState<WidgetId | null>(null);

  const [trendGranularity, setTrendGranularity] = useState<TrendGranularity>("week");
  const [trendPreset, setTrendPreset] = useState<TrendPreset>("30d");
  const [trendStart, setTrendStart] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 29);
    return toDateInput(d);
  });
  const [trendEnd, setTrendEnd] = useState<string>(() => toDateInput(new Date()));
  const [trendStatuses, setTrendStatuses] = useState<Record<VulnStatus, boolean>>({
    TODO: true,
    IN_PROGRESS: true,
    DONE: false,
    ARCHIVE: false,
  });
  const [trendSeverities, setTrendSeverities] = useState<Record<Severity, boolean>>({
    CRITICAL: true,
    HIGH: true,
    MEDIUM: true,
    LOW: true,
    INFO: false,
  });

  const [deadlineStart, setDeadlineStart] = useState<string>(() => toDateInput(new Date()));
  const [deadlineUnit, setDeadlineUnit] = useState<DeadlineUnit>("days");
  const [deadlineAmount, setDeadlineAmount] = useState(7);

  useEffect(() => {
    if (trendPreset === "custom") return;
    const end = new Date();
    const start = new Date();
    if (trendPreset === "7d") start.setDate(start.getDate() - 6);
    if (trendPreset === "30d") start.setDate(start.getDate() - 29);
    if (trendPreset === "90d") start.setDate(start.getDate() - 89);
    if (trendPreset === "365d") start.setDate(start.getDate() - 364);
    setTrendStart(toDateInput(start));
    setTrendEnd(toDateInput(end));
  }, [trendPreset]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("procyon-overview-layout");
      if (!raw) return;
      const parsed = JSON.parse(raw) as { layout: WidgetId[]; hidden: WidgetId[] };
      if (!Array.isArray(parsed.layout) || !Array.isArray(parsed.hidden)) return;
      const validLayout = parsed.layout.filter((id) => WIDGETS.some((w) => w.id === id));
      const missing = WIDGETS.map((w) => w.id).filter((id) => !validLayout.includes(id));
      setLayout([...validLayout, ...missing]);
      setHidden(parsed.hidden.filter((id) => WIDGETS.some((w) => w.id === id)));
    } catch {
      // ignore corrupted local storage
    }
  }, []);

  useEffect(() => {
    localStorage.setItem("procyon-overview-layout", JSON.stringify({ layout, hidden }));
  }, [layout, hidden]);

  async function loadData(options?: { silent?: boolean }) {
    const silent = options?.silent === true;
    if (!silent) {
      setLoading(true);
      setError(null);
    }
    try {
      const data = await parseJson<Vuln[]>(await fetch("/api/vulnerabilities"));
      setItems(data);
    } catch (e) {
      if (!silent) {
        setError(e instanceof Error ? e.message : t("Loading error", "Erreur de chargement"));
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const interval = window.setInterval(() => {
      void loadData({ silent: true });
    }, 15000);
    const onFocus = () => {
      void loadData({ silent: true });
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        void loadData({ silent: true });
      }
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const visibleWidgets = useMemo(() => layout.filter((id) => !hidden.includes(id)), [layout, hidden]);

  const statusCounts = useMemo(() => {
    const out: Record<VulnStatus, number> = { TODO: 0, IN_PROGRESS: 0, DONE: 0, ARCHIVE: 0 };
    for (const v of items) out[v.status] += 1;
    return out;
  }, [items]);

  const severityCounts = useMemo(() => {
    const out: Record<Severity, number> = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0, INFO: 0 };
    for (const v of items) out[v.severity] += 1;
    return out;
  }, [items]);

  const openItems = useMemo(() => items.filter((v) => v.status === "TODO" || v.status === "IN_PROGRESS"), [items]);
  const inProgressItems = useMemo(() => items.filter((v) => v.status === "IN_PROGRESS"), [items]);

  const openBySeverity = useMemo(() => {
    const out: Record<Severity, number> = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0, INFO: 0 };
    for (const v of openItems) out[v.severity] += 1;
    return out;
  }, [openItems]);

  const inProgressBySeverity = useMemo(() => {
    const out: Record<Severity, number> = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0, INFO: 0 };
    for (const v of inProgressItems) out[v.severity] += 1;
    return out;
  }, [inProgressItems]);

  const trendBuckets = useMemo(() => {
    const start = parseDateInput(trendStart);
    const end = parseDateInput(trendEnd);
    if (!start || !end) return [];
    const safeStart = start <= end ? start : end;
    const safeEnd = start <= end ? end : start;
    return buildTrendBuckets(safeStart, safeEnd, trendGranularity, locale);
  }, [locale, trendEnd, trendGranularity, trendStart]);

  const trendSeries = useMemo(() => {
    const filtered = items.filter((v) => trendStatuses[v.status] && trendSeverities[v.severity]);
    const base: Record<Severity, number[]> = {
      CRITICAL: new Array(trendBuckets.length).fill(0),
      HIGH: new Array(trendBuckets.length).fill(0),
      MEDIUM: new Array(trendBuckets.length).fill(0),
      LOW: new Array(trendBuckets.length).fill(0),
      INFO: new Array(trendBuckets.length).fill(0),
    };
    const bucketIdx = new Map(trendBuckets.map((b, i) => [b.key, i]));
    for (const v of filtered) {
      const d = new Date(v.createdAt);
      if (Number.isNaN(d.getTime())) continue;
      const key = bucketKey(d, trendGranularity);
      const i = bucketIdx.get(key) ?? -1;
      if (i >= 0) base[v.severity][i] += 1;
    }

    // Convert per-bucket creations into cumulative total over time.
    for (const sev of severityOrder) {
      for (let i = 1; i < base[sev].length; i++) {
        base[sev][i] += base[sev][i - 1];
      }
    }
    return base;
  }, [items, trendBuckets, trendGranularity, trendSeverities, trendStatuses]);

  const trendYMax = useMemo(
    () => Math.max(5, ...severityOrder.filter((s) => trendSeverities[s]).flatMap((s) => trendSeries[s]), 1),
    [trendSeries, trendSeverities],
  );

  const deadlineRange = useMemo(() => {
    const start = parseDateInput(deadlineStart) ?? new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    const safeAmount = Math.max(1, Math.min(36, deadlineAmount));
    if (deadlineUnit === "days") {
      end.setDate(end.getDate() + safeAmount - 1);
    } else {
      end.setMonth(end.getMonth() + safeAmount);
      end.setDate(end.getDate() - 1);
    }
    end.setHours(23, 59, 59, 999);
    return { start, end, amount: safeAmount };
  }, [deadlineAmount, deadlineStart, deadlineUnit]);

  const deadlinesWindowItems = useMemo(() => {
    return items
      .filter((v) => v.dueAt && v.status !== "DONE" && v.status !== "ARCHIVE")
      .map((v) => ({ ...v, dueDate: new Date(v.dueAt as string) }))
      .filter((v) => !Number.isNaN(v.dueDate.getTime()))
      .filter((v) => v.dueDate >= deadlineRange.start && v.dueDate <= deadlineRange.end)
      .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());
  }, [deadlineRange.end, deadlineRange.start, items]);

  function toggleWidget(id: WidgetId) {
    setHidden((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function moveWidget(id: WidgetId, delta: -1 | 1) {
    setLayout((prev) => {
      const i = prev.indexOf(id);
      if (i < 0) return prev;
      const j = i + delta;
      if (j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }

  function reorderWidgets(activeId: WidgetId, overId: WidgetId) {
    if (activeId === overId) return;
    setLayout((prev) => {
      const from = prev.indexOf(activeId);
      const to = prev.indexOf(overId);
      if (from < 0 || to < 0) return prev;
      const next = [...prev];
      next.splice(from, 1);
      next.splice(to, 0, activeId);
      return next;
    });
  }

  function shiftDeadlineWindow(direction: "back" | "forward") {
    setDeadlineStart((prev) => {
      const d = parseDateInput(prev) ?? new Date();
      const delta = deadlineUnit === "days" ? deadlineRange.amount : deadlineRange.amount * 30;
      d.setDate(d.getDate() + (direction === "back" ? -delta : delta));
      return toDateInput(d);
    });
  }

  function toggleTrendStatus(status: VulnStatus) {
    setTrendStatuses((prev) => {
      const next = { ...prev, [status]: !prev[status] };
      return Object.values(next).some(Boolean) ? next : prev;
    });
  }

  function toggleTrendSeverity(severity: Severity) {
    setTrendSeverities((prev) => {
      const next = { ...prev, [severity]: !prev[severity] };
      return Object.values(next).some(Boolean) ? next : prev;
    });
  }

  return (
    <div className="mx-auto max-w-[1480px] px-5 py-8 lg:px-10 lg:py-10">
      <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--accent)]">
            {t("Main View", "Vue principale")}
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-[var(--text)] sm:text-3xl">
            {t("Vulnerability Monitoring", "Monitoring des vulnerabilites")}
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => void loadData()} className="ui-btn-secondary px-4 py-2 text-xs font-semibold">
            {t("Refresh data", "Actualiser les donnees")}
          </button>
          {editMode ? (
            <button
              type="button"
              onClick={() => {
                const ok = window.confirm(
                  t(
                    "Reset widget layout to default?",
                    "Réinitialiser l’agencement des widgets aux valeurs par défaut ?",
                  ),
                );
                if (!ok) return;
                setLayout(DEFAULT_LAYOUT);
                setHidden([]);
              }}
              className="ui-btn-secondary px-4 py-2 text-xs font-semibold"
            >
              {t("Reset layout", "Reinitialiser la vue")}
            </button>
          ) : null}
          <button type="button" onClick={() => setEditMode((v) => !v)} className="ui-btn-secondary px-4 py-2 text-xs font-semibold">
            {editMode ? t("Finish customization", "Terminer la personnalisation") : t("Customize widgets", "Personnaliser les widgets")}
          </button>
        </div>
      </header>

      {editMode ? (
        <section className="ui-card mb-6 p-4">
          <p className="text-xs font-semibold text-[var(--muted)]">
            {t("Show/hide and reorder widgets", "Afficher / masquer et reorganiser les widgets")}
          </p>
          <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2">
            {layout.map((id) => {
              const meta = WIDGETS.find((w) => w.id === id)!;
              const hiddenNow = hidden.includes(id);
              return (
                <div key={id} className="flex items-center justify-between rounded border border-[var(--border)] px-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-xs font-semibold text-[var(--text)]">{meta.title}</p>
                    <p className="truncate text-[11px] text-[var(--muted)]">{meta.description}</p>
                  </div>
                  <div className="ml-2 flex items-center gap-1.5">
                    <button type="button" onClick={() => moveWidget(id, -1)} className="ui-btn-secondary px-2 py-1 text-[10px]">
                      ↑
                    </button>
                    <button type="button" onClick={() => moveWidget(id, 1)} className="ui-btn-secondary px-2 py-1 text-[10px]">
                      ↓
                    </button>
                    <button type="button" onClick={() => toggleWidget(id)} className="ui-btn-secondary px-2 py-1 text-[10px]">
                      {hiddenNow ? t("Show", "Afficher") : t("Hide", "Masquer")}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ) : null}

      {error ? (
        <p className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-800 dark:text-red-200">
          {error}
        </p>
      ) : null}
      {loading ? <p className="text-sm text-[var(--muted)]">{t("Loading...", "Chargement...")}</p> : null}

      {!loading ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
          {visibleWidgets.map((id) => (
            <WidgetShell
              key={id}
              id={id}
              draggable={editMode}
              isDragging={draggingWidgetId === id}
              isOver={dragOverWidgetId === id && draggingWidgetId !== id}
              canRemove={visibleWidgets.length > 1}
              removeLabel={t("Remove widget", "Supprimer le widget")}
              onRemove={() => toggleWidget(id)}
              onDragStart={(activeId) => setDraggingWidgetId(activeId)}
              onDragEnd={() => {
                setDraggingWidgetId(null);
                setDragOverWidgetId(null);
              }}
              onDragOver={(overId) => {
                if (!draggingWidgetId || draggingWidgetId === overId) return;
                setDragOverWidgetId(overId);
                reorderWidgets(draggingWidgetId, overId);
              }}
            >
              {id === "kpi_overview" ? (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <Kpi title={t("Total", "Total")} value={items.length} />
                  <Kpi title={t("Open", "Ouvertes")} value={openItems.length} accent />
                  <Kpi title={t("In Progress", "En cours")} value={statusCounts.IN_PROGRESS} />
                  <Kpi title={t("Acknowledged", "Acquittees")} value={statusCounts.ARCHIVE} />
                </div>
              ) : id === "deadlines_window" ? (
                <DeadlineWindowWidget
                  t={t}
                  deadlineStart={deadlineStart}
                  deadlineUnit={deadlineUnit}
                  deadlineAmount={deadlineAmount}
                  onChangeStart={setDeadlineStart}
                  onChangeUnit={setDeadlineUnit}
                  onChangeAmount={(n) => setDeadlineAmount(Math.max(1, Math.min(36, n)))}
                  onShift={shiftDeadlineWindow}
                  rangeLabel={`${deadlineRange.start.toLocaleDateString(locale === "fr" ? "fr-FR" : "en-US")} - ${deadlineRange.end.toLocaleDateString(locale === "fr" ? "fr-FR" : "en-US")}`}
                  items={deadlinesWindowItems}
                  severityLabel={severityLabel}
                />
              ) : id === "status_breakdown" ? (
                <div className="space-y-2">
                  {(Object.keys(statusCounts) as VulnStatus[]).map((s) => (
                    <RowCount key={s} label={statusLabel[s]} value={statusCounts[s]} />
                  ))}
                </div>
              ) : id === "severity_breakdown" ? (
                <div className="space-y-2">
                  {severityOrder.map((s) => (
                    <RowCount key={s} label={severityLabel[s]} value={severityCounts[s]} color={severityColor[s]} />
                  ))}
                </div>
              ) : id === "trend_chart" ? (
                <div>
                  <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
                    <label className="text-[var(--muted)]">
                      {t("Period", "Periode")}:
                      <select value={trendPreset} onChange={(e) => setTrendPreset(e.target.value as TrendPreset)} className="ui-input ml-2 px-2 py-1 text-xs">
                        <option value="7d">7 {t("days", "jours")}</option>
                        <option value="30d">30 {t("days", "jours")}</option>
                        <option value="90d">90 {t("days", "jours")}</option>
                        <option value="365d">365 {t("days", "jours")}</option>
                        <option value="custom">{t("Custom", "Personnalisee")}</option>
                      </select>
                    </label>
                    {trendPreset === "custom" ? (
                      <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--muted)]">
                        <label>
                          {t("From", "Du")}:
                          <input type="date" value={trendStart} onChange={(e) => setTrendStart(e.target.value)} className="ui-input ml-2 px-2 py-1 text-xs" />
                        </label>
                        <label>
                          {t("To", "Au")}:
                          <input type="date" value={trendEnd} onChange={(e) => setTrendEnd(e.target.value)} className="ui-input ml-2 px-2 py-1 text-xs" />
                        </label>
                      </div>
                    ) : null}
                    <label className="text-[var(--muted)]">
                      {t("Granularity", "Granularite")}:
                      <select value={trendGranularity} onChange={(e) => setTrendGranularity(e.target.value as TrendGranularity)} className="ui-input ml-2 px-2 py-1 text-xs">
                        <option value="day">{t("Day", "Jour")}</option>
                        <option value="week">{t("Week", "Semaine")}</option>
                        <option value="month">{t("Month", "Mois")}</option>
                      </select>
                    </label>
                    <details className="relative">
                      <summary className="ui-btn-secondary list-none cursor-pointer px-2.5 py-1 text-xs">{t("Statuses", "Statuts")}</summary>
                      <div className="absolute z-20 mt-1 w-48 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-2 shadow-xl">
                        {(Object.keys(statusLabel) as VulnStatus[]).map((s) => (
                          <label key={s} className="flex items-center gap-2 text-xs text-[var(--muted)]">
                            <input type="checkbox" checked={trendStatuses[s]} onChange={() => toggleTrendStatus(s)} className="h-3.5 w-3.5 rounded border-[var(--border)]" />
                            <span>{statusLabel[s]}</span>
                          </label>
                        ))}
                      </div>
                    </details>
                    <details className="relative">
                      <summary className="ui-btn-secondary list-none cursor-pointer px-2.5 py-1 text-xs">{t("Severities", "Criticites")}</summary>
                      <div className="absolute z-20 mt-1 w-48 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-2 shadow-xl">
                        {severityOrder.map((s) => (
                          <label key={s} className="flex items-center gap-2 text-xs text-[var(--muted)]">
                            <input type="checkbox" checked={trendSeverities[s]} onChange={() => toggleTrendSeverity(s)} className="h-3.5 w-3.5 rounded border-[var(--border)]" />
                            <span>{severityLabel[s]}</span>
                          </label>
                        ))}
                      </div>
                    </details>
                  </div>
                  <TrendChart
                    buckets={trendBuckets}
                    series={trendSeries}
                    yMax={trendYMax}
                    severityLabel={severityLabel}
                    visibleSeverities={trendSeverities}
                  />
                </div>
              ) : id === "open_pie" ? (
                <DonutWidget title={t("Open by Severity", "Ouvertes par criticite")} data={openBySeverity} severityLabel={severityLabel} totalLabel={t("Total", "Total")} />
              ) : (
                <DonutWidget title={t("In Progress by Severity", "En cours par criticite")} data={inProgressBySeverity} severityLabel={severityLabel} totalLabel={t("Total", "Total")} />
              )}
            </WidgetShell>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function WidgetShell({
  id,
  children,
  draggable,
  isDragging,
  isOver,
  canRemove,
  removeLabel,
  onRemove,
  onDragStart,
  onDragOver,
  onDragEnd,
}: {
  id: WidgetId;
  children: ReactNode;
  draggable: boolean;
  isDragging: boolean;
  isOver: boolean;
  canRemove: boolean;
  removeLabel: string;
  onRemove: () => void;
  onDragStart: (id: WidgetId) => void;
  onDragOver: (id: WidgetId) => void;
  onDragEnd: () => void;
}) {
  const wide = id === "trend_chart" || id === "kpi_overview" || id === "deadlines_window";
  const title = WIDGETS.find((w) => w.id === id)?.title ?? id;

  return (
    <section
      onDragOver={(e) => {
        if (!draggable) return;
        e.preventDefault();
        onDragOver(id);
      }}
      className={`ui-card p-4 transition-[transform,box-shadow,background-color] ${
        wide ? "lg:col-span-12" : "lg:col-span-6 xl:col-span-4"
      } ${isOver ? "ring-2 ring-[var(--accent)]/40" : ""} ${isDragging ? "opacity-70 shadow-xl" : ""}`}
    >
      <div className="flex items-start justify-between gap-2">
        <h2 className="text-sm font-semibold text-[var(--text)]">{title}</h2>
        {draggable ? (
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={onRemove}
              disabled={!canRemove}
              className="inline-flex h-7 w-7 items-center justify-center rounded border border-red-500/30 bg-red-500/10 text-red-600 transition hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-40"
              aria-label={removeLabel}
              title={removeLabel}
            >
              <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 7h12m-9 0V5.75A1.75 1.75 0 0 1 10.75 4h2.5A1.75 1.75 0 0 1 15 5.75V7m-7 0 1 11a2 2 0 0 0 2 1.8h2a2 2 0 0 0 2-1.8l1-11M10 11v5m4-5v5" />
              </svg>
            </button>
            <button
              type="button"
              draggable
              onDragStart={(e) => {
                e.dataTransfer.effectAllowed = "move";
                e.dataTransfer.setData("text/plain", id);
                onDragStart(id);
              }}
              onDragEnd={onDragEnd}
              className="inline-flex h-7 w-7 cursor-grab items-center justify-center rounded border border-[var(--border)] bg-[var(--surface-muted)] text-[var(--muted)] active:cursor-grabbing"
              aria-label={`Deplacer le widget ${title}`}
            >
              <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 24 24" aria-hidden>
                <circle cx="9" cy="6" r="1.5" />
                <circle cx="15" cy="6" r="1.5" />
                <circle cx="9" cy="12" r="1.5" />
                <circle cx="15" cy="12" r="1.5" />
                <circle cx="9" cy="18" r="1.5" />
                <circle cx="15" cy="18" r="1.5" />
              </svg>
            </button>
          </div>
        ) : null}
      </div>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function DeadlineWindowWidget({
  t,
  deadlineStart,
  deadlineUnit,
  deadlineAmount,
  onChangeStart,
  onChangeUnit,
  onChangeAmount,
  onShift,
  rangeLabel,
  items,
  severityLabel,
}: {
  t: (en: string, fr: string) => string;
  deadlineStart: string;
  deadlineUnit: DeadlineUnit;
  deadlineAmount: number;
  onChangeStart: (value: string) => void;
  onChangeUnit: (value: DeadlineUnit) => void;
  onChangeAmount: (value: number) => void;
  onShift: (direction: "back" | "forward") => void;
  rangeLabel: string;
  items: Array<Vuln & { dueDate: Date }>;
  severityLabel: Record<Severity, string>;
}) {
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
        <button type="button" onClick={() => onShift("back")} className="ui-btn-secondary px-2 py-1 text-xs">
          ◀
        </button>
        <button type="button" onClick={() => onShift("forward")} className="ui-btn-secondary px-2 py-1 text-xs">
          ▶
        </button>
        <label className="text-[var(--muted)]">
          {t("Start", "Debut")}:
          <input type="date" value={deadlineStart} onChange={(e) => onChangeStart(e.target.value)} className="ui-input ml-2 px-2 py-1 text-xs" />
        </label>
        <label className="text-[var(--muted)]">
          {t("Window", "Fenetre")}:
          <input
            type="number"
            min={1}
            max={36}
            value={deadlineAmount}
            onChange={(e) => onChangeAmount(Number(e.target.value) || 1)}
            className="ui-input ml-2 w-16 px-2 py-1 text-xs"
          />
        </label>
        <select value={deadlineUnit} onChange={(e) => onChangeUnit(e.target.value as DeadlineUnit)} className="ui-input px-2 py-1 text-xs">
          <option value="days">{t("Days", "Jours")}</option>
          <option value="months">{t("Months", "Mois")}</option>
        </select>
        <span className="rounded-full bg-[var(--surface-muted)] px-2 py-1 text-[11px] text-[var(--muted)]">{rangeLabel}</span>
      </div>
      {items.length === 0 ? (
        <p className="text-xs text-[var(--muted)]">{t("No upcoming deadline in this window.", "Aucune echeance dans cette fenetre.")}</p>
      ) : (
        <ul className="space-y-2">
          {items.slice(0, 14).map((v) => (
            <li key={v.id} className="flex items-center justify-between rounded border border-[var(--border)] bg-[var(--surface-muted)] px-2.5 py-2 text-xs">
              <div className="min-w-0">
                <p className="truncate font-semibold text-[var(--text)]">{v.title}</p>
                <p className="text-[11px] text-[var(--muted)]">{severityLabel[v.severity]}</p>
              </div>
              <span className="ml-2 shrink-0 rounded-full bg-[var(--surface)] px-2 py-0.5 font-semibold text-[var(--text)]">
                {v.dueDate.toLocaleDateString()}
              </span>
            </li>
          ))}
          {items.length > 14 ? <li className="text-[11px] text-[var(--muted)]">+{items.length - 14}...</li> : null}
        </ul>
      )}
    </div>
  );
}

function Kpi({ title, value, accent }: { title: string; value: number; accent?: boolean }) {
  return (
    <div className="rounded-md border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-2">
      <p className="text-[11px] uppercase tracking-wide text-[var(--muted)]">{title}</p>
      <p className={`text-2xl font-bold ${accent ? "text-[var(--accent)]" : "text-[var(--text)]"}`}>{value}</p>
    </div>
  );
}

function RowCount({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div className="flex items-center justify-between rounded border border-[var(--border)] px-2.5 py-1.5 text-xs">
      <span style={color ? { color } : undefined} className="font-medium text-[var(--muted)]">
        {label}
      </span>
      <span className="font-bold text-[var(--text)]">{value}</span>
    </div>
  );
}

function TrendChart({
  buckets,
  series,
  yMax,
  severityLabel,
  visibleSeverities,
}: {
  buckets: { key: string; label: string }[];
  series: Record<Severity, number[]>;
  yMax: number;
  severityLabel: Record<Severity, string>;
  visibleSeverities: Record<Severity, boolean>;
}) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const width = 920;
  const height = 300;
  const margin = { top: 16, right: 16, bottom: 36, left: 36 };
  const plotW = width - margin.left - margin.right;
  const plotH = height - margin.top - margin.bottom;
  const xFor = (i: number) => margin.left + (i / Math.max(1, buckets.length - 1)) * plotW;
  const yFor = (v: number) => margin.top + plotH - (v / yMax) * plotH;

  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${width} ${height}`} className="h-auto min-w-[760px] w-full">
        {[0, 0.25, 0.5, 0.75, 1].map((r, i) => {
          const v = Math.round(yMax * r);
          const y = yFor(v);
          return (
            <g key={i}>
              <line x1={margin.left} y1={y} x2={width - margin.right} y2={y} stroke="#cbd5e1" strokeWidth="1" />
              <text x={6} y={y + 4} fontSize="10" fill="#64748b">
                {v}
              </text>
            </g>
          );
        })}
        {buckets.map((m, i) => (
          <text key={m.key} x={xFor(i)} y={height - 10} textAnchor="middle" fontSize="10" fill="#64748b">
            {m.label}
          </text>
        ))}
        {hoverIdx != null ? (
          <line
            x1={xFor(hoverIdx)}
            y1={margin.top}
            x2={xFor(hoverIdx)}
            y2={height - margin.bottom}
            stroke="#94a3b8"
            strokeDasharray="3 3"
          />
        ) : null}
        {severityOrder.filter((s) => visibleSeverities[s]).map((s) => {
          const pts = series[s].map((v, i) => `${xFor(i)},${yFor(v)}`).join(" ");
          return (
            <g key={s}>
              <polyline fill="none" stroke={severityColor[s]} strokeWidth="2.2" points={pts} />
              {series[s].map((v, i) => (
                <circle key={`${s}-${i}`} cx={xFor(i)} cy={yFor(v)} r="3" fill={severityColor[s]}>
                  <title>{`${severityLabel[s]} - ${buckets[i]?.label ?? ""}: ${v}`}</title>
                </circle>
              ))}
            </g>
          );
        })}
        <rect
          x={margin.left}
          y={margin.top}
          width={plotW}
          height={plotH}
          fill="transparent"
          onMouseLeave={() => setHoverIdx(null)}
          onMouseMove={(e) => {
            if (!buckets.length) return;
            const svg = e.currentTarget.ownerSVGElement;
            if (!svg) return;
            const point = svg.createSVGPoint();
            point.x = e.clientX;
            point.y = e.clientY;
            const ctm = svg.getScreenCTM();
            if (!ctm) return;
            const transformed = point.matrixTransform(ctm.inverse());
            const ratio = (transformed.x - margin.left) / plotW;
            const idx = Math.max(0, Math.min(buckets.length - 1, Math.round(ratio * Math.max(1, buckets.length - 1))));
            setHoverIdx(idx);
          }}
        />
        {hoverIdx != null && buckets[hoverIdx] ? (
          <g transform={`translate(${Math.min(width - 200, xFor(hoverIdx) + 8)}, ${margin.top + 10})`}>
            <rect x="0" y="0" width="190" height="110" rx="8" fill="#0f172a" opacity="0.92" />
            <text x="10" y="16" fontSize="11" fill="#e2e8f0">
              {buckets[hoverIdx].label}
            </text>
            {severityOrder.filter((s) => visibleSeverities[s]).map((s, i) => (
              <text key={s} x="10" y={34 + i * 14} fontSize="11" fill={severityColor[s]}>
                {severityLabel[s]}: {series[s][hoverIdx]}
              </text>
            ))}
          </g>
        ) : null}
      </svg>
      <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
        {severityOrder.filter((s) => visibleSeverities[s]).map((s) => (
          <span key={s} className="inline-flex items-center gap-1 text-[var(--muted)]">
            <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: severityColor[s] }} />
            {severityLabel[s]}
          </span>
        ))}
      </div>
    </div>
  );
}

function toDateInput(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseDateInput(s: string): Date | null {
  if (!s) return null;
  const d = new Date(`${s}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function startOfWeekMonday(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  const day = (x.getDay() + 6) % 7;
  x.setDate(x.getDate() - day);
  return x;
}

function bucketKey(d: Date, granularity: TrendGranularity): string {
  if (granularity === "month") return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  if (granularity === "day") return toDateInput(d);
  const w = startOfWeekMonday(d);
  return `W-${toDateInput(w)}`;
}

function buildTrendBuckets(
  start: Date,
  end: Date,
  granularity: TrendGranularity,
  locale: "en" | "fr",
): { key: string; label: string }[] {
  const out: { key: string; label: string }[] = [];
  const current = new Date(start);
  current.setHours(0, 0, 0, 0);

  if (granularity === "month") {
    current.setDate(1);
    while (current <= end) {
      out.push({
        key: bucketKey(current, "month"),
        label: current.toLocaleDateString(locale === "fr" ? "fr-FR" : "en-US", { month: "short", year: "2-digit" }),
      });
      current.setMonth(current.getMonth() + 1);
    }
    return out;
  }

  if (granularity === "week") {
    let week = startOfWeekMonday(current);
    while (week <= end) {
      out.push({
        key: bucketKey(week, "week"),
        label:
          (locale === "fr" ? "S" : "W") +
          " " +
          week.toLocaleDateString(locale === "fr" ? "fr-FR" : "en-US", { day: "2-digit", month: "2-digit" }),
      });
      week = new Date(week);
      week.setDate(week.getDate() + 7);
    }
    return out;
  }

  while (current <= end) {
    out.push({
      key: bucketKey(current, "day"),
      label: current.toLocaleDateString(locale === "fr" ? "fr-FR" : "en-US", { day: "2-digit", month: "2-digit" }),
    });
    current.setDate(current.getDate() + 1);
  }
  return out;
}

function createDonutSegments(values: number[]) {
  const total = values.reduce((a, b) => a + b, 0);
  if (!total) return [];
  let start = 0;
  return values.map((v) => {
    const ratio = v / total;
    const end = start + ratio;
    const seg = { start, end, value: v };
    start = end;
    return seg;
  });
}

function arcPath(cx: number, cy: number, r: number, start: number, end: number): string {
  const a0 = start * Math.PI * 2 - Math.PI / 2;
  const a1 = end * Math.PI * 2 - Math.PI / 2;
  const x0 = cx + r * Math.cos(a0);
  const y0 = cy + r * Math.sin(a0);
  const x1 = cx + r * Math.cos(a1);
  const y1 = cy + r * Math.sin(a1);
  const large = end - start > 0.5 ? 1 : 0;
  return `M ${cx} ${cy} L ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1} Z`;
}

function DonutWidget({
  title,
  data,
  severityLabel,
  totalLabel,
}: {
  title: string;
  data: Record<Severity, number>;
  severityLabel: Record<Severity, string>;
  totalLabel: string;
}) {
  const values = severityOrder.map((s) => data[s]);
  const segments = createDonutSegments(values);
  const total = values.reduce((a, b) => a + b, 0);
  return (
    <div>
      <p className="text-xs text-[var(--muted)]">{title}</p>
      <div className="mt-2 flex items-center gap-4">
        <svg viewBox="0 0 180 180" className="h-36 w-36">
          <circle cx="90" cy="90" r="72" fill="#f1f5f9" />
          {segments.map((seg, i) => (
            <path key={i} d={arcPath(90, 90, 72, seg.start, seg.end)} fill={severityColor[severityOrder[i]]}>
              <title>{`${severityLabel[severityOrder[i]]}: ${seg.value}`}</title>
            </path>
          ))}
          <circle cx="90" cy="90" r="42" fill="white" />
          <text x="90" y="88" textAnchor="middle" fontSize="11" fill="#64748b">
            {totalLabel}
          </text>
          <text x="90" y="104" textAnchor="middle" fontSize="14" fontWeight="700" fill="#0f172a">
            {total}
          </text>
        </svg>
        <div className="space-y-1.5 text-xs">
          {severityOrder.map((s) => (
            <div key={s} className="flex items-center justify-between gap-3">
              <span className="inline-flex items-center gap-1 text-[var(--muted)]">
                <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: severityColor[s] }} />
                {severityLabel[s]}
              </span>
              <span className="font-semibold text-[var(--text)]">{data[s]}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
