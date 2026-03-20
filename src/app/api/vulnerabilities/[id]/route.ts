import { NextResponse } from "next/server";
import { Severity, VulnStatus } from "@prisma/client";
import { prisma } from "@/lib/db";

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
    } else if (b.acknowledgedAt === true) {
      data.acknowledgedAt = new Date();
    } else if (typeof b.acknowledgedAt === "string") {
      const t = b.acknowledgedAt.trim();
      if (!t) {
        data.acknowledgedAt = null;
      } else {
        const d = new Date(t);
        if (Number.isNaN(d.getTime())) {
          return NextResponse.json({ error: "acknowledgedAt invalide" }, { status: 400 });
        }
        data.acknowledgedAt = d;
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

  try {
    const updated = await prisma.vulnerability.update({
      where: { id },
      data,
      include: { importBatch: { include: { template: true } } },
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
