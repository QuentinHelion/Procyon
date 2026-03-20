import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { guessContentType, readStoredReport } from "@/lib/reports-storage";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Ctx) {
  const { id } = await context.params;
  const { searchParams } = new URL(request.url);
  const download = searchParams.get("download") === "1";

  const batch = await prisma.importBatch.findUnique({ where: { id } });
  if (!batch?.storedPath) {
    return NextResponse.json({ error: "Rapport introuvable ou non archivé" }, { status: 404 });
  }

  const buf = await readStoredReport(batch.storedPath);
  if (!buf) {
    return NextResponse.json({ error: "Fichier absent du disque" }, { status: 404 });
  }

  const name = batch.fileName ?? "rapport";
  const ct = guessContentType(name);
  const disposition = download ? "attachment" : "inline";
  const safe = encodeURIComponent(name);

  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": ct,
      "Content-Disposition": `${disposition}; filename*=UTF-8''${safe}`,
      "Cache-Control": "private, max-age=60",
    },
  });
}
