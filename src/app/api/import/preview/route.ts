import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { runParser } from "@/lib/parsers";

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
    return NextResponse.json({ error: "Modele de scan inconnu" }, { status: 404 });
  }

  const buf = Buffer.from(await file.arrayBuffer());
  const parsed = runParser(template.parserId, file.name, buf);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 422 });
  }

  const refs = parsed.items
    .map((item) => item.externalRef)
    .filter((x): x is string => typeof x === "string" && x.trim().length > 0);
  const uniqueRefs = [...new Set(refs)];
  const existing = uniqueRefs.length
    ? await prisma.vulnerability.findMany({
        where: { externalRef: { in: uniqueRefs } },
        select: { externalRef: true },
      })
    : [];
  const existingRefs = new Set(existing.map((e) => e.externalRef).filter(Boolean) as string[]);

  const noRefCandidates = parsed.items.filter((item) => !item.externalRef);
  const titleSeveritySeen = new Set<string>();
  const noRefUnique = noRefCandidates.filter((item) => {
    const key = `${item.title}::${item.severity}`;
    if (titleSeveritySeen.has(key)) return false;
    titleSeveritySeen.add(key);
    return true;
  });
  const existingNoRef = noRefUnique.length
    ? await prisma.vulnerability.findMany({
        where: {
          OR: noRefUnique.map((item) => ({
            title: item.title,
            severity: item.severity,
          })),
        },
        select: { title: true, severity: true },
      })
    : [];
  const existingNoRefKeys = new Set(existingNoRef.map((e) => `${e.title}::${e.severity}`));

  const items = parsed.items.map((item) => ({
    title: item.title,
    severity: item.severity,
    externalRef: item.externalRef ?? null,
    action: item.externalRef
      ? existingRefs.has(item.externalRef)
        ? ("update" as const)
        : ("create" as const)
      : existingNoRefKeys.has(`${item.title}::${item.severity}`)
        ? ("skip" as const)
        : ("create" as const),
  }));

  const createCount = items.filter((x) => x.action === "create").length;
  const updateCount = items.filter((x) => x.action === "update").length;
  const skipCount = items.filter((x) => x.action === "skip").length;

  return NextResponse.json({
    total: items.length,
    createCount,
    updateCount,
    skipCount,
    items: items.slice(0, 200),
  });
}
