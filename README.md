# Team 4 – LOTO

Lockout/Tagout (LOTO) Management System – SE 3354 Software Engineering, Fall 2026.

## Repository contents

| Path | What it is |
|---|---|
| `Team_04_SE3354_F26_Final_Project Report.pdf` | Final project report (Deliverable #2) |
| `Project Scope.pdf` | Project scope from the charter (Deliverable #1) |
| `loto-unit-test/` | LockoutService unit and its Jest test suite |
| `diagrams/` | PlantUML and Graphviz sources and images for every diagram |
| `app/` | Runnable prototype: Express REST API (`app/server`) and React + Vite client (`app/client`) |
| `docs/screenshots/` | Screenshots of the key screens, captured by `app/e2e/scenario.mjs` |
| slides PDF | Final presentation slides |

## Running the unit tests

### 1. Install dependencies

Requires Node.js 18 or newer (includes npm). Check with `node -v`.

```bash
cd loto-unit-test
npm install
```

### 2. Environment variables

None are required. The unit runs against an in-memory data store, and its collaborators
(AuthService, AuditService, NotificationService) are Jest mocks, so no database, server or `.env` file is needed.

### 3. Run

```bash
npm test                 # all 7 test cases, verbose output
npm run test:coverage    # same, plus a coverage table
```

Expected result: `Tests: 7 passed, 7 total`.

## Running the full prototype

A locally runnable web prototype (React + Vite client, Express REST API) with an in-memory data store. It reuses
`loto-unit-test/src/lockoutService.js` unchanged. No database, Docker or native modules are needed; it runs on macOS and Windows.

### 1. Install

Requires Node.js 18 or newer.

```bash
cd app
npm install
```

### 2. Environment variables (optional)

Everything has a default, so `app/.env` is not required. To customise, copy `app/.env.example` to `app/.env`:

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `4000` | Port of the API |
| `SESSION_SECRET` | random per run | Secret that signs the session cookie. If unset, sessions reset on every restart |
| `VITE_API_BASE_URL` | `/api` | Base URL the client uses for the API (`/api` goes through the Vite dev proxy) |

### 3. Run

```bash
npm run dev      # API on http://localhost:4000, client on http://localhost:5173
```

Open http://localhost:5173. Data is seeded at startup and resets whenever the API restarts.

```bash
npm test         # API tests (Jest + supertest), 29 tests
npm run build    # production build of the client into app/client/dist
npm start        # API only; also serves app/client/dist if it has been built
```

The original unit tests still run independently: `cd loto-unit-test && npm install && npm test` (7 tests).

Optional: `npm run e2e` (with the app running) replays the demo scenario through the UI with Playwright and rewrites
`docs/screenshots/`. It uses an installed Chrome or Edge.

### Demo logins (demo passwords only)

| Username | Password | Role | Notes |
|---|---|---|---|
| `amorales` | `Worker#2026` | WORKER (Ana Morales) | Not authorized for Lathe 4 and Air Compressor |
| `bchen` | `Worker#2026` | WORKER (Ben Chen) | Not authorized for Hydraulic Press #1 and Boiler Pump |
| `cdavis` | `Worker#2026` | WORKER (Carla Davis) | Not authorized for Conveyor Belt A and Lathe 4 |
| `dlee` | `Worker#2026` | WORKER (Dan Lee) | Deactivated: cannot log in |
| `esingh` | `Supervisor#2026` | SUPERVISOR (Eva Singh) | Authorized for all equipment; can override locks and view reports |
| `admin` | `Admin#2026` | ADMIN (Frank Admin) | Manages users, equipment, authorizations; can view reports |

Five wrong passwords lock an account for 15 minutes (restart the API to reset).

### Layout of `app/`

```text
app/
  server/src/data/       in-memory store + seed data (swappable for PostgreSQL)
  server/src/services/   AuthService, LockoutService, AuditService, NotificationService, ReportService, AdminService
  server/src/routes/     REST routes under /api (role checks only, no business rules)
  server/tests/          Jest + supertest API tests
  client/src/            React pages and components (call only the REST API)
  e2e/scenario.mjs       Playwright demo scenario that produces docs/screenshots
```

### Deviations from the design

- The data layer is an in-memory store (Maps) instead of PostgreSQL; it is isolated in `app/server/src/data/`.
- Sessions are kept in server memory (signed, HTTP-only cookie, 30-minute inactivity timeout) and are lost on restart.
- `LockoutService` is the unmodified unit-tested class; `app/server/src/services/LockoutService.js` only subclasses it to add
  `getEquipmentStatuses()` (class diagram) and the one-lock-per-worker-per-equipment rule.
- Supervisors still need an equipment authorization to apply or release a lock; they can always override.
