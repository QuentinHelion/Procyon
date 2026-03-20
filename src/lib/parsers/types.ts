import type { Severity } from "@prisma/client";

export type ParsedVulnerability = {
  title: string;
  description?: string;
  severity: Severity;
  externalRef?: string;
  metadata?: Record<string, unknown>;
};

export type ParseResult =
  | { ok: true; items: ParsedVulnerability[] }
  | { ok: false; error: string };
