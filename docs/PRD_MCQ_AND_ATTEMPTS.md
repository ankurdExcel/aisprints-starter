# Quiz Master — Faculty MCQ Management (PRD)

## Sprint scope and roadmap

**This document’s active implementation track** covers **faculty-only** MCQ management: database schema (full model retained for future features), services, APIs, and the faculty MCQ UI. **Student-facing UI**, **student quiz-taking**, **attempt submission**, and **faculty quiz creation** (multiple quizzes, titles, settings UI) are **out of scope for this track** and are captured in **Roadmap — future sprint** below so we do not redesign the database later.

**Implicit quiz (backend-only for this track)**  
The backend maintains **one logical quiz per faculty user** (created or ensured on first use). **All MCQs** created or listed for that faculty are **linked to that quiz** via `quiz_questions` (and `quizzes` row) **without any quiz picker or quiz-management UI**. When quiz authoring ships later, the same tables apply—**no DB upgrade scripts** are required for that transition if migrations ship the full schema now.

**Already in the repo (auth Phase 6–7, outside MCQ numbered phases below):** Protected **`/faculty`** route with a shared app shell (`src/components/app/app-shell-header.tsx`, `app-shell-footer.tsx`), JWT middleware, and **placeholder** faculty UI—`src/app/faculty/page.tsx` shows a Card with “No MCQs available.” and a **disabled** “Create MCQ” button. MCQ work **replaces and wires** these placeholders; it does not need to recreate routing or the shell. The **`/student`** shell remains placeholder-only until the roadmap sprint.

---

## Roadmap — future sprint (not in this track)

The following stay **specified at the data/API level** where helpful for schema and comments, but **implementation is deferred**:

- **Student UI** (`/student`): quiz list, take quiz, results, placeholder replacement on `src/app/student/page.tsx`.
- **Student APIs**: `GET /api/student/quizzes`, `GET /api/student/quizzes/[id]`, `POST /api/student/quizzes/[id]/attempts`, grading, `max_attempts` enforcement, no `is_correct` leakage on student GETs.
- **`quiz-attempt-service.ts`** and its tests (attempt limits, grading, `quiz_attempt_answers`).
- **Faculty quiz creation UI**: multiple quizzes, titles, `max_attempts` editing, explicit question ordering across quizzes—**database tables `quizzes`, `quiz_questions`, `quiz_attempts`, `quiz_attempt_answers` are still created in Phase 1** so future work is additive.

Optional later: faculty attempts listing, reporting (previous Phase 6–style hardening).

---

## Overview

Faculty manage **multiple-choice questions**: list (with **pagination, sorting, and search**), **create**, **edit**, **delete**, and **preview**. Data model retains **quizzes**, **joins**, and **attempts** tables for student flows later; this track implements **MCQ CRUD + implicit per-faculty quiz linkage** only.

This builds on authentication (see `PRD_AUTHENTICATION.md`): faculty routes require `role === 'faculty'`.

**Test-driven development (TDD)** for this track follows the **same workflow as the auth implementation** documented in **`PRD_AUTHENTICATION.md` → Testing Strategy (TDD)**: for every phase that introduces **application code** (TypeScript), **write or extend tests first** until they **fail (red)** against the intended contracts, then implement the **minimum code to pass (green)**, then **refactor** with the suite staying green. Details are spelled out in [Testing strategy (TDD)](#testing-strategy-tdd) below.

---

## Business requirements (in scope)

### Faculty — MCQ management

- Faculty see a **data table** of all MCQs they can manage (same implicit quiz / ownership rules as implementation).
- **Page size: 15** MCQs per page with **pagination** controls.
- **Sorting** on supported columns (at minimum **updated_at**; additional columns such as **prompt** optional if indexed/performant—finalize in Phase 3).
- **Search**: text input filters MCQs by **question prompt** (server-side; substring or prefix per implementation).
- Per-row **actions**: **Edit**, **Delete**, **Preview** (see **Preview (student-style)** below—**not** an immediate answer-key dump).
- **Primary CTA**: **Add MCQ** / **Create MCQ** at the top—opens **create form** (sheet, dialog, or dedicated route—product choice in Phase 4; prefer shadcn **Sheet** or **Dialog** for consistency).
- **Edit** opens the same form pattern pre-filled; **Delete** uses shadcn **AlertDialog** (or equivalent) for confirmation.
- **Empty state** when no MCQs exist: friendly, on-brand copy (witty professor persona); **must use shadcn/ui**—e.g. install and use the official **Empty** component from the shadcn registry (`npx shadcn add empty`) if available for the project style, **or** compose from existing primitives (**Card**, **Button**, typography) already in `@/components/ui` so no “raw” unstyled empty blocks. **Do not** use non-shadcn ad-hoc HTML for interactive or structural UI.

### Cross-cutting — copy and experience

- User-visible strings for toasts, empty states, validation errors, and confirmations: **persona: witty old professor**—dry humor, clever asides, still clear. Do not sacrifice clarity or accessibility.

---

## Business requirements (deferred — see roadmap)

- Student viewing quizzes, taking quizzes, attempt limits, scoring UI, and faculty reporting on attempts are **not** implemented in this track; schema and PRD notes below remain **design reference** for the future sprint.

---

## Technical requirements

### Stack alignment

- Next.js App Router, Server Actions and/or `app/api` routes per project conventions.
- Cloudflare D1 via **`@/lib/d1-client`**. Binding name: align with `wrangler.jsonc` (e.g. `tna_app_db` or project-specific).
- **shadcn/ui** for **table**, **pagination**, **input** (search), **dropdown/select** (sort if needed), **dialog/sheet**, **form**, **alert dialog**, **button**, **card**, **toast** (e.g. Sonner), **badge** (optional), **empty** (or Card-based empty), **skeleton** (optional loading).
- Faculty routes: **`role === 'faculty'`** (existing `src/middleware.ts` + `src/app/faculty/layout.tsx`).

### Data model strategy (unchanged; full schema in Phase 1)

1. **Questions** — `mcq_questions` + `mcq_options`.  
2. **Quiz** — `quizzes` (one row per faculty for this track, maintained in code).  
3. **`quiz_questions`** — links each MCQ to that quiz with `sort_order`.  
4. **Attempts** — `quiz_attempts`, `quiz_attempt_answers` — **tables migrated now**, **services later**.

---

## Database schema

**Audit columns (all new tables)**  
Include at minimum:

- `created_at` TEXT NOT NULL DEFAULT (ISO UTC),
- `updated_at` TEXT NOT NULL,
- `created_by` TEXT NULL REFERENCES users(id),
- `updated_by` TEXT NULL REFERENCES users(id),

Align with the same pattern as `users` in `PRD_AUTHENTICATION.md`.

### Table: `mcq_questions`

| Column | Type | Notes |
|--------|------|--------|
| `id` | TEXT PK | |
| `author_user_id` | TEXT NOT NULL FK → users(id) | Faculty who owns the question |
| `prompt` | TEXT NOT NULL | Question text |
| Audit columns | | |

### Table: `mcq_options`

| Column | Type | Notes |
|--------|------|--------|
| `id` | TEXT PK | |
| `question_id` | TEXT NOT NULL FK → mcq_questions(id) ON DELETE CASCADE | |
| `label` | TEXT | Optional display label A,B,C |
| `body` | TEXT NOT NULL | Answer text |
| `is_correct` | INTEGER NOT NULL DEFAULT 0 | **Exactly one** correct per question (enforce in app) |
| `sort_order` | INTEGER NOT NULL DEFAULT 0 | |
| Audit columns | | |

### Table: `quizzes`

| Column | Type | Notes |
|--------|------|--------|
| `id` | TEXT PK | |
| `title` | TEXT NOT NULL | For this track: default title e.g. “Default quiz” acceptable |
| `owner_user_id` | TEXT NOT NULL FK → users(id) | Faculty |
| `max_attempts` | INTEGER NULL | **NULL** = unlimited for future student flow; comment in migration |
| Audit columns | | |

### Table: `quiz_questions` (join)

| Column | Type | Notes |
|--------|------|--------|
| `quiz_id` | TEXT FK | Implicit faculty quiz |
| `question_id` | TEXT FK | |
| `sort_order` | INTEGER | |
| PK | (quiz_id, question_id) | |

### Table: `quiz_attempts` / `quiz_attempt_answers`

As in the previous full PRD—**create in Phase 1** for forward compatibility; **no application code** in this track unless a stub is needed for migrations only.

**Example migration excerpt** (illustrative; complete indexes in real migration files)

```sql
CREATE TABLE mcq_questions (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  author_user_id TEXT NOT NULL REFERENCES users(id),
  prompt TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  created_by TEXT REFERENCES users(id),
  updated_by TEXT REFERENCES users(id)
);

CREATE TABLE mcq_options (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  question_id TEXT NOT NULL REFERENCES mcq_questions(id) ON DELETE CASCADE,
  label TEXT,
  body TEXT NOT NULL,
  is_correct INTEGER NOT NULL DEFAULT 0 CHECK (is_correct IN (0, 1)),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  created_by TEXT REFERENCES users(id),
  updated_by TEXT REFERENCES users(id)
);

CREATE INDEX idx_mcq_options_question ON mcq_options(question_id);
CREATE INDEX idx_mcq_questions_author ON mcq_questions(author_user_id);
-- Full DDL for quizzes, quiz_questions, quiz_attempts, quiz_attempt_answers + indexes in migrations/
```

**Implicit quiz rule (application)**  
On first MCQ operation for a faculty user, **ensure** a `quizzes` row exists with `owner_user_id = faculty id` and **insert** `quiz_questions` for every new/edited linkage as required. Listing MCQs for the UI can query **by `author_user_id`** for simplicity, while create/update still **attach** to the implicit `quiz_id` for future student use.

---

## API endpoints (faculty — this track)

### GET `/api/faculty/mcqs`

- **Auth**: faculty session only.
- **Query parameters** (all optional; sensible defaults):
  - `page` — 1-based, default `1`.
  - `pageSize` — default **`15`**, max cap (e.g. 50) to avoid abuse.
  - `sort` — allowed fields, e.g. `updated_at` asc/desc (document enum in OpenAPI/comments).
  - `q` — search string; filter **`prompt`** (SQLite `LIKE` with proper binding via `d1-client`).
- **Response**: `{ items: [...], total: number, page, pageSize }` (or equivalent). Each item includes fields needed for the table and actions (id, prompt snippet or full prompt per UX, option count, `updated_at`, etc.). **Preview** uses `GET /api/faculty/mcqs/[id]` for full detail (same payload as edit).

### GET `/api/faculty/mcqs/[id]`

- Full MCQ for **edit** and for **preview** (faculty-only); includes options and **`is_correct`** flags so the client can **grade a simulated attempt**. The **preview UI** must **not** reveal which option is correct until after the faculty user has **chosen an answer** and **submitted** (mirrors the intended **student attempt → feedback** flow at the interaction level). **No change** to student API rules here: future student `GET` payloads still omit `is_correct` before grading; this is a **faculty-only** client experience using the faculty GET.

### POST `/api/faculty/mcqs`

**Body**

```json
{
  "prompt": "string",
  "options": [
    { "body": "string", "isCorrect": false },
    { "body": "string", "isCorrect": true }
  ]
}
```

- Validate: min 2 options, exactly one `isCorrect`, non-empty prompt and bodies.
- After insert: **link** to implicit faculty quiz in `quiz_questions`.

### PATCH `/api/faculty/mcqs/[id]`

- Same shape as create; verify **`author_user_id`** matches session user.

### DELETE `/api/faculty/mcqs/[id]`

- Verify ownership; cascade deletes options; remove `quiz_questions` row for that question.

### Student / attempt endpoints

**Deferred** — see **Roadmap — future sprint**; no requirement to ship routes in Phases 1–4 of this track.

---

## User interface requirements (faculty)

### MCQ list page (`/faculty` or `/faculty/mcqs`)

**Target**

- **Toolbar**: **Search** input (shadcn **Input**); optional **sort** control (shadcn **Select**); **Add MCQ** primary **Button**.
- **Table** (shadcn **Table** + **Pagination**): one row per MCQ; columns aligned with PRD (e.g. prompt preview, # options, updated, **actions**).
- **Actions** per row: **Edit**, **Delete**, **Preview** (icons + accessible labels).
- **Pagination**: **15 rows per page**; show total count if available from API.
- **Loading**: optional **Skeleton** rows.
- **Empty state** (zero MCQs, no active search): shadcn **Empty** or **Card**-based layout + professor copy + CTA to add first MCQ.

#### Preview (student-style)

- **Purpose**: Let faculty experience the question roughly as a **student** would—**without** seeing the keyed answer until they have **attempted** it.
- **Flow**:
  1. **Attempt step**: Show stem and all options as **selectable choices** (e.g. shadcn **RadioGroup** + **Button** “Submit answer” / equivalent). **Do not** show “Correct” badges or green/red answer-key styling for the keyed option in this step.
  2. **Result step**: After submit, show whether the **selected** option was **correct or incorrect** (clear copy + optional **Badge**). If the selection was **incorrect**, also indicate which option was the **correct** one (so the preview remains useful for authoring QA). Offer **Try again** to return to the attempt step with the same question (clears selection).
- **Data**: Uses **`GET /api/faculty/mcqs/[id]`** (faculty payload includes `is_correct`; UI gates display until the result step). This is **not** a substitute for the roadmap **student attempt** API; it is **UX mimicry** only.
- **Components**: shadcn **Dialog** (or Sheet), **RadioGroup**, **Button**, **Badge** as needed; copy from **`professor.ts`** where it fits.

### Faculty MCQ form (create / edit)

- **Prompt** — **Textarea** (shadcn).
- **Options** — dynamic list (minimum 2); **exactly one** correct — **RadioGroup** or single-select pattern tied to options.
- **Save** — toast (Sonner); invalidate list or navigate back to list.
- Validation messages follow professor persona where appropriate.

### Student quiz UI

**Deferred** — roadmap sprint; placeholder on `src/app/student/page.tsx` unchanged by this track except incidental copy tweaks if needed (avoid scope creep).

---

## Copy persona — “Witty old professor”

**Guidelines**

- Short lines; one quip max per message where it fits.
- Never mock the user; humor targets the situation.

**Examples**

| Context | Example tone |
|---------|----------------|
| Empty MCQ list | “No questions yet? The silence is admirable, but pedagogically thin.” |
| Delete confirm | “Shred this question? Even my worst exams got a second glance.” |
| Save success | “Splendid. Another pearl for the quiz necklace.” |
| Validation | “Every multiple-choice needs a victor—tag one option as correct.” |
| Preview (correct) | “Correct. Gold star material.” (example; tune in `professor.ts`) |
| Preview (incorrect) | “Not this time—the key lives elsewhere.” (example) |

Centralize copy in `src/lib/copy/professor.ts` (or equivalent).

---

## Testing strategy (TDD)

This section is **aligned with** `PRD_AUTHENTICATION.md` **§ Testing Strategy (TDD)** so the MCQ track uses the **same discipline** as auth: red → green → refactor, Vitest, colocated tests, and **no placeholder tests**.

### Principles

- **Test-driven development**: For each implementation phase below that ships **TypeScript behavior**, **write or extend unit tests first** so they **fail (red)** against the intended contracts (function signatures, return shapes, validation errors, HTTP status codes). Then implement the **minimum code to pass (green)**. **Refactor** while keeping tests green.
- **Vitest** is the project test runner; tests are **colocated** with the code under test (e.g. `mcq-service.test.ts`, `route.test.ts` next to `route.ts`). Follow **`.cursor/rules/vitest-testing.mdc`**: meaningful assertions, isolated tests, **`vi.clearAllMocks()` in `beforeEach`**, mock external I/O.
- **No real D1 or network in unit tests**: Mock **`@/lib/d1-client`** (or a small fake D1 surface) when testing **services** and **route handlers**, consistent with auth service tests.
- **Layering**: **SQL migration files** are verified by **`wrangler d1 migrations apply --local`** (or project equivalent) and optional manual smoke `SELECT`s—**not** by Vitest executing raw SQL. **Automated tests** own **MCQ services** (business rules, pagination/search/sort, implicit quiz linkage, ownership, “exactly one correct” validation), **faculty HTTP handlers** (status codes, JSON bodies, query defaults such as **pageSize 15**), and **UI** where regressions are likely (see Phase 4).

### Per-layer focus

| Layer | TDD approach |
|--------|----------------|
| **Phase 1 — Migrations** | No unit tests required for `.sql` migration files alone. Primary verification: local migration apply; optional documented smoke queries in troubleshooting. **Phase 2 must not start** until the schema is applied locally so service tests target the real DDL contract. |
| **MCQ service** (`mcq-service.ts`) | **Red first**: `mcq-service.test.ts` specifies list (**pagination, sort, search**), create/update/delete, **implicit quiz** + `quiz_questions` rows, ownership denial, rejection of zero or multiple correct options, transaction boundaries. Mock **`@/lib/d1-client`**. |
| **Faculty API route handlers** | **Red first**: colocated `route.test.ts` (or shared handler test pattern used in auth) with `NextRequest` / `Request` stubs, **mocked mcq-service** (or mocked env + DB as in auth routes); assert **200/201/400/403/404**, list query parsing, and response JSON shapes. No real Worker or D1. |
| **Faculty UI (Phase 4)** | Prefer **component or page tests** with **`@testing-library/react`** for **form validation** (exactly one correct answer), **delete confirm** flow, **preview attempt → result** (select option, submit, assert correct/incorrect copy), and critical table interactions; **mock `fetch`** to Phase 3 APIs. Match auth UI pattern where applicable: colocated **`page.test.ts`**, jsdom, **no JSX in test files** if the project keeps **`jsx: preserve`** + Vitest constraints. Thin e2e optional; not required for this PRD. |

### Deferred (roadmap sprint)

- **quiz-attempt-service** tests, student route tests, and attempt-limit/scoring tests — **TDD still applies** when those phases are scheduled; same Vitest and mocking rules.

### Definition of done (MCQ track)

- Phases **2–4** merge with **new or updated tests** that prove the behaviors introduced in that phase; **`npm test`** passes before the phase is considered done.
- **No placeholder tests** (`expect(true).toBe(true)` or equivalent).
- **Phase 1** is “done” when migrations exist, apply **locally**, and indexes/constraints match this PRD; automated coverage resumes in **Phase 2** with service tests.
- Do **not** apply remote D1 migrations unless explicitly requested.

---

## Implementation phases (this track — revised)

**Canonical build order**: **database migrations** → **mcq service** (including implicit quiz + list query) → **faculty API** → **faculty UI**.

**TDD (same as auth)**: **Phases 2–4** follow **tests first (red) → implementation (green) → refactor**. **Phase 1** is the **SQL migration** step: verify with **local Wrangler apply** (see Testing strategy); **no TDD loop on raw SQL files**.

### Prerequisites

1. **`src/lib/d1-client.ts`** from `PRD_AUTHENTICATION.md` Phase 2.
2. **`/faculty`** layout and shell — **done** (auth Phases 6–7).

---

### Phase 1: Database migrations — ⏳ PLANNED

**Objective**: D1 schema for `mcq_questions`, `mcq_options`, `quizzes`, `quiz_questions`, `quiz_attempts`, `quiz_attempt_answers`, indexes (including author and any columns used for sort/search). Document **`max_attempts` NULL = unlimited** in SQL comments.

**TDD note** (same convention as **`PRD_AUTHENTICATION.md` Phase 1**): Migrations are **SQL artifacts**. **Do not** add Vitest suites that merely duplicate DDL strings. Primary verification: **`wrangler d1 migrations apply --local`** (or project equivalent). Optionally document manual smoke **`SELECT`**s (e.g. `sqlite_master`, row counts) in **Troubleshooting** or phase notes. **`cloudflare-env.d.ts`** / Wrangler types: update if new bindings or conventions require it.

**Tasks**

1. Author Wrangler D1 migrations for **all** tables and indexes.
2. Apply **locally only** unless remote apply is explicitly requested.

**Deliverables**: Migration SQL under the project `migrations/` convention.

---

### Phase 2: MCQ service (faculty + implicit quiz) — ⏳ PLANNED

**Objective**: `src/lib/services/mcq-service.ts` — CRUD, transactions for options, **ensure implicit quiz** per faculty, **sync `quiz_questions`** on create/delete (and on update if linkage rules change), **list with `page`, `pageSize` (default 15), `sort`, `q`**.

**TDD note** (same rhythm as **`PRD_AUTHENTICATION.md` Phase 3**): **`mcq-service.test.ts` before `mcq-service.ts`** (or extend tests before changing behavior): **red** scenarios include empty list, **pagination totals**, **search** filters `prompt`, **sort** behavior for allowed fields, create with ≥2 options and **exactly one** correct plus **`quiz_questions`** row, **reject** zero or two correct flags, **update** denied for wrong `author_user_id`, **delete** removes question/options and join row. Mock **`@/lib/d1-client`** only; **no real D1** in unit tests.

**Deliverables**: `mcq-service.ts` + `mcq-service.test.ts`.  
**Not in this phase**: `quiz-attempt-service.ts`.

---

### Phase 3: Faculty API endpoints — ⏳ PLANNED

**Objective**: Route handlers for `GET` list (query params), `GET` by id, `POST`, `PATCH`, `DELETE` under `src/app/api/faculty/mcqs/`.

**TDD note** (same rhythm as **`PRD_AUTHENTICATION.md` Phase 4**): **Colocated `route.test.ts` first** (red): e.g. list returns **200** + body shape with **`pageSize` default 15**; **400** on invalid query/body; **403/404** on ownership or missing id; **201** on create. **Mock the mcq-service** (or the same dependency boundary auth uses for routes) so tests do not need a real Worker or D1.

**Deliverables**: `app/api/faculty/mcqs/**` + colocated tests; Zod at boundary.

---

### Phase 4: Faculty MCQ UI — ⏳ PLANNED

**Objective**: Full **table** experience: **search**, **sort**, **pagination (15)**, row actions **Edit / Delete / Preview** (preview = **student-style attempt then feedback**), **Add MCQ** form (shadcn form controls), delete **AlertDialog**, toasts, **shadcn empty state**, `professor.ts` strings.

**TDD note** (same rhythm as **`PRD_AUTHENTICATION.md` Phase 5**): Prefer **failing tests first** for the highest-risk UX: **form validation** (exactly one correct answer), **delete confirmation**, and any **client-side list URL state** that must stay in sync with the API. Use **`@testing-library/react`**; **mock `fetch`**. Colocate **`page.test.ts`** (or component `*.test.tsx` if the project allows JSX in tests); if the repo standard matches auth, use **jsdom** and **avoid JSX in `*.test.ts` files** when `jsx: preserve` applies.

**Tasks**

1. Add any missing shadcn primitives (**Table**, **Pagination**, **Sheet** or **Dialog**, **AlertDialog**, **Input**, **Textarea**, **Select**, **Empty** or composed empty, **Sonner** if not present).
2. Wire `src/app/faculty/page.tsx` (or `src/app/faculty/mcqs/page.tsx` if split) to Phase 3 APIs.
3. **Enable** primary CTA; replace static “No MCQs available.” line with designed empty state.

**Deliverables**: Faculty pages + targeted tests.

---

## Future track phases (roadmap — separate sprint)

| Phase | Content |
|--------|---------|
| **R1** | `quiz-attempt-service` + tests; student `GET`/`POST` APIs; `max_attempts`; grading; no answer leakage. |
| **R2** | Student UI: quiz list, take quiz, results; replace `/student` placeholder. |
| **R3** | Faculty **quiz creation** UI (multiple quizzes, settings, ordering); reporting / attempts table (optional). |

---

## Technical implementation details

### Key files (expected)

**Existing**

- `src/app/faculty/layout.tsx`, `src/components/app/app-shell-*.tsx`
- `src/app/faculty/page.tsx` — evolve in Phase 4
- `src/app/student/page.tsx` — **roadmap** only

**MCQ track (to add)**

- `src/lib/services/mcq-service.ts`
- `src/app/api/faculty/mcqs/**`
- `src/components/faculty/mcq-*` (table, form, preview, delete dialog)
- `src/lib/copy/professor.ts`

**Deferred**

- `src/lib/services/quiz-attempt-service.ts`

### Patterns

- **Transactions** on MCQ save (options replace or diff safely).
- **Authorization**: mutations check `session.user.id === author_user_id`.
- **D1**: use `d1-client` helpers; positional `?1`, `?2` normalization.

---

## Success criteria (this track)

- [ ] Faculty can **list** MCQs with **pagination (15)**, **sort**, and **search** on prompt.
- [ ] Faculty can **create**, **edit**, **delete** MCQs with validation (exactly one correct option).
- [ ] Faculty can **preview** an MCQ in a **student-style** flow: **choose an answer**, **submit**, then see **correct / incorrect** (and the keyed correct option if wrong); optional **Try again** to repeat the attempt step.
- [ ] New MCQs are **linked** to the **implicit per-faculty quiz** in the database.
- [ ] Empty list shows a **shadcn-based** empty state and professor persona copy.
- [ ] Toasts and confirmations follow persona guidelines.
- [ ] **Full schema** including attempt tables exists in migrations (no later rewrite for quiz/MCQ core).
- [ ] **TDD**: Same bar as auth—**Phases 2–4** ship with **Vitest** coverage per [Testing strategy (TDD)](#testing-strategy-tdd); **`npm test`** passes; **no placeholder tests**; **Phase 1** verified by **local migration apply** (not Vitest on raw SQL).

**Deferred success criteria** (student attempts, grading UI, `max_attempts` enforcement in live flows, student GET without `is_correct`) apply to the **roadmap sprint**, not this track.

---

## Troubleshooting guide

### “Exactly one correct” validation fails intermittently

**Cause**: Client allows zero or two “correct” flags.  
**Solution**: Radio / single index; server Zod refine.

### Search or pagination feels wrong

**Cause**: Off-by-one page or `LIKE` without bind.  
**Solution**: Document API defaults; use `d1-client` binding only.

---

## Future enhancements

- Question banks, tags, difficulty, standards (TEKS).
- Timed quizzes, randomization, partial credit, rich media.
- LMS integration.

---

## Dependencies

### Internal

- `PRD_AUTHENTICATION.md`: users, session, middleware, D1 client, `/faculty` shell.
- shadcn/ui, zod.

### External

- None beyond existing stack for this track.

---

## Risks and mitigation

- **Risk**: `LIKE` search performance on large datasets.  
  **Mitigation**: Index `author_user_id` + consider `prompt` prefix strategy; cap `pageSize`.

- **Risk**: Persona overused.  
  **Mitigation**: Full wit on empty states and toasts; keep dense forms mostly neutral.

---

## Notes for AI agents

1. Keep MCQ logic **server-authoritative**.  
2. Update phase checkboxes in this file as phases complete.  
3. Follow **TDD** exactly as in **`PRD_AUTHENTICATION.md`**: **tests before implementation** for Phases **2–4**; **Phase 1** = migrations + local apply only.  
4. **Do not** apply remote D1 migrations unless the user requests.  
5. **Student** and **attempt** implementation: see **Roadmap — future sprint**.  
6. Install missing shadcn components via project CLI/registry before building UI.

---

## Current status

**Last Updated**: 2026-05-04  
**Active track**: Faculty MCQ management (Phases **1 → 4**).  
**Current phase to implement**: **Phase 1** (migrations) — first implementation step after PRD approval.  
**Status**: Auth + D1 client + faculty/student shells in repo. MCQ schema and services **not** started unless already present in tree.  
**Next step after approval**: Phase 1 (migrations, local apply) → Phase 2 (**`mcq-service.test.ts` red first**, then `mcq-service`) → Phase 3 (**route tests red first**, then APIs) → Phase 4 (**UI tests red first** where specified, then faculty UI).
