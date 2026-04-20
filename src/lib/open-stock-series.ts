import type { Severity, VulnStatus, VulnTimelineEventKind } from "@prisma/client";

export type TimelineEventRow = {
  id?: string;
  vulnerabilityId: string;
  occurredAt: Date;
  kind: VulnTimelineEventKind;
  fromStatus: VulnStatus | null;
  toStatus: VulnStatus;
  severityAtEvent: Severity;
};

export type TrendGranularity = "day" | "week" | "month";

export const SEVERITY_ORDER: Severity[] = ["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"];

function toDateInput(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
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

function endOfLocalDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

function endOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
}

/**
 * Bucket metadata aligned with the monitoring trend chart (local timezone).
 */
export function buildBucketMeta(
  start: Date,
  end: Date,
  granularity: TrendGranularity,
  locale: "en" | "fr",
): { key: string; label: string; end: Date }[] {
  const out: { key: string; label: string; end: Date }[] = [];
  const safeStart = start <= end ? start : end;
  const safeEnd = start <= end ? end : start;
  const rangeEnd = new Date(safeEnd);
  rangeEnd.setHours(23, 59, 59, 999);

  const current = new Date(safeStart);
  current.setHours(0, 0, 0, 0);

  if (granularity === "month") {
    current.setDate(1);
    while (current <= rangeEnd) {
      const end = endOfMonth(current);
      const bucketEnd = end > rangeEnd ? rangeEnd : end;
      out.push({
        key: bucketKey(current, "month"),
        label: current.toLocaleDateString(locale === "fr" ? "fr-FR" : "en-US", {
          month: "short",
          year: "2-digit",
        }),
        end: bucketEnd,
      });
      current.setMonth(current.getMonth() + 1);
    }
    return out;
  }

  if (granularity === "week") {
    let week = startOfWeekMonday(current);
    while (week <= rangeEnd) {
      const weekEnd = new Date(week);
      weekEnd.setDate(weekEnd.getDate() + 6);
      const end = endOfLocalDay(weekEnd);
      const bucketEnd = end > rangeEnd ? rangeEnd : end;
      out.push({
        key: bucketKey(week, "week"),
        label:
          (locale === "fr" ? "S" : "W") +
          " " +
          week.toLocaleDateString(locale === "fr" ? "fr-FR" : "en-US", { day: "2-digit", month: "2-digit" }),
        end: bucketEnd,
      });
      week = new Date(week);
      week.setDate(week.getDate() + 7);
    }
    return out;
  }

  while (current <= rangeEnd) {
    out.push({
      key: bucketKey(current, "day"),
      label: current.toLocaleDateString(locale === "fr" ? "fr-FR" : "en-US", { day: "2-digit", month: "2-digit" }),
      end: endOfLocalDay(current),
    });
    current.setDate(current.getDate() + 1);
  }
  return out;
}

type VulnState = { status: VulnStatus; severity: Severity };

function applyEvent(state: VulnState | undefined, ev: TimelineEventRow): VulnState {
  if (ev.kind === "CREATED") {
    return { status: ev.toStatus, severity: ev.severityAtEvent };
  }
  return { status: ev.toStatus, severity: ev.severityAtEvent };
}

function countBySeverity(
  states: Map<string, VulnState>,
  statuses: Set<VulnStatus>,
): Record<Severity, number> {
  const out: Record<Severity, number> = {
    CRITICAL: 0,
    HIGH: 0,
    MEDIUM: 0,
    LOW: 0,
    INFO: 0,
  };
  for (const s of states.values()) {
    if (statuses.has(s.status)) {
      out[s.severity] += 1;
    }
  }
  return out;
}

/**
 * Replay timeline events up to each bucket end; count vulns in `statusFilter` by last known severity.
 */
export function computeOpenStockSeries(
  events: TimelineEventRow[],
  bucketEnds: { end: Date }[],
  statusFilter: VulnStatus[],
): Record<Severity, number[]> {
  const statuses = new Set(statusFilter);
  const sorted = [...events].sort((a, b) => {
    const t = a.occurredAt.getTime() - b.occurredAt.getTime();
    if (t !== 0) return t;
    const u = a.vulnerabilityId.localeCompare(b.vulnerabilityId);
    if (u !== 0) return u;
    return (a.id ?? "").localeCompare(b.id ?? "");
  });

  const series: Record<Severity, number[]> = {
    CRITICAL: [],
    HIGH: [],
    MEDIUM: [],
    LOW: [],
    INFO: [],
  };

  let idx = 0;
  const states = new Map<string, VulnState>();

  for (const bucket of bucketEnds) {
    while (idx < sorted.length && sorted[idx]!.occurredAt <= bucket.end) {
      const ev = sorted[idx]!;
      states.set(ev.vulnerabilityId, applyEvent(states.get(ev.vulnerabilityId), ev));
      idx += 1;
    }
    const counts = countBySeverity(states, statuses);
    for (const sev of SEVERITY_ORDER) {
      series[sev].push(counts[sev]);
    }
  }

  return series;
}
