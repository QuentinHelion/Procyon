"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { buildGanttModel } from "@/lib/gantt";
import {
  BUCKET_LABEL,
  BUCKET_ORDER,
  bucketForTask,
  nextDayKeys,
  toLocalDateKey,
  type PlanningBucketId,
} from "@/lib/planning-buckets";
import { PlanningTaskCard, type PlanningVuln } from "@/components/PlanningTaskCard";

type VulnStatus = PlanningVuln["status"];

type Vuln = PlanningVuln & { createdAt: string };

type PlanningView = "buckets" | "period" | "calendar" | "gantt";

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
  const [items, setItems] = useState<Vuln[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<PlanningView>("buckets");
  const [showDone, setShowDone] = useState(false);
  const [onlyUnacknowledged, setOnlyUnacknowledged] = useState(false);
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [exportSelection, setExportSelection] = useState<{
    buckets: boolean;
    period: boolean;
    calendar: boolean;
    gantt: boolean;
  }>({ buckets: true, period: true, calendar: true, gantt: true });
  const [periodStart, setPeriodStart] = useState(() => new Date());
  const [periodDays, setPeriodDays] = useState(14);

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const data = await parseJson<Vuln[]>(await fetch("/api/vulnerabilities"));
      setItems(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function shiftPeriod(direction: "back" | "forward") {
    setPeriodStart((prev) => {
      const d = new Date(prev);
      d.setDate(d.getDate() + (direction === "back" ? -periodDays : periodDays));
      return d;
    });
  }

  const visible = useMemo(() => {
    if (!onlyUnacknowledged) return items;
    return items.filter((v) => v.status !== "DONE" && !v.acknowledgedAt);
  }, [items, onlyUnacknowledged]);

  const grouped = useMemo(() => {
    const m = new Map<PlanningBucketId, Vuln[]>();
    for (const id of BUCKET_ORDER) m.set(id, []);
    m.set("done", []);

    const clock = new Date();
    for (const v of visible) {
      const b = bucketForTask(v.status, v.dueAt ? new Date(v.dueAt) : null, clock);
      if (b === "done" && !showDone) continue;
      m.get(b)?.push(v);
    }

    const sortOpen = (a: Vuln, b: Vuln) => {
      const ad = a.dueAt ? new Date(a.dueAt).getTime() : Infinity;
      const bd = b.dueAt ? new Date(b.dueAt).getTime() : Infinity;
      if (ad !== bd) return ad - bd;
      return a.title.localeCompare(b.title, "fr");
    };
    for (const id of BUCKET_ORDER) {
      m.get(id)?.sort(sortOpen);
    }
    m.get("done")?.sort((a, b) => b.title.localeCompare(a.title, "fr"));

    return m;
  }, [visible, showDone]);

  const timelineKeys = useMemo(() => nextDayKeys(periodStart, periodDays), [periodStart, periodDays]);
  const timelineMap = useMemo(() => {
    const map = new Map<string, Vuln[]>();
    for (const k of timelineKeys) map.set(k, []);
    for (const v of visible) {
      if (v.status === "DONE") continue;
      if (!v.dueAt) continue;
      const key = toLocalDateKey(new Date(v.dueAt));
      if (map.has(key)) map.get(key)!.push(v);
    }
    for (const list of map.values()) {
      list.sort((a, b) => a.title.localeCompare(b.title, "fr"));
    }
    return map;
  }, [visible, timelineKeys]);

  const ganttModel = useMemo(
    () =>
      buildGanttModel(visible, {
        showDone,
        minBarDays: 3,
        tailPaddingDays: 56,
      }),
    [visible, showDone],
  );

  async function patchDue(id: string, dateStr: string) {
    const payload =
      dateStr === ""
        ? { dueAt: null as null }
        : { dueAt: fromDateInputToIso(dateStr) ?? null };
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

  const viewOptions: { id: PlanningView; label: string; hint: string }[] = [
    { id: "buckets", label: "Échéances (périodes)", hint: "Retard, cette semaine, sans date…" },
    { id: "period", label: "Période", hint: "Plage glissante (7/14/30 jours)" },
    { id: "calendar", label: "Calendrier", hint: "Vue mensuelle classique" },
    { id: "gantt", label: "Gantt", hint: "Création → échéance" },
  ];

  return (
    <div className="mx-auto max-w-[1480px] px-5 py-8 lg:px-10 lg:py-10">
      <div className="mb-10 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--accent)]">
            Pilotage temporel
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-[var(--text)] sm:text-3xl">
            Rétro-planning
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[var(--muted)]">
            Choisissez une vue ci-dessous pour lire les échéances et mettre à jour les tâches. Pour changer le{" "}
            <strong>statut</strong> par glisser-déposer, utilisez le{" "}
            <Link href="/" className="text-[var(--accent)] underline underline-offset-2">
              tableau de bord
            </Link>
            .
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void load()}
            className="ui-btn-secondary px-4 py-2.5 text-xs font-semibold"
          >
            Actualiser
          </button>
          <button
            type="button"
            onClick={() => setExportModalOpen(true)}
            className="ui-btn-secondary px-4 py-2.5 text-xs font-semibold"
          >
            Exporter en PDF
          </button>
        </div>
      </div>

      <div className="ui-card mb-6 flex flex-col gap-4 p-4 lg:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
          <label className="flex min-w-[min(100%,240px)] flex-col gap-1.5 text-xs font-medium text-[var(--muted)]">
            Vue
            <select
              value={view}
              onChange={(e) => setView(e.target.value as PlanningView)}
              className="ui-input w-full max-w-md px-3 py-2.5 text-sm font-semibold text-[var(--text)]"
              aria-label="Choisir la vue du planning"
            >
              {viewOptions.map((o) => (
                <option key={o.id} value={o.id} title={o.hint}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <p className="text-[11px] leading-snug text-[var(--muted)] sm:max-w-xs sm:pb-1">
            {viewOptions.find((o) => o.id === view)?.hint}
          </p>
        </div>
        <details className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-muted)]/60 px-3 py-2 text-xs">
          <summary className="cursor-pointer select-none font-semibold text-[var(--text)]">
            Filtres
          </summary>
          <div className="mt-3 flex flex-col gap-3 text-[var(--muted)] sm:flex-row sm:flex-wrap sm:gap-6">
            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={showDone}
                onChange={(e) => setShowDone(e.target.checked)}
                className="rounded border-[var(--border)]"
              />
              Afficher les terminées
            </label>
            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={onlyUnacknowledged}
                onChange={(e) => setOnlyUnacknowledged(e.target.checked)}
                className="rounded border-[var(--border)]"
              />
              Non acquittées seulement
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
        <p className="text-sm text-[var(--muted)]">Chargement…</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">
          Aucune vulnérabilité. Créez-en depuis le{" "}
          <Link href="/" className="text-[var(--accent)] underline">
            tableau
          </Link>
          .
        </p>
      ) : visible.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">Aucun élément ne correspond au filtre actuel.</p>
      ) : view === "buckets" ? (
        <BucketsBody
          grouped={grouped}
          showDone={showDone}
          onPatchDue={patchDue}
          onPatchStatus={patchStatus}
          onPatchAck={patchAck}
        />
      ) : view === "period" ? (
        <PeriodBody
          timelineKeys={timelineKeys}
          timelineMap={timelineMap}
          periodStart={periodStart}
          periodDays={periodDays}
          setPeriodDays={setPeriodDays}
          shiftPeriod={shiftPeriod}
        />
      ) : view === "calendar" ? (
        <CalendarBody items={visible} />
      ) : (
        <GanttBody ganttModel={ganttModel} />
      )}

      {exportModalOpen ? (
        <ExportModal
          selection={exportSelection}
          onChangeSelection={setExportSelection}
          onCancel={() => setExportModalOpen(false)}
          onConfirm={() => {
            const parts: string[] = [];
            if (exportSelection.buckets) {
              parts.push("# Échéances (périodes)");
              for (const id of BUCKET_ORDER) {
                const list = grouped.get(id) ?? [];
                if (!list.length) continue;
                parts.push(`\n## ${BUCKET_LABEL[id]} (${list.length})`);
                for (const v of list) {
                  parts.push(`- ${v.title}${v.dueAt ? " — " + new Date(v.dueAt).toLocaleDateString("fr-FR") : ""}`);
                }
              }
            }
            if (exportSelection.period) {
              parts.push("\n# Période");
              for (const key of timelineKeys) {
                const list = timelineMap.get(key) ?? [];
                if (!list.length) continue;
                parts.push(`\n## ${key}`);
                for (const v of list) {
                  parts.push(`- ${v.title}`);
                }
              }
            }
            if (exportSelection.calendar) {
              parts.push("\n# Calendrier (mois en cours)");
              const byDay = groupByDayForCalendar(visible);
              for (const [day, list] of byDay) {
                parts.push(`\n## ${day}`);
                for (const v of list) parts.push(`- ${v.title}`);
              }
            }
            if (exportSelection.gantt && ganttModel) {
              parts.push("\n# Gantt");
              for (const b of ganttModel.bars) {
                parts.push(
                  `- ${b.title} : ${new Date(b.startMs).toLocaleDateString(
                    "fr-FR",
                  )} → ${new Date(b.endMs).toLocaleDateString("fr-FR")}`,
                );
              }
            }
            const content = parts.join("\n");
            const blob = new Blob([content], { type: "application/pdf" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = "planning.pdf";
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            setExportModalOpen(false);
          }}
        />
      ) : null}
    </div>
  );
}

function BucketsBody({
  grouped,
  showDone,
  onPatchDue,
  onPatchStatus,
  onPatchAck,
}: {
  grouped: Map<PlanningBucketId, Vuln[]>;
  showDone: boolean;
  onPatchDue: (id: string, dateStr: string) => void;
  onPatchStatus: (id: string, s: VulnStatus) => void;
  onPatchAck: (id: string, ack: boolean) => void;
}) {
  const hasOpen = BUCKET_ORDER.some((bid) => (grouped.get(bid) ?? []).length > 0);
  const doneLen = grouped.get("done")?.length ?? 0;
  if (!hasOpen && !(showDone && doneLen > 0)) {
    return (
      <p className="text-sm text-[var(--muted)]">
        Toutes les tâches ouvertes sont terminées. Cochez « Afficher les terminées » ou élargissez le filtre.
      </p>
    );
  }
  return (
    <div className="space-y-8">
      {BUCKET_ORDER.map((bid) => {
        const list = grouped.get(bid) ?? [];
        if (list.length === 0) return null;
        return (
          <section key={bid}>
            <h2 className="mb-3 text-sm font-semibold text-[var(--text)]">
              {BUCKET_LABEL[bid]}
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
      {showDone && doneLen > 0 ? (
        <section>
          <h2 className="mb-3 text-sm font-semibold text-[var(--text)]">
            {BUCKET_LABEL.done}
            <span className="ml-2 font-normal text-[var(--muted)]">({doneLen})</span>
          </h2>
          <div className="space-y-2 opacity-90">
            {(grouped.get("done") ?? []).map((v) => (
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
      ) : null}
    </div>
  );
}

function PeriodBody({
  timelineKeys,
  timelineMap,
  periodStart,
  periodDays,
  setPeriodDays,
  shiftPeriod,
}: {
  timelineKeys: string[];
  timelineMap: Map<string, Vuln[]>;
  periodStart: Date;
  periodDays: number;
  setPeriodDays: (n: number) => void;
  shiftPeriod: (dir: "back" | "forward") => void;
}) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 text-xs text-[var(--muted)]">
        <span className="font-semibold text-[var(--text)]">Période</span>
        <span>
          du{" "}
          {periodStart.toLocaleDateString("fr-FR")} au{" "}
          {new Date(periodStart.getTime() + (periodDays - 1) * 24 * 60 * 60 * 1000).toLocaleDateString("fr-FR")}
        </span>
        <div className="flex flex-wrap items-center gap-2">
          <span>Durée :</span>
          {[7, 14, 30].map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setPeriodDays(d)}
              className={`rounded-full px-2 py-1 text-[11px] ${
                periodDays === d
                  ? "bg-[var(--accent)] text-white"
                  : "border border-[var(--border)] bg-[var(--surface-muted)] text-[var(--muted)]"
              }`}
            >
              {d} j
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={() => shiftPeriod("back")}
            className="rounded-full border border-[var(--border)] bg-[var(--surface-muted)] px-2 py-1 text-[11px]"
          >
            ◀ Précédent
          </button>
          <button
            type="button"
            onClick={() => shiftPeriod("forward")}
            className="rounded-full border border-[var(--border)] bg-[var(--surface-muted)] px-2 py-1 text-[11px]"
          >
            Suivant ▶
          </button>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
        {timelineKeys.map((key) => {
          const list = timelineMap.get(key) ?? [];
          const [y, mo, d] = key.split("-").map(Number);
          const label = new Date(y, mo - 1, d).toLocaleDateString("fr-FR", {
            weekday: "short",
            day: "numeric",
            month: "short",
          });
          const isToday = key === toLocalDateKey(new Date());
          return (
            <div
              key={key}
              className={`flex min-h-[120px] flex-col rounded-[var(--radius-lg)] border p-2.5 ${
                isToday
                  ? "border-[var(--accent)] bg-[var(--accent-subtle)] shadow-sm"
                  : "border-[var(--border)] bg-[var(--surface-muted)]"
              }`}
            >
              <p className="text-center text-[10px] font-semibold capitalize text-[var(--text)]">
                {label}
              </p>
              <ul className="mt-2 flex flex-1 flex-col gap-1.5">
                {list.map((v) => (
                  <li
                    key={v.id}
                    className={`rounded border px-1.5 py-1 text-[10px] leading-tight ${
                      v.status !== "DONE" && !v.acknowledgedAt
                        ? "border-amber-500/50 bg-amber-500/10"
                        : "border-[var(--border)] bg-[var(--surface)]"
                    } text-[var(--text)]`}
                    title={v.title}
                  >
                    <span className="line-clamp-3">{v.title}</span>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function groupByDayForCalendar(items: Vuln[]): Map<string, Vuln[]> {
  const map = new Map<string, Vuln[]>();
  for (const v of items) {
    const d = v.dueAt ? new Date(v.dueAt) : null;
    if (!d) continue;
    const key = toLocalDateKey(d);
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(v);
  }
  return map;
}

function CalendarBody({ items }: { items: Vuln[] }) {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const first = new Date(year, month, 1);
  const firstDay = first.getDay() === 0 ? 6 : first.getDay() - 1; // lundi=0
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  const byDay = groupByDayForCalendar(items);

  return (
    <div className="space-y-3">
      <p className="text-xs text-[var(--muted)]">
        Calendrier du mois en cours. Chaque case correspond à un jour avec ses vulnérabilités planifiées.
      </p>
      <div className="ui-card p-3">
        <div className="mb-2 grid grid-cols-7 text-center text-[10px] font-semibold text-[var(--muted)]">
          {["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"].map((d) => (
            <span key={d}>{d}</span>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {cells.map((d, idx) => {
            if (d === null) {
              return <div key={idx} className="h-20 rounded-[var(--radius-md)] bg-transparent" />;
            }
            const date = new Date(year, month, d);
            const key = toLocalDateKey(date);
            const list = byDay.get(key) ?? [];
            const isToday = toLocalDateKey(now) === key;
            return (
              <div
                key={idx}
                className={`flex h-24 flex-col rounded-[var(--radius-md)] border p-1.5 ${
                  isToday
                    ? "border-[var(--accent)] bg-[var(--accent-subtle)]"
                    : "border-[var(--border)] bg-[var(--surface-muted)]"
                }`}
              >
                <div className="flex items-center justify-between text-[10px] font-semibold text-[var(--text)]">
                  <span>{d}</span>
                  {list.length ? (
                    <span className="rounded-full bg-[var(--column)] px-1 text-[9px] tabular-nums">
                      {list.length}
                    </span>
                  ) : null}
                </div>
                <ul className="mt-1 flex-1 space-y-0.5 overflow-hidden">
                  {list.slice(0, 3).map((v) => (
                    <li
                      key={v.id}
                      className="truncate rounded border border-[var(--border)] bg-[var(--surface)] px-1 py-0.5 text-[9px] leading-tight text-[var(--text)]"
                      title={v.title}
                    >
                      {v.title}
                    </li>
                  ))}
                  {list.length > 3 ? (
                    <li className="text-[9px] text-[var(--muted)]">+{list.length - 3} autres…</li>
                  ) : null}
                </ul>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function ExportModal({
  selection,
  onChangeSelection,
  onCancel,
  onConfirm,
}: {
  selection: { buckets: boolean; period: boolean; calendar: boolean; gantt: boolean };
  onChangeSelection: (s: { buckets: boolean; period: boolean; calendar: boolean; gantt: boolean }) => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/45 p-4 backdrop-blur-[2px] sm:items-center">
      <div className="ui-card w-full max-w-md p-5 shadow-xl">
        <h2 className="text-sm font-bold text-[var(--text)]">Exporter les vues en PDF</h2>
        <p className="mt-1 text-xs text-[var(--muted)]">
          Choisissez les vues à inclure. Un fichier PDF sera généré à partir d’un résumé texte des tâches.
        </p>
        <div className="mt-3 space-y-2 text-xs text-[var(--muted)]">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={selection.buckets}
              onChange={(e) => onChangeSelection({ ...selection, buckets: e.target.checked })}
            />
            Échéances (périodes)
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={selection.period}
              onChange={(e) => onChangeSelection({ ...selection, period: e.target.checked })}
            />
            Période
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={selection.calendar}
              onChange={(e) => onChangeSelection({ ...selection, calendar: e.target.checked })}
            />
            Calendrier
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={selection.gantt}
              onChange={(e) => onChangeSelection({ ...selection, gantt: e.target.checked })}
            />
            Gantt
          </label>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="ui-btn-secondary px-4 py-2 text-xs">
            Annuler
          </button>
          <button type="button" onClick={onConfirm} className="ui-btn-primary px-4 py-2 text-xs">
            Exporter
          </button>
        </div>
      </div>
    </div>
  );
}

function GanttBody({ ganttModel }: { ganttModel: ReturnType<typeof buildGanttModel> }) {
  if (!ganttModel) {
    return (
      <p className="text-sm text-[var(--muted)]">
        Aucune tâche à afficher (activez « Afficher les terminées » si tout est clos).
      </p>
    );
  }

  const { minMs, maxMs, spanMs, todayPct, bars, weekStarts } = ganttModel;

  return (
    <div className="space-y-3">
      <p className="text-xs text-[var(--muted)]">
        Chaque barre va de la <strong>date de création</strong> à l’<strong>échéance</strong> (ou +3 jours si
        pas d’échéance). Ligne verticale : aujourd’hui.
      </p>
      <div className="ui-card overflow-x-auto">
        <div className="min-w-[640px] p-3">
          <div className="relative mb-2 h-8 border-b border-[var(--border)]">
            {weekStarts.map((w) => {
              const left = ((w.ms - minMs) / spanMs) * 100;
              if (left < 0 || left > 100) return null;
              return (
                <span
                  key={w.ms}
                  className="absolute top-0 text-[10px] text-[var(--muted)]"
                  style={{ left: `${left}%`, transform: "translateX(-0%)" }}
                >
                  {w.label}
                </span>
              );
            })}
          </div>
          <div className="relative">
            <div
              className="pointer-events-none absolute bottom-0 top-0 z-10 w-px bg-[var(--accent)]"
              style={{ left: `${todayPct}%` }}
              title="Aujourd’hui"
            />
            <ul className="space-y-2">
              {bars.map((b) => (
                <li key={b.id} className="flex items-center gap-2 text-xs">
                  <span className="w-[min(28%,180px)] shrink-0 truncate text-[var(--text)]" title={b.title}>
                    {b.title}
                  </span>
                  <div className="relative h-7 min-w-0 flex-1 rounded bg-[var(--column)]">
                    <div
                      className="absolute top-1 h-5 rounded-[6px] bg-[var(--accent)] opacity-90"
                      style={{ left: `${b.leftPct}%`, width: `${b.widthPct}%` }}
                      title={`${new Date(b.startMs).toLocaleDateString("fr-FR")} → ${new Date(b.endMs).toLocaleDateString("fr-FR")}`}
                    />
                  </div>
                </li>
              ))}
            </ul>
          </div>
          <p className="mt-3 text-[10px] text-[var(--muted)]">
            Période affichée : {new Date(minMs).toLocaleDateString("fr-FR")} —{" "}
            {new Date(maxMs).toLocaleDateString("fr-FR")}
          </p>
        </div>
      </div>
    </div>
  );
}
