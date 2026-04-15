import { Severity } from "@prisma/client";
import { XMLParser } from "fast-xml-parser";
import type { ParseResult, ParsedVulnerability } from "./types";

function mapPointsToSeverity(points: unknown): Severity {
  const n = typeof points === "string" ? parseInt(points, 10) : typeof points === "number" ? points : NaN;
  if (!Number.isFinite(n)) return Severity.MEDIUM;
  // PingCastle scores are typically between 0 and 100, with most risk rules around 0..20.
  if (n >= 20) return Severity.CRITICAL;
  if (n >= 15) return Severity.HIGH;
  if (n >= 10) return Severity.MEDIUM;
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
    ("Points" in o || "points" in o || "Rationale" in o || "rationale" in o || "Model" in o || "model" in o);
  if (looksLikeRule) out.push(o);
  for (const k of keys) collectRiskRuleNodes(o[k], out);
}

export function parsePingCastleXml(xml: string): ParseResult {
  try {
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: "@_",
      trimValues: true,
      parseTagValue: false,
    });
    const doc = parser.parse(xml);
    const rules: Record<string, unknown>[] = [];

    const root = (doc as Record<string, unknown>)?.HealthcheckData as Record<string, unknown> | undefined;
    const directRules = root?.RiskRules as Record<string, unknown> | undefined;
    const directRuleNodes = directRules?.HealthcheckRiskRule;
    if (Array.isArray(directRuleNodes)) {
      for (const r of directRuleNodes) {
        if (r && typeof r === "object") rules.push(r as Record<string, unknown>);
      }
    } else if (directRuleNodes && typeof directRuleNodes === "object") {
      rules.push(directRuleNodes as Record<string, unknown>);
    }

    // Fallback: recursive search to support alternate PingCastle shapes.
    if (rules.length === 0) {
      collectRiskRuleNodes(doc, rules);
    }

    const items: ParsedVulnerability[] = [];
    const seen = new Set<string>();

    for (const r of rules) {
      const riskId = text(r.RiskId ?? r.riskId ?? r["@_RiskId"]);
      const ruleName = text(r.RiskRule ?? r.riskRule ?? r.Model ?? r.model);
      const points = r.Points ?? r.points ?? r["@_Points"];
      const category = text(r.Category ?? r.category);
      const rationale = text(r.Rationale ?? r.rationale);
      const recommendation = text(r.Recommendation ?? r.recommendation);
      const technical = text(r.TechnicalExplanation ?? r.technicalExplanation);

      const title =
        ruleName ??
        rationale?.split(".")[0]?.trim() ??
        (riskId ? `PingCastle - ${riskId}` : "Finding PingCastle");
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
