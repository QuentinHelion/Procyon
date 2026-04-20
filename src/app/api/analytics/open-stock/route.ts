import { NextResponse } from "next/server";
import { VulnStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  buildBucketMeta,
  computeOpenStockSeries,
  SEVERITY_ORDER,
  type TimelineEventRow,
  type TrendGranularity,
} from "@/lib/open-stock-series";

const GRANULARITIES = new Set<TrendGranularity>(["day", "week", "month"]);
const STATUSES = new Set(Object.values(VulnStatus));

function parseLocalDay(s: string | null): Date | null {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const from = parseLocalDay(searchParams.get("from"));
  const to = parseLocalDay(searchParams.get("to"));
  const granularity = searchParams.get("granularity") as TrendGranularity | null;
  const locale = searchParams.get("locale") === "en" ? "en" : "fr";

  const statusParams = searchParams.get("statuses")?.split(",").map((s) => s.trim()) ?? [];
  const statusFilter =
    statusParams.length > 0
      ? (statusParams.filter((s) => STATUSES.has(s as VulnStatus)) as VulnStatus[])
      : ([VulnStatus.TODO, VulnStatus.IN_PROGRESS] as VulnStatus[]);

  if (!from || !to) {
    return NextResponse.json({ error: "Query params from and to (YYYY-MM-DD) are required" }, { status: 400 });
  }
  if (!granularity || !GRANULARITIES.has(granularity)) {
    return NextResponse.json({ error: "granularity must be day, week, or month" }, { status: 400 });
  }
  if (statusFilter.length === 0) {
    return NextResponse.json({ error: "At least one valid status required" }, { status: 400 });
  }

  const rangeEnd = new Date(to);
  rangeEnd.setHours(23, 59, 59, 999);

  const buckets = buildBucketMeta(from, to, granularity, locale);
  if (buckets.length === 0) {
    return NextResponse.json({
      granularity,
      locale,
      statuses: statusFilter,
      buckets: [],
      series: Object.fromEntries(SEVERITY_ORDER.map((s) => [s, [] as number[]])) as Record<
        (typeof SEVERITY_ORDER)[number],
        number[]
      >,
    });
  }

  const rows = await prisma.vulnTimelineEvent.findMany({
    where: { occurredAt: { lte: rangeEnd } },
    orderBy: [{ occurredAt: "asc" }, { id: "asc" }],
    select: {
      id: true,
      vulnerabilityId: true,
      occurredAt: true,
      kind: true,
      fromStatus: true,
      toStatus: true,
      severityAtEvent: true,
    },
  });

  const events: TimelineEventRow[] = rows.map((r) => ({
    id: r.id,
    vulnerabilityId: r.vulnerabilityId,
    occurredAt: r.occurredAt,
    kind: r.kind,
    fromStatus: r.fromStatus,
    toStatus: r.toStatus,
    severityAtEvent: r.severityAtEvent,
  }));

  const series = computeOpenStockSeries(events, buckets, statusFilter);

  return NextResponse.json({
    granularity,
    locale,
    statuses: statusFilter,
    buckets: buckets.map((b) => ({ key: b.key, label: b.label })),
    series,
  });
}
