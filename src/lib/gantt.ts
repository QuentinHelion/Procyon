const MS_DAY = 86_400_000;

export type GanttVulnInput = {
  id: string;
  title: string;
  status: string;
  createdAt: string;
  dueAt: string | null;
};

export type GanttBar = {
  id: string;
  title: string;
  leftPct: number;
  widthPct: number;
  startMs: number;
  endMs: number;
};

export type GanttModel = {
  minMs: number;
  maxMs: number;
  spanMs: number;
  todayPct: number;
  bars: GanttBar[];
  weekStarts: { ms: number; label: string }[];
};

function startOfWeekMonday(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  const day = (x.getDay() + 6) % 7;
  x.setDate(x.getDate() - day);
  return x;
}

/**
 * Barres de planning : début = création, fin = échéance (ou durée minimale si sans échéance).
 */
export function buildGanttModel(
  items: GanttVulnInput[],
  options: { showDone: boolean; minBarDays: number; tailPaddingDays: number },
): GanttModel | null {
  const visible = items.filter((v) => options.showDone || v.status !== "DONE");
  if (visible.length === 0) return null;

  const now = Date.now();
  const minBar = options.minBarDays * MS_DAY;
  const tail = options.tailPaddingDays * MS_DAY;

  const ranges = visible.map((v) => {
    const s = new Date(v.createdAt).getTime();
    let e = v.dueAt ? new Date(v.dueAt).getTime() : s + minBar;
    if (!Number.isFinite(s)) return { v, s: now, e: now + minBar };
    if (!Number.isFinite(e) || e < s) e = s + minBar;
    return { v, s, e };
  });

  const minMs = Math.min(...ranges.map((r) => r.s), now - 7 * MS_DAY);
  let maxMs = Math.max(...ranges.map((r) => r.e), now + tail);
  const spanMs = Math.max(maxMs - minMs, MS_DAY);
  maxMs = minMs + spanMs;

  const todayPct = ((now - minMs) / spanMs) * 100;

  const bars: GanttBar[] = ranges.map(({ v, s, e }) => ({
    id: v.id,
    title: v.title,
    startMs: s,
    endMs: e,
    leftPct: ((s - minMs) / spanMs) * 100,
    widthPct: Math.max(((e - s) / spanMs) * 100, 0.4),
  }));

  const weekStarts: { ms: number; label: string }[] = [];
  let w = startOfWeekMonday(new Date(minMs));
  const endW = new Date(maxMs);
  while (w.getTime() <= endW.getTime() + MS_DAY) {
    weekStarts.push({
      ms: w.getTime(),
      label: w.toLocaleDateString("fr-FR", { day: "numeric", month: "short" }),
    });
    w = new Date(w);
    w.setDate(w.getDate() + 7);
    if (weekStarts.length > 24) break;
  }

  return { minMs, maxMs, spanMs, todayPct, bars, weekStarts };
}
