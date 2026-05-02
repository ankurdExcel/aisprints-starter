# Quiz Master — Authentication & Roles - Technical PRD

## Overview

This document specifies authentication and authorization for the Quiz Master application used by faculty and students. Faculty and students sign up with the same flow but select a role at registration; after login, each role lands on a distinct home experience. Authentication uses JWTs delivered in HTTP-only cookies so credentials are not exposed to client-side JavaScript.

---

## Business Requirements

### Account & Identity
- New users can register with first name, last name, email, password, and role (faculty or student).
- Returning users can sign in with email and password.
- Users can sign out in a way that invalidates or clears their session cookie.
- Passwords must never be stored or transmitted in plain text in the database.

### Role-Based Experience
- At sign-up, the user explicitly chooses faculty or student.
- After login, faculty users see the faculty-oriented Quiz Master creation/dashboard entry point.
- After login, student users see the student-oriented entry point (MCQ taking and attempts are covered in the MCQ PRD).
- The system must persist role with the user so future sessions route correctly without re-asking.

### Security & Compliance (MVP)
- Sessions should be tamper-resistant (signed JWT).
- Cookies should use `HttpOnly`, `Secure` in production, and an appropriate `SameSite` policy.
- Basic server-side validation must reject malformed or obviously invalid sign-up and login payloads.

---

## Technical Requirements

### Stack Alignment
- **Framework**: Next.js (App Router) on Cloudflare Workers via OpenNext.
- **Database**: Cloudflare D1 (SQLite). All access through prepared statements via **`lib/d1-client.ts`**, introduced in **Implementation Phase 2** (helpers: normalize anonymous `?` → positional `?1`, `?2`, …, safe binding, `executeQuery`, `executeQueryFirst`, `executeMutation`, `executeBatch`, etc., per workspace D1 rules).
- **UI**: shadcn/ui components for sign-up and login forms (Form + react-hook-form + zod).
- **Binding**: Per `wrangler.jsonc`, the D1 binding name is `tna_app_db` (database `tna-app-db`). TypeScript env types should match generated `cloudflare-env.d.ts` after `wrangler types`.

### Database Schema

**Table: `users`**

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | TEXT | PRIMARY KEY | Prefer `lower(hex(randomblob(16)))` or ULID-style string |
| `email` | TEXT | NOT NULL, UNIQUE | Normalized to lowercase in application layer |
| `password_hash` | TEXT | NOT NULL | One-way hash only (e.g. bcrypt or scrypt); never reversible encryption for passwords |
| `first_name` | TEXT | NOT NULL | |
| `last_name` | TEXT | NOT NULL | |
| `role` | TEXT | NOT NULL | Allowed values: `faculty`, `student` (CHECK constraint recommended) |
| `created_at` | TEXT/DATETIME | NOT NULL, default | ISO-8601 or SQLite `CURRENT_TIMESTAMP` |
| `updated_at` | TEXT/DATETIME | NOT NULL | Updated on every user mutation |
| `created_by` | TEXT | NULLABLE | User id of creator; NULL for self-registration |
| `updated_by` | TEXT | NULLABLE | User id of last updater |

**Indexes**
- Unique index on `email` (if not enforced by UNIQUE alone).
- Optional index on `role` if admin queries filter by role often.

**Example migration SQL (D1/SQLite)**

```sql
CREATE TABLE users (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('faculty', 'student')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  created_by TEXT REFERENCES users(id),
  updated_by TEXT REFERENCES users(id)
);

CREATE UNIQUE INDEX idx_users_email ON users(email);
```

**Note**: `created_by` / `updated_by` self-reference is optional for MVP self-service signup; can remain NULL until admin flows exist.

### JWT & Cookie Contract

- **Claims (minimum)**: `sub` (user id), `email`, `role`, `iat`, `exp`.
- **Signing**: HMAC (e.g. HS256) with a secret from environment (`JWT_SECRET` in `.dev.vars` / Wrangler secret in production). Document rotation strategy as future work.
- **Cookie name**: e.g. `session` or `qm_session` (pick one and use consistently).
- **Cookie attributes**: `HttpOnly; Path=/; Max-Age` or `Expires` aligned with JWT `exp`; `Secure` when `NODE_ENV === 'production'` or when request is HTTPS; `SameSite=Lax` (or `Strict` if no cross-site flows).
- **Logout**: Clear cookie (Set-Cookie with empty value and expired max-age) and optionally maintain a denylist table later for instant revocation (out of scope for MVP unless required).

### API Endpoints

#### POST `/api/auth/signup`

**Request body (JSON)**

```json
{
  "firstName": "string",
  "lastName": "string",
  "email": "string",
  "password": "string",
  "role": "faculty | student"
}
```

**Behavior**
- Validate body with zod (lengths, email format, password policy, role enum).
- Reject duplicate email with 409.
- Hash password; insert user; set session cookie with JWT; return user profile without password fields.

**Responses**
- **201**: `{ "user": { "id", "email", "firstName", "lastName", "role" } }` + `Set-Cookie`.
- **400**: Validation errors (structured field errors for form display).
- **409**: Email already registered.
- **500**: Generic server error (no stack to client).

#### POST `/api/auth/login`

**Request body**

```json
{
  "email": "string",
  "password": "string"
}
```

**Behavior**
- Look up user by email; verify password with constant-time compare against hash.
- On success: issue JWT and set HTTP-only cookie.

**Responses**
- **200**: `{ "user": { ... } }` + `Set-Cookie`.
- **400**: Validation errors.
- **401**: Invalid credentials (same message for unknown user and bad password to avoid enumeration).
- **500**: Server error.

#### POST `/api/auth/logout`

**Behavior**
- Clear session cookie.

**Responses**
- **200**: `{ "ok": true }`.

#### GET `/api/auth/me` (optional but recommended)

**Behavior**
- Read JWT from cookie; verify signature and expiry; load fresh user row if needed.

**Responses**
- **200**: `{ "user": { ... } }`.
- **401**: Missing or invalid session.

### User Interface Requirements

#### Sign-up page (`/signup` or `/auth/signup`)

- Fields: first name, last name, email, password, confirm password (optional but recommended), role (radio or select: Faculty / Student).
- Client validation with zod + react-hook-form; mirror rules on server.
- Submit calls `POST /api/auth/signup`; on success redirect by role (e.g. `/faculty` vs `/student`) or a single `/app` that branches internally.
- Use shadcn Form, Input, Button, Label, RadioGroup or Select, Card layout.

**Suggested validation rules (MVP)**

| Field | Rules |
|-------|--------|
| First name | Required, trim, min 1 char, max reasonable (e.g. 100) |
| Last name | Same as first name |
| Email | Required, valid email format, max length, normalize lowercase |
| Password | Min length (e.g. 8), optional complexity (mixed case + number) per product decision |
| Role | Required enum `faculty` \| `student` |

#### Login page (`/login` or `/auth/login`)

- Fields: email, password.
- Submit `POST /api/auth/login`; redirect post-success by stored `role`.
- Same shadcn stack; show field-level and form-level errors.

#### Protected layout / middleware

- Routes under `/faculty/**` require authenticated user with `role === 'faculty'`.
- Routes under `/student/**` require `role === 'student'`.
- Unauthenticated users hitting protected routes redirect to `/login` with optional `returnUrl`.
- Faculty hitting student-only routes (and vice versa) redirect to their home or 403 page.

### Copy & Tone (Authentication Flows)

- Authentication screens may use a light “witty old professor” tone in helper text, inline hints, and toasts (aligned with product-wide persona described in the MCQ PRD). Keep legal/security copy (e.g. password requirements) clear and accurate first, wit second.

---

## Testing Strategy (TDD)

### Principles

- **Test-driven development**: For each implementation phase below, **write or extend unit tests first** so they **fail (red)** against the intended contracts (function signatures, return shapes, error cases). Then implement the minimum code to **pass (green)**. Refactor while keeping tests green.
- **Vitest** is the project test runner; tests are **colocated** with the code under test (e.g. `lib/d1-client.test.ts`, `lib/services/user-service.test.ts`). Follow `.cursor/rules/vitest-testing.mdc`: meaningful assertions, isolated tests, `vi.clearAllMocks()` in `beforeEach`, mock external I/O.
- **No real D1 or network in unit tests**: Mock the D1 database surface (e.g. `prepare` / `bind` / `run` / `all` / `first`) or mock `lib/d1-client` module functions when testing services and route handlers.
- **Layering**: Migrations are validated by applying locally and optional smoke queries; **automated tests** focus on **D1 client behavior** (SQL normalization, binding), **services** (business rules, validation, error mapping), **auth primitives** (JWT sign/verify, password verify with mocked hash), and **HTTP handlers** (status codes, response bodies, cookie headers) with dependencies mocked.

### Per-layer focus

| Layer | TDD approach |
|--------|----------------|
| **D1 client** | Tests define expected SQL placeholder normalization, parameter binding order, and error handling using a fake D1 stub. |
| **Services** (e.g. user creation, lookup by email) | Tests specify success paths, duplicate email, invalid role, and hashing integration boundaries (mock hasher if injected). |
| **JWT / password modules** | Tests specify token payload, expiry rejection, wrong signature; password verify with known fixture hashes where library allows. |
| **API route handlers** | Tests call exported handler logic or small `runRequest()` wrappers with `NextRequest`/`Request` stubs and mocked env + service layer; assert status, JSON, and `Set-Cookie` where applicable. |

### Definition of done (auth track)

- All phases that introduce behavior ship with **new or updated tests** that pass in CI / `npm test`.
- No placeholder tests (`expect(true).toBe(true)`).
- Regression-sensitive rules (duplicate email → 409, generic 401 on login, cookie flags) have explicit test coverage.

---

## Implementation Phases

**Canonical build order**: **database migrations → D1 client → services → API endpoints → UI → protection / role routing**. Each phase follows **TDD**: tests first (red), then implementation (green), then refactor.

### Phase 1: Database migrations - ⏳ PLANNED

**Objective**: `users` table and indexes exist locally via Wrangler migration.

**TDD note**: Migrations are SQL artifacts; add tests only where application code parses migration output. Primary verification: `wrangler d1 migrations apply --local` (or project equivalent). Optionally document manual smoke `SELECT` in troubleshooting.

**Tasks**
1. Create D1 migration for `users` table and indexes (see schema above).
2. Apply migration **locally only** (do not apply to remote unless explicitly requested).
3. Regenerate or extend `cloudflare-env.d.ts` for `tna_app_db` (`wrangler types`).

**Deliverables**
- Migration file under project `migrations/` (or documented convention).
- Binding name matches `wrangler.jsonc` (`tna_app_db`).

---

### Phase 2: D1 client - ⏳ PLANNED

**Objective**: Shared **`lib/d1-client.ts`** module so all SQL goes through one place: placeholder normalization (`?` → `?1`, `?2`, …), safe binding, and helpers (`executeQuery`, `executeQueryFirst`, `executeMutation`, `executeBatch`, optional `generateId` if used).

**TDD note**: **Write `lib/d1-client.test.ts` first** with a mock D1 database object; tests should fail until the client exists. Cover edge cases called out in workspace D1 rules (empty params, multiple placeholders, single-row reads).

**Tasks**
1. Define the public API of `d1-client` (types for `D1Database`, batch, first row).
2. Implement normalization and delegation to D1 prepared statements.
3. Green all client unit tests.

**Deliverables**
- `lib/d1-client.ts` + colocated `lib/d1-client.test.ts`.

---

### Phase 3: Services & auth primitives - ⏳ PLANNED

**Objective**: Server-side **user persistence** (create user, find by email), **password hashing/verification**, and **JWT create/verify** used exclusively by services and route handlers—not ad hoc SQL in routes.

**TDD note**: **Write failing tests first** for `lib/services/user-service.ts` (or equivalent) and `lib/auth/password.ts` / `lib/auth/jwt.ts`: e.g. create user persists normalized email, duplicate email throws or returns a result type mapped later to 409; login lookup + verify password; JWT contains `sub`, `email`, `role`, `exp`. Mock **`lib/d1-client`** in service tests per vitest rules.

**Tasks**
1. Choose Worker-safe password hashing (e.g. pure JS bcrypt or Web Crypto–based approach).
2. Implement `hashPassword` / `verifyPassword` and `createSessionToken` / `verifySessionToken`.
3. Implement user service functions using `d1-client` only for SQL.

**Deliverables**
- `lib/auth/password.ts`, `lib/auth/jwt.ts` + tests.
- `lib/services/user-service.ts` (or `lib/services/auth-user-service.ts`) + colocated `.test.ts`.

---

### Phase 4: API endpoints - ⏳ PLANNED

**Objective**: `POST` signup, `POST` login, `POST` logout, optional `GET` me—wired to services and cookie helpers.

**TDD note**: **Write route tests first** (red): e.g. signup returns 201 + `Set-Cookie` when service succeeds; 409 when duplicate email; login 401 for bad password. Mock user service + JWT/cookie builders so tests do not need a real Worker or D1.

**Tasks**
1. Zod schemas for request bodies; call services from `app/api/auth/**/route.ts`.
2. Set/clear HTTP-only session cookie with correct attributes for dev vs prod.

**Deliverables**
- `app/api/auth/**/route.ts` + colocated `*.test.ts` or `__tests__` next to routes per project convention.

---

### Phase 5: UI (shadcn) - ⏳ PLANNED

**Objective**: Sign-up and login pages calling the APIs above.

**TDD note**: Prefer **component tests** with `@testing-library/react` for critical form validation and submit behavior (mock `fetch`). Optional: thin e2e later; not required for MVP PRD.

**Tasks**
1. Add shadcn components (Form, Input, Button, etc.).
2. Implement pages, loading and error states, redirects by role.

**Deliverables**
- `app/(auth)/login/page.tsx`, `app/(auth)/signup/page.tsx` (or equivalent) + component tests where high value.

---

### Phase 6: Protection & role routing - ⏳ PLANNED

**Objective**: Middleware or layout guards; faculty vs student landing shells.

**TDD note**: Unit-test small pure helpers (e.g. “required role from JWT payload”) if middleware is hard to run in Vitest; integration test optional.

**Tasks**
1. Middleware or layout checks session + role.
2. Placeholder faculty and student landing pages.

**Deliverables**
- `middleware.ts` (if used), protected route groups, minimal landing UIs.

---

## Technical Implementation Details

### Key Files (expected)

- `wrangler.jsonc` — D1 binding `tna_app_db`.
- `lib/d1-client.ts` + `lib/d1-client.test.ts` — All SQL execution (Phase 2).
- `lib/auth/*` — JWT and password helpers.
- `app/api/auth/*/route.ts` — Route handlers.
- `middleware.ts` — Optional cookie/JWT edge checks (respect Next.js + OpenNext constraints on Edge runtime).
- `.dev.vars` — `JWT_SECRET` and any auth-related secrets (document in README, never commit secrets).

### Implementation Patterns

- **Server-only secrets**: Never import JWT secret into client bundles.
- **Email uniqueness**: Use `INSERT` and handle constraint violation, or `SELECT` before insert in a transaction; prefer unique constraint + error mapping to 409.
- **Timing**: Use constant-time password comparison from the hashing library.

### Important Notes

- Cloudflare Workers have CPU/runtime limits; keep password hashing cost factor reasonable.
- If middleware cannot access D1, keep JWT self-contained for authz and refresh user from DB only on sensitive operations.
- Align `CloudflareEnv` typing with actual binding name `tna_app_db`.

---

## Success Criteria

- [ ] User can sign up as faculty or student; duplicate email is rejected cleanly.
- [ ] User can log in; invalid credentials show a single generic message (no user enumeration).
- [ ] Session is stored in an HTTP-only cookie; client JS cannot read the token.
- [ ] Logout clears the session cookie.
- [ ] Faculty cannot access student-only routes and vice versa (with sensible redirect).
- [ ] Passwords are stored as one-way hashes only.
- [ ] All new tables include audit columns as specified (`created_at`, `updated_at`, `created_by`, `updated_by` where applicable).
- [ ] **TDD**: D1 client, auth services/primitives, and auth API layers have Vitest coverage as described in Testing Strategy; `npm test` passes for the auth track.

---

## Troubleshooting Guide

### Cookie not set or not sent on subsequent requests

**Problem**: User appears logged out immediately after login.  
**Cause**: Wrong `Path`, `Secure` on localhost, or `SameSite` blocking.  
**Solution**: In local dev use `Secure: false` for HTTP; ensure `Path=/` and correct domain.

### D1 binding undefined in route handler

**Problem**: `env.tna_app_db` is undefined.  
**Cause**: Handler running outside Worker context or wrong binding name.  
**Solution**: Verify `getRequestContext()` / OpenNext pattern used elsewhere in the repo; match `wrangler.jsonc` binding.

---

## Future Enhancements

- Email verification and password reset flows.
- OAuth (Google/Microsoft) for schools.
- Refresh tokens or rotating sessions with server-side session store.
- Admin role and impersonation (audit-heavy).
- Rate limiting on login/signup endpoints.

---

## Dependencies

### External

- Cryptographic / JWT libraries compatible with Workers (evaluate `jose` for JWT).

### Internal

- D1 client module, zod, react-hook-form, shadcn/ui form components.

### Environment variables

- `JWT_SECRET` — required in all environments that issue tokens.
- Optional: token TTL as env var for tuning without redeploy logic changes.

---

## Risks and Mitigation

### Technical risks

- **Risk**: Edge-incompatible bcrypt native modules.  
  **Mitigation**: Use pure JS bcrypt build or Web Crypto–based scrypt; test under `wrangler dev`.

### UX risks

- **Risk**: Users forget which role they picked.  
  **Mitigation**: Display role on profile/settings later; for MVP, role is visible after login in header.

---

## Notes for AI Agents

1. Update phase status markers as work progresses.  
2. When implementing, add real file paths under “Key Files”.  
3. Follow **TDD**: tests before implementation per phase; keep suite green before merging a phase.  
4. Do not apply D1 migrations to remote databases unless the user explicitly requests it.  
5. Use code references `filepath:line` when linking implementation to this PRD.

---

## Current Status

**Last Updated**: 2026-05-02  
**Current Phase**: Not started — awaiting PRD review  
**Status**: ⏳ PLANNED  
**Next Steps**: Implement Phase 1 (migrations), then Phase 2 (D1 client + TDD), then services → endpoints → UI → guards.
