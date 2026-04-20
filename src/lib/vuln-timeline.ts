import type { Prisma } from "@prisma/client";
import { Severity, VulnStatus } from "@prisma/client";

export type Tx = Prisma.TransactionClient;

export async function recordVulnCreated(
  tx: Tx,
  args: {
    vulnerabilityId: string;
    toStatus: VulnStatus;
    severity: Severity;
    occurredAt?: Date;
  },
): Promise<void> {
  await tx.vulnTimelineEvent.create({
    data: {
      vulnerabilityId: args.vulnerabilityId,
      kind: "CREATED",
      fromStatus: null,
      toStatus: args.toStatus,
      severityAtEvent: args.severity,
      occurredAt: args.occurredAt ?? new Date(),
    },
  });
}

/**
 * Records a transition on the vulnerability state. When only severity changes,
 * `fromStatus` and `toStatus` may be equal so the replay still updates `severityAtEvent`.
 */
export async function recordVulnStatusChanged(
  tx: Tx,
  args: {
    vulnerabilityId: string;
    fromStatus: VulnStatus;
    toStatus: VulnStatus;
    severity: Severity;
    occurredAt?: Date;
  },
): Promise<void> {
  await tx.vulnTimelineEvent.create({
    data: {
      vulnerabilityId: args.vulnerabilityId,
      kind: "STATUS_CHANGED",
      fromStatus: args.fromStatus,
      toStatus: args.toStatus,
      severityAtEvent: args.severity,
      occurredAt: args.occurredAt ?? new Date(),
    },
  });
}
