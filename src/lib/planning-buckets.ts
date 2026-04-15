/** Utilitaires de classement par échéance (fuseau local du navigateur). */

export type PlanningBucketId =
  | "overdue"
  | "today"
  | "this_week"
  | "next_week"
  | "later"
  | "none"
  | "done";

export const BUCKET_ORDER: PlanningBucketId[] = [
  "overdue",
  "today",
  "this_week",
  "next_week",
  "later",
  "none",
];

export const BUCKET_LABEL: Record<PlanningBucketId, string> = {
  overdue: "En retard",
  today: "Aujourd’hui",
  this_week: "Cette semaine",
  next_week: "Semaine prochaine",
  later: "Plus tard",
  none: "Sans échéance",
  done: "Terminées",
};

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function endOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

/** Lundi = début de semaine (usage courant en FR). */
function startOfWeekMonday(d: Date): Date {
  const x = startOfDay(d);
  const day = (x.getDay() + 6) % 7;
  x.setDate(x.getDate() - day);
  return x;
}

function endOfWeekMonday(d: Date): Date {
  const s = startOfWeekMonday(d);
  const e = new Date(s);
  e.setDate(e.getDate() + 6);
  return endOfDay(e);
}

/**
 * Classe une vulnérabilité ouverte selon `dueAt` par rapport à `now`.
 */
export function bucketForOpenTask(dueAt: Date | null, now: Date): PlanningBucketId {
  if (!dueAt) return "none";
  const due = new Date(dueAt);
  const t0 = startOfDay(now);
  const t1 = endOfDay(now);
  if (due < t0) return "overdue";
  if (due >= t0 && due <= t1) return "today";

  const weekEnd = endOfWeekMonday(now);
  if (due > t1 && due <= weekEnd) return "this_week";

  const nextWeekStart = new Date(startOfWeekMonday(now));
  nextWeekStart.setDate(nextWeekStart.getDate() + 7);
  const nextWeekEnd = endOfWeekMonday(nextWeekStart);
  if (due > weekEnd && due <= nextWeekEnd) return "next_week";

  return "later";
}

export function bucketForTask(
  status: "TODO" | "IN_PROGRESS" | "DONE" | "ARCHIVE",
  dueAt: Date | null,
  now: Date,
): PlanningBucketId {
  if (status === "DONE" || status === "ARCHIVE") return "done";
  return bucketForOpenTask(dueAt, now);
}

/** Jour calendaire local `YYYY-MM-DD` pour une date. */
export function toLocalDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Prochains `count` jours à partir d’`anchor` (inclus), en clés locales. */
export function nextDayKeys(anchor: Date, count: number): string[] {
  const out: string[] = [];
  const x = startOfDay(anchor);
  for (let i = 0; i < count; i++) {
    const d = new Date(x);
    d.setDate(d.getDate() + i);
    out.push(toLocalDateKey(d));
  }
  return out;
}
