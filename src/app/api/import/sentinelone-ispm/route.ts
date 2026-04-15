import { NextResponse } from "next/server";
import { Severity, VulnSource } from "@prisma/client";
import { prisma } from "@/lib/db";

type S1Exposure = {
  id?: unknown;
  severity?: unknown;
  detectionName?: unknown;
};

function mapSeverity(value: string): Severity {
  const s = value.trim().toUpperCase();
  if (s === "CRITICAL") return Severity.CRITICAL;
  if (s === "HIGH") return Severity.HIGH;
  if (s === "LOW") return Severity.LOW;
  if (s === "INFO" || s === "INFORMATIONAL") return Severity.INFO;
  return Severity.MEDIUM;
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON invalide" }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Corps JSON attendu" }, { status: 400 });
  }

  const b = body as Record<string, unknown>;
  const tenantUrl = typeof b.tenantUrl === "string" ? b.tenantUrl.trim() : "";
  const token = typeof b.token === "string" ? b.token.trim() : "";
  const siteIds = typeof b.siteIds === "string" ? b.siteIds.trim() : "";

  if (!tenantUrl || !token || !siteIds) {
    return NextResponse.json(
      { error: "tenantUrl, token et siteIds sont requis" },
      { status: 400 },
    );
  }

  let baseUrl: URL;
  try {
    baseUrl = new URL(tenantUrl);
  } catch {
    return NextResponse.json({ error: "tenantUrl invalide" }, { status: 400 });
  }

  baseUrl.pathname = "/web/api/v2.1/ranger-ad/get-exposures";
  baseUrl.search = "";
  const parsedSiteIds = siteIds
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
  if (!parsedSiteIds.length) {
    return NextResponse.json({ error: "siteIds invalide" }, { status: 400 });
  }

  let externalRes: Response;
  try {
    externalRes = await fetch(baseUrl.toString(), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        limit: 100,
        skip: 0,
        filter: {
          siteIds: parsedSiteIds,
          detectionStatus: ["Vulnerable"],
        },
      }),
      cache: "no-store",
    });
  } catch {
    return NextResponse.json(
      { error: "Connexion SentinelOne impossible" },
      { status: 502 },
    );
  }

  if (!externalRes.ok) {
    const text = await externalRes.text().catch(() => "");
    return NextResponse.json(
      {
        error: `SentinelOne a répondu ${externalRes.status} ${externalRes.statusText}`,
        details: text.slice(0, 300),
      },
      { status: 502 },
    );
  }

  const payload = (await externalRes.json().catch(() => null)) as
    | { data?: unknown }
    | null;
  if (!payload || !Array.isArray(payload.data)) {
    return NextResponse.json(
      { error: "Réponse SentinelOne inattendue (champ data manquant)" },
      { status: 422 },
    );
  }

  const exposures = payload.data as S1Exposure[];
  const candidates: Array<{
    title: string;
    severity: Severity;
    externalRef: string;
    legacyExternalRef: string;
  }> = [];
  const seenInPayload = new Set<string>();

  for (const raw of exposures) {
    if (!raw || typeof raw !== "object") continue;
    const detectionName =
      typeof raw.detectionName === "string" ? raw.detectionName.trim() : "";
    const id = typeof raw.id === "string" ? raw.id.trim() : "";
    if (!detectionName || !id) continue;

    const externalRef = id;
    const legacyExternalRef = `sentinelone-ispm:${id}`;
    if (seenInPayload.has(externalRef)) continue;
    seenInPayload.add(externalRef);

    const severityRaw =
      typeof raw.severity === "string" ? raw.severity : "MEDIUM";
    candidates.push({
      title: detectionName,
      severity: mapSeverity(severityRaw),
      externalRef,
      legacyExternalRef,
    });
  }

  const template = await prisma.scanTemplate.upsert({
    where: { slug: "sentinelone-ispm-api" },
    create: {
      name: "SentinelOne ISPM (API)",
      slug: "sentinelone-ispm-api",
      description: "Import API des expositions SentinelOne ISPM",
      parserId: "generic_csv",
      fileHint: "API",
      isBuiltIn: true,
    },
    update: {},
  });

  const batch = await prisma.importBatch.create({
    data: {
      templateId: template.id,
      fileName: "sentinelone-ispm-api",
      itemCount: 0,
    },
  });

  const existing = await prisma.vulnerability.findMany({
    where: {
      externalRef: {
        in: candidates.flatMap((c) => [c.externalRef, c.legacyExternalRef]),
      },
    },
    select: { externalRef: true },
  });
  const existingRefs = new Set(existing.map((e) => e.externalRef).filter(Boolean) as string[]);

  let created = 0;
  let skipped = 0;
  for (const c of candidates) {
    if (existingRefs.has(c.externalRef) || existingRefs.has(c.legacyExternalRef)) {
      skipped++;
      continue;
    }
    await prisma.vulnerability.create({
      data: {
        title: c.title,
        severity: c.severity,
        source: VulnSource.IMPORT,
        externalRef: c.externalRef,
        metadata: { provider: "sentinelone_ispm" },
        importBatchId: batch.id,
      },
    });
    created++;
  }

  await prisma.importBatch.update({
    where: { id: batch.id },
    data: { itemCount: created },
  });

  return NextResponse.json({
    created,
    skipped,
    total: candidates.length,
  });
}
