# Team 4 - Team LOTO: Lockout/Tagout (LOTO) Management System

## Backend API (UC-2 Apply Lock, UC-3 Release Lock)

Node.js + Express. Layered: routes (presentation edge) -> services (application) -> repository (data).

### Install
1. Install Node.js 18 or newer (https://nodejs.org).
2. In the project folder run: `npm install`

### Configure
No environment variables are required. Optional: `PORT` (default 3000).

### Run
`npm start` then open http://localhost:3000/api/equipment (send header `x-user-id: w1`).
Demo users: w1, w2 (workers), s1 (supervisor). Demo equipment: e1, e2.

### Test
`npm test`

### Endpoints
| Method | Endpoint | Purpose |
|---|---|---|
| POST | /api/lockouts | Apply lock (body: `{"equipmentId":"e1"}`) |
| GET | /api/lockouts | List locks (`?equipmentId=&status=`) |
| GET | /api/lockouts/:id | Lock details |
| POST | /api/lockouts/:id/release | Release own lock |
| POST | /api/lockouts/:id/override | Supervisor override (body: `{"reason":"..."}`) |
| GET | /api/equipment | All equipment with status |
| GET | /api/equipment/:id/status | One equipment status |

### Integration points
- `src/middleware/auth.js` - swap for Zoe's AuthService (sessions).
- `src/repositories/memoryRepo.js` - swap for Abrar's database with the same method names.
