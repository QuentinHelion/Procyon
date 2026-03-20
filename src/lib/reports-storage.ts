import { mkdir, readFile, stat, writeFile } from "fs/promises";
import path from "path";

function getReportsRoot(): string {
  const raw = process.env.REPORTS_DIR?.trim();
  const root = raw && raw.length > 0 ? path.resolve(raw) : path.join(process.cwd(), "data", "reports");
  return root;
}

export function getReportsRootResolved(): string {
  return getReportsRoot();
}

/** Nom de fichier sûr pour le disque (conserve l’extension). */
export function sanitizeOriginalFileName(name: string): string {
  const base = path.basename(name).replace(/[^\w.\-()+ ]/g, "_").replace(/\s+/g, " ");
  return base.slice(0, 180) || "rapport";
}

/**
 * Enregistre une copie du rapport importé. Retourne le chemin relatif (séparateurs /).
 */
export async function saveImportedReport(
  batchId: string,
  originalName: string,
  buffer: Buffer,
): Promise<string> {
  const root = getReportsRoot();
  await mkdir(root, { recursive: true });
  const safe = sanitizeOriginalFileName(originalName);
  const relative = path.join(batchId, `${Date.now()}_${safe}`);
  const full = path.join(root, relative);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, buffer);
  return relative.split(path.sep).join("/");
}

export function resolveStoredReportAbsolute(storedRelativePath: string): string | null {
  const root = path.resolve(getReportsRoot());
  if (storedRelativePath.includes("..")) return null;
  const normalized = storedRelativePath.replace(/\//g, path.sep);
  const abs = path.resolve(root, normalized);
  const rel = path.relative(root, abs);
  if (rel.startsWith("..") || path.isAbsolute(rel)) return null;
  return abs;
}

export async function readStoredReport(storedRelativePath: string): Promise<Buffer | null> {
  const abs = resolveStoredReportAbsolute(storedRelativePath);
  if (!abs) return null;
  try {
    const s = await stat(abs);
    if (!s.isFile()) return null;
    return readFile(abs);
  } catch {
    return null;
  }
}

export function guessContentType(fileName: string): string {
  const ext = path.extname(fileName).toLowerCase();
  if (ext === ".xml") return "application/xml; charset=utf-8";
  if (ext === ".csv") return "text/csv; charset=utf-8";
  if (ext === ".json") return "application/json; charset=utf-8";
  if (ext === ".txt") return "text/plain; charset=utf-8";
  return "application/octet-stream";
}
