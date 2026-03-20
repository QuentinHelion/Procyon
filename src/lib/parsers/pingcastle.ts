import { Severity } from "@prisma/client";
import { XMLParser } from "fast-xml-parser";
import type { ParseResult, ParsedVulnerability } from "./types";

function mapPointsToSeverity(points: unknown): Severity {
  const n = typeof points === "string" ? parseInt(points, 10) : typeof points === "number" ? points : NaN;
  if (!Number.isFinite(n)) return Severity.MEDIUM;
  if (n >= 50) return Severity.CRITICAL;
  if (n >= 30) return Severity.HIGH;
  if (n >= 15) return Severity.MEDIUM;
  if (n > 0) return Severity.LOW;
  return Severity.INFO;
}

function text(v: unknown): string | undefined {
  if (v == null) return undefined;
  if (typeof v === "string") return v.trim() || undefined;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return undefined;
}

function collectRiskRuleNodes(obj: unknown, out: Record<string, unknown>[]): void {
  if (obj == null) return;
  if (Array.isArray(obj)) {
    obj.forEach((x) => collectRiskRuleNodes(x, out));
    return;
  }
  if (typeof obj !== "object") return;
  const o = obj as Record<string, unknown>;
  const keys = Object.keys(o);
  const looksLikeRule =
    ("RiskId" in o || "riskId" in o) &&
    ("RiskRule" in o || "riskRule" in o || "Points" in o || "points" in o);
  if (looksLikeRule) out.push(o);
  for (const k of keys) collectRiskRuleNodes(o[k], out);
}

export function parsePingCastleXml(xml: string): ParseResult {
  try {
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: "@_",
      trimValues: true,
    });
    const doc = parser.parse(xml);
    const rules: Record<string, unknown>[] = [];
    collectRiskRuleNodes(doc, rules);

    const items: ParsedVulnerability[] = [];
    const seen = new Set<string>();

    for (const r of rules) {
      const riskId = text(r.RiskId ?? r.riskId ?? r["@_RiskId"]);
      const ruleName = text(r.RiskRule ?? r.riskRule);
      const points = r.Points ?? r.points ?? r["@_Points"];
      const category = text(r.Category ?? r.category);
      const rationale = text(r.Rationale ?? r.rationale);
      const recommendation = text(r.Recommendation ?? r.recommendation);
      const technical = text(r.TechnicalExplanation ?? r.technicalExplanation);

      const title = ruleName ?? (riskId ? `PingCastle — ${riskId}` : "Finding PingCastle");
      const parts = [category, rationale, technical, recommendation].filter(Boolean);
      const description = parts.length ? parts.join("\n\n") : undefined;
      const externalRef = riskId ?? undefined;

      const key = externalRef ?? `${title}:${String(points)}`;
      if (seen.has(key)) continue;
      seen.add(key);

      items.push({
        title,
        description,
        severity: mapPointsToSeverity(points),
        externalRef,
        metadata: { source: "pingcastle", points, category },
      });
    }

    if (items.length === 0) {
      return {
        ok: false,
        error:
          "Aucune règle de risque reconnue dans le XML. Vérifiez qu'il s'agit d'un export PingCastle complet.",
      };
    }

    return { ok: true, items };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erreur de lecture XML";
    return { ok: false, error: msg };
  }
}
