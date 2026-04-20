"use client";

import {
  closestCenter,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragCancelEvent,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { arrayMove, rectSortingStrategy, SortableContext, sortableKeyboardCoordinates, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  useEffect,
  useMemo,
  useState,
  type ButtonHTMLAttributes,
  type CSSProperties,
  type ReactNode,
} from "react";
import { useLocale } from "@/components/LocaleProvider";
import { dateLocaleTag } from "@/lib/ui-i18n";

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
  {
    id: "trend_chart",
    title: "Trend Over Time",
    description: "Open backlog by severity over time (from status timeline).",
  },
  { id: "open_pie", title: "Open by Type", description: "Donut of open alerts by severity." },
  { id: "inprogress_pie", title: "In Progress by Type", description: "Donut of in-progress alerts by severity." },
];

function widgetHeading(id: WidgetId, locale: "en" | "fr"): string {
  if (locale === "fr") {
    const fr: Record<WidgetId, string> = {
      kpi_overview: "Indicateurs globaux",
      deadlines_window: "Échéances à venir",
      status_breakdown: "Répartition par statut",
      severity_breakdown: "Répartition par criticité",
      trend_chart: "Évolution dans le temps",
      open_pie: "Ouvertes par criticité",
      inprogress_pie: "En cours par criticité",
    };
    return fr[id];
  }
  return WIDGETS.find((w) => w.id === id)?.title ?? id;
}

function widgetDescription(id: WidgetId, locale: "en" | "fr"): string {
  if (locale === "fr") {
    const fr: Record<WidgetId, string> = {
      kpi_overview: "Volume, ouvertes, en cours, critiques.",
      deadlines_window: "Fenêtre personnalisable en jours ou en mois.",
      status_breakdown: "Nombre d’alertes par statut.",
      severity_breakdown: "Nombre d’alertes par criticité.",
      trend_chart: "Stock ouvert par criticité dans le temps (chronologie des statuts).",
      open_pie: "Anneau des alertes ouvertes par criticité.",
      inprogress_pie: "Anneau des alertes en cours par criticité.",
    };
    return fr[id];
  }
  return WIDGETS.find((w) => w.id === id)?.description ?? "";
}

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
  HIGH: "Élevée",
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
  TODO: "À traiter",
  IN_PROGRESS: "En cours",
  DONE: "Terminées",
  ARCHIVE: "Acquittées",
};

async function parseJson<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(typeof err.error === "string" ? err.error : res.statusText);
  }
  return res.json() as Promise<T>;
}

/** Re-injecte l’ordre des widgets visibles dans le tableau `layout` complet (les masqués gardent leur place). */
function mergeVisibleOrder(layout: WidgetId[], hidden: WidgetId[], newVisibleOrder: WidgetId[]): WidgetId[] {
  const h = new Set(hidden);
  let i = 0;
  return layout.map((id) => (h.has(id) ? id : newVisibleOrder[i++]!));
}

function widgetGridSpanClass(id: WidgetId): string {
  const wide = id === "trend_chart" || id === "kpi_overview" || id === "deadlines_window";
  return wide ? "lg:col-span-12" : "lg:col-span-6 xl:col-span-4";
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

  const widgetSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

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

  const [stockBuckets, setStockBuckets] = useState<{ key: string; label: string }[]>([]);
  const [stockSeries, setStockSeries] = useState<Record<Severity, number[]> | null>(null);
  const [stockLoading, setStockLoading] = useState(false);
  const [stockError, setStockError] = useState<string | null>(null);

  const [deadlineStart, setDeadlineStart] = useState<string>(() => toDateInput(new Date()));
  const [deadlineUnit, setDeadlineUnit] = useState<DeadlineUnit>("days");
  const [deadlineAmount, setDeadlineAmount] = useState(7);

  /** Copie flottante pendant le drag (évite le scale imposé par la grille sur l’item source). */
  const [dragOverlayWidget, setDragOverlayWidget] = useState<WidgetId | null>(null);
  const [dragOverlaySize, setDragOverlaySize] = useState<{ width: number; height: number } | null>(null);

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

  const trendStatusFilterKey = useMemo(
    () =>
      (Object.keys(trendStatuses) as VulnStatus[])
        .filter((k) => trendStatuses[k])
        .sort()
        .join(","),
    [trendStatuses],
  );

  useEffect(() => {
    let cancelled = false;
    const statuses = (Object.keys(trendStatuses) as VulnStatus[]).filter((k) => trendStatuses[k]);
    if (statuses.length === 0) {
      setStockBuckets([]);
      setStockSeries(null);
      setStockLoading(false);
      return;
    }
    setStockLoading(true);
    setStockError(null);
    const qs = new URLSearchParams({
      from: trendStart,
      to: trendEnd,
      granularity: trendGranularity,
      statuses: statuses.join(","),
      locale,
    });
    void (async () => {
      try {
        const body = await parseJson<{
          buckets: { key: string; label: string }[];
          series: Record<Severity, number[]>;
        }>(await fetch(`/api/analytics/open-stock?${qs}`));
        if (cancelled) return;
        setStockBuckets(body.buckets);
        setStockSeries(body.series);
      } catch (e) {
        if (!cancelled) {
          setStockError(e instanceof Error ? e.message : locale === "fr" ? "Erreur courbe" : "Failed to load trend");
          setStockBuckets([]);
          setStockSeries(null);
        }
      } finally {
        if (!cancelled) setStockLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [trendStart, trendEnd, trendGranularity, locale, trendStatusFilterKey]);

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

  const trendYMax = useMemo(() => {
    if (!stockSeries || stockBuckets.length === 0) return 5;
    return Math.max(
      5,
      ...severityOrder.filter((s) => trendSeverities[s]).flatMap((s) => stockSeries[s] ?? []),
      1,
    );
  }, [stockSeries, stockBuckets.length, trendSeverities]);

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

  function clearDragOverlay() {
    setDragOverlayWidget(null);
    setDragOverlaySize(null);
  }

  function handleWidgetDragStart(event: DragStartEvent) {
    const id = event.active.id as WidgetId;
    setDragOverlayWidget(id);
    const r = event.active.rect.current?.initial;
    if (r && r.width > 0 && r.height > 0) {
      setDragOverlaySize({ width: Math.round(r.width), height: Math.round(r.height) });
    } else {
      setDragOverlaySize(null);
    }
  }

  function handleWidgetDragCancel(_event: DragCancelEvent) {
    clearDragOverlay();
  }

  function handleWidgetDragEnd(event: DragEndEvent) {
    clearDragOverlay();
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const activeId = active.id as WidgetId;
    const overId = over.id as WidgetId;
    setLayout((prev) => {
      const visible = prev.filter((wid) => !hidden.includes(wid));
      const oldIdx = visible.indexOf(activeId);
      const newIdx = visible.indexOf(overId);
      if (oldIdx < 0 || newIdx < 0) return prev;
      const reordered = arrayMove(visible, oldIdx, newIdx);
      return mergeVisibleOrder(prev, hidden, reordered);
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

  const dashboardWidgetBody = (id: WidgetId) =>
    id === "kpi_overview" ? (
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Kpi title={t("Total", "Total")} value={items.length} />
        <Kpi title={t("Open", "Ouvertes")} value={openItems.length} accent />
        <Kpi title={t("In Progress", "En cours")} value={statusCounts.IN_PROGRESS} />
        <Kpi title={t("Acknowledged", "Acquittées")} value={statusCounts.ARCHIVE} />
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
        rangeLabel={`${deadlineRange.start.toLocaleDateString(dateLocaleTag(locale))} - ${deadlineRange.end.toLocaleDateString(dateLocaleTag(locale))}`}
        items={deadlinesWindowItems}
        severityLabel={severityLabel}
        dateLocale={dateLocaleTag(locale)}
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
            {t("Period", "Période")}:
            <select value={trendPreset} onChange={(e) => setTrendPreset(e.target.value as TrendPreset)} className="ui-input ml-2 px-2 py-1 text-xs">
              <option value="7d">7 {t("days", "jours")}</option>
              <option value="30d">30 {t("days", "jours")}</option>
              <option value="90d">90 {t("days", "jours")}</option>
              <option value="365d">365 {t("days", "jours")}</option>
              <option value="custom">{t("Custom", "Personnalisée")}</option>
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
            {t("Granularity", "Granularité")}:
            <select value={trendGranularity} onChange={(e) => setTrendGranularity(e.target.value as TrendGranularity)} className="ui-input ml-2 px-2 py-1 text-xs">
              <option value="day">{t("Day", "Jour")}</option>
              <option value="week">{t("Week", "Semaine")}</option>
              <option value="month">{t("Month", "Mois")}</option>
            </select>
          </label>
          <details className="relative">
            <summary className="ui-btn-secondary list-none cursor-pointer px-2.5 py-1 text-xs">
              {t("Statuses (stock)", "Statuts (stock)")}
            </summary>
            <div className="absolute z-20 mt-1 w-56 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-2 shadow-xl">
              <p className="mb-2 text-[10px] leading-snug text-[var(--muted)]">
                {t(
                  "Count vulnerabilities in each status at the end of each period (timeline replay).",
                  "Compte les fiches dans chaque statut en fin de période (rejoue la chronologie).",
                )}
              </p>
              {(Object.keys(statusLabel) as VulnStatus[]).map((s) => (
                <label key={s} className="flex items-center gap-2 text-xs text-[var(--muted)]">
                  <input type="checkbox" checked={trendStatuses[s]} onChange={() => toggleTrendStatus(s)} className="h-3.5 w-3.5 rounded border-[var(--border)]" />
                  <span>{statusLabel[s]}</span>
                </label>
              ))}
            </div>
          </details>
          <details className="relative">
            <summary className="ui-btn-secondary list-none cursor-pointer px-2.5 py-1 text-xs">{t("Severities", "Criticités")}</summary>
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
        {stockError ? <p className="text-xs text-red-600 dark:text-red-300">{stockError}</p> : null}
        {stockLoading ? <p className="text-xs text-[var(--muted)]">{t("Loading trend…", "Chargement de la courbe…")}</p> : null}
        {!stockLoading && !stockError && stockBuckets.length > 0 && stockSeries ? (
          <TrendChart
            buckets={stockBuckets}
            series={stockSeries}
            yMax={trendYMax}
            severityLabel={severityLabel}
            visibleSeverities={trendSeverities}
          />
        ) : !stockLoading && !stockError && stockBuckets.length === 0 ? (
          <p className="text-xs text-[var(--muted)]">
            {t("Select at least one status to plot.", "Cochez au moins un statut pour afficher la courbe.")}
          </p>
        ) : null}
        <p className="mt-2 text-[10px] leading-snug text-[var(--muted)]">
          {t(
            "Based on creation and status-change history (not simple creation dates).",
            "Basé sur l’historique des créations et changements de statut (pas seulement la date de création).",
          )}
        </p>
      </div>
    ) : id === "open_pie" ? (
      <DonutWidget title={t("Open by Severity", "Ouvertes par criticité")} data={openBySeverity} severityLabel={severityLabel} totalLabel={t("Total", "Total")} />
    ) : (
      <DonutWidget title={t("In Progress by Severity", "En cours par criticité")} data={inProgressBySeverity} severityLabel={severityLabel} totalLabel={t("Total", "Total")} />
    );

  const dashboardGridClass = "grid grid-cols-1 gap-4 lg:grid-cols-12";

  return (
    <div className="mx-auto max-w-[1480px] px-5 py-8 lg:px-10 lg:py-10">
      <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--accent)]">
            {t("Main View", "Vue principale")}
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-[var(--text)] sm:text-3xl">
            {t("Vulnerability Monitoring", "Suivi des vulnérabilités")}
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => void loadData()} className="ui-btn-secondary px-4 py-2 text-xs font-semibold">
            {t("Refresh data", "Actualiser les données")}
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
              {t("Reset layout", "Réinitialiser la vue")}
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
            {t("Show/hide and reorder widgets", "Afficher / masquer et réorganiser les widgets")}
          </p>
          <p className="mt-1 text-[11px] leading-snug text-[var(--muted)]">
            {t(
              "Drag the grip on each widget to move it smoothly on the grid.",
              "Glissez la poignée sur chaque widget pour le déplacer fluidement sur la grille.",
            )}
          </p>
          <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2">
            {layout.map((id) => {
              const hiddenNow = hidden.includes(id);
              return (
                <div key={id} className="flex items-center justify-between rounded border border-[var(--border)] px-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-xs font-semibold text-[var(--text)]">{widgetHeading(id, locale)}</p>
                    <p className="truncate text-[11px] text-[var(--muted)]">{widgetDescription(id, locale)}</p>
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
      {loading ? <p className="text-sm text-[var(--muted)]">{t("Loading…", "Chargement…")}</p> : null}

      {!loading ? (
        editMode ? (
          <DndContext
            sensors={widgetSensors}
            collisionDetection={closestCenter}
            onDragStart={handleWidgetDragStart}
            onDragCancel={handleWidgetDragCancel}
            onDragEnd={handleWidgetDragEnd}
          >
            <SortableContext items={visibleWidgets} strategy={rectSortingStrategy}>
              <div className={dashboardGridClass}>
                {visibleWidgets.map((id) => (
                  <SortableWidgetCard
                    key={id}
                    id={id}
                    locale={locale}
                    heading={widgetHeading(id, locale)}
                    dragSnapshotSize={dragOverlayWidget === id ? dragOverlaySize : null}
                    canRemove={visibleWidgets.length > 1}
                    removeLabel={t("Remove widget", "Supprimer le widget")}
                    onRemove={() => toggleWidget(id)}
                  >
                    {dashboardWidgetBody(id)}
                  </SortableWidgetCard>
                ))}
              </div>
            </SortableContext>
            <DragOverlay dropAnimation={null}>
              {dragOverlayWidget && dragOverlaySize ? (
                <div
                  className="box-border cursor-grabbing overflow-hidden rounded-[var(--radius-lg)] shadow-2xl ring-2 ring-[var(--accent)]/25"
                  style={{
                    width: dragOverlaySize.width,
                    maxWidth: "min(100vw - 24px, 1400px)",
                    pointerEvents: "none",
                  }}
                >
                  <WidgetShell
                    id={dragOverlayWidget}
                    heading={widgetHeading(dragOverlayWidget, locale)}
                    locale={locale}
                    fillGridCell
                    showControls={false}
                    canRemove={false}
                    removeLabel=""
                    onRemove={() => {}}
                  >
                    {dashboardWidgetBody(dragOverlayWidget)}
                  </WidgetShell>
                </div>
              ) : dragOverlayWidget ? (
                <div className="min-w-[280px] max-w-[min(100vw-24px,1400px)] cursor-grabbing rounded-[var(--radius-lg)] shadow-2xl ring-2 ring-[var(--accent)]/25">
                  <WidgetShell
                    id={dragOverlayWidget}
                    heading={widgetHeading(dragOverlayWidget, locale)}
                    locale={locale}
                    fillGridCell
                    showControls={false}
                    canRemove={false}
                    removeLabel=""
                    onRemove={() => {}}
                  >
                    {dashboardWidgetBody(dragOverlayWidget)}
                  </WidgetShell>
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>
        ) : (
          <div className={dashboardGridClass}>
            {visibleWidgets.map((id) => (
              <WidgetShell
                key={id}
                id={id}
                heading={widgetHeading(id, locale)}
                locale={locale}
                canRemove={visibleWidgets.length > 1}
                removeLabel={t("Remove widget", "Supprimer le widget")}
                onRemove={() => toggleWidget(id)}
              >
                {dashboardWidgetBody(id)}
              </WidgetShell>
            ))}
          </div>
        )
      ) : null}
    </div>
  );
}

function SortableWidgetCard({
  id,
  children,
  locale,
  heading,
  dragSnapshotSize,
  canRemove,
  removeLabel,
  onRemove,
}: {
  id: WidgetId;
  children: ReactNode;
  locale: "en" | "fr";
  heading: string;
  /** Taille mesurée au pointerdown : garde la cellule stable quand l’overlay prend le rendu visuel. */
  dragSnapshotSize: { width: number; height: number } | null;
  canRemove: boolean;
  removeLabel: string;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
    /** Désactive le `derivedTransform` (scaleX/scaleY) quand la grille recalcule les colonnes — source du « resize ». */
    animateLayoutChanges: () => false,
  });
  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition: isDragging ? undefined : transition,
    opacity: isDragging ? 0 : 1,
    zIndex: isDragging ? 0 : undefined,
    ...(isDragging && dragSnapshotSize
      ? {
          minWidth: dragSnapshotSize.width,
          minHeight: dragSnapshotSize.height,
        }
      : {}),
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`${widgetGridSpanClass(id)} w-full min-w-0 max-w-full self-start`}
    >
      <WidgetShell
        id={id}
        heading={heading}
        locale={locale}
        fillGridCell
        isDragging={isDragging}
        showControls
        dragHandleProps={{ ...attributes, ...listeners }}
        canRemove={canRemove}
        removeLabel={removeLabel}
        onRemove={onRemove}
      >
        {children}
      </WidgetShell>
    </div>
  );
}

function WidgetShell({
  id,
  heading,
  locale = "en",
  children,
  rootRef,
  rootStyle,
  fillGridCell = false,
  isDragging,
  showControls = false,
  dragHandleProps,
  canRemove,
  removeLabel,
  onRemove,
}: {
  id: WidgetId;
  /** Titre affiché (libellé localisé). */
  heading: string;
  locale?: "en" | "fr";
  children: ReactNode;
  /** Quand le parent (sortable) porte déjà `col-span` + transform sur un wrapper. */
  fillGridCell?: boolean;
  rootRef?: (node: HTMLElement | null) => void;
  rootStyle?: CSSProperties;
  isDragging?: boolean;
  showControls?: boolean;
  dragHandleProps?: ButtonHTMLAttributes<HTMLButtonElement>;
  canRemove: boolean;
  removeLabel: string;
  onRemove: () => void;
}) {
  const wide = id === "trend_chart" || id === "kpi_overview" || id === "deadlines_window";
  const showHandle = Boolean(dragHandleProps);
  const reorderHint =
    locale === "fr" ? `${heading} — glisser pour réorganiser` : `${heading} — drag to reorder`;
  const spanClass = fillGridCell ? "" : wide ? "lg:col-span-12" : "lg:col-span-6 xl:col-span-4";
  const widthClass = fillGridCell ? "w-full min-w-0 max-w-full" : "";

  return (
    <section
      ref={fillGridCell ? undefined : rootRef}
      style={fillGridCell ? undefined : rootStyle}
      className={`ui-card touch-manipulation p-4 transition-shadow ${spanClass} ${widthClass} ${
        isDragging ? "shadow-xl ring-2 ring-[var(--accent)]/30" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <h2 className="text-sm font-semibold text-[var(--text)]">{heading}</h2>
        {showControls ? (
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
            {showHandle ? (
              <button
                type="button"
                className="inline-flex h-7 w-7 cursor-grab touch-none items-center justify-center rounded border border-[var(--border)] bg-[var(--surface-muted)] text-[var(--muted)] hover:bg-[var(--column)]/40 active:cursor-grabbing"
                aria-label={reorderHint}
                title={reorderHint}
                {...dragHandleProps}
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
            ) : null}
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
  dateLocale,
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
  dateLocale: string;
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
          {t("Start", "Début")}:
          <input type="date" value={deadlineStart} onChange={(e) => onChangeStart(e.target.value)} className="ui-input ml-2 px-2 py-1 text-xs" />
        </label>
        <label className="text-[var(--muted)]">
          {t("Window", "Fenêtre")}:
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
        <p className="text-xs text-[var(--muted)]">{t("No upcoming deadline in this window.", "Aucune échéance dans cette fenêtre.")}</p>
      ) : (
        <ul className="space-y-2">
          {items.slice(0, 14).map((v) => (
            <li key={v.id} className="flex items-center justify-between rounded border border-[var(--border)] bg-[var(--surface-muted)] px-2.5 py-2 text-xs">
              <div className="min-w-0">
                <p className="truncate font-semibold text-[var(--text)]">{v.title}</p>
                <p className="text-[11px] text-[var(--muted)]">{severityLabel[v.severity]}</p>
              </div>
              <span className="ml-2 shrink-0 rounded-full bg-[var(--surface)] px-2 py-0.5 font-semibold text-[var(--text)]">
                {v.dueDate.toLocaleDateString(dateLocale, { day: "numeric", month: "short" })}
              </span>
            </li>
          ))}
          {items.length > 14 ? (
            <li className="text-[11px] text-[var(--muted)]">
              {t(`+${items.length - 14} more`, `+${items.length - 14} autres…`)}
            </li>
          ) : null}
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
