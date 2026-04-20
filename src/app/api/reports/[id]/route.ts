import { rm } from "fs/promises";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { resolveStoredReportAbsolute } from "@/lib/reports-storage";

type Ctx = { params: Promise<{ id: string }> };

export async function DELETE(_request: Request, context: Ctx) {
  const { id } = await context.params;
  const batch = await prisma.importBatch.findUnique({
    where: { id },
    select: { id: true, storedPath: true },
  });
  if (!batch) {
    return NextResponse.json({ error: "Rapport introuvable" }, { status: 404 });
  }

  const absPath = batch.storedPath ? resolveStoredReportAbsolute(batch.storedPath) : null;

  await prisma.$transaction(async (tx) => {
    await tx.vulnerability.updateMany({
      where: { importBatchId: id },
      data: { importBatchId: null },
    });
    await tx.importBatch.delete({ where: { id } });
  });

  if (absPath) {
    await rm(absPath, { force: true }).catch(() => {});
  }

  return NextResponse.json({ ok: true });
}
