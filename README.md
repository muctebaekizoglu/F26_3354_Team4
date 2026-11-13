# Team 4 – LOTO

Lockout/Tagout (LOTO) Management System – SE 3354 Software Engineering, Fall 2026.

## Repository contents

| Path | What it is |
|---|---|
| `Team_04_SE3354_F26_Final_Project Report.pdf` | Final project report (Deliverable #2) |
| `Project Scope.pdf` | Project scope from the charter (Deliverable #1) |
| `loto-unit-test/` | LockoutService unit and its Jest test suite |
| `diagrams/` | PlantUML and Graphviz sources and images for every diagram |
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
