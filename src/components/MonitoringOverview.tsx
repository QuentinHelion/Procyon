"use client";

import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { useEffect, useMemo, useState } from "react";
import { useLocale } from "@/components/LocaleProvider";

type Severity = "INFO" | "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
type VulnStatus = "TODO" | "IN_PROGRESS" | "DONE" | "ARCHIVE";

type Vuln = {
  id: string;
  severity: Severity;
  status: VulnStatus;
  createdAt: string;
  acknowledgedAt: string | null;
};

type WidgetId =
  | "kpi_overview"
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

const WIDGETS: WidgetDef[] = [
  { id: "kpi_overview", title: "Global KPIs", description: "Volume, open, in progress, critical." },
  { id: "status_breakdown", title: "Status Breakdown", description: "Alerts count by status." },
  { id: "severity_breakdown", title: "Severity Breakdown", description: "Alerts count by severity." },
  { id: "trend_chart", title: "Trend Over Time", description: "Monthly evolution by severity." },
  { id: "open_pie", title: "Open by Type", description: "Donut of open alerts by severity." },
  { id: "inprogress_pie", title: "In Progress by Type", description: "Donut of in-progress alerts by severity." },
];

const DEFAULT_LAYOUT: WidgetId[] = [
  "kpi_overview",
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
  const [activeWidgetId, setActiveWidgetId] = useState<WidgetId | null>(null);
  const [trendGranularity, setTrendGranularity] = useState<TrendGranularity>("month");
  const [trendPreset, setTrendPreset] = useState<TrendPreset>("90d");
  const [trendStart, setTrendStart] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 90);
    return toDateInput(d);
  });
  const [trendEnd, setTrendEnd] = useState<string>(() => toDateInput(new Date()));
  const [trendStatuses, setTrendStatuses] = useState<Record<VulnStatus, boolean>>({
    TODO: true,
    IN_PROGRESS: true,
    DONE: true,
    ARCHIVE: false,
  });
  const [trendSeverities, setTrendSeverities] = useState<Record<Severity, boolean>>({
    CRITICAL: true,
    HIGH: true,
    MEDIUM: true,
    LOW: true,
    INFO: false,
  });
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));
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
      if (raw) {
        const parsed = JSON.parse(raw) as { layout: WidgetId[]; hidden: WidgetId[] };
        if (Array.isArray(parsed.layout) && Array.isArray(parsed.hidden)) {
          setLayout(parsed.layout.filter((id) => WIDGETS.some((w) => w.id === id)));
          setHidden(parsed.hidden.filter((id) => WIDGETS.some((w) => w.id === id)));
        }
      }
    } catch {
      // ignore invalid local data
    }
  }, []);

  useEffect(() => {
    localStorage.setItem("procyon-overview-layout", JSON.stringify({ layout, hidden }));
  }, [layout, hidden]);

  async function loadData() {
    setLoading(true);
    setError(null);
    try {
      const data = await parseJson<Vuln[]>(await fetch("/api/vulnerabilities"));
      setItems(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("Loading error", "Erreur de chargement"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let mounted = true;
    void (async () => {
      try {
        const data = await parseJson<Vuln[]>(await fetch("/api/vulnerabilities"));
        if (!mounted) return;
        setItems(data);
      } catch (e) {
        if (!mounted) return;
        setError(e instanceof Error ? e.message : t("Loading error", "Erreur de chargement"));
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
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
  }, [trendEnd, trendGranularity, trendStart, locale]);

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
    return base;
  }, [items, trendBuckets, trendGranularity, trendSeverities, trendStatuses]);

  const trendYMax = useMemo(
    () => Math.max(5, ...severityOrder.flatMap((s) => trendSeries[s]), 1),
    [trendSeries],
  );

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

  function onDragEnd(event: DragEndEvent) {
    setActiveWidgetId(null);
    const { active, over } = event;
    if (!over) return;
    const a = String(active.id) as WidgetId;
    const b = String(over.id) as WidgetId;
    if (a === b) return;
    setLayout((prev) => {
      const i = prev.indexOf(a);
      const j = prev.indexOf(b);
      if (i < 0 || j < 0) return prev;
      const next = [...prev];
      next.splice(i, 1);
      next.splice(j, 0, a);
      return next;
    });
  }

  function toggleTrendStatus(status: VulnStatus) {
    setTrendStatuses((prev) => {
      const next = { ...prev, [status]: !prev[status] };
      if (!Object.values(next).some(Boolean)) return prev;
      return next;
    });
  }

  function toggleTrendSeverity(severity: Severity) {
    setTrendSeverities((prev) => {
      const next = { ...prev, [severity]: !prev[severity] };
      if (!Object.values(next).some(Boolean)) return prev;
      return next;
    });
  }

  return (
    <div className="mx-auto max-w-[1480px] px-5 py-8 lg:px-10 lg:py-10">
      <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--accent)]">{t("Main View", "Vue principale")}</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-[var(--text)] sm:text-3xl">
            {t("Vulnerability Monitoring", "Monitoring des vulnérabilités")}
          </h1>
          <p className="mt-2 text-sm text-[var(--muted)]">
            {t(
              "Modern widget dashboard: stats, granularity, trends and workload.",
              "Dashboard moderne par widgets : stats, granularité, tendances et charges de traitement.",
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => void loadData()} className="ui-btn-secondary px-4 py-2 text-xs font-semibold">
            {t("Refresh data", "Actualiser les données")}
          </button>
          <button
            type="button"
            onClick={() => {
              setLayout(DEFAULT_LAYOUT);
              setHidden([]);
            }}
            className="ui-btn-secondary px-4 py-2 text-xs font-semibold"
          >
            {t("Reset layout", "Réinitialiser la vue")}
          </button>
          <button
            type="button"
            onClick={() => setEditMode((v) => !v)}
            className="ui-btn-secondary px-4 py-2 text-xs font-semibold"
          >
            {editMode ? t("Finish customization", "Terminer la personnalisation") : t("Customize widgets", "Personnaliser les widgets")}
          </button>
        </div>
      </header>

      {editMode ? (
        <section className="ui-card mb-6 p-4">
          <p className="text-xs font-semibold text-[var(--muted)]">{t("Show/hide and reorder widgets", "Afficher / masquer et réorganiser les widgets")}</p>
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
                    <button
                      type="button"
                      onClick={() => toggleWidget(id)}
                      className="ui-btn-secondary px-2 py-1 text-[10px]"
                    >
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
      {loading ? <p className="text-sm text-[var(--muted)]">{t("Loading...", "Chargement…")}</p> : null}

      {!loading ? (
        <DndContext
          sensors={sensors}
          onDragStart={({ active }) => setActiveWidgetId(String(active.id) as WidgetId)}
          onDragCancel={() => setActiveWidgetId(null)}
          onDragEnd={onDragEnd}
        >
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
            {visibleWidgets.map((id) => (
              <DraggableWidgetShell key={id} id={id} draggable={editMode}>
              {id === "kpi_overview" ? (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <Kpi title={t("Total", "Total")} value={items.length} />
                  <Kpi title={t("Open", "Ouvertes")} value={openItems.length} accent />
                  <Kpi title={t("In Progress", "En cours")} value={statusCounts.IN_PROGRESS} />
                  <Kpi title={t("Acknowledged", "Acquittées")} value={statusCounts.ARCHIVE} />
                </div>
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
                      <select
                        value={trendPreset}
                        onChange={(e) => setTrendPreset(e.target.value as TrendPreset)}
                        className="ui-input ml-2 px-2 py-1 text-xs"
                      >
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
                          <input
                            type="date"
                            value={trendStart}
                            onChange={(e) => setTrendStart(e.target.value)}
                            className="ui-input ml-2 px-2 py-1 text-xs"
                          />
                        </label>
                        <label>
                          {t("To", "Au")}:
                          <input
                            type="date"
                            value={trendEnd}
                            onChange={(e) => setTrendEnd(e.target.value)}
                            className="ui-input ml-2 px-2 py-1 text-xs"
                          />
                        </label>
                      </div>
                    ) : null}
                    <label className="text-[var(--muted)]">
                      {t("Granularity", "Granularité")}:
                      <select
                        value={trendGranularity}
                        onChange={(e) => setTrendGranularity(e.target.value as TrendGranularity)}
                        className="ui-input ml-2 px-2 py-1 text-xs"
                      >
                        <option value="day">{t("Day", "Jour")}</option>
                        <option value="week">{t("Week", "Semaine")}</option>
                        <option value="month">{t("Month", "Mois")}</option>
                      </select>
                    </label>
                    <details className="relative">
                      <summary className="ui-btn-secondary list-none cursor-pointer px-2.5 py-1 text-xs">
                        {t("Statuses", "Statuts")}
                      </summary>
                      <div className="absolute z-20 mt-1 w-48 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-2 shadow-xl">
                        {(Object.keys(statusLabel) as VulnStatus[]).map((s) => (
                          <label key={s} className="flex items-center gap-2 text-xs text-[var(--muted)]">
                            <input
                              type="checkbox"
                              checked={trendStatuses[s]}
                              onChange={() => toggleTrendStatus(s)}
                              className="h-3.5 w-3.5 rounded border-[var(--border)]"
                            />
                            <span>{statusLabel[s]}</span>
                          </label>
                        ))}
                      </div>
                    </details>
                    <details className="relative">
                      <summary className="ui-btn-secondary list-none cursor-pointer px-2.5 py-1 text-xs">
                        {t("Severities", "Criticités")}
                      </summary>
                      <div className="absolute z-20 mt-1 w-48 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-2 shadow-xl">
                        {severityOrder.map((s) => (
                          <label key={s} className="flex items-center gap-2 text-xs text-[var(--muted)]">
                            <input
                              type="checkbox"
                              checked={trendSeverities[s]}
                              onChange={() => toggleTrendSeverity(s)}
                              className="h-3.5 w-3.5 rounded border-[var(--border)]"
                            />
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
                  />
                </div>
              ) : id === "open_pie" ? (
                <DonutWidget title={t("Open by Severity", "Ouvertes par criticité")} data={openBySeverity} severityLabel={severityLabel} totalLabel={t("Total", "Total")} />
              ) : (
                <DonutWidget title={t("In Progress by Severity", "En cours par criticité")} data={inProgressBySeverity} severityLabel={severityLabel} totalLabel={t("Total", "Total")} />
              )}
              </DraggableWidgetShell>
            ))}
          </div>
          <DragOverlay dropAnimation={null}>
            {activeWidgetId ? (
              <section className="ui-card w-[min(92vw,540px)] p-4 opacity-95">
                <h2 className="text-sm font-semibold text-[var(--text)]">
                  {WIDGETS.find((w) => w.id === activeWidgetId)?.title ?? activeWidgetId}
                </h2>
                <p className="mt-1 text-xs text-[var(--muted)]">{t("Drop to reorder the dashboard.", "Déposez pour réorganiser le dashboard.")}</p>
              </section>
            ) : null}
          </DragOverlay>
        </DndContext>
      ) : null}
    </div>
  );
}

function DraggableWidgetShell({
  id,
  children,
  draggable,
}: {
  id: WidgetId;
  children: React.ReactNode;
  draggable: boolean;
}) {
  const wide = id === "trend_chart" || id === "kpi_overview";
  const title = WIDGETS.find((w) => w.id === id)?.title ?? id;
  const { setNodeRef: setDropRef, isOver } = useDroppable({ id });
  const { attributes, listeners, setNodeRef: setDragRef, transform, isDragging } = useDraggable({
    id,
    disabled: !draggable,
  });
  const style = { transform: CSS.Translate.toString(transform) };

  function setRefs(el: HTMLElement | null) {
    setDropRef(el);
    setDragRef(el);
  }

  return (
    <section
      ref={setRefs}
      style={style}
      className={`ui-card p-4 transition-[transform,box-shadow,background-color] ${
        wide ? "lg:col-span-12" : "lg:col-span-6 xl:col-span-4"
      } ${isOver ? "ring-2 ring-[var(--accent)]/40" : ""} ${isDragging ? "opacity-70 shadow-xl" : ""}`}
    >
      <div className="flex items-start justify-between gap-2">
        <h2 className="text-sm font-semibold text-[var(--text)]">{title}</h2>
        {draggable ? (
          <button
            type="button"
            className="inline-flex h-7 w-7 cursor-grab items-center justify-center rounded border border-[var(--border)] bg-[var(--surface-muted)] text-[var(--muted)] active:cursor-grabbing"
            aria-label={`Déplacer le widget ${title}`}
            {...listeners}
            {...attributes}
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
      <div className="mt-3">{children}</div>
    </section>
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
}: {
  buckets: { key: string; label: string }[];
  series: Record<Severity, number[]>;
  yMax: number;
  severityLabel: Record<Severity, string>;
}) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const width = 920;
  const height = 300;
  const margin = { top: 16, right: 16, bottom: 36, left: 36 };
  const plotW = width - margin.left - margin.right;
  const plotH = height - margin.top - margin.bottom;
  const xFor = (i: number) => margin.left + (i / Math.max(1, buckets.length - 1)) * plotW;
  const yFor = (v: number) => margin.top + plotH - (v / yMax) * plotH;
  const tooltipX = hoverIdx == null ? 0 : xFor(hoverIdx);
  const tooltipY = hoverIdx == null ? 0 : margin.top + 10;

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
            x1={tooltipX}
            y1={margin.top}
            x2={tooltipX}
            y2={height - margin.bottom}
            stroke="#94a3b8"
            strokeDasharray="3 3"
          />
        ) : null}
        {severityOrder.map((s) => {
          const pts = series[s].map((v, i) => `${xFor(i)},${yFor(v)}`).join(" ");
          return (
            <g key={s}>
              <polyline fill="none" stroke={severityColor[s]} strokeWidth="2.2" points={pts} />
              {series[s].map((v, i) => (
                <circle key={`${s}-${i}`} cx={xFor(i)} cy={yFor(v)} r="3" fill={severityColor[s]}>
                  <title>{`${severityLabel[s]} - ${buckets[i].label}: ${v}`}</title>
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
        {hoverIdx != null ? (
          <g transform={`translate(${Math.min(width - 200, tooltipX + 8)}, ${tooltipY})`}>
            <rect x="0" y="0" width="190" height="110" rx="8" fill="#0f172a" opacity="0.92" />
            <text x="10" y="16" fontSize="11" fill="#e2e8f0">
              {buckets[hoverIdx].label}
            </text>
            {severityOrder.map((s, i) => (
              <text key={s} x="10" y={34 + i * 14} fontSize="11" fill={severityColor[s]}>
                {severityLabel[s]}: {series[s][hoverIdx]}
              </text>
            ))}
          </g>
        ) : null}
      </svg>
      <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
        {severityOrder.map((s) => (
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

function bucketKey(d: Date, g: TrendGranularity): string {
  if (g === "month") return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  if (g === "day") return toDateInput(d);
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
        label: current.toLocaleDateString(locale === "fr" ? "fr-FR" : "en-US", {
          month: "short",
          year: "2-digit",
        }),
      });
      current.setMonth(current.getMonth() + 1);
    }
    return out;
  }
  if (granularity === "week") {
    let w = startOfWeekMonday(current);
    while (w <= end) {
      out.push({
        key: bucketKey(w, "week"),
        label:
          (locale === "fr" ? "S" : "W") +
          " " +
          w.toLocaleDateString(locale === "fr" ? "fr-FR" : "en-US", { day: "2-digit", month: "2-digit" }),
      });
      w = new Date(w);
      w.setDate(w.getDate() + 7);
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
            <path
              key={i}
              d={arcPath(90, 90, 72, seg.start, seg.end)}
              fill={severityColor[severityOrder[i]]}
            >
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

