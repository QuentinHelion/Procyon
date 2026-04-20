<div align="center">

# Procyon

**A lightweight, self-hosted vulnerability tracking workspace.**

Modern dashboard widgets, Kanban operations, calendar planning, and extensible imports — without the bloat.

[![Next.js](https://img.shields.io/badge/Next.js-15-black?logo=next.js)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3+-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Prisma](https://img.shields.io/badge/Prisma-ORM-2D3748?logo=prisma)](https://www.prisma.io/)
[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)

[Features](#-features) · [Local development](#-local-development-without-docker) · [Docker](#-docker-optional) · [API](#-api) · [Contributing](#-contributing)

</div>

---

## Why Procyon?

Security teams juggle spreadsheets, heavy GRC suites, and one-off exports. **Procyon** sits in the middle: a **fast** web UI to triage findings, acknowledge alerts, set due dates, and **replay imports** from familiar tools (PingCastle, CSV, SentinelOne ISPM API, and more via pluggable parsers).

- **Own your data** — PostgreSQL + optional on-disk archive of imported files.
- **Opinionated UX** — severity-first cards, drag-and-drop status, customizable widgets, and practical planning views.
- **Small surface** — Next.js App Router, a focused REST API, no unnecessary services.

---

## Features

| Area | What you get |
|------|----------------|
| **Monitoring overview** | Widget-based homepage (KPIs, trend chart, status donuts, upcoming deadlines). Show/hide and reorder widgets, with layout persisted in localStorage. |
| **Kanban operations** | Status columns with drag-and-drop, severity/category filters, sort options, configurable metric cards, and localStorage persistence for view settings. |
| **Planning** | Efficient monthly calendar + deadlines buckets. Day side panel on click, drag task between days to move due dates, and focused filters. |
| **Imports** | Unified import modal with preview/confirm workflow. Supports PingCastle XML, generic CSV, and SentinelOne ISPM API with duplicate protection. |
| **Reports archive** | Successful imports store an archive file under `REPORTS_DIR`; includes uploaded files and raw SentinelOne API JSON payloads, with preview/download/delete from UI. |
| **Internationalization & theme** | Light/dark/system theme and EN/FR locale (browser auto-detection with manual override in settings). |

---

## Tech stack

| Layer | Choice |
|-------|--------|
| Framework | [Next.js 15](https://nextjs.org/) (App Router), [React 19](https://react.dev/) |
| Language | [TypeScript](https://www.typescriptlang.org/) |
| Styling | [Tailwind CSS v4](https://tailwindcss.com/) |
| Database | [PostgreSQL](https://www.postgresql.org/) via [Prisma](https://www.prisma.io/) |
| Drag & drop | [@dnd-kit/core](https://docs.dndkit.com/) + native HTML5 DnD where smoother |
| XML / CSV | [fast-xml-parser](https://github.com/NaturalIntelligence/fast-xml-parser) + custom parsers |

```mermaid
flowchart LR
  subgraph client [Browser]
    UI[Next.js UI]
  end
  subgraph server [Node]
    API[Route Handlers]
    Parsers[src/lib/parsers]
  end
  DB[(PostgreSQL)]
  Disk[(REPORTS_DIR)]
  UI --> API
  API --> DB
  API --> Parsers
  API --> Disk
```

---

## Local development (without Docker)

You only need **Node.js** and a running **PostgreSQL** instance. The Next.js app runs on your machine; Docker is optional.

### Prerequisites

- **Node.js** 20+ (22 matches the production Dockerfile)
- **PostgreSQL** 14+

### 1. Clone and install

```bash
git clone https://github.com/QuentinHelion/Procyon.git
cd Procyon
npm install
```

`postinstall` runs **`prisma generate`** so the client is ready before the first dev server start.

### 2. Create the database (one-time)

Create a database and user that match `DATABASE_URL` (default in `.env.example`: user `procyon`, database `procyon`). Example with `psql` as a superuser:

```sql
CREATE USER procyon WITH PASSWORD 'procyon';
CREATE DATABASE procyon OWNER procyon;
```

Or use any existing database — then point `DATABASE_URL` at it.

**Shortcut — Postgres only in Docker, app stays local:**

```bash
npm run docker:db
```

This starts the `db` service from `docker-compose.yml` on port **5432**. Keep `.env` aligned with the compose credentials (same as `.env.example`), then continue with step 3.

### 3. Environment

```bash
cp .env.example .env
```

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | PostgreSQL connection string |
| `REPORTS_DIR` | Directory for archived import files (relative to project root or absolute; `data/reports` is gitignored) |

### 4. Migrations and seed (one-time per database)

```bash
npm run setup
```

Equivalent to `prisma migrate deploy` + `prisma db seed` (built-in scan templates).

### 5. Run the app

```bash
npm run dev
```

Open **[http://localhost:3000](http://localhost:3000)**.

### Useful scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Development server (Turbopack) |
| `npm run setup` | Apply migrations + seed templates |
| `npm run docker:db` | Start **only** PostgreSQL via Docker Compose (optional) |
| `npm run db:seed` | Re-run seed (idempotent upserts) |
| `npm run db:migrate` | `prisma migrate deploy` (CI / production) |
| `npm run db:migrate:dev` | `prisma migrate dev` (when you author new migrations) |
| `npm run build` | Production build (`prisma generate` + `next build`) |
| `npm run start` | Start production server (after `build`) |
| `npm run lint` | ESLint |
| `npm run db:studio` | Prisma Studio |

---

## Docker (optional)

### Full stack (app + Postgres)

For a containerized deployment with persisted volumes:

```bash
docker compose up --build
```

- **App:** [http://localhost:3000](http://localhost:3000)
- Migrations run on container startup (`seed` is disabled by default for faster and safer restarts).
- Volumes: `procyon_pg` (database), `procyon_reports` (archived files at `REPORTS_DIR=/app/data/reports`).

If you need to force seed once:

```bash
docker compose run --rm -e RUN_SEED=1 app sh -lc "npx prisma db seed"
```

### Database only (hybrid with local `npm run dev`)

If you prefer **not** to install PostgreSQL on the host, you can run only the DB container and still develop with Node locally — see **`npm run docker:db`** in the local development section above.

---

## Project structure

```
procyon/
├── prisma/                 # Schema, migrations, seed
├── src/
│   ├── app/                # App Router pages & API routes
│   ├── components/         # React UI (Dashboard, Planning, Reports, …)
│   └── lib/
│       ├── parsers/        # Scan parsers + registry
│       ├── planning-buckets.ts
│       └── db.ts
├── docker-compose.yml
├── Dockerfile
└── README.md
```

---

## Scan templates & parsers

Built-in templates (see seed) map a **slug** to a **`parserId`** implemented in code.

| Parser ID | Typical input |
|-----------|----------------|
| `pingcastle_xml` | PingCastle XML exports (flexible risk-rule node detection) |
| `generic_csv` | CSV with header: `title`, `severity`, optional `description`, `externalRef`. Severities: `INFO`, `LOW`, `MEDIUM`, `HIGH`, `CRITICAL`. |

> SentinelOne ISPM import is API-driven (no local parser file required in `runParser`).

From the UI you can register **new templates** that reuse an existing `parserId`.

### Adding a new tool (developers)

1. Implement a parser in `src/lib/parsers/` returning `ParseResult`.
2. Register it in `src/lib/parsers/index.ts` (`runParser`).
3. Add the id in `src/lib/parser-ids.ts` (`PARSER_IDS`).
4. Seed or create a `ScanTemplate` row pointing at that `parserId`.

---

## API

REST-style handlers under `src/app/api/`.

| Method | Path | Description |
|--------|------|-------------|
| `GET`, `POST` | `/api/vulnerabilities` | List / create vulnerabilities |
| `PATCH`, `DELETE` | `/api/vulnerabilities/[id]` | Update fields (status, `dueAt`, `acknowledgedAt`, …) / delete; status changes append a timeline row |
| `GET` | `/api/analytics/open-stock` | Time series: count vulnerabilities in selected statuses by severity at each period end (`from`, `to`, `granularity`, `statuses`, `locale`) — replays `VulnTimelineEvent` |
| `GET`, `POST` | `/api/templates` | List / create scan templates |
| `POST` | `/api/import/preview` | Preview file import (`multipart/form-data`: `file`, `templateSlug`) |
| `POST` | `/api/import` | `multipart/form-data`: `file`, `templateSlug` |
| `POST` | `/api/import/sentinelone-ispm/preview` | Preview SentinelOne ISPM API import (`tenantUrl`, `token`, `siteIds`) |
| `POST` | `/api/import/sentinelone-ispm` | Confirm SentinelOne ISPM API import |
| `GET` | `/api/reports` | List import batches + file presence |
| `DELETE` | `/api/reports/[id]` | Delete an import report entry and its archived file |
| `GET` | `/api/reports/[id]/file` | Stream archived file (`?download=1` to force download) |

Imports that supply `externalRef` update existing rows when a match is found. Preview endpoints return create/update/skip decisions before confirmation.

---

## Data model (high level)

- **`Vulnerability`** — title, description, severity, status (`TODO` / `IN_PROGRESS` / `DONE` / `ARCHIVE`), source, optional `externalRef`, `dueAt`, `acknowledgedAt`, JSON `metadata`.
- **`VulnTimelineEvent`** — append-only audit: `CREATED` (first appearance) and `STATUS_CHANGED` (from → to), with `severityAtEvent` and `occurredAt` for historical dashboards (open backlog by severity over time).
- **`ScanTemplate`** — display name, slug, `parserId`, file hint.
- **`ImportBatch`** — links uploads to a template; optional `storedPath` under `REPORTS_DIR`.

Acknowledgement uses the `ARCHIVE` workflow and preserves previous status in metadata so tasks can be unacknowledged cleanly. Moving in or out of `ARCHIVE` records a `STATUS_CHANGED` timeline event like any other status transition.

---

## Contributing

Contributions are welcome.

1. **Fork** the repository and create a branch from `main`.
2. **Keep changes focused** — one concern per PR when possible.
3. Run **`npm run lint`** before opening a PR.
4. For parsers or schema changes, include **migrations** and update this README if behavior or env vars change.

Please open an issue first for large features so we can align on direction.

---

## Security

If you discover a security issue, please **do not** file a public issue. Contact the maintainers privately with reproduction steps and impact. We will coordinate disclosure.

---

## License

Procyon is released under the **Apache License 2.0**. See [LICENSE](LICENSE).
