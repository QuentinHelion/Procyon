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

type PlanningView = "buckets" | "timeline" | "kanban" | "gantt";

const KANBAN_COLS: { status: VulnStatus; label: string }[] = [
  { status: "TODO", label: "À traiter" },
  { status: "IN_PROGRESS", label: "En cours" },
  { status: "DONE", label: "Terminé" },
];

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

  const timelineKeys = useMemo(() => nextDayKeys(new Date(), 14), []);
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

  const kanbanMap = useMemo(() => {
    const m = new Map<VulnStatus, Vuln[]>();
    for (const c of KANBAN_COLS) m.set(c.status, []);
    for (const v of visible) {
      if (v.status === "DONE" && !showDone) continue;
      m.get(v.status)?.push(v);
    }
    for (const c of KANBAN_COLS) {
      m.set(
        c.status,
        (m.get(c.status) ?? []).sort((a, b) => a.title.localeCompare(b.title, "fr")),
      );
    }
    return m;
  }, [visible, showDone]);

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
    { id: "timeline", label: "14 jours", hint: "Une colonne par jour" },
    { id: "kanban", label: "Kanban", hint: "Par statut (comme le tableau)" },
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
      ) : view === "timeline" ? (
        <TimelineBody timelineKeys={timelineKeys} timelineMap={timelineMap} />
      ) : view === "kanban" ? (
        <KanbanBody
          kanbanMap={kanbanMap}
          showDone={showDone}
          onPatchDue={patchDue}
          onPatchStatus={patchStatus}
          onPatchAck={patchAck}
        />
      ) : (
        <GanttBody ganttModel={ganttModel} />
      )}
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

function TimelineBody({
  timelineKeys,
  timelineMap,
}: {
  timelineKeys: string[];
  timelineMap: Map<string, Vuln[]>;
}) {
  return (
    <div className="overflow-x-auto pb-2">
      <div className="flex min-w-[720px] gap-2">
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
                  className={`flex w-[140px] shrink-0 flex-col rounded-[var(--radius-lg)] border p-2.5 ${
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

function KanbanBody({
  kanbanMap,
  showDone,
  onPatchDue,
  onPatchStatus,
  onPatchAck,
}: {
  kanbanMap: Map<VulnStatus, Vuln[]>;
  showDone: boolean;
  onPatchDue: (id: string, dateStr: string) => void;
  onPatchStatus: (id: string, s: VulnStatus) => void;
  onPatchAck: (id: string, ack: boolean) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      {KANBAN_COLS.map((col) => {
        if (col.status === "DONE" && !showDone) {
          return (
            <div
              key={col.status}
              className="flex min-h-[200px] flex-col rounded-[var(--radius-lg)] border border-dashed border-[var(--border-strong)] bg-[var(--surface-muted)]/80 p-4"
            >
              <h2 className="text-sm font-semibold text-[var(--muted)]">{col.label}</h2>
              <p className="mt-2 text-xs text-[var(--muted)]">
                Cochez « Afficher les terminées » pour voir cette colonne.
              </p>
            </div>
          );
        }
        const list = kanbanMap.get(col.status) ?? [];
        return (
          <div
            key={col.status}
            className="ui-card flex min-h-[420px] flex-col bg-[var(--surface-muted)] p-4"
          >
            <h2 className="text-sm font-bold text-[var(--text)]">
              {col.label}
              <span className="ml-2 text-xs font-normal text-[var(--muted)]">({list.length})</span>
            </h2>
            <div className="mt-3 flex flex-1 flex-col gap-2 overflow-y-auto">
              {list.map((v) => (
                <PlanningTaskCard
                  key={v.id}
                  v={v}
                  compact
                  onPatchDue={onPatchDue}
                  onPatchStatus={onPatchStatus}
                  onPatchAck={onPatchAck}
                />
              ))}
            </div>
          </div>
        );
      })}
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
