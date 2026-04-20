import { NextResponse } from "next/server";
import { VulnSource } from "@prisma/client";
import { prisma } from "@/lib/db";
import { runParser } from "@/lib/parsers";
import { saveImportedReport } from "@/lib/reports-storage";
import { recordVulnCreated, recordVulnStatusChanged } from "@/lib/vuln-timeline";

export async function POST(request: Request) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Formulaire multipart attendu" }, { status: 400 });
  }

  const file = form.get("file");
  const templateSlug = form.get("templateSlug");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Champ file requis" }, { status: 400 });
  }
  if (typeof templateSlug !== "string" || !templateSlug.trim()) {
    return NextResponse.json({ error: "templateSlug requis" }, { status: 400 });
  }

  const template = await prisma.scanTemplate.findUnique({
    where: { slug: templateSlug.trim().toLowerCase() },
  });
  if (!template) {
    return NextResponse.json({ error: "Modèle de scan inconnu" }, { status: 404 });
  }

  const buf = Buffer.from(await file.arrayBuffer());
  const parsed = runParser(template.parserId, file.name, buf);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 422 });
  }

  const batch = await prisma.importBatch.create({
    data: {
      templateId: template.id,
      fileName: file.name,
      itemCount: 0,
    },
  });

  try {
    const storedPath = await saveImportedReport(batch.id, file.name, buf);
    await prisma.importBatch.update({
      where: { id: batch.id },
      data: { storedPath },
    });
  } catch (e) {
    console.error("[import] archivage du fichier échoué", e);
  }

  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const item of parsed.items) {
    const meta = { ...(item.metadata ?? {}), templateSlug: template.slug };
    if (item.externalRef) {
      const existing = await prisma.vulnerability.findFirst({
        where: { externalRef: item.externalRef },
        select: { id: true, status: true, severity: true },
      });
      if (existing) {
        await prisma.$transaction(async (tx) => {
          const prevStatus = existing.status;
          const prevSev = existing.severity;
          const row = await tx.vulnerability.update({
            where: { id: existing.id },
            data: {
              title: item.title,
              description: item.description ?? null,
              severity: item.severity,
              metadata: meta as object,
              source: VulnSource.IMPORT,
              importBatchId: batch.id,
            },
          });
          if (prevStatus !== row.status || prevSev !== row.severity) {
            await recordVulnStatusChanged(tx, {
              vulnerabilityId: row.id,
              fromStatus: prevStatus,
              toStatus: row.status,
              severity: row.severity,
            });
          }
        });
        updated++;
      } else {
        await prisma.$transaction(async (tx) => {
          const row = await tx.vulnerability.create({
            data: {
              title: item.title,
              description: item.description ?? null,
              severity: item.severity,
              externalRef: item.externalRef,
              metadata: meta as object,
              source: VulnSource.IMPORT,
              importBatchId: batch.id,
            },
          });
          await recordVulnCreated(tx, {
            vulnerabilityId: row.id,
            toStatus: row.status,
            severity: row.severity,
          });
        });
        created++;
      }
    } else {
      const duplicate = await prisma.vulnerability.findFirst({
        where: {
          title: item.title,
          severity: item.severity,
        },
        select: { id: true },
      });
      if (duplicate) {
        skipped++;
        continue;
      }
      await prisma.$transaction(async (tx) => {
        const row = await tx.vulnerability.create({
          data: {
            title: item.title,
            description: item.description ?? null,
            severity: item.severity,
            metadata: meta as object,
            source: VulnSource.IMPORT,
            importBatchId: batch.id,
          },
        });
        await recordVulnCreated(tx, {
          vulnerabilityId: row.id,
          toStatus: row.status,
          severity: row.severity,
        });
      });
      created++;
    }
  }

  await prisma.importBatch.update({
    where: { id: batch.id },
    data: { itemCount: created + updated },
  });

  return NextResponse.json({
    batchId: batch.id,
    created,
    updated,
    skipped,
    total: parsed.items.length,
  });
}
