<div align="center">

# Procyon

**A lightweight, self-hosted vulnerability tracking workspace.**

Modern dashboard widgets, Kanban operations, calendar planning, and extensible imports — without the bloat.

[![Next.js](https://img.shields.io/badge/Next.js-15-black?logo=next.js)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3+-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Prisma](https://img.shields.io/badge/Prisma-ORM-2D3748?logo=prisma)](https://www.prisma.io/)
[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)

[Features](#-features) · [Quick start](#-quick-start) · [Docker](#-docker) · [API](#-api) · [Contributing](#-contributing)

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
| **Reports archive** | Successful imports store an archive file under `REPORTS_DIR`; includes uploaded files and raw SentinelOne API JSON payloads. |
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

## Quick start

### Prerequisites

- **Node.js** 20+ (recommended)
- **PostgreSQL** 14+ (or use Docker Compose below)

### 1. Clone and install

```bash
git clone https://github.com/QuentinHelion/Procyon
cd procyon
npm install
```

### 2. Environment

```bash
cp .env.example .env
```

Edit `.env`:

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | PostgreSQL connection string |
| `REPORTS_DIR` | Directory for archived import files (absolute or relative to cwd) |

### 3. Database

```bash
npx prisma migrate deploy
npx prisma db seed
```

The seed loads built-in scan templates (PingCastle XML, generic CSV, SentinelOne ISPM API).

### 4. Run

```bash
npm run dev
```

Open **[http://localhost:3000](http://localhost:3000)**.

### Useful scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Development server (Turbopack) |
| `npm run build` | Production build (`prisma generate` + `next build`) |
| `npm run start` | Start production server |
| `npm run lint` | ESLint |
| `npm run db:studio` | Prisma Studio |

---

## Docker

Run the full stack (app + Postgres) with persisted DB and report volumes:

```bash
docker compose up --build
```

- **App:** [http://localhost:3000](http://localhost:3000)
- Migrations and seed run on container startup.
- Volumes: `procyon_pg` (database), `procyon_reports` (archived files at `REPORTS_DIR=/app/data/reports`).

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
| `PATCH`, `DELETE` | `/api/vulnerabilities/[id]` | Update fields (status, `dueAt`, `acknowledgedAt`, …) / delete |
| `GET`, `POST` | `/api/templates` | List / create scan templates |
| `POST` | `/api/import/preview` | Preview file import (`multipart/form-data`: `file`, `templateSlug`) |
| `POST` | `/api/import` | `multipart/form-data`: `file`, `templateSlug` |
| `POST` | `/api/import/sentinelone-ispm/preview` | Preview SentinelOne ISPM API import (`tenantUrl`, `token`, `siteIds`) |
| `POST` | `/api/import/sentinelone-ispm` | Confirm SentinelOne ISPM API import |
| `GET` | `/api/reports` | List import batches + file presence |
| `GET` | `/api/reports/[id]/file` | Stream archived file (`?download=1` to force download) |

Imports that supply `externalRef` update existing rows when a match is found. Preview endpoints return create/update/skip decisions before confirmation.

---

## Data model (high level)

- **`Vulnerability`** — title, description, severity, status (`TODO` / `IN_PROGRESS` / `DONE` / `ARCHIVE`), source, optional `externalRef`, `dueAt`, `acknowledgedAt`, JSON `metadata`.
- **`ScanTemplate`** — display name, slug, `parserId`, file hint.
- **`ImportBatch`** — links uploads to a template; optional `storedPath` under `REPORTS_DIR`.

Acknowledgement uses the `ARCHIVE` workflow and preserves previous status in metadata so tasks can be unacknowledged cleanly.

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
