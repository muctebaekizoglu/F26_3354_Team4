# LOTO Management System – Unit Test (SE3354 Team 4)

This folder holds the sample unit for the Deliverable #2 Test Plan (Section 4): `LockoutService`,
the application-layer class that applies and releases locks, and its automated Jest tests.

## 1. Install dependencies

Requires [Node.js](https://nodejs.org) 18 or newer (includes npm). Check with `node -v`.

```bash
cd loto-unit-test
npm install
```

## 2. Configure environment variables

None are required. The unit runs against an in-memory data store, and its collaborators
(AuthService, AuditService, NotificationService) are replaced with Jest mocks, so no database,
server, or `.env` file is needed.

## 3. Run the tests

```bash
npm test                 # runs all 7 test cases with verbose output
npm run test:coverage    # same, plus a code-coverage table
```

Expected result: `Tests: 7 passed, 7 total`.

## Files

| File | Purpose |
|---|---|
| `src/lockoutService.js` | Unit under test (FR-3 to FR-7, Reliability NFR) |
| `src/errors.js` | Error types returned to the API layer |
| `tests/lockoutService.test.js` | Test cases TC-1 to TC-7 from the report |
