"use client";

import { useEffect, useMemo, useState } from "react";

type Severity = "INFO" | "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
type VulnStatus = "TODO" | "IN_PROGRESS" | "DONE" | "ARCHIVE";

type Vuln = {
  id: string;
  severity: Severity;
  status: VulnStatus;
  createdAt: string;
};

const SEVERITY_ORDER: Severity[] = ["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"];

const severityLabel: Record<Severity, string> = {
  CRITICAL: "Critique",
  HIGH: "Élevée",
  MEDIUM: "Moyenne",
  LOW: "Faible",
  INFO: "Info",
};

const severityColor: Record<Severity, string> = {
  CRITICAL: "#facc15",
  HIGH: "#f97316",
  MEDIUM: "#2563eb",
  LOW: "#06b6d4",
  INFO: "#64748b",
};

const statusLabel: Record<VulnStatus, string> = {
  TODO: "À traiter",
  IN_PROGRESS: "En cours",
  DONE: "Terminées",
  ARCHIVE: "Acquittées",
};

async function parseJson<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(typeof err.error === "string" ? err.error : res.statusText);
  }
  return res.json() as Promise<T>;
}

type MonthPoint = { key: string; label: string };

function lastMonths(count: number): MonthPoint[] {
  const out: MonthPoint[] = [];
  const now = new Date();
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push({
      key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
      label: d.toLocaleDateString("fr-FR", { month: "short" }),
    });
  }
  return out;
}

export function TrendsView() {
  const [items, setItems] = useState<Vuln[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [enabledStatuses, setEnabledStatuses] = useState<Record<VulnStatus, boolean>>({
    TODO: true,
    IN_PROGRESS: true,
    DONE: true,
    ARCHIVE: false,
  });
  const [enabledSeverities, setEnabledSeverities] = useState<Record<Severity, boolean>>({
    CRITICAL: true,
    HIGH: true,
    MEDIUM: true,
    LOW: true,
    INFO: false,
  });
  const [monthsWindow, setMonthsWindow] = useState<6 | 12 | 24>(12);

  useEffect(() => {
    let mounted = true;
    void (async () => {
      try {
        const data = await parseJson<Vuln[]>(await fetch("/api/vulnerabilities"));
        if (!mounted) return;
        setItems(data);
      } catch (e) {
        if (!mounted) return;
        setError(e instanceof Error ? e.message : "Erreur de chargement");
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const months = useMemo(() => lastMonths(monthsWindow), [monthsWindow]);
  const monthKeys = useMemo(() => new Set(months.map((m) => m.key)), [months]);

  const series = useMemo(() => {
    const filtered = items.filter((v) => enabledStatuses[v.status]);
    const map: Record<Severity, number[]> = {
      CRITICAL: new Array(months.length).fill(0),
      HIGH: new Array(months.length).fill(0),
      MEDIUM: new Array(months.length).fill(0),
      LOW: new Array(months.length).fill(0),
      INFO: new Array(months.length).fill(0),
    };
    for (const v of filtered) {
      const d = new Date(v.createdAt);
      if (Number.isNaN(d.getTime())) continue;
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      if (!monthKeys.has(key)) continue;
      const idx = months.findIndex((m) => m.key === key);
      if (idx >= 0) map[v.severity][idx] += 1;
    }
    return map;
  }, [enabledStatuses, items, months, monthKeys]);

  const activeSeverities = useMemo(
    () => SEVERITY_ORDER.filter((s) => enabledSeverities[s]),
    [enabledSeverities],
  );

  const yMax = useMemo(() => {
    const values = activeSeverities.flatMap((s) => series[s]);
    return Math.max(5, ...values, 1);
  }, [activeSeverities, series]);

  function toggleSeverity(s: Severity) {
    setEnabledSeverities((prev) => {
      const next = { ...prev, [s]: !prev[s] };
      if (!Object.values(next).some(Boolean)) return prev;
      return next;
    });
  }

  function toggleStatus(s: VulnStatus) {
    setEnabledStatuses((prev) => {
      const next = { ...prev, [s]: !prev[s] };
      if (!Object.values(next).some(Boolean)) return prev;
      return next;
    });
  }

  const width = 860;
  const height = 320;
  const margin = { top: 20, right: 20, bottom: 40, left: 40 };
  const plotW = width - margin.left - margin.right;
  const plotH = height - margin.top - margin.bottom;

  const xFor = (i: number) => margin.left + (i / Math.max(1, months.length - 1)) * plotW;
  const yFor = (v: number) => margin.top + plotH - (v / yMax) * plotH;

  return (
    <div className="mx-auto max-w-[1480px] px-5 py-8 lg:px-10 lg:py-10">
      <header className="mb-6">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--accent)]">Analyse</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-[var(--text)] sm:text-3xl">Tendances</h1>
        <p className="mt-2 text-sm text-[var(--muted)]">
          Évolution du volume d’alertes dans le temps, en courbes, avec filtres.
        </p>
      </header>

      <section className="ui-card p-4 lg:p-5">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <details className="relative">
            <summary className="ui-btn-secondary list-none cursor-pointer px-3 py-1.5 text-xs font-semibold">
              Statuts
            </summary>
            <div className="absolute z-20 mt-1 w-56 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-2 shadow-xl">
              <p className="mb-1 text-[10px] uppercase tracking-wide text-[var(--muted)]">Sélection multiple</p>
              <div className="space-y-1.5">
                {(Object.keys(statusLabel) as VulnStatus[]).map((s) => (
                  <label key={s} className="flex items-center gap-2 text-xs text-[var(--muted)]">
                    <input
                      type="checkbox"
                      checked={enabledStatuses[s]}
                      onChange={() => toggleStatus(s)}
                      className="h-3.5 w-3.5 rounded border-[var(--border)]"
                    />
                    <span>{statusLabel[s]}</span>
                  </label>
                ))}
              </div>
            </div>
          </details>
          <label className="text-xs text-[var(--muted)]">
            Période :
            <select
              value={monthsWindow}
              onChange={(e) => setMonthsWindow(Number(e.target.value) as 6 | 12 | 24)}
              className="ui-input ml-2 px-2.5 py-1.5 text-xs"
            >
              <option value={6}>6 mois</option>
              <option value={12}>12 mois</option>
              <option value={24}>24 mois</option>
            </select>
          </label>
          <details className="relative">
            <summary className="ui-btn-secondary list-none cursor-pointer px-3 py-1.5 text-xs font-semibold">
              Criticités
            </summary>
            <div className="absolute z-20 mt-1 w-56 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-2 shadow-xl">
              <p className="mb-1 text-[10px] uppercase tracking-wide text-[var(--muted)]">Sélection multiple</p>
              <div className="space-y-1.5">
                {SEVERITY_ORDER.map((s) => (
                  <label key={s} className="flex items-center gap-2 text-xs text-[var(--muted)]">
                    <input
                      type="checkbox"
                      checked={enabledSeverities[s]}
                      onChange={() => toggleSeverity(s)}
                      className="h-3.5 w-3.5 rounded border-[var(--border)]"
                    />
                    <span style={{ color: severityColor[s] }}>{severityLabel[s]}</span>
                  </label>
                ))}
              </div>
            </div>
          </details>
        </div>

        {error ? (
          <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-800 dark:text-red-200">
            {error}
          </p>
        ) : loading ? (
          <p className="text-sm text-[var(--muted)]">Chargement…</p>
        ) : (
          <div className="overflow-x-auto">
            <svg viewBox={`0 0 ${width} ${height}`} className="h-auto min-w-[760px] w-full">
              {[0, 0.25, 0.5, 0.75, 1].map((r, i) => {
                const v = Math.round(yMax * r);
                const y = yFor(v);
                return (
                  <g key={i}>
                    <line x1={margin.left} y1={y} x2={width - margin.right} y2={y} stroke="#cbd5e1" strokeWidth="1" />
                    <text x={8} y={y + 4} fontSize="10" fill="#64748b">
                      {v}
                    </text>
                  </g>
                );
              })}

              {months.map((m, i) => (
                <text key={m.key} x={xFor(i)} y={height - 10} textAnchor="middle" fontSize="10" fill="#64748b">
                  {m.label}
                </text>
              ))}

              {activeSeverities.map((s) => {
                const pts = series[s].map((v, i) => `${xFor(i)},${yFor(v)}`).join(" ");
                return (
                  <g key={s}>
                    <polyline fill="none" stroke={severityColor[s]} strokeWidth="2.5" points={pts} />
                    {series[s].map((v, i) => (
                      <circle key={`${s}-${i}`} cx={xFor(i)} cy={yFor(v)} r="3.5" fill={severityColor[s]}>
                        <title>{`${severityLabel[s]} - ${months[i].label}: ${v} alerte(s)`}</title>
                      </circle>
                    ))}
                  </g>
                );
              })}
            </svg>
          </div>
        )}
      </section>
    </div>
  );
}
