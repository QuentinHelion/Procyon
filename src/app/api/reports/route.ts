import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
  const batches = await prisma.importBatch.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
    include: { template: { select: { name: true, slug: true } } },
  });

  return NextResponse.json(
    batches.map((b) => ({
      id: b.id,
      fileName: b.fileName,
      storedPath: b.storedPath,
      hasFile: Boolean(b.storedPath),
      itemCount: b.itemCount,
      createdAt: b.createdAt.toISOString(),
      template: b.template,
    })),
  );
}
