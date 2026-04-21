-- Backfill only: schema objects are created by migration 20260420185511_vuln_timeline_events.
-- This migration intentionally remains idempotent and data-only.
INSERT INTO "VulnTimelineEvent" ("id", "vulnerabilityId", "occurredAt", "kind", "fromStatus", "toStatus", "severityAtEvent")
SELECT
    md5(random()::text || clock_timestamp()::text || v."id"),
    v."id",
    v."createdAt",
    'CREATED'::"VulnTimelineEventKind",
    NULL,
    v."status",
    v."severity"
FROM "Vulnerability" v
WHERE NOT EXISTS (
  SELECT 1 FROM "VulnTimelineEvent" t WHERE t."vulnerabilityId" = v."id" AND t."kind" = 'CREATED'::"VulnTimelineEventKind"
);
