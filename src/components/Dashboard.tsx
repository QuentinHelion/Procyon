"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type Severity = "INFO" | "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
type VulnStatus = "TODO" | "IN_PROGRESS" | "DONE";
type VulnSource = "MANUAL" | "IMPORT";

type Template = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  parserId: string;
  fileHint: string;
  isBuiltIn: boolean;
};

type Vuln = {
  id: string;
  title: string;
  description: string | null;
  severity: Severity;
  status: VulnStatus;
  source: VulnSource;
  externalRef: string | null;
  metadata: unknown;
  createdAt: string;
  updatedAt: string;
  importBatch: null | {
    template: { name: string; slug: string };
  };
};

const COLUMNS: { status: VulnStatus; label: string; hint: string }[] = [
  { status: "TODO", label: "À traiter", hint: "Comme la liste « Planifié » dans To Do" },
  { status: "IN_PROGRESS", label: "En cours", hint: "Analyse ou remédiation en cours" },
  { status: "DONE", label: "Terminé", hint: "Clos ou accepté" },
];

const SEVERITY_ORDER: Severity[] = ["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"];

const severityStyle: Record<Severity, string> = {
  CRITICAL: "bg-red-600/15 text-red-700 dark:text-red-300",
  HIGH: "bg-orange-500/15 text-orange-800 dark:text-orange-200",
  MEDIUM: "bg-amber-500/15 text-amber-900 dark:text-amber-100",
  LOW: "bg-sky-500/15 text-sky-900 dark:text-sky-100",
  INFO: "bg-zinc-500/10 text-[var(--muted)]",
};

const severityLabel: Record<Severity, string> = {
  CRITICAL: "Critique",
  HIGH: "Élevée",
  MEDIUM: "Moyenne",
  LOW: "Faible",
  INFO: "Info",
};

async function parseJson<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(typeof err.error === "string" ? err.error : res.statusText);
  }
  return res.json() as Promise<T>;
}

export function Dashboard() {
  const [vulns, setVulns] = useState<Vuln[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [addOpen, setAddOpen] = useState(false);
  const [addTitle, setAddTitle] = useState("");
  const [addDesc, setAddDesc] = useState("");
  const [addSeverity, setAddSeverity] = useState<Severity>("MEDIUM");

  const [importSlug, setImportSlug] = useState("");
  const [importBusy, setImportBusy] = useState(false);
  const [importMsg, setImportMsg] = useState<string | null>(null);

  const [tplOpen, setTplOpen] = useState(false);
  const [tplName, setTplName] = useState("");
  const [tplSlug, setTplSlug] = useState("");
  const [tplParser, setTplParser] = useState("generic_csv");
  const [tplDesc, setTplDesc] = useState("");
  const [tplHint, setTplHint] = useState("*.csv");

  const load = useCallback(async () => {
    setError(null);
    try {
      const [v, t] = await Promise.all([
        parseJson<Vuln[]>(await fetch("/api/vulnerabilities")),
        parseJson<Template[]>(await fetch("/api/templates")),
      ]);
      setVulns(v);
      setTemplates(t);
      setImportSlug((prev) => prev || (t[0]?.slug ?? ""));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur de chargement");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const byStatus = useMemo(() => {
    const m = new Map<VulnStatus, Vuln[]>();
    for (const c of COLUMNS) m.set(c.status, []);
    for (const v of vulns) {
      const list = m.get(v.status);
      if (list) list.push(v);
    }
    for (const c of COLUMNS) {
      m.set(
        c.status,
        (m.get(c.status) ?? []).sort(
          (a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity),
        ),
      );
    }
    return m;
  }, [vulns]);

  async function patchStatus(id: string, status: VulnStatus) {
    const res = await fetch(`/api/vulnerabilities/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    const updated = await parseJson<Vuln>(res);
    setVulns((prev) => prev.map((x) => (x.id === id ? updated : x)));
  }

  async function removeVuln(id: string) {
    const res = await fetch(`/api/vulnerabilities/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(typeof err.error === "string" ? err.error : "Suppression impossible");
    }
    setVulns((prev) => prev.filter((x) => x.id !== id));
  }

  async function submitAdd(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/vulnerabilities", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: addTitle,
        description: addDesc || undefined,
        severity: addSeverity,
        status: "TODO",
      }),
    });
    const created = await parseJson<Vuln>(res);
    setVulns((prev) => [created, ...prev]);
    setAddOpen(false);
    setAddTitle("");
    setAddDesc("");
    setAddSeverity("MEDIUM");
  }

  async function onImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !importSlug) return;
    setImportBusy(true);
    setImportMsg(null);
    try {
      const fd = new FormData();
      fd.set("file", file);
      fd.set("templateSlug", importSlug);
      const res = await fetch("/api/import", { method: "POST", body: fd });
      const data = await parseJson<{ created: number; updated: number; total: number }>(res);
      setImportMsg(`${data.created} créée(s), ${data.updated} mise(s) à jour (${data.total} au total).`);
      await load();
    } catch (err) {
      setImportMsg(err instanceof Error ? err.message : "Import échoué");
    } finally {
      setImportBusy(false);
    }
  }

  async function submitTemplate(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: tplName,
        slug: tplSlug,
        parserId: tplParser,
        description: tplDesc || undefined,
        fileHint: tplHint,
      }),
    });
    await parseJson<Template>(res);
    setTplOpen(false);
    setTplName("");
    setTplSlug("");
    setTplDesc("");
    setTplParser("generic_csv");
    setTplHint("*.csv");
    await load();
  }

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-8 sm:px-6">
      <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Procyon</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Suivi des vulnérabilités — tableau type To Do, imports par modèles de scan.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setAddOpen(true)}
            className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white transition hover:bg-[var(--accent-hover)]"
          >
            Nouvelle vulnérabilité
          </button>
          <button
            type="button"
            onClick={() => setTplOpen(true)}
            className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-2 text-sm font-medium transition hover:bg-[var(--column)]"
          >
            Nouveau modèle
          </button>
        </div>
      </header>

      <section
        className="mb-8 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-sm"
        style={{ boxShadow: "0 1px 2px rgba(0,0,0,0.04)" }}
      >
        <h2 className="text-sm font-semibold text-[var(--text)]">Importer un rapport</h2>
        <p className="mt-1 text-xs text-[var(--muted)]">
          Choisissez un modèle (PingCastle XML, CSV générique, ou un modèle personnalisé partageant le
          même parseur).
        </p>
        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center">
          <select
            value={importSlug}
            onChange={(e) => setImportSlug(e.target.value)}
            className="w-full max-w-md rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--accent)] sm:w-auto"
          >
            {templates.map((t) => (
              <option key={t.id} value={t.slug}>
                {t.name} ({t.fileHint})
              </option>
            ))}
          </select>
          <label className="inline-flex cursor-pointer items-center justify-center rounded-lg border border-dashed border-[var(--border)] bg-[var(--column)] px-4 py-2 text-sm font-medium transition hover:border-[var(--accent)] hover:bg-[var(--bg)]">
            <input
              type="file"
              className="hidden"
              disabled={importBusy || !importSlug}
              onChange={onImportFile}
            />
            {importBusy ? "Import…" : "Choisir un fichier"}
          </label>
        </div>
        {importMsg ? <p className="mt-2 text-sm text-[var(--muted)]">{importMsg}</p> : null}
      </section>

      {error ? (
        <p className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-800 dark:text-red-200">
          {error}
        </p>
      ) : null}

      {loading ? (
        <p className="text-sm text-[var(--muted)]">Chargement…</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {COLUMNS.map((col) => (
            <div
              key={col.status}
              className="flex min-h-[420px] flex-col rounded-xl border border-[var(--border)] bg-[var(--column)] p-3"
            >
              <div className="mb-3 px-1">
                <h2 className="text-sm font-semibold">{col.label}</h2>
                <p className="text-xs text-[var(--muted)]">{col.hint}</p>
                <p className="mt-1 text-xs font-medium text-[var(--muted)]">
                  {(byStatus.get(col.status) ?? []).length} élément(s)
                </p>
              </div>
              <ul className="flex flex-1 flex-col gap-2 overflow-y-auto">
                {(byStatus.get(col.status) ?? []).map((v) => (
                  <li
                    key={v.id}
                    className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3 shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span
                        className={`inline-flex shrink-0 rounded px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${severityStyle[v.severity]}`}
                      >
                        {severityLabel[v.severity]}
                      </span>
                      <span className="text-[10px] text-[var(--muted)]">
                        {v.source === "IMPORT" ? "Import" : "Manuel"}
                      </span>
                    </div>
                    <p className="mt-2 text-sm font-medium leading-snug">{v.title}</p>
                    {v.description ? (
                      <p className="mt-1 line-clamp-3 text-xs text-[var(--muted)]">{v.description}</p>
                    ) : null}
                    {v.importBatch?.template ? (
                      <p className="mt-2 text-[10px] text-[var(--muted)]">
                        Modèle : {v.importBatch.template.name}
                      </p>
                    ) : null}
                    <div className="mt-3 flex flex-wrap gap-1">
                      {COLUMNS.filter((c) => c.status !== v.status).map((c) => (
                        <button
                          key={c.status}
                          type="button"
                          onClick={() => void patchStatus(v.id, c.status)}
                          className="rounded border border-[var(--border)] bg-[var(--bg)] px-2 py-1 text-[11px] transition hover:border-[var(--accent)]"
                        >
                          → {c.label}
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={() => void removeVuln(v.id).catch((err) => setError(String(err)))}
                        className="rounded border border-transparent px-2 py-1 text-[11px] text-red-600 hover:bg-red-500/10 dark:text-red-400"
                      >
                        Supprimer
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      {addOpen ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
          <div
            className="w-full max-w-md rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-lg"
            role="dialog"
            aria-modal="true"
            aria-labelledby="add-title"
          >
            <h2 id="add-title" className="text-lg font-semibold">
              Nouvelle vulnérabilité
            </h2>
            <form onSubmit={submitAdd} className="mt-4 flex flex-col gap-3">
              <label className="text-xs font-medium text-[var(--muted)]">
                Titre
                <input
                  required
                  value={addTitle}
                  onChange={(e) => setAddTitle(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--accent)]"
                />
              </label>
              <label className="text-xs font-medium text-[var(--muted)]">
                Description
                <textarea
                  value={addDesc}
                  onChange={(e) => setAddDesc(e.target.value)}
                  rows={3}
                  className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--accent)]"
                />
              </label>
              <label className="text-xs font-medium text-[var(--muted)]">
                Sévérité
                <select
                  value={addSeverity}
                  onChange={(e) => setAddSeverity(e.target.value as Severity)}
                  className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm"
                >
                  {SEVERITY_ORDER.map((s) => (
                    <option key={s} value={s}>
                      {severityLabel[s]}
                    </option>
                  ))}
                </select>
              </label>
              <div className="mt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setAddOpen(false)}
                  className="rounded-lg px-3 py-2 text-sm text-[var(--muted)] hover:bg-[var(--column)]"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--accent-hover)]"
                >
                  Créer
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {tplOpen ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
          <div
            className="w-full max-w-md rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-lg"
            role="dialog"
            aria-modal="true"
          >
            <h2 className="text-lg font-semibold">Nouveau modèle de scan</h2>
            <p className="mt-1 text-xs text-[var(--muted)]">
              Un modèle associe un nom convivial à un parseur déjà implémenté. Pour un nouvel outil,
              ajoutez un parseur dans le code puis enregistrez son identifiant ici.
            </p>
            <form onSubmit={submitTemplate} className="mt-4 flex flex-col gap-3">
              <label className="text-xs font-medium text-[var(--muted)]">
                Nom affiché
                <input
                  required
                  value={tplName}
                  onChange={(e) => setTplName(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm"
                />
              </label>
              <label className="text-xs font-medium text-[var(--muted)]">
                Slug (unique, minuscules)
                <input
                  required
                  value={tplSlug}
                  onChange={(e) => setTplSlug(e.target.value.toLowerCase())}
                  placeholder="mon-outil-export"
                  className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm"
                />
              </label>
              <label className="text-xs font-medium text-[var(--muted)]">
                Parseur
                <select
                  value={tplParser}
                  onChange={(e) => {
                    setTplParser(e.target.value);
                    setTplHint(e.target.value === "pingcastle_xml" ? "*.xml" : "*.csv");
                  }}
                  className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm"
                >
                  <option value="pingcastle_xml">PingCastle (XML)</option>
                  <option value="generic_csv">CSV générique</option>
                </select>
              </label>
              <label className="text-xs font-medium text-[var(--muted)]">
                Indication fichier
                <input
                  value={tplHint}
                  onChange={(e) => setTplHint(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm"
                />
              </label>
              <label className="text-xs font-medium text-[var(--muted)]">
                Description
                <textarea
                  value={tplDesc}
                  onChange={(e) => setTplDesc(e.target.value)}
                  rows={2}
                  className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm"
                />
              </label>
              <div className="mt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setTplOpen(false)}
                  className="rounded-lg px-3 py-2 text-sm text-[var(--muted)] hover:bg-[var(--column)]"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--accent-hover)]"
                >
                  Enregistrer
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
