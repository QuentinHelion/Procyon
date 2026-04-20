import { NextResponse } from "next/server";
import { Severity, VulnSource, VulnStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { recordVulnCreated } from "@/lib/vuln-timeline";

const SEVERITIES = new Set(Object.values(Severity));
const STATUSES = new Set(Object.values(VulnStatus));

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");
  const where =
    status && STATUSES.has(status as VulnStatus) ? { status: status as VulnStatus } : {};

  const items = await prisma.vulnerability.findMany({
    where,
    orderBy: [{ severity: "desc" }, { updatedAt: "desc" }],
    include: { importBatch: { include: { template: true } } },
  });

  return NextResponse.json(items);
}

export async function POST(request: Request) {
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
  const title = typeof b.title === "string" ? b.title.trim() : "";
  if (!title) {
    return NextResponse.json({ error: "title est requis" }, { status: 400 });
  }
  const description = typeof b.description === "string" ? b.description : undefined;
  const severity =
    typeof b.severity === "string" && SEVERITIES.has(b.severity as Severity)
      ? (b.severity as Severity)
      : Severity.MEDIUM;
  const status =
    typeof b.status === "string" && STATUSES.has(b.status as VulnStatus)
      ? (b.status as VulnStatus)
      : VulnStatus.TODO;

  let dueAt: Date | null | undefined;
  if ("dueAt" in b) {
    if (b.dueAt === null || b.dueAt === "") dueAt = null;
    else if (typeof b.dueAt === "string") {
      const d = new Date(b.dueAt.trim());
      if (Number.isNaN(d.getTime())) {
        return NextResponse.json({ error: "dueAt invalide" }, { status: 400 });
      }
      dueAt = d;
    } else {
      return NextResponse.json({ error: "dueAt invalide" }, { status: 400 });
    }
  }

  const created = await prisma.$transaction(async (tx) => {
    const row = await tx.vulnerability.create({
      data: {
        title,
        description: description || null,
        severity,
        status,
        source: VulnSource.MANUAL,
        ...(dueAt !== undefined ? { dueAt } : {}),
      },
      include: { importBatch: { include: { template: true } } },
    });
    await recordVulnCreated(tx, {
      vulnerabilityId: row.id,
      toStatus: row.status,
      severity: row.severity,
    });
    return row;
  });

  return NextResponse.json(created, { status: 201 });
}
