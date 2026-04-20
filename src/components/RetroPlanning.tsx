"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocale } from "@/components/LocaleProvider";
import {
  BUCKET_ORDER,
  bucketForTask,
  bucketLabel,
  toLocalDateKey,
  type PlanningBucketId,
} from "@/lib/planning-buckets";
import { dateLocaleTag, uiT } from "@/lib/ui-i18n";
import { PlanningTaskCard, type PlanningVuln } from "@/components/PlanningTaskCard";

type VulnStatus = PlanningVuln["status"];
type Vuln = PlanningVuln & { createdAt: string };
type PlanningView = "buckets" | "calendar";

async function parseJson<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(typeof err.error === "string" ? err.error : res.statusText);
  }
  return res.json() as Promise<T>;
}

function fromDateInputToIso(dateStr: string): string | null {
  if (!dateStr) return null;
  const d = new Date(`${dateStr}T12:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

export function RetroPlanning() {
  const { locale } = useLocale();
  const t = (en: string, fr: string) => uiT(locale, en, fr);
  const collatorLocale = locale === "fr" ? "fr" : "en";
  const [items, setItems] = useState<Vuln[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<PlanningView>("calendar");
  const [filterMode, setFilterMode] = useState<"with_done" | "unack_only">("with_done");
  const [calendarMonthOffset, setCalendarMonthOffset] = useState(0);

  const viewOptions = useMemo(() => {
    const loc = (en: string, fr: string) => uiT(locale, en, fr);
    return [
      {
        id: "calendar" as const,
        label: loc("Calendar", "Calendrier"),
        hint: loc("Monthly navigation with a dense, efficient view.", "Navigation mensuelle avec vue dense et efficace."),
      },
      {
        id: "buckets" as const,
        label: loc("Deadlines", "Échéances"),
        hint: loc("Overdue, this week, no date, etc.", "Retard, cette semaine, sans date, etc."),
      },
    ] satisfies { id: PlanningView; label: string; hint: string }[];
  }, [locale]);

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const data = await parseJson<Vuln[]>(await fetch("/api/vulnerabilities"));
      setItems(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : uiT(locale, "Error", "Erreur"));
    } finally {
      setLoading(false);
    }
  }, [locale]);

  useEffect(() => {
    void load();
  }, [load]);

  const visible = useMemo(() => {
    return items.filter((v) => {
      if (filterMode === "unack_only" && (v.status === "DONE" || v.status === "ARCHIVE" || Boolean(v.acknowledgedAt))) {
        return false;
      }
      return true;
    });
  }, [filterMode, items]);

  const grouped = useMemo(() => {
    const m = new Map<PlanningBucketId, Vuln[]>();
    for (const id of BUCKET_ORDER) m.set(id, []);
    m.set("done", []);

    const now = new Date();
    for (const v of visible) {
      const bucket = bucketForTask(v.status, v.dueAt ? new Date(v.dueAt) : null, now);
      m.get(bucket)?.push(v);
    }

    const sortByDue = (a: Vuln, b: Vuln) => {
      const aDue = a.dueAt ? new Date(a.dueAt).getTime() : Infinity;
      const bDue = b.dueAt ? new Date(b.dueAt).getTime() : Infinity;
      if (aDue !== bDue) return aDue - bDue;
      return a.title.localeCompare(b.title, collatorLocale);
    };

    for (const id of BUCKET_ORDER) m.get(id)?.sort(sortByDue);
    m.get("done")?.sort((a, b) => b.title.localeCompare(a.title, collatorLocale));
    return m;
  }, [visible, collatorLocale]);

  const calendarBaseDate = useMemo(() => {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() + calendarMonthOffset);
    return d;
  }, [calendarMonthOffset]);

  async function patchDue(id: string, dateStr: string) {
    const payload = dateStr === "" ? { dueAt: null as null } : { dueAt: fromDateInputToIso(dateStr) ?? null };
    const res = await fetch(`/api/vulnerabilities/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const updated = await parseJson<Vuln>(res);
    setItems((prev) => prev.map((x) => (x.id === id ? updated : x)));
  }

  async function patchStatus(id: string, status: VulnStatus) {
    const res = await fetch(`/api/vulnerabilities/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    const updated = await parseJson<Vuln>(res);
    setItems((prev) => prev.map((x) => (x.id === id ? updated : x)));
  }

  async function patchAck(id: string, acknowledged: boolean) {
    const res = await fetch(`/api/vulnerabilities/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ acknowledgedAt: acknowledged ? true : null }),
    });
    const updated = await parseJson<Vuln>(res);
    setItems((prev) => prev.map((x) => (x.id === id ? updated : x)));
  }

  return (
    <div className="mx-auto max-w-[1480px] px-5 py-8 lg:px-10 lg:py-10">
      <div className="mb-10 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--accent)]">
            {t("Time-based triage", "Pilotage temporel")}
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-[var(--text)] sm:text-3xl">{t("Planning", "Planning")}</h1>
        </div>
        <button type="button" onClick={() => void load()} className="ui-btn-secondary px-4 py-2.5 text-xs font-semibold">
          {t("Refresh", "Actualiser")}
        </button>
      </div>

      <div className="ui-card mb-6 flex flex-col gap-4 p-4 lg:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
          <label className="flex min-w-[min(100%,240px)] flex-col gap-1.5 text-xs font-medium text-[var(--muted)]">
            {t("View", "Vue")}
            <select
              value={view}
              onChange={(e) => setView(e.target.value as PlanningView)}
              className="ui-input w-full max-w-md px-3 py-2.5 text-sm font-semibold text-[var(--text)]"
              aria-label={t("Choose planning view", "Choisir la vue du planning")}
            >
              {viewOptions.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <details className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-muted)]/60 px-3 py-2 text-xs">
          <summary className="cursor-pointer select-none font-semibold text-[var(--text)]">{t("Filters", "Filtres")}</summary>
          <div className="mt-3 flex flex-col gap-3 text-[var(--muted)] sm:flex-row sm:flex-wrap sm:gap-6">
            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="radio"
                name="planning-filter-mode"
                checked={filterMode === "with_done"}
                onChange={() => setFilterMode("with_done")}
                className="rounded border-[var(--border)]"
              />
              {t("Show completed / acknowledged", "Afficher les terminées / acquittées")}
            </label>
            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="radio"
                name="planning-filter-mode"
                checked={filterMode === "unack_only"}
                onChange={() => setFilterMode("unack_only")}
                className="rounded border-[var(--border)]"
              />
              {t("Not acknowledged only", "Non acquittées seulement")}
            </label>
          </div>
        </details>
      </div>

      {error ? (
        <p className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-800 dark:text-red-200">
          {error}
        </p>
      ) : null}

      {loading ? (
        <p className="text-sm text-[var(--muted)]">{t("Loading…", "Chargement…")}</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">
          {locale === "fr" ? (
            <>
              Aucune vulnérabilité. Créez-en depuis le{" "}
              <Link href="/kanban" className="text-[var(--accent)] underline">
                tableau Kanban
              </Link>
              .
            </>
          ) : (
            <>
              No vulnerabilities yet. Create some from the{" "}
              <Link href="/kanban" className="text-[var(--accent)] underline">
                Kanban
              </Link>{" "}
              board.
            </>
          )}
        </p>
      ) : visible.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">{t("Nothing matches the current filter.", "Aucun élément ne correspond au filtre actuel.")}</p>
      ) : view === "calendar" ? (
        <CalendarBody
          locale={locale}
          t={t}
          items={visible}
          baseDate={calendarBaseDate}
          onPrevMonth={() => setCalendarMonthOffset((v) => v - 1)}
          onNextMonth={() => setCalendarMonthOffset((v) => v + 1)}
          onToday={() => setCalendarMonthOffset(0)}
          onPatchDue={patchDue}
          onPatchStatus={patchStatus}
          onPatchAck={patchAck}
        />
      ) : (
        <BucketsBody
          locale={locale}
          grouped={grouped}
          onPatchDue={patchDue}
          onPatchStatus={patchStatus}
          onPatchAck={patchAck}
        />
      )}
    </div>
  );
}

function BucketsBody({
  locale,
  grouped,
  onPatchDue,
  onPatchStatus,
  onPatchAck,
}: {
  locale: "en" | "fr";
  grouped: Map<PlanningBucketId, Vuln[]>;
  onPatchDue: (id: string, dateStr: string) => void;
  onPatchStatus: (id: string, s: VulnStatus) => void;
  onPatchAck: (id: string, ack: boolean) => void;
}) {
  const t = (en: string, fr: string) => uiT(locale, en, fr);
  const hasContent = [...grouped.values()].some((list) => list.length > 0);
  if (!hasContent) {
    return (
      <p className="text-sm text-[var(--muted)]">
        {t("Nothing to show for the current filters.", "Aucun élément à afficher pour les filtres en cours.")}
      </p>
    );
  }

  return (
    <div className="space-y-8">
      {[...BUCKET_ORDER, "done" as const].map((bucketId) => {
        const list = grouped.get(bucketId) ?? [];
        if (!list.length) return null;
        return (
          <section key={bucketId}>
            <h2 className="mb-3 text-sm font-semibold text-[var(--text)]">
              {bucketLabel(bucketId, locale)}
              <span className="ml-2 font-normal text-[var(--muted)]">({list.length})</span>
            </h2>
            <div className="space-y-2">
              {list.map((v) => (
                <PlanningTaskCard
                  key={v.id}
                  v={v}
                  onPatchDue={onPatchDue}
                  onPatchStatus={onPatchStatus}
                  onPatchAck={onPatchAck}
                />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function groupByDayForCalendar(items: Vuln[], collatorLocale: string): Map<string, Vuln[]> {
  const map = new Map<string, Vuln[]>();
  for (const v of items) {
    if (!v.dueAt) continue;
    const key = toLocalDateKey(new Date(v.dueAt));
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(v);
  }
  for (const list of map.values()) {
    list.sort((a, b) => a.title.localeCompare(b.title, collatorLocale));
  }
  return map;
}

function CalendarBody({
  locale,
  t,
  items,
  baseDate,
  onPrevMonth,
  onNextMonth,
  onToday,
  onPatchDue,
  onPatchStatus,
  onPatchAck,
}: {
  locale: "en" | "fr";
  t: (en: string, fr: string) => string;
  items: Vuln[];
  baseDate: Date;
  onPrevMonth: () => void;
  onNextMonth: () => void;
  onToday: () => void;
  onPatchDue: (id: string, dateStr: string) => void;
  onPatchStatus: (id: string, s: VulnStatus) => void;
  onPatchAck: (id: string, ack: boolean) => void;
}) {
  const now = new Date();
  const collatorLocale = locale === "fr" ? "fr" : "en";
  const dateLoc = dateLocaleTag(locale);
  const [selectedDayKey, setSelectedDayKey] = useState<string | null>(null);
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const year = baseDate.getFullYear();
  const month = baseDate.getMonth();
  const first = new Date(year, month, 1);
  const firstDay = first.getDay() === 0 ? 6 : first.getDay() - 1;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let day = 1; day <= daysInMonth; day++) cells.push(day);
  while (cells.length % 7 !== 0) cells.push(null);

  const byDay = useMemo(() => groupByDayForCalendar(items, collatorLocale), [items, collatorLocale]);
  const taskById = useMemo(() => new Map(items.map((v) => [v.id, v])), [items]);
  const weekdayLabels =
    locale === "fr"
      ? ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"]
      : ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const selectedTasks = selectedDayKey ? byDay.get(selectedDayKey) ?? [] : [];

  useEffect(() => {
    if (!selectedDayKey) return;
    if (!byDay.has(selectedDayKey)) setSelectedDayKey(null);
  }, [byDay, selectedDayKey]);

  function moveTaskToDay(taskId: string, dayKey: string) {
    if (!taskId) return;
    const task = taskById.get(taskId);
    if (!task) return;
    const currentDayKey = task.dueAt ? toLocalDateKey(new Date(task.dueAt)) : null;
    if (currentDayKey === dayKey) return;
    void onPatchDue(taskId, dayKey);
    setSelectedDayKey(dayKey);
  }

  return (
    <div className="space-y-3">
      <div className="ui-card flex flex-wrap items-center justify-between gap-2 px-3 py-2">
        <div className="flex items-center gap-2">
          <button type="button" onClick={onPrevMonth} className="ui-btn-secondary px-2.5 py-1 text-xs">
            ◀
          </button>
          <button type="button" onClick={onNextMonth} className="ui-btn-secondary px-2.5 py-1 text-xs">
            ▶
          </button>
          <button type="button" onClick={onToday} className="ui-btn-secondary px-2.5 py-1 text-xs">
            {t("Today", "Aujourd’hui")}
          </button>
        </div>
        <p className="text-sm font-semibold text-[var(--text)]">
          {baseDate.toLocaleDateString(dateLoc, { month: "long", year: "numeric" })}
        </p>
      </div>

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="ui-card p-3">
          <div className="mb-2 grid grid-cols-7 text-center text-[10px] font-semibold text-[var(--muted)]">
            {weekdayLabels.map((d) => (
              <span key={d}>{d}</span>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {cells.map((day, idx) => {
              if (day === null) return <div key={idx} className="h-24 rounded-[var(--radius-md)] bg-transparent" />;
              const date = new Date(year, month, day);
              const key = toLocalDateKey(date);
              const list = byDay.get(key) ?? [];
              const isToday = key === toLocalDateKey(now);
              const isSelected = key === selectedDayKey;
              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setSelectedDayKey(key)}
                  onDragOver={(e) => {
                    if (!draggedTaskId) return;
                    e.preventDefault();
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    const taskId = e.dataTransfer.getData("text/task-id") || draggedTaskId;
                    if (taskId) moveTaskToDay(taskId, key);
                    setDraggedTaskId(null);
                  }}
                  className={`flex h-28 flex-col rounded-[var(--radius-md)] border p-1.5 text-left transition ${
                    isSelected
                      ? "ring-2 ring-[var(--accent)]/35"
                      : ""
                  } ${
                    isToday
                      ? "border-[var(--accent)] bg-[var(--accent-subtle)]"
                      : "border-[var(--border)] bg-[var(--surface-muted)]"
                  }`}
                >
                  <div className="flex items-center justify-between text-[10px] font-semibold text-[var(--text)]">
                    <span>{day}</span>
                    {list.length ? (
                      <span className="rounded-full bg-[var(--column)] px-1 text-[9px] tabular-nums">{list.length}</span>
                    ) : null}
                  </div>
                  <ul className="mt-1 flex-1 space-y-0.5 overflow-hidden">
                    {list.slice(0, 3).map((v) => (
                      <li
                        key={v.id}
                        draggable
                        onDragStart={(e) => {
                          e.stopPropagation();
                          e.dataTransfer.effectAllowed = "move";
                          e.dataTransfer.setData("text/task-id", v.id);
                          setDraggedTaskId(v.id);
                        }}
                        onDragEnd={() => setDraggedTaskId(null)}
                        className="truncate rounded border border-[var(--border)] bg-[var(--surface)] px-1 py-0.5 text-[9px] leading-tight text-[var(--text)]"
                        title={t("Drag to change due date", "Glisser pour déplacer l’échéance")}
                      >
                        {v.title}
                      </li>
                    ))}
                    {list.length > 3 ? (
                      <li className="text-[9px] text-[var(--muted)]">
                        {t(`+${list.length - 3} more`, `+${list.length - 3} autres…`)}
                      </li>
                    ) : null}
                  </ul>
                </button>
              );
            })}
          </div>
        </div>

        <aside className="ui-card p-3">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-[var(--text)]">
              {selectedDayKey
                ? t(
                    `Due on ${new Date(`${selectedDayKey}T12:00:00`).toLocaleDateString(dateLoc)}`,
                    `Échéances du ${new Date(`${selectedDayKey}T12:00:00`).toLocaleDateString(dateLoc)}`,
                  )
                : t("Day detail", "Détail du jour")}
            </h3>
            {selectedDayKey ? (
              <button
                type="button"
                onClick={() => setSelectedDayKey(null)}
                className="ui-btn-secondary px-2 py-1 text-[10px]"
              >
                {t("Close", "Fermer")}
              </button>
            ) : null}
          </div>
          {!selectedDayKey ? (
            <p className="text-xs text-[var(--muted)]">{t("Select a date.", "Sélectionnez une date.")}</p>
          ) : selectedTasks.length === 0 ? (
            <p className="text-xs text-[var(--muted)]">{t("No tasks on this date.", "Aucune tâche sur cette date.")}</p>
          ) : (
            <div className="space-y-2">
              {selectedTasks.map((v) => (
                <PlanningTaskCard
                  key={v.id}
                  v={v}
                  onPatchDue={onPatchDue}
                  onPatchStatus={onPatchStatus}
                  onPatchAck={onPatchAck}
                />
              ))}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
