import { Severity } from "@prisma/client";
import type { ParseResult, ParsedVulnerability } from "./types";

const ALLOWED = new Set(Object.values(Severity));

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (c === "," && !inQuotes) {
      out.push(cur.trim());
      cur = "";
    } else {
      cur += c;
    }
  }
  out.push(cur.trim());
  return out;
}

function normSeverity(s: string): Severity | null {
  const u = s.trim().toUpperCase();
  if (ALLOWED.has(u as Severity)) return u as Severity;
  return null;
}

export function parseGenericCsv(content: string): ParseResult {
  const lines = content.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) {
    return { ok: false, error: "CSV vide ou sans en-tête." };
  }
  const header = parseCsvLine(lines[0]).map((h) => h.toLowerCase().trim());
  const idx = (name: string) => header.indexOf(name);

  const iTitle = idx("title");
  const iSeverity = idx("severity");
  if (iTitle < 0 || iSeverity < 0) {
    return {
      ok: false,
      error: "Colonnes obligatoires manquantes : title, severity.",
    };
  }
  const iDesc = idx("description");
  const iRef = idx("externalref");

  const items: ParsedVulnerability[] = [];
  for (let r = 1; r < lines.length; r++) {
    const cells = parseCsvLine(lines[r]);
    const title = cells[iTitle]?.trim();
    if (!title) continue;
    const sev = normSeverity(cells[iSeverity] ?? "");
    if (!sev) {
      return { ok: false, error: `Ligne ${r + 1} : severity invalide.` };
    }
    const description = iDesc >= 0 ? cells[iDesc]?.trim() || undefined : undefined;
    const externalRef = iRef >= 0 ? cells[iRef]?.trim() || undefined : undefined;
    items.push({
      title,
      description,
      severity: sev,
      externalRef,
      metadata: { source: "generic_csv", row: r },
    });
  }

  if (items.length === 0) return { ok: false, error: "Aucune ligne de donnée exploitable." };
  return { ok: true, items };
}
