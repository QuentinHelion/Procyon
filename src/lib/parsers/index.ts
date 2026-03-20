import type { ParseResult } from "./types";
import { parsePingCastleXml } from "./pingcastle";
import { parseGenericCsv } from "./generic-csv";

export type { ParsedVulnerability, ParseResult } from "./types";

export function runParser(parserId: string, fileName: string, buffer: Buffer): ParseResult {
  const text = buffer.toString("utf8");
  const lower = fileName.toLowerCase();

  switch (parserId) {
    case "pingcastle_xml":
      if (!lower.endsWith(".xml")) {
        return { ok: false, error: "Ce modèle attend un fichier .xml." };
      }
      return parsePingCastleXml(text);
    case "generic_csv":
      if (!lower.endsWith(".csv")) {
        return { ok: false, error: "Ce modèle attend un fichier .csv." };
      }
      return parseGenericCsv(text);
    default:
      return { ok: false, error: `Parseur inconnu : ${parserId}` };
  }
}
