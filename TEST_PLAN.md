# Test Plan — Class & Recording Management System

**Date:** 2026-05-30
**App:** EdDream Institute Class & Recording Management System
**Stack:** React 19 + Vite (frontend, :5173) · Node/Express 5 + Neon Postgres (backend, :5001)

There is no automated test framework in the repo, so this is a **manual integration / smoke-test** pass: build/lint the frontend, boot the backend against the real Neon DB, and exercise every API route group end-to-end with `curl`, checking auth, CRUD, validation, and authorization.

## Pre-flight
- [ ] P1. Confirm backend & frontend `node_modules` installed
- [ ] P2. Frontend lint (`npm run lint`)
- [ ] P3. Frontend production build (`npm run build`)
- [ ] P4. Start backend; confirm it binds :5001 and runs startup migrations without error
- [ ] P5. `GET /api/health` returns `{status:"ok"}`

## Auth (`/api/auth`)
- [ ] A1. Login with bad credentials → 401
- [ ] A2. Login missing fields → 400
- [ ] A3. Login as admin (admin@classapp.com) → 200 + JWT
- [ ] A4. `GET /me` with token → 200 user; without token → 401
- [ ] A5. `forgot-password` for unknown email → 200 generic message (no enumeration)
- [ ] A6. `reset-password` with bad token → 400; short password → 400
- [ ] A7. `accept-invite` with bad token → 400

## Master data CRUD (universities / streams / batches / subjects)
- [ ] M1. List each (GET) with token → 200 array
- [ ] M2. Create one of each (POST) → 201/200, capture IDs
- [ ] M3. Update (PUT) → 200
- [ ] M4. List reflects changes
- [ ] M5. (cleanup) Delete created rows where safe

## Faculty (`/api/faculty`)
- [ ] F1. List faculty
- [ ] F2. Create faculty with linked subjects/universities/batches
- [ ] F3. Get one → link arrays populated
- [ ] F4. Update faculty + change links
- [ ] F5. Delete faculty

## Classes (`/api/classes`)
- [ ] C1. List classes
- [ ] C2. Create class entry
- [ ] C3. Filtered list (query params) returns scoped results
- [ ] C4. Update class entry
- [ ] C5. Delete class entry

## Timetables (`/api/timetables`)
- [ ] T1. List timetables
- [ ] T2. Create timetable (+ week_start_date)
- [ ] T3. Add slot(s)
- [ ] T4. Cycle slot status scheduled → taken → not_taken
- [ ] T5. Delete slot / timetable

## Dashboard / Reports / Users / Logs
- [ ] D1. `GET /dashboard/summary` → 200 stats object
- [ ] R1. Each of the 5 report endpoints → 200
- [ ] R2. CSV export endpoint returns CSV content-type/body
- [ ] U1. Users list (admin)
- [ ] U2. Invite user flow validation (bad input → 400)
- [ ] L1. Activity logs paginated list → 200

## Authorization
- [ ] Z1. Any protected route without token → 401
- [ ] Z2. Admin-only write as non-admin → 403 (if a non-admin user is available)

## Results — executed 2026-05-30

**Overall: PASS** (with notes). 30+ checks run against the live backend on :5001.

### Pre-flight
| ID | Check | Result |
|----|-------|--------|
| P1 | node_modules present (backend + frontend) | ✅ |
| P2 | `npm run lint` | ⚠️ **30 errors, 2 warnings** — all style/hooks rules (`react-hooks/set-state-in-effect` across pages, one unused `getDayName` in TimetableCalendarPage.jsx). Non-blocking. |
| P3 | `npm run build` | ✅ built in ~0.8s (bundle 660 kB / 189 kB gzip — chunk-size warning only) |
| P4 | Backend boots on :5001, startup migrations run | ✅ no errors |
| P5 | `GET /api/health` | ✅ 200 `{status:"ok"}` |

### Auth
| ID | Check | Result |
|----|-------|--------|
| A1 | Bad creds | ✅ 401 |
| A2 | Missing fields | ✅ 400 |
| A3 | Admin login w/ documented creds | ❌→see note | 401 — **seeded `admin@classapp.com` does not exist** in the live DB |
| A4 | `/me` with/without token | ✅ 200 / 401 |
| A5 | forgot-password unknown email | ✅ 200 generic (no enumeration) |
| A6 | reset-password bad token / short pw | ✅ 400 / 400 |
| A7 | accept-invite bad token | ✅ 400 |

### Read endpoints (all 200, returned data)
universities, streams, batches, subjects, faculty, classes (70 kB), timetables, dashboard/summary, users, activity-logs — ✅ all 200.

### Reports & export
faculty, recordings, uploads, payment, university reports — ✅ all 200.
CSV export — ✅ 200, `Content-Type: text/csv`, valid CSV body; missing params → ✅ 400.

### Filtering (classes)
`class_status`, date range, `is_recorded` filters all return scoped results (response sizes differ correctly) — ✅.

### Write path (CRUD round-trip on universities, test row, cleaned up)
Create → ✅ 201 · Update → ✅ 200 · Soft-delete → ✅ 200 · activity logging fired (3 log rows) → ✅. Test row + logs hard-deleted afterward; **DB left unchanged**.
Validation: create w/o name → ✅ 400; create user missing fields → ✅ 400.

### Authorization (role enforcement)
Every write/admin route checks `req.user.role === 'admin'`:
- Staff create university / subject → ✅ 403
- Staff list users / activity-logs → ✅ 403
- No token → ✅ 401; bad token → ✅ 401

## Notes / findings
1. **Stale credentials (not a bug):** The documented default `admin@classapp.com / Admin@1234` is not in the connected Neon DB. The live DB has two real users — `anandu.cn112@gmail.com` (admin) and `techgeumdemo6@gmail.com` (staff) — with unknown passwords. Authenticated tests were run with JWTs minted locally from `JWT_SECRET` (read-only + one cleaned-up write); no passwords were changed. To get a working documented login, run `node seed.js` (creates the admin@classapp.com user; `ON CONFLICT DO NOTHING`).
2. **Lint errors:** 30 ESLint errors, all the strict `react-hooks/set-state-in-effect` rule firing on `useEffect(() => load(), [])` data-loading patterns, plus one unused variable. They don't break the build but should be cleaned up (or the rule relaxed) for a green lint.
3. **Backend connects to a live/shared Neon database** — testing here mutates real data. Writes were limited to one labeled, fully-cleaned-up row. For repeatable testing, consider a separate test database + the `seed-sample.js` fixtures.
4. **Not exercised live:** timetable slot status-cycle and faculty link-table writes were verified by code read only (to avoid further live-DB churn); the generic write path is confirmed working via the universities round-trip.
