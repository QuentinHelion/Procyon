/** Parseurs disponibles — à étendre avec les implémentations dans `src/lib/parsers/`. */
export const PARSER_IDS = ["pingcastle_xml", "generic_csv"] as const;
export type ParserId = (typeof PARSER_IDS)[number];

export function isParserId(s: string): s is ParserId {
  return (PARSER_IDS as readonly string[]).includes(s);
}
