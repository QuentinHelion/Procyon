import { NextResponse } from "next/server";
import { Severity, VulnStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { recordVulnStatusChanged } from "@/lib/vuln-timeline";

const SEVERITIES = new Set(Object.values(Severity));
const STATUSES = new Set(Object.values(VulnStatus));

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: Ctx) {
  const { id } = await context.params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON invalide" }, { status: 400 });
  }
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Corps attendu : objet JSON" }, { status: 400 });
  }
  const b = body as Record<string, unknown>;
  const data: Record<string, unknown> = {};
  let shouldRememberPreviousStatus = false;
  let shouldRestorePreviousStatus = false;

  if (typeof b.title === "string") {
    const t = b.title.trim();
    if (!t) return NextResponse.json({ error: "title vide" }, { status: 400 });
    data.title = t;
  }
  if (typeof b.description === "string") data.description = b.description;
  if (typeof b.severity === "string" && SEVERITIES.has(b.severity as Severity)) {
    data.severity = b.severity;
  }
  if (typeof b.status === "string" && STATUSES.has(b.status as VulnStatus)) {
    data.status = b.status;
  }
  if ("dueAt" in b) {
    if (b.dueAt === null) {
      data.dueAt = null;
    } else if (typeof b.dueAt === "string") {
      const t = b.dueAt.trim();
      if (!t) {
        data.dueAt = null;
      } else {
        const d = new Date(t);
        if (Number.isNaN(d.getTime())) {
          return NextResponse.json({ error: "dueAt invalide (ISO ou date)" }, { status: 400 });
        }
        data.dueAt = d;
      }
    } else {
      return NextResponse.json({ error: "dueAt doit être une chaîne ISO ou null" }, { status: 400 });
    }
  }

  if ("acknowledgedAt" in b) {
    if (b.acknowledgedAt === null || b.acknowledgedAt === false) {
      data.acknowledgedAt = null;
      if (!("status" in b)) shouldRestorePreviousStatus = true;
    } else if (b.acknowledgedAt === true) {
      data.acknowledgedAt = new Date();
      if (!("status" in b)) {
        data.status = VulnStatus.ARCHIVE;
        shouldRememberPreviousStatus = true;
      }
    } else if (typeof b.acknowledgedAt === "string") {
      const t = b.acknowledgedAt.trim();
      if (!t) {
        data.acknowledgedAt = null;
        if (!("status" in b)) shouldRestorePreviousStatus = true;
      } else {
        const d = new Date(t);
        if (Number.isNaN(d.getTime())) {
          return NextResponse.json({ error: "acknowledgedAt invalide" }, { status: 400 });
        }
        data.acknowledgedAt = d;
        if (!("status" in b)) {
          data.status = VulnStatus.ARCHIVE;
          shouldRememberPreviousStatus = true;
        }
      }
    } else {
      return NextResponse.json(
        { error: "acknowledgedAt : null, false, true ou chaîne ISO" },
        { status: 400 },
      );
    }
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Aucun champ à mettre à jour" }, { status: 400 });
  }

  const existing = await prisma.vulnerability.findUnique({
    where: { id },
    select: { status: true, severity: true, metadata: true },
  });
  if (!existing) {
    return NextResponse.json({ error: "Non trouvé" }, { status: 404 });
  }
  const prevSeverity = existing.severity;

  if (shouldRememberPreviousStatus || shouldRestorePreviousStatus) {
    const currentMeta =
      existing.metadata && typeof existing.metadata === "object" && !Array.isArray(existing.metadata)
        ? (existing.metadata as Record<string, unknown>)
        : {};

    if (shouldRememberPreviousStatus) {
      if (existing.status !== VulnStatus.ARCHIVE) {
        data.metadata = {
          ...currentMeta,
          archivedFromStatus: existing.status,
        };
      }
    } else if (shouldRestorePreviousStatus) {
      const from = currentMeta.archivedFromStatus;
      if (from === VulnStatus.TODO || from === VulnStatus.IN_PROGRESS || from === VulnStatus.DONE) {
        data.status = from;
      } else {
        data.status = VulnStatus.TODO;
      }
      data.metadata = {
        ...currentMeta,
        archivedFromStatus: null,
      };
    }
  }

  const prevStatus = existing.status;

  try {
    const updated = await prisma.$transaction(async (tx) => {
      const row = await tx.vulnerability.update({
        where: { id },
        data,
        include: { importBatch: { include: { template: true } } },
      });
      if (prevStatus !== row.status || prevSeverity !== row.severity) {
        await recordVulnStatusChanged(tx, {
          vulnerabilityId: id,
          fromStatus: prevStatus,
          toStatus: row.status,
          severity: row.severity,
        });
      }
      return row;
    });
    return NextResponse.json(updated);
  } catch {
    return NextResponse.json({ error: "Non trouvé" }, { status: 404 });
  }
}

export async function DELETE(_request: Request, context: Ctx) {
  const { id } = await context.params;
  try {
    await prisma.vulnerability.delete({ where: { id } });
    return new NextResponse(null, { status: 204 });
  } catch {
    return NextResponse.json({ error: "Non trouvé" }, { status: 404 });
  }
}
