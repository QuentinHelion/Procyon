import { NextResponse } from "next/server";
import { VulnSource } from "@prisma/client";
import { prisma } from "@/lib/db";
import { runParser } from "@/lib/parsers";
import { saveImportedReport } from "@/lib/reports-storage";

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

  for (const item of parsed.items) {
    const meta = { ...(item.metadata ?? {}), templateSlug: template.slug };
    if (item.externalRef) {
      const existing = await prisma.vulnerability.findFirst({
        where: { externalRef: item.externalRef },
      });
      if (existing) {
        await prisma.vulnerability.update({
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
        updated++;
      } else {
        await prisma.vulnerability.create({
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
        created++;
      }
    } else {
      await prisma.vulnerability.create({
        data: {
          title: item.title,
          description: item.description ?? null,
          severity: item.severity,
          metadata: meta as object,
          source: VulnSource.IMPORT,
          importBatchId: batch.id,
        },
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
    total: parsed.items.length,
  });
}
