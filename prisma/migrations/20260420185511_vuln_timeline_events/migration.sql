-- CreateEnum
CREATE TYPE "VulnTimelineEventKind" AS ENUM ('CREATED', 'STATUS_CHANGED');

-- CreateTable
CREATE TABLE "VulnTimelineEvent" (
    "id" TEXT NOT NULL,
    "vulnerabilityId" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "kind" "VulnTimelineEventKind" NOT NULL,
    "fromStatus" "VulnStatus",
    "toStatus" "VulnStatus" NOT NULL,
    "severityAtEvent" "Severity" NOT NULL,

    CONSTRAINT "VulnTimelineEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VulnTimelineEvent_occurredAt_idx" ON "VulnTimelineEvent"("occurredAt");

-- CreateIndex
CREATE INDEX "VulnTimelineEvent_vulnerabilityId_occurredAt_idx" ON "VulnTimelineEvent"("vulnerabilityId", "occurredAt");

-- AddForeignKey
ALTER TABLE "VulnTimelineEvent" ADD CONSTRAINT "VulnTimelineEvent_vulnerabilityId_fkey" FOREIGN KEY ("vulnerabilityId") REFERENCES "Vulnerability"("id") ON DELETE CASCADE ON UPDATE CASCADE;
