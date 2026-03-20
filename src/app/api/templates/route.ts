import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { isParserId, PARSER_IDS } from "@/lib/parser-ids";

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export async function GET() {
  const templates = await prisma.scanTemplate.findMany({
    orderBy: [{ isBuiltIn: "desc" }, { name: "asc" }],
  });
  return NextResponse.json(templates);
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
  const name = typeof b.name === "string" ? b.name.trim() : "";
  const slug = typeof b.slug === "string" ? b.slug.trim().toLowerCase() : "";
  const parserId = typeof b.parserId === "string" ? b.parserId.trim() : "";
  const description = typeof b.description === "string" ? b.description.trim() : undefined;
  const fileHint = typeof b.fileHint === "string" && b.fileHint.trim() ? b.fileHint.trim() : "*.dat";

  if (!name || !slug || !SLUG_RE.test(slug)) {
    return NextResponse.json(
      { error: "name et slug requis (slug : minuscules et tirets)" },
      { status: 400 },
    );
  }
  if (!isParserId(parserId)) {
    return NextResponse.json(
      {
        error: `parserId inconnu. Valeurs : ${PARSER_IDS.join(", ")}`,
      },
      { status: 400 },
    );
  }

  try {
    const created = await prisma.scanTemplate.create({
      data: {
        name,
        slug,
        parserId,
        description: description || null,
        fileHint,
        isBuiltIn: false,
      },
    });
    return NextResponse.json(created, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Slug déjà utilisé ou données invalides" }, { status: 409 });
  }
}
