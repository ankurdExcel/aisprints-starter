# Quiz Master — MCQs, Dashboard & Student Attempts - Technical PRD

## Overview

This document covers faculty-facing multiple-choice question (MCQ) management—list, create, edit, delete—and the data model and APIs for students to take quizzes, submit answers, and record attempts with configurable attempt limits and per-question response tracking. It builds on authentication (see `PRD_AUTHENTICATION.md`): faculty manage MCQs; students consume them and generate scored attempts.

**Already in the repo (auth Phase 6–7, outside MCQ numbered phases below):** Protected **`/faculty`** and **`/student`** routes with a shared app shell (`src/components/app/app-shell-header.tsx`, `app-shell-footer.tsx`), JWT middleware, and **placeholder** UIs—faculty shows “No MCQs available.” plus a **disabled** “Create MCQ” button; student shows “No quizzes available.” MCQ work **replaces and wires** these placeholders; it does not need to recreate routing or the shell.

---

## Business Requirements

### Faculty — MCQ Management

- Faculty see a dashboard listing all MCQs they (or the system, per ownership rules) can manage.
- Faculty can add a new MCQ: question text, multiple choices, exactly one correct choice.
- Faculty can edit an existing MCQ and delete an MCQ with appropriate confirmation.
- Empty state when no MCQs exist should be friendly and on-brand (see copy persona).

### Student — Taking Quizzes & Attempts

- Students can view assigned or available MCQ sets (exact UX for “quiz assignment” can start as “all published MCQs” or “quiz entity” below—see schema options).
- The product must support **configurable attempt limits** per quiz (or per assessment): e.g. exactly one attempt, or multiple attempts up to N, or unlimited within a policy.
- The system must **record each attempt**: which answers were selected per question, which were correct, and an **aggregate score** (and optionally per-question scoring).
- Historical attempts remain queryable for faculty reporting (reporting UI can be phased).

### Cross-Cutting — Copy & Experience

- User-visible strings for toasts, empty states, validation errors, and confirmations should avoid dull boilerplate. Prefer a **persona: witty old professor**—dry humor, clever asides, still clear about what went wrong or what to do next. Do not sacrifice clarity or accessibility for jokes.

---

## Technical Requirements

### Stack Alignment

- Next.js App Router, Server Actions and/or `app/api` routes per project conventions.
- Cloudflare D1 via shared **`@/lib/d1-client`** (`src/lib/d1-client.ts`, delivered in **`PRD_AUTHENTICATION.md` Phase 2**). If MCQ work starts before that exists, complete the D1 client phase first—the MCQ track does not duplicate the client. Binding: `tna_app_db` per `wrangler.jsonc`.
- shadcn/ui for tables, dialogs, forms, toasts (e.g. Sonner), badges.
- Faculty routes require `role === 'faculty'`; student routes require `role === 'student'`. **Implemented:** `src/middleware.ts` + layouts under `src/app/faculty/` and `src/app/student/` (see `PRD_AUTHENTICATION.md` Phases 6–7).

### Data Model Strategy

Two layers are recommended so “quiz” settings (attempt limits) stay separate from reusable questions:

1. **Questions** — reusable MCQ definition.  
2. **Quiz** — container with policy (`max_attempts`, etc.) linking questions.  
3. **Attempts** — one row per student submission session for a quiz.  
4. **Attempt answers** — one row per question within an attempt.

This supports “one attempt” vs “many attempts” without duplicating question rows.

### Database Schema

**Audit columns (all new tables)**  
Include at minimum:

- `created_at` TEXT NOT NULL DEFAULT (ISO UTC),
- `updated_at` TEXT NOT NULL,
- `created_by` TEXT NULL REFERENCES users(id),
- `updated_by` TEXT NULL REFERENCES users(id),

Adjust defaults to match the same pattern as `users` in `PRD_AUTHENTICATION.md`.

---

#### Table: `mcq_questions`

Stores the MCQ stem and ownership. Choices can be normalized in a child table or stored as JSON in SQLite; **normalized form** is preferred for integrity and reporting.

| Column | Type | Notes |
|--------|------|--------|
| `id` | TEXT PK | |
| `author_user_id` | TEXT NOT NULL FK → users(id) | Faculty who owns the question |
| `prompt` | TEXT NOT NULL | Question text |
| `created_at`, `updated_at`, `created_by`, `updated_by` | | Audit |

#### Table: `mcq_options`

| Column | Type | Notes |
|--------|------|--------|
| `id` | TEXT PK | |
| `question_id` | TEXT NOT NULL FK → mcq_questions(id) ON DELETE CASCADE | |
| `label` | TEXT | Optional display label A,B,C |
| `body` | TEXT NOT NULL | Answer text |
| `is_correct` | INTEGER NOT NULL DEFAULT 0 | SQLite 0/1; **exactly one** correct per question (enforce in app + optional trigger or CHECK via partial unique index pattern) |
| `sort_order` | INTEGER NOT NULL DEFAULT 0 | |
| Audit columns | | |

**Constraint note**: SQLite lacks partial UNIQUE constraints in all versions; enforce “exactly one `is_correct`” in application transactions when saving MCQs.

#### Table: `quizzes`

Container for a deliverable assessment (even if MVP UI shows one implicit quiz per faculty).

| Column | Type | Notes |
|--------|------|--------|
| `id` | TEXT PK | |
| `title` | TEXT NOT NULL | |
| `owner_user_id` | TEXT NOT NULL FK → users(id) | Faculty |
| `max_attempts` | INTEGER NOT NULL DEFAULT 1 | `1` = single attempt; `0` or NULL policy TBD—define as **0 = unlimited** or use separate boolean; **recommendation**: `NULL` = unlimited, positive integer = cap |
| `created_at`, … | | Audit |

**Product decision to freeze in implementation**: Document chosen semantics for `max_attempts` in migration comments (suggested: `NULL` unlimited, `1` single attempt, `N` max N).

#### Table: `quiz_questions` (join)

| Column | Type | Notes |
|--------|------|--------|
| `quiz_id` | TEXT FK | |
| `question_id` | TEXT FK | |
| `sort_order` | INTEGER | |
| PK | (quiz_id, question_id) | |

#### Table: `quiz_attempts`

| Column | Type | Notes |
|--------|------|--------|
| `id` | TEXT PK | |
| `quiz_id` | TEXT NOT NULL FK | |
| `student_user_id` | TEXT NOT NULL FK → users(id) | |
| `started_at` | TEXT NOT NULL | |
| `submitted_at` | TEXT NULL | NULL if abandoned (optional MVP: only submitted) |
| `score` | REAL NULL | e.g. 0–100 or count correct / total |
| `max_score` | REAL NULL | Denormalized for fast read |
| `created_at`, … | | Audit |

**Index**: `(quiz_id, student_user_id)` for counting attempts.

#### Table: `quiz_attempt_answers`

| Column | Type | Notes |
|--------|------|--------|
| `id` | TEXT PK | |
| `attempt_id` | TEXT NOT NULL FK → quiz_attempts(id) ON DELETE CASCADE | |
| `question_id` | TEXT NOT NULL FK | |
| `selected_option_id` | TEXT NULL FK → mcq_options(id) | NULL if skipped (if allowed) |
| `is_correct` | INTEGER NOT NULL | Snapshot at grade time |
| `created_at`, … | | Audit |

---

**MVP simplification option** (if scope is tight): Single implicit `quiz` per faculty with `max_attempts` configurable; auto-link all their `mcq_questions` to that quiz. PRD still recommends full schema so later phases do not require painful migrations.

**Example migration excerpt (illustrative)**

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
-- Additional tables: quizzes, quiz_questions, quiz_attempts, quiz_attempt_answers as above
```

### API Endpoints (Faculty)

#### GET `/api/faculty/mcqs` (or Server Action list)

- Returns paginated list of MCQs for `author_user_id === session user` (or all if team feature later).
- Each item: id, prompt, option count, updated_at, maybe correct answer masked for list.

#### POST `/api/faculty/mcqs`

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

#### PATCH `/api/faculty/mcqs/[id]`

- Same shape as create; verify ownership.

#### DELETE `/api/faculty/mcqs/[id]`

- Verify ownership; cascade deletes options.

### API Endpoints (Student) — Phase after faculty CRUD

#### GET `/api/student/quizzes` / GET `/api/student/quizzes/[id]`

- List quizzes available to student; detail includes questions and options **without** revealing `is_correct` in JSON (never send correct flags to client before grading).

#### POST `/api/student/quizzes/[id]/attempts`

- Validates `max_attempts` not exceeded for `(quiz_id, student_user_id)`.
- Creates `quiz_attempts` + `quiz_attempt_answers` rows; computes score server-side by comparing `selected_option_id` to correct option; returns score summary.

**Responses**

- **403**: Max attempts exhausted (witty professor copy).
- **400**: Invalid payload / missing answers.
- **201**: Attempt id, score, breakdown optional.

### User Interface Requirements

#### Faculty dashboard (`/faculty` or `/faculty/mcqs`)

**Current (placeholder, auth Phase 7):** `src/app/faculty/page.tsx` — heading + short copy, **“No MCQs available.”**, and **Create MCQ** disabled until APIs and **MCQ Phase 4** ship.

**Target (MCQ Phase 4):** Replace/enhance the placeholder with:

- Table or card list of MCQs with actions: Edit, Delete.
- Primary CTA: “Add MCQ” / “Create MCQ” (enabled) → sheet/dialog or dedicated `/faculty/mcqs/new` if split routes.
- Empty state copy in professor voice (can replace the bare placeholder line).
- Delete: confirm dialog; toast on success/failure.

#### Faculty MCQ form (new / edit)

- Prompt (textarea).
- Dynamic list of options (minimum 2); one marked as correct (radio tied to options).
- Save → toast; redirect or inline refresh list.

#### Student quiz UI (later phase)

**Current (placeholder, auth Phase 7):** `src/app/student/page.tsx` — **“No quizzes available.”** until **MCQ Phase 5** lists real quizzes and attempt flows.

**Target (MCQ Phase 5):**

- Show one question at a time or all on one page (product choice); submit triggers attempt creation.
- After submit: show score and professor-flavored feedback.

### Copy Persona — “Witty Old Professor”

**Guidelines**

- Short lines; one quip max per message where it fits.
- Never mock the user; humor targets the situation (“That blank page longs for a question as much as I long for coffee.”).
- Errors still state the fix (“Pick exactly one correct answer—I’m strict, not cruel.”).

**Examples (non-exhaustive)**

| Context | Example tone |
|---------|----------------|
| Empty MCQ list | “No questions yet? The silence is admirable, but pedagogically thin.” |
| Delete confirm | “Shred this question? Even my worst exams got a second glance.” |
| Save success | “Splendid. Another pearl for the quiz necklace.” |
| Validation | “Every multiple-choice needs a victor—tag one option as correct.” |
| Max attempts | “You’ve used your allotted guesses. The exam is closed; the bar is open—metaphorically.” |

Centralize copy in a `lib/copy/professor.ts` or similar module for consistency and i18n later.

---

## Testing Strategy (TDD)

### Principles

- **Test-driven development**: Within each phase, **add or extend failing unit tests first** that describe the desired behavior (service methods, validation rules, grading math, attempt limits). Implement until tests **pass (green)**; refactor without changing behavior.
- **Vitest** + colocated `*.test.ts`; follow `.cursor/rules/vitest-testing.mdc` (no placeholder tests, mock external dependencies, `beforeEach` clears mocks).
- **Mock D1**: Never hit a real D1 instance in unit tests—mock `@/lib/d1-client` exports or inject a fake DB so services remain fast and deterministic.

### Per-layer focus

| Layer | TDD approach |
|--------|----------------|
| **MCQ service** | Tests for list/create/update/delete with ownership checks; “exactly one correct option” validation; transaction boundaries (options saved with question). Red first, then implement `mcq-service`. |
| **Quiz / attempt service** | Tests for `max_attempts` counting, creating attempts, grading, storing `quiz_attempt_answers`, 403-style outcomes when over limit—all with mocked D1 client. |
| **API handlers** | Tests for faculty CRUD HTTP status and JSON shapes; student attempt POST returns score without leaking `is_correct` in GET fixtures used by tests. |

### UI and migrations

- **Migrations**: Verified by local apply; optional small integration script later—not a substitute for service unit tests.
- **React UI**: Use Testing Library for forms and table actions where regressions are likely; persona copy can be snapshot-tested lightly if desired.

### Definition of done (MCQ track)

- Each phase merges with **new tests** proving the behaviors introduced in that phase.
- Attempt-limit and scoring logic have explicit unit tests (easy to get wrong).

---

## Implementation Phases

**Canonical build order**: **database migrations → (prerequisite: shared D1 client from auth) → services → API endpoints → faculty UI → student quiz/attempts → hardening / reporting**. Each phase uses **TDD**: failing tests first, then implementation until green.

**Prerequisites**

1. **`src/lib/d1-client.ts`** from **`PRD_AUTHENTICATION.md` Phase 2**. If the client is not yet in the repo, complete that phase before MCQ **Phase 2** service tests that depend on SQL helpers.
2. **Role shells (optional for migrations, required before meaningful UI):** `PRD_AUTHENTICATION.md` **Phases 6–7** — middleware, `/faculty` and `/student` layouts, shared header/footer, and placeholder copy as described in the Overview. **Status: done** in this repo.

### Phase 1: Database migrations - ⏳ PLANNED

**Objective**: D1 schema for `mcq_questions`, `mcq_options`, `quizzes`, `quiz_questions`, `quiz_attempts`, `quiz_attempt_answers`, indexes, and documented `max_attempts` semantics in SQL comments.

**TDD note**: No unit tests required for raw SQL files; optional migration smoke. Downstream **service tests** will assume this schema.

**Tasks**
1. Author Wrangler D1 migrations for all tables and indexes.
2. Apply **locally only** unless remote apply is explicitly requested.

**Deliverables**
- Migration SQL files under project `migrations/` convention.

---

### Phase 2: Services - ⏳ PLANNED

**Objective**: **`lib/services/mcq-service.ts`** (and **`lib/services/quiz-attempt-service.ts`** when attempts are in scope) containing all business logic and SQL via `d1-client`.

**TDD note**: **Write `mcq-service.test.ts` first** (red): list empty, create with two options one correct, reject zero/two correct, update ownership denied for other user, delete cascades options. Mock **`@/lib/d1-client`**. Then implement service until green. Repeat for attempt service when implementing student flows.

**Tasks**
1. Define service public API (types for MCQ DTOs, errors).
2. Implement CRUD + transactions for questions/options.
3. Implement attempt creation, limit checks, grading (Phase 2b can be a sub-milestone if split).

**Deliverables**
- `lib/services/mcq-service.ts` + `mcq-service.test.ts`.
- `lib/services/quiz-attempt-service.ts` + tests (deliver when student attempt phase starts, still TDD).

---

### Phase 3: API endpoints - ⏳ PLANNED

**Objective**: Faculty REST or route handlers for list/create/update/delete MCQs; later student quiz list/detail and `POST` attempts.

**TDD note**: **Handler tests first** with mocked services: 200/201/400/403/404 as applicable; response bodies never include `is_correct` for student-facing GETs.

**Tasks**
1. Zod request/response validation at the HTTP boundary.
2. Wire handlers to services only (no raw SQL in routes).

**Deliverables**
- `app/api/faculty/mcqs/**` (+ optional `app/api/student/**`) + colocated tests.

---

### Phase 4: Faculty dashboard UI - ⏳ PLANNED

**Objective**: List, add, edit, delete MCQs with shadcn; professor copy on toasts and empty states.

**TDD note**: Component tests for form validation (exactly one correct answer) and delete confirm flow; mock `fetch` to APIs.

**Tasks**
1. Data table, dialog/sheet forms, toasts (e.g. Sonner).
2. `lib/copy/professor.ts` wired to user-visible strings.
3. **Enable** the existing **Create MCQ** control on `src/app/faculty/page.tsx` (or move logic to `/faculty/mcqs` if reorganized) and replace the static empty state with data from **Phase 3** APIs.

**Deliverables**
- Pages under `src/app/faculty/...` (App Router; align with existing `layout.tsx`) + targeted `.test.tsx` / `page.test.ts` where valuable.

---

### Phase 5: Student quiz flow & attempts - ⏳ PLANNED

**Objective**: Quiz linkage (explicit or implicit per PRD), student UI, `POST` attempts, server-side grading, results view.

**TDD note**: Extend **quiz-attempt-service** tests first (red) for limit and grading edge cases; then endpoints; then minimal UI tests.

**Tasks**
1. Ensure quiz–question linkage for MVP policy.
2. Student routes + attempt API; no answer key leakage.
3. **Replace** the placeholder copy on `src/app/student/page.tsx` with quiz list / take-quiz / results flows powered by APIs.

**Deliverables**
- Student pages under `src/app/student/...` + APIs + passing unit tests.

---

### Phase 6: Hardening & reporting hooks - ⏳ PLANNED

**Objective**: Hot-query review, faculty table of attempts per quiz/student, edge-case tests for concurrency or double-submit if addressed.

**TDD note**: Add regression tests for any bug fixed in this phase.

**Tasks**
1. Faculty attempts listing UI (optional MVP scope).
2. Performance and index review.

**Deliverables**
- Documentation updates in this PRD “Key Files”; tests for new reporting helpers.

---

## Technical Implementation Details

### Key Files (expected)

**Existing (auth / shell — do not duplicate)**

- `src/app/faculty/layout.tsx`, `src/app/student/layout.tsx` — role layouts using `AppShellHeader` / `AppShellFooter`.
- `src/components/app/app-shell-header.tsx`, `src/components/app/app-shell-footer.tsx` — shared chrome.
- `src/app/faculty/page.tsx`, `src/app/student/page.tsx` — placeholders to evolve in Phases 4–5.

**MCQ track (to add)**

- `src/lib/services/mcq-service.ts` — CRUD + transactions for question + options.
- `src/lib/services/quiz-attempt-service.ts` — attempt creation, limit check, grading.
- `src/app/api/faculty/mcqs/**` or Server Actions colocated with faculty routes.
- `src/components/faculty/mcq-*` (or `src/components/mcq/*`) — table, form, delete dialog.
- `src/lib/copy/professor.ts` — centralized strings.

### Implementation Patterns

- **Transactions**: On MCQ save, replace options in one transaction (delete children + insert) or diff updates carefully to avoid orphan rows.
- **Authorization**: Every mutation checks `session.user.id === author_user_id` (or quiz owner).
- **Never leak answers**: Student GET payloads must omit `is_correct`; grading uses DB truth.

### Important Notes

- Align with D1 parameter rules (`?1`, `?2` via `d1-client`).
- If OpenNext limits Server Actions, prefer route handlers for binary/large payloads later; JSON MCQs are fine for MVP.

---

## Success Criteria

- [ ] Faculty can list, create, edit, and delete their MCQs with validation (exactly one correct option).
- [ ] Empty dashboard shows engaging empty state (professor persona).
- [ ] Toasts and critical errors use persona guidelines without obscuring facts.
- [ ] `max_attempts` is enforced server-side; client cannot bypass.
- [ ] Each attempt stores selected option per question and computed score.
- [ ] All new tables include standard audit fields.
- [ ] Students never receive correct answers before grading in API responses.
- [ ] **TDD**: Service and API layers ship with Vitest coverage described in Testing Strategy; suite passes before each phase is considered done.

---

## Troubleshooting Guide

### “Exactly one correct” validation fails intermittently

**Problem**: Users report save errors when one option is marked correct.  
**Cause**: Client state allows zero or two “correct” flags.  
**Solution**: Single source of truth—radio group bound to `correctOptionIndex`; server zod refine.

### Attempt count mismatch

**Problem**: Student gets blocked early or too many attempts.  
**Cause**: Counting non-submitted rows or wrong `max_attempts` NULL semantics.  
**Solution**: Count only `submitted_at IS NOT NULL` attempts; document and test NULL vs N.

---

## Future Enhancements

- Question banks, tags, difficulty, standards alignment (TEKS, etc.).
- Timed quizzes, question randomization, partial credit.
- Rich media in prompts; more question types beyond MCQ.
- Email notifications; LMS integration.

---

## Dependencies

### Internal

- `PRD_AUTHENTICATION.md`: `users`, session, **`src/middleware.ts`** role guards, **`/faculty` / `/student` shells** (Phases 6–7), and **`src/lib/d1-client.ts`** (Phase 2)—required before MCQ service TDD and before replacing placeholder UIs.
- shadcn/ui, zod.

### External

- None required for MVP beyond existing stack.

---

## Risks and Mitigation

### Technical

- **Risk**: Schema too heavy for first sprint.  
  **Mitigation**: MVP implicit single quiz per faculty + link all questions in app code.

### UX

- **Risk**: Persona overused becomes annoying.  
  **Mitigation**: Use full wit on empty states and toasts; keep dense forms mostly neutral.

---

## Notes for AI Agents

1. Keep MCQ and attempt logic server-authoritative.  
2. Update phase checkboxes in this file as phases complete.  
3. Follow **TDD** per phase: red tests → green implementation → refactor.  
4. Do not apply remote D1 migrations unless user requests.  
5. Colocate Vitest tests with services and route tests with APIs.

---

## Current Status

**Last Updated**: 2026-05-02  
**Current Phase**: MCQ **Phase 1** (migrations) — next up for this document’s numbered work  
**Status**: Auth + D1 client + **faculty/student placeholder shells** are in the repo (`PRD_AUTHENTICATION.md` Phases 2–7). MCQ schema and services are **not** started here yet.  
**Next Steps**: D1 migrations (Phase 1) → `mcq-service` TDD (Phase 2) → faculty APIs (Phase 3) → replace `/faculty` placeholder UI (Phase 4) → student attempts + `/student` UI (Phase 5) → hardening (Phase 6).
