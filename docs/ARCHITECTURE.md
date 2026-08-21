# QuizGuard Architecture

Status: **Phase 11 — Security Hardening** complete. This document describes the target
architecture for the whole system and calls out what exists today versus
what each later phase adds.

## 1. System overview

```text
                         INTERNET
                            │
                            ▼
                   OVHcloud Load Balancer          (Phase 13, added when load testing requires it)
                            │
                 ┌──────────┴──────────┐
                 ▼                     ▼
             App Server 1          App Server 2      (Next.js, horizontally scaled)
                 │                     │
                 └──────────┬──────────┘
                             │
             ┌───────────────┼────────────────┬───────────────┐
             ▼               ▼                ▼               ▼
           Redis         Realtime server   PostgreSQL        Nginx    (Redis: Phase 0 infra /
             │            (Socket.IO,                                  Phase 1 sessions;
             │             own process,                                Realtime server: Phase 9,
             └──────────────►Phase 9)                                  see Section 12; Nginx:
                                                                        Phase 13)
                                │
                                ▼
                            Backups                                    (Phase 13)
```

A single Next.js application hosts the frontend and API (Route Handlers). It
is a **modular monolith**, not microservices (Rule 2): one deployable unit
today, but internally partitioned so any module can be pulled into its own
service later without a rewrite (Rule 15). Nothing here needs Kubernetes;
horizontal scaling is "run more copies of the same container behind a load
balancer" (Rule 14).

**The realtime server (Phase 9) is a second, separate process — not a
Socket.IO server bolted onto the Next.js app.** Earlier drafts of this
document assumed the opposite (a single process hosting both), following the
typical Next.js + Socket.IO tutorial pattern. That pattern relies on a
custom `server.js` attaching Socket.IO to the same Node `http.Server` Next
uses — checked directly against `node_modules/next/dist/docs/01-app/02-guides
/custom-server.md` before writing any Phase 9 code, per this repo's own
AGENTS.md instruction, and confirmed to not apply here: **`output:
"standalone"` (already set in `next.config.ts` since Phase 0, for the
production Docker image) explicitly cannot be combined with a custom
server** — the docs state standalone mode generates its own minimal
`server.js` and "these cannot be used together." Route Handlers in the App
Router also expose only the Web `Request`/`Response` API, with no documented
way to reach the underlying raw socket (the old Pages Router `res.socket
.server` trick isn't referenced anywhere in the App Router docs). See
Section 12 for the resulting design and why it doesn't cost anything Phase
9 actually needed.

## 2. Request flow

```text
Browser
  │
  ▼
Next.js (Route Handlers)  ──►  Zod validation  ──►  backend/<module> service
  │                                                        │
  │                                          ┌─────────────┴─────────────┐
  │                                          ▼                           ▼
  │                                       Redis                     PostgreSQL
  │                              (sessions, rate limits,        (source of truth —
  │                               active-exam state, cache)      Drizzle ORM)
  ▼
NextResponse.json(...)
```

Route Handlers stay thin: they parse/validate the request, call into a
`src/backend/<module>` service function, and shape the HTTP response. All
business logic lives in the service layer so it is framework-agnostic and
portable to a standalone Node service later (Rule 3), and directly testable
without spinning up an HTTP server — see `backend/auth/auth.service.ts` and
`tests/integration/auth.test.ts` for the pattern every future module follows.

## 3. Redis vs. PostgreSQL — the boundary

PostgreSQL is the permanent source of truth for everything (Rule 9). Redis is
used only for temporary/high-frequency state (Rule 8):

| Data                                        | Store                                                   |
| ------------------------------------------- | ------------------------------------------------------- |
| Users, quizzes, questions, results          | PostgreSQL                                              |
| Final submitted answers                     | PostgreSQL                                              |
| Active exam session / in-progress answers   | Redis (synced to PostgreSQL periodically and on submit) |
| Rate limit counters                         | Redis                                                   |
| Login sessions (Phase 1)                    | Redis                                                   |
| Cross-process realtime events (Phase 9)     | Redis Pub/Sub (transit only, nothing at rest)           |
| Live "who's currently taking an exam" state | In-memory in the realtime server process (Section 12)   |

A Redis outage must degrade the exam experience, never silently lose a final
grade — anything Redis holds either has a PostgreSQL row it will sync into,
or is safely disposable (rate limit counters, presence, sessions — a session
flush just means everyone re-logs-in, not lost data).

## 4. Authentication & sessions (Phase 1)

**Sessions are opaque, Redis-backed tokens — not JWTs.** `backend/auth/
session.ts` mints a random 32-byte token on login, stores `{id, email, name,
role}` as the Redis value at `session:<token>` with a 7-day sliding TTL, and
sets it as an httpOnly/sameSite=lax cookie. The Next.js authentication guide's
own top suggestion is a signed/encrypted cookie (via `jose` or `iron-session`)
holding the session data directly; QuizGuard uses the guide's "Database
Sessions" pattern instead, with Redis as the store, because Section 22
(Student Management) requires "Disable student" to take effect immediately.
A stateless JWT valid for days would keep working for a disabled account
until it naturally expired; a Redis-backed session can be revoked with one
`DEL`, which `backend/auth/session.ts#destroySession` does on logout and
would do identically for an admin-triggered force-logout later.

**RBAC is two-layered**, per the Next.js authentication guide's optimistic
vs. secure distinction:

- **`src/proxy.ts`** (optimistic): checks only whether the session _cookie is
  present_, no Redis lookup — Proxy runs on every request including
  prefetches, and the guide explicitly warns against database/Redis checks
  there. It redirects obviously-unauthenticated requests to `/admin`,
  `/teacher`, `/student` away to `/login`, and redirects a cookie-bearing
  visitor away from `/login` to `/dashboard`. Note: Proxy runs in the Node.js
  runtime in Next 16 (not Edge, unlike older Next versions), so it _could_
  call Redis — the code deliberately doesn't, to keep every request cheap.
- **The DAL** (`backend/auth/session.ts#getCurrentUser`, wrapped in React's
  `cache()`): the authoritative check, used in every protected page and in
  `backend/auth/rbac.ts#requireApiUser` for Route Handlers. This is what
  actually enforces "a student must never reach an admin/teacher route"
  (Section 3) — Proxy is a UX optimization on top of it, never a substitute.

`/dashboard` exists solely to bridge the two: Proxy knows a session cookie
exists but not the role, so authenticated visits to `/login` land on
`/dashboard`, which does the one Redis lookup needed and forwards to
`/admin`, `/teacher`, or `/student`.

**CSRF**: `src/lib/same-origin.ts` rejects cross-origin requests to
state-changing routes (login, logout) by comparing the `Origin` header to
`Host`. Combined with the session cookie's `SameSite=Lax`, this covers the
realistic browser CSRF surface for a same-origin app without a double-submit
token system — Section 25's "CSRF protection where applicable" is satisfied
by "applicable" not yet including a scenario that needs one. `AUTH_SECRET`
(env var already reserved in Phase 0) still has no consumer: nothing signs
or encrypts anything, including the realtime server's handshake (Section
12), which reuses the same Redis-backed session token everything else
already uses rather than introducing a second, signed-token auth scheme
for one feature. `AUTH_SECRET` remains reserved for whenever something
actually needs a signed/encrypted payload — no phase has, so far.

**Passwords**: bcrypt via `bcryptjs` (12 rounds), never logged, never
returned from any API. Login always returns the same generic "Invalid email
or password" for a wrong password, a nonexistent email, or a disabled
account — never revealing which case occurred (Section 25).

**Rate limiting**: `src/lib/rate-limit.ts` is a generic Redis fixed-window
counter (`INCR` + `EXPIRE`), applied to login (10 attempts / 15 min / IP)
and built to be reused by every future endpoint Section 31 calls out (exam
start, event sync, imports, file upload).

## 5. Academic schema (Phase 2)

```text
users (Phase 1)
  ├─ 1:1 → teachers ──┐
  └─ 1:1 → students   │
                       ▼
                    classes ── owned by one teacher
                       │
                       ▼
                class_students  (many-to-many: which students are in which class)
```

`teachers` and `students` extend a `users` row (1:1, PK = FK = `users.id`)
rather than adding role-specific columns directly to `users`. This exists
for one concrete reason right now: it lets `classes.teacher_id` reference
_`teachers.user_id` specifically_, so the database itself — not just
application logic — rejects a class owned by a non-teacher account. Both
tables are intentionally column-light today (`students` has one extra field,
`student_number`; `teachers` has none) — more columns get added only when a
phase actually needs them (Section 4's `students`/`teachers` entities are a
checklist, not a final column list), per the "no empty scaffolding" rule.

**`classes`** is soft-deleted (`deleted_at`) since Phase 4+ will hang quizzes
and results off a class, which shouldn't vanish with it. It has a **partial**
unique index on `(teacher_id, name)` — `WHERE deleted_at IS NULL` — so a
teacher can't have two _active_ classes with the same name, but can reuse a
name after archiving the old one. Partial indexes need matching conflict
handling: `INSERT ... ON CONFLICT (teacher_id, name) DO NOTHING` alone
doesn't match a partial index in Postgres — the `ON CONFLICT` also needs the
same `WHERE deleted_at IS NULL` predicate, which `database/seed/academic.
seed.ts` and any future upsert against this table must include (verified
against `drizzle-orm/pg-core`'s `onConflictDoNothing({ target, where })`
rather than assumed).

**`class_students`** is the enrollment join table: a composite primary key
`(class_id, student_id)`, not a surrogate `id` — the row has no identity
beyond "this student is in this class," and the PK doubles as the index for
"students in a class"; `student_id` gets its own index for the reverse
lookup. `ON DELETE CASCADE` on both FKs means deleting a class or a student
profile cleans up enrollments automatically — verified in
`tests/integration/academic-schema.test.ts`, along with the FK constraint
rejecting an orphan `teacher_id`, the partial-unique-index behavior, and
`classes.teacher_id`'s `ON DELETE RESTRICT` (a teacher who still owns a
class can't be deleted out from under it — reassign or archive the class
first).

`database/seed/academic.seed.ts` wraps its multi-table writes (teacher/
student profiles, one class, five enrollments) in a single
`db.transaction()` — Section 4's "use transactions" made concrete: a run
that fails partway through leaves no half-populated class behind. Every
seed function upserts (`onConflictDoNothing` + a fallback SELECT) so
`pnpm db:seed` is safe to run repeatedly.

## 6. Question bank (Phase 3)

```text
questions ──1:N── question_options
```

**`question_options` stores the correct-answer data for every question
type, not just multiple choice.** A row's `is_correct` flag means "this is
an accepted answer," reinterpreted per type:

| Type                            | Options                                                              |
| ------------------------------- | -------------------------------------------------------------------- |
| `multiple_choice`               | exactly 1 correct, 1+ incorrect (distractors)                        |
| `true_false`                    | exactly 2 options, exactly 1 correct                                 |
| `multiple_answer`               | 2+ correct, 1+ incorrect                                             |
| `short_answer`, `fill_in_blank` | 1+ correct, zero incorrect — every row is an accepted answer variant |

This unifies "the correct-answer store" across all five types instead of a
type-specific table each, directly matching Section 5's "options should be
stored separately." `backend/questions/question.schema.ts` enforces the
per-type option-count/correctness rules with a Zod discriminated union on
`type`; the two answer-only types don't even accept an `isCorrect` field
from the client — the service layer (`toOptionRows`) sets it to `true` for
every row, so there's no `isCorrect: false` state to accidentally send for
those types.

**`subject` and `category` are free text, not enums** — the platform
supports any subject (Section 1), so a fixed list would contradict that.
Filter dropdowns are populated from `getQuestionFilterFacets()` (a
`SELECT DISTINCT` over existing rows), never a hardcoded list. `tags` is a
Postgres `text[]` column with a **GIN index** (`questions_tags_idx`) for the
tag filter (`arrayContains`) — verified as the correct Drizzle index-builder
call (`index(name).using("gin", column)`, not `.on()`) against
`drizzle-orm/pg-core`'s actual type signatures rather than assumed.

**Update replaces all options rather than diffing them** — delete the old
rows, insert the new set, inside one `db.transaction()`. At ~10 options per
question this is simpler than add/update/remove reconciliation and exactly
as correct.

**RBAC**: every `/api/questions*` route requires `admin` or `teacher`
(`requireApiUser(["admin", "teacher"])`) — Section 3 assigns "manage
question bank" to Teacher; Admin is included too since "manage quizzes"
plausibly extends to the material quizzes are built from, and it's the
easier direction to loosen later if wrong. Students have no access at any
layer — there's no student-facing question view yet (that's a Phase 7
concern: a filtered, randomized, answer-stripped snapshot for an active
exam attempt, a completely different code path from the bank itself).

**UI**: `src/app/teacher/layout.tsx` is the first real persistent layout
(sidebar + topbar) — Phase 1's `/admin`, `/teacher`, `/student` pages were
single bare cards with no shared chrome because nothing needed one yet. The
sidebar lists only routes that actually exist (Dashboard, Question Bank);
new entries get added as each phase lands, not stubbed in ahead of time.
`features/questions/question-form.tsx` uses plain `useState` + a submit-time
`questionInputSchema.safeParse()` rather than React Hook Form (the pattern
`features/auth/login-form.tsx` established) — a discriminated union whose
option _array item shape_ changes with `type` fights RHF's typing enough
that plain state was the pragmatic choice for this one form; the server
route re-validates with the identical schema regardless (Rule 6: never trust
the client), so this is a DX choice, not a security one.

## 7. Quiz management (Phase 4)

```text
quizzes ──1:N── quiz_questions ──N:1── questions
```

**`quiz_questions` is the quiz's question _pool_, not necessarily what a
given student sees.** When `quizzes.randomize_questions` is true and the
pool is larger than `questions_per_attempt`, Phase 7 will draw a random
subset per attempt from this pool; when it's false (or the pool is exactly
`questions_per_attempt`), every pooled question is used, in `position`
order. This phase only stores that configuration — the actual random
sampling algorithm is Phase 7's job (Exam Engine), when attempts first
exist to sample for. Composite PK `(quiz_id, question_id)`, same reasoning
as `class_students`/`question_options`' shape: the row has no identity
beyond "this question is in this quiz's pool." `question_id` is `ON DELETE
RESTRICT` — a question still pooled into a quiz can't be hard-deleted out
from under it.

**Status is a 3-state enum (`draft` → `published` → `archived`),
independent of `deleted_at`.** Section 6 lists "Delete quiz" and "Archive
quiz" as distinct actions — archiving keeps a quiz visible and duplicable
(useful for reusing an old exam as a template) while soft-delete hides it
everywhere. `publish`/`unpublish`/`archive` are simple direct status
setters (`backend/quizzes/quiz.service.ts#setQuizStatus`), not a strict
state machine — nothing yet depends on transition order, and adding
stricter rules (e.g. can't unpublish once attempts exist) is straightforward
once Phase 7 gives "attempts exist" a table to check.

**Publishing is validated, not just a status flip**: `publishQuiz` rejects
an empty pool (409) and rejects a pool smaller than `questions_per_attempt`
(409) — a published quiz students could theoretically attempt should always
have enough questions to actually serve one. This is the one piece of
business logic in Phase 4 that goes beyond "store what the teacher typed."

**Duplicate** copies quiz settings and the entire pool (same `question_id`s,
not new question rows) into a new `draft` quiz owned by whoever clicked
Duplicate — not necessarily the original author (an admin duplicating a
teacher's quiz makes sense) — inside one `db.transaction()`.

**Pool editing replaces the whole set** (`setQuizQuestionPool`: delete all,
re-insert), the same pattern `question.service.ts` uses for
`question_options` — simpler than diffing and just as correct at the scale
a quiz's pool actually reaches. `quiz-question-picker.tsx` batches all
add/remove/reorder actions into one edit buffer client-side, sent as a
single `PUT /api/quizzes/:id/questions` on Save, rather than firing a
request per click.

**RBAC and free-text `subject`** follow the same reasoning as the question
bank (Section 6): `admin`/`teacher` only, no fixed subject list.

## 8. Import pipeline (Phase 5)

```text
CSV file ──┐
Excel file ─┼──► {headers, rows}  ──►  preview + auto-mapped columns  ──►  commit
Google Sheet┘      (parser)              (Redis session, TTL 30 min)      (PostgreSQL)
```

**All three sources converge on one `{headers, rows: Record<string,string>[]}`
shape** (`backend/imports/csv-parser.ts`'s `ParsedFile` type) before anything
downstream ever sees them — `parseCsv` (papaparse), `parseExcel` (exceljs),
and `rowsToParsedFile` (Google's `values.get()` 2D array) are the only
places that know their source format exists. Everything after that —
column mapping, per-row validation, preview, commit — is one pipeline
(`backend/imports/import.service.ts`), not three parallel ones. This is
also why "Map columns," listed under Google Sheets in Section 8, applies
equally to a CSV upload with unexpected header names: mapping is a
pipeline-level concept, not a Google-specific one.

**The preview → remap → commit loop's working state lives in Redis, not
PostgreSQL** (`backend/imports/import-session.ts`) — the same reasoning as
Phase 1 sessions (Section 4): it's disposable (re-upload regenerates it),
short-lived (30-minute TTL), and every mapping change just re-runs
validation against data already sitting in memory, no DB round trip. Only
`commitImport` writes to PostgreSQL, and it does so once, atomically per
row (see below) — there is no partially-imported row sitting in the
database while a teacher is still adjusting the mapping.

**Per-type validation is reused from Phase 3, not reimplemented.** A row's
`correct_answer` cell (a letter like "a", or "a,c" for multiple answer, or
literal text for short answer) gets converted into the same
`{text, isCorrect}` option shape `question.service.ts` expects, then handed
to `questionInputSchema.safeParse()` — the identical discriminated-union
validator Phase 3's UI uses. `import-row.schema.ts` only adds the checks
that schema _can't_ do: matching a spreadsheet letter against which options
are actually present (`"Invalid correct answer"`), duplicate detection, and
defaulting absent optional cells (`points` → 1, unrecognized `difficulty` →
`medium`) rather than rejecting them — the six validations Section 8 lists
by name (missing question/answer, invalid correct answer, invalid points,
duplicate questions, invalid type) are implemented explicitly with those
exact error strings; everything else falls out of reusing the question
schema.

**Duplicate detection is two-tier**: `parseImportRow`'s `seenQuestions` set
catches duplicates _within_ a batch (pure, no DB access, unit-tested
directly); `commitImport` separately checks pooled rows against every
non-deleted question already in the bank (`subject + text`, case-
insensitive) right before writing, since a within-batch check alone would
miss re-importing the same file twice.

**Each valid row commits as its own transaction** (`commitImport` calls
`createQuestion` — Phase 3's function, unmodified — in a loop) rather than
one transaction for the whole batch. A bulk import is expected to have
partial success (some rows valid, some not); wrapping the entire commit in
one transaction would mean a single bad row rolling back every row that
already succeeded, which is the opposite of what "show import errors
clearly" (Section 8) implies the teacher wants.

**`imports`/`import_errors` are an audit trail, not in-progress state** —
a row is only written once, at the end of a successful commit, recording
the final counts and (for failed rows) the exact message and raw source
data. There's no "pending" import row; if `commitImport` never gets called,
nothing is written to PostgreSQL at all, which is correct — an abandoned
preview shouldn't leave a trace.

**Google Sheets uses an access-token-only OAuth flow** (`google-sheets
.service.ts`): no refresh token, no `access_type: "offline"`, because this
integration only needs Sheets access for the duration of one import
session, not a persistent connection — the token lives in Redis for ~55
minutes (Google's access tokens last ~60), tied to the user, not persisted
in PostgreSQL. The OAuth `state` parameter (Section 25's CSRF protection,
applied to a flow `same-origin.ts` can't cover — Google's redirect back to
`/api/imports/google/callback` is a genuine cross-site navigation, not a
same-origin fetch) is a random value round-tripped through an httpOnly
cookie, verified on callback before any token exchange happens.

**This integration requires a real Google Cloud OAuth app** (Client ID/
Secret) that this development environment does not have configured — every
function that needs one fails with a clear 409
("Google Sheets import is not configured on this server") rather than a
confusing downstream error, and `README.md` — "Google Sheets import setup"
documents exactly what to create in Google Cloud Console to enable it. As a
result, **the OAuth flow, spreadsheet listing, and sheet reading have not
been exercised against Google's live APIs** — only the pure, credential-free
pieces (`rowsToParsedFile`'s row-to-record conversion) have real test
coverage. CSV and Excel import are fully verified end to end, including a
live HTTP walkthrough through preview → remap → commit.

## 9. Student management (Phase 6)

```text
Admin ──creates──► users (admin/teacher/student)
Teacher ──creates──► classes ──enrolls──► students (via class_students, Phase 2)
Teacher ──assigns published quiz──► a class OR an individual student ──► quiz_assignments
Student ──sees──► assignments resolved through direct grant + class membership
```

**Account provisioning is admin-only** (`backend/users/user.service.ts`,
`/api/users`) — there is still no public self-registration (Section 14
carries this forward). Creating a user inserts into `users` and, inside the
same transaction, the matching `teachers` or `students` subtype row (Section 5) — an admin account has neither. Role is immutable after creation (no
`PATCH` field for it): changing a live account's role would mean deciding
what happens to its `teachers`/`students` row and everything hanging off it,
which nothing in the spec asks for.

**Every user-facing response is an explicit column projection, never a raw
`users` row.** `user.service.ts` defines `publicColumns` (id, email, name,
role, status, createdAt, updatedAt — no `passwordHash`) and every read,
insert-returning, and update-returning uses it. This was a deliberate
correction during the phase's own HTTP verification pass: the first cut used
`db.select()`/`.returning()` with no column list, which — like `question
.service.ts` and `quiz.service.ts` before it — returns every column,
including `passwordHash`. Those services return DB rows because nothing they
touch is ever sensitive; `users` is the first table in this codebase with a
secret column, and selecting an explicit projection (not filtering the
object after the fact) is the pattern going forward for any table that ever
gains one.

**Classes are a shared org resource, not per-teacher-siloed** — consistent
with quizzes (Section 7) and questions (Section 6), any admin or teacher can
create, rename, or manage the roster of any class; `classes.teacher_id`
(Section 5) records an owner for display and defaults new classes to their
creator, but nothing in the API enforces exclusive access. Roster changes
(`class_students`, Phase 2's composite-PK join table) are immediate inserts/
deletes, not a staged "save roster" step — unlike the quiz question pool
(Section 7), there's no ordering or replace-all semantics to batch.

**`quiz_assignments` (new table this phase) links a published quiz to
exactly one class or one student, enforced by a database `CHECK` constraint**
(`(class_id IS NOT NULL AND student_id IS NULL) OR (class_id IS NULL AND
student_id IS NOT NULL)`), not just Zod's `.refine()` on the request body —
the same "don't trust application code alone for an invariant the database
can guarantee" reasoning as Section 5's partial unique indexes. Two more
partial unique indexes prevent assigning the same quiz to the same class (or
same student) twice. `createAssignment` also re-checks quiz status
server-side (`status = 'published'`) — a quiz can be unpublished after being
assigned (to fix a question, say) without deleting existing assignments, but
a _new_ assignment always requires the quiz to be published first.

**A student's assignment list resolves two sources into one view**
(`listAssignmentsForStudent`): rows assigned directly to their `student_id`,
and rows assigned to any `class_id` they're enrolled in (via `class_students
`). Both are real, independent `quiz_assignments` rows — a student can see
the same quiz twice if they're both directly assigned and in an assigned
class, which is correct, not a bug to deduplicate away. This function only
returns assignments for quizzes still `published` — an assignment to a quiz
that's since been unpublished or deleted quietly stops appearing rather than
erroring, since Phase 7 (exam-taking) is what actually needs to reject a
stale attempt.

## 10. Exam engine (Phase 7)

```text
Student ──starts──► exam_attempts (server picks deadlineAt = now + duration,
                     samples questions from the pool into exam_attempt_questions)
Student ──answers──► exam_answers (upserted per question, ungraded)
Student ──submits, or deadline passes──► gradeAttempt() ──► score/maxScore/passed written once
```

**The server is the only clock and the only grader — Rule "never trust
client-side score or timer" is load-bearing here, not a slogan.**
`deadlineAt` is computed once, server-side, at `startAttempt`
(`backend/attempts/attempt.service.ts`) as `startedAt + quiz.durationMinutes`.
The client (`features/attempts/exam-attempt.tsx`) only ever renders a
countdown to that fixed instant — it never reports elapsed time back to the
server. Every mutating request (`saveAnswer`, `submitAttempt`, even `GET
/api/attempts/:id`) re-checks `now > deadlineAt` against the server's clock
before doing anything else; there is no client-supplied field the server
trusts for either the remaining time or the score. Grading
(`backend/answers/answer.service.ts#gradeAttempt`) reads `question_options
.is_correct` (Section 6) directly — the client never receives correctness
data until the attempt is finished (see below), so there is nothing for a
modified client to leak early.

**An attempt's question set and option order are a frozen snapshot, not
computed at render time.** `startAttempt` samples `quiz.questionsPerAttempt`
questions from the pool once — a JS Fisher-Yates shuffle when
`randomizeQuestions` is on, the pool's stored `position` order otherwise
(Section 7's questions_per_attempt comment forward-declared exactly this) —
and writes the result to `exam_attempt_questions`, one row per question with
its `position` in this attempt and its `option_order` (shuffled per attempt
when `randomizeOptions` is on). Every subsequent read replays that stored
order. This is what makes reloading the exam page mid-attempt show the exact
same questions in the exact same order, and what makes grading unambiguous
about which option the student was actually looking at when they answered.

**Expiry is lazy, not a background job.** There is no cron/worker checking
for overdue attempts — Phase 0's rule against introducing infrastructure
before load testing justifies it applies here too. Instead, `maybeExpire()`
runs at the top of every attempt-touching function
(`getAttempt`, `requireActiveAttemptForAnswering`, and implicitly
`submitAttempt`, which treats "already finished" as a no-op): if the status
is still `in_progress` and the deadline has passed, it grades and closes the
attempt right there before doing anything else. In practice this means an
attempt is graded either when the client's own countdown hits zero and calls
`/submit`, or — if the student never comes back — the next time anything
touches that attempt row. `auto_submitted` vs. `submitted` records only
which of those happened; grading is identical either way.

**Submitting is idempotent by design**, not by accident: `submitAttempt`
returns the existing attempt unchanged if it's already finished rather than
re-grading or erroring. This absorbs the inherent race between the client's
timer firing `/submit` and a `GET` request that happened to land a moment
earlier and lazily expired the same attempt — whichever request finalizes it
first wins, and the other just reads back the same result.

**Grading is all-or-nothing per question, not partial credit**: a
`multiple_answer` question awards its full points only if the selected
option-id set exactly equals the correct set (Section 6); one missed or one
extra selection scores zero for that question, matching the spec's five
question types without adding a partial-credit model nothing asked for.
`short_answer`/`fill_in_blank` grading reuses the same "every option row is
an accepted variant" convention Section 6 and the import pipeline (Section 8)
already established — a case-insensitive, trimmed match against any accepted
answer counts as correct.

**`exam_answers` gets a row for every snapshot question at grading time, not
just answered ones** — an unanswered question is graded as incorrect
(0 points) rather than silently absent, so the post-submit review always has
exactly one row per question the student saw, whether they answered it or
not.

**Answer-stripped until finished, and only if the quiz allows it**:
`getAttempt`'s `reviewAvailable` flag is `status !== 'in_progress' &&
quiz.showResults` — the same `quizzes.show_results` setting from Section 7,
respected for the first time now that there's something to show. While
`reviewAvailable` is false, `AttemptQuestionOption.isCorrect` is omitted
entirely from the JSON response (not sent as `false` or `null`) — the same
"explicit projection, never leak the sensitive column" discipline Section 9
established for `passwordHash`, applied here to correct-answer data instead
of a secret column.

**Starting an attempt re-derives eligibility from the assignment system
(Section 9) on every call, never from a cached flag**: `startAttempt` calls
`listAssignmentsForStudent` fresh and requires at least one currently-open
assignment (direct or via class, resolved the same way the student dashboard
resolves it) for that quiz, plus `quiz.status === 'published'`, plus
`attemptCount < quiz.maxAttempts`. Resuming an already-in-progress attempt
skips all three checks deliberately — a quiz being unpublished or an
assignment window closing mid-attempt shouldn't strand a student who already
started, only block starting a _new_ one (see the ordering comment in
`startAttempt`).

## 11. Exam monitoring (Phase 8)

```text
Quiz settings: fullscreen_required, monitor_activity  (stored since Phase 4, enforced now)
                          │
                          ▼
Student's browser observes its OWN tab only:
  fullscreenchange → exit           (only when fullscreen_required)
  visibilitychange → tab hidden     (only when monitor_activity)
  copy / cut event                  (only when monitor_activity)
                          │
                          ▼
POST /api/attempts/:id/violations  ──►  exam_violations (fire-and-forget, best-effort)
                          │
                          ▼
Teacher: /teacher/quizzes/:id/attempts[/:attemptId]  — list + per-attempt review
```

**Every violation type is something the page can honestly say about itself —
never a claim about the rest of the student's machine.** This is a direct
requirement, not a nice-to-have: the three types in `violation_type`
(`fullscreen_exit`, `tab_switch`, `copy_paste`) all come from standard
browser page-lifecycle events (`fullscreenchange`, `visibilitychange`,
`copy`/`cut`) that fire regardless of what's actually running outside the
tab. There is no attempt to detect other applications, background
processes, or a second monitor — anything beyond "this page is no longer
frontmost/fullscreen, or a copy happened" would require capabilities a
browser sandbox doesn't grant and the spec is explicit is off-limits. The
student is told exactly this before it starts watching — the disclosure
banner in `exam-attempt.tsx` names the two things being observed and says
plainly that nothing outside the tab is seen.

**Violation reporting is fire-and-forget by design.** `reportViolation()`
increments the on-screen counter immediately (optimistic, so the student
always sees an accurate live count regardless of network conditions) and
POSTs in the background; a failed request is swallowed, not retried — a
dropped violation report is a monitoring gap, not a correctness bug, and
retrying mid-exam risks contending with answer-saving traffic for no
benefit (Section 10's `saveAnswer` autosave already accepts the same
trade-off for the same reason).

**`fullscreen_required` blocks progress; `monitor_activity` doesn't.**
When a quiz requires fullscreen, `exam-attempt.tsx` renders a gate screen
in place of the questions until `document.fullscreenElement` is set —
entering fullscreen needs a user gesture, so the gate's button click is
that gesture. The countdown keeps running behind the gate (visible, not
hidden) so there's no way to "pause" an attempt by refusing to enter
fullscreen. Losing fullscreen mid-exam re-shows the same gate and logs
`fullscreen_exit`. `monitor_activity`, by contrast, only ever logs and
warns — a tab switch or copy doesn't block anything, since unlike
fullscreen there's no browser API to force a tab to stay focused, and
pretending otherwise would violate the same honesty requirement.

**The teacher-facing review is a new capability this phase adds, not
carried over from Phase 7** — until now, nothing let a teacher see an
individual student's attempt at all. `backend/monitoring/monitoring
.service.ts` exposes `listAttemptsForQuiz` (roster-style summary with a
violation count per attempt) and `getAttemptDetailForTeacher` (full
per-question review plus the violation timeline), both scoped to
admin/teacher and independent of the student-facing `attempt.service.ts`
to avoid coupling the two call directions together (Section 7's read for
why `backend/answers` and `backend/attempts` are already split along
similar lines). Unlike the student's own view, the teacher's review always
shows correctness — `quizzes.show_results` governs what a student sees of
their own attempt, not what a teacher reviewing it sees.

**This is not the realtime piece.** A teacher only sees violations by
opening the attempt page — there is no live-updating view, no push
notification the moment a violation happens, and no "who's currently
testing" dashboard. That's Phase 9, deliberately layered on top of working
detection + storage rather than built alongside it.

## 12. Realtime monitoring (Phase 9)

```text
src/realtime/server.ts  (separate Node process, own port — REALTIME_PORT, default 4001)
  │
  ├─ Socket.IO, auth middleware: reuses the Redis session token (Section 4),
  │  read from the handshake's Cookie header, no second auth scheme
  │
  ├─ Rooms: quiz:<quizId> (teacher/admin, one per quiz being watched)
  │          attempt:<attemptId> (the owning student only, presence-only — no
  │          server→student traffic is ever sent to this room)
  │
  ├─ Presence: in-memory Map<quizId, Map<attemptId, {studentId, studentName}>>,
  │  updated on join:attempt / leave:attempt / disconnect, broadcast to quiz:<id>
  │
  └─ Redis Pub/Sub subscriber on "realtime:events" ──► re-validates each message
     against realtime-event.schema.ts ──► io.to(`quiz:${quizId}`).emit("event", …)

Next.js app (any process)
  │
  └─ backend/{attempts,answers,monitoring}/*.service.ts ──► publishRealtimeEvent()
     (backend/realtime/realtime.service.ts) ──► redis.publish("realtime:events", …)
```

**Why a separate process, concretely** (Section 1 has the "what the docs
say"; this is "what it costs"): the Next.js app and the realtime server
share almost everything that matters — the same PostgreSQL database, same
Redis instance, same session mechanism, same `src/database/schema` and
`src/backend` modules where they're portable — so splitting the process
doesn't mean duplicating logic. What it does mean: a request handled by one
Next.js app server can't push a Socket.IO event on behalf of a _different_
app server's socket connections directly, so the two sides need a bus
between them. Redis Pub/Sub is that bus, and it was already a dependency
(Rule 8) — no new infrastructure, just a new channel on it.

**Every module the realtime server imports is deliberately portable**:
`src/lib/env.ts`, `src/lib/redis.ts`, `src/lib/db.ts`, `src/database/schema`,
`backend/auth/session-lookup.ts`, and `backend/realtime/realtime-event
.schema.ts` all avoid `"server-only"` and any `next/*` import, the same
discipline `backend/auth/password.ts` and the database seed scripts already
followed for the same reason (Phase 0/1) — a plain Node process outside
Next's bundler can't resolve either. `backend/auth/session.ts` itself
(cookie handling via `next/headers`) is _not_ portable and is not imported
here; `session-lookup.ts` was split out of it this phase specifically to
share the token→user Redis lookup without the Next-only parts. `SESSION_COOKIE_NAME`
is duplicated as a literal in `src/realtime/server.ts` rather than imported,
same as `src/proxy.ts` already does, for the same reason: importing
`session.ts` would pull in `next/headers` and fail outside a Next request.

**The realtime event contract is validated twice, at both ends of the
Redis hop.** `backend/realtime/realtime-event.schema.ts` is pure Zod, no
side imports, shared by the publisher (which doesn't validate its own
output — TypeScript already guarantees the shape at the call site) and the
subscriber (which does re-validate, with `safeParse`, before ever emitting
to a browser) — Redis Pub/Sub carries whatever bytes were published, so the
schema is what stops a malformed message from reaching a teacher's client
as-is, the same reasoning Section 8's import pipeline applies to untrusted
file contents.

**Presence is derived from live socket connections, not stored anywhere
persistent.** A student's browser opens the realtime connection and emits
`join:attempt` when the exam page mounts (`features/attempts/exam-attempt
.tsx`) — the server verifies that attempt actually belongs to the connecting
user against PostgreSQL before adding them to presence, never trusting a
client-asserted id pairing. Because the shared socket
(`features/realtime/socket-client.ts`) survives client-side navigation, an
explicit `leave:attempt` event (emitted on unmount, and by the submit flow)
handles "the student navigated away without closing the tab," while
`disconnect` handles the tab actually closing — both converge on the same
cleanup path. This is single-process, in-memory state, which is fine for
one realtime server instance; making it survive multiple instances (a
Redis-backed presence set, or the `@socket.io/redis-adapter` package) is
exactly the kind of infrastructure Rule 14 says not to add before load
testing shows it's necessary.

**Events, not a generic pipe**: the channel carries exactly three
discriminated event types (`attempt_started`, `attempt_submitted`,
`violation`) — the same three moments Phase 7/8 already made visible via
polling (the historical `/teacher/quizzes/:id/attempts` view). Phase 9 adds
_when_, not _what_ — a teacher watching live sees the identical information
the post-hoc review already showed, just as it happens rather than only on
next page load.

**Verification note**: `pnpm test`/`pnpm test:integration` cover the event
schema and the publish side (`realtime.service.test.ts` asserts a real Redis
subscriber receives exactly what was published) — deliberately not a full
Socket.IO client/server integration test, since spinning up real WebSocket
connections inside the Vitest suite would test the `socket.io` library more
than this codebase's logic. The full pipeline (auth rejection, room-scoped
RBAC, presence join/leave, live event delivery from an HTTP request through
Redis to a connected browser-equivalent client) was verified live with a
`socket.io-client` script driving real authenticated connections against
both running processes — same category of "verified live, not by an
automated suite" as Phase 5's Google OAuth flow.

## 13. Results (Phase 10)

```text
backend/results/results.service.ts
  ├─ getQuizResults(quizId)   ──► exam_attempts (score distribution, pass rate)
  │                           ──► exam_attempt_questions ⋈ exam_answers (per-question difficulty)
  └─ getClassResults(classId) ──► class_students ⋈ quiz_assignments ⋈ exam_attempts
                                  (per-quiz pass rate among one class's roster)
```

**No new table — results are computed live off `exam_attempts`/
`exam_answers`, not stored in a separate `quiz_results` table.** Earlier
phases' forward references (Section 14, Section 20) mentioned `quiz_results`
as a placeholder name for "wherever results data ends up"; having built the
actual feature, a denormalized table isn't needed — `exam_attempts` already
holds exactly the score/maxScore/passed fields Section 10's grading writes
once at submission, and re-aggregating a `GROUP BY`-sized query on read is
simpler and has no sync-drift risk. This is the same call Section 9 already
made for assignments and Section 10 for attempts: don't add a table (or
schema field) that duplicates data another table already owns.

**Two aggregation shapes, not one generic "reports" abstraction**:
`getQuizResults` answers "how did this quiz go" (score distribution,
per-question difficulty, pass rate across every finished attempt);
`getClassResults` answers "how is this class doing" (per-quiz pass rate,
scoped to one class's roster, only counting quizzes actually assigned to
that class). They're deliberately separate functions with separate return
shapes rather than one parameterized "give me results for X" function —
the two questions a teacher actually asks are different enough (one quiz
across all takers vs. one class across all its quizzes) that forcing a
shared shape would just add indirection Section 2's "thin route → service"
pattern doesn't need.

**Per-question difficulty only counts finished attempts, and only
attempts where the question was actually drawn.** Because Section 7's
`questions_per_attempt` can be smaller than the pool, and Section 10's
sampling sends different students different subsets, a question's
`timesAsked` in the results view is "how many finished attempts happened to
include it," not "how many attempts this quiz has" — an unanswered
question inside an in-progress attempt isn't counted at all (it has no
`is_correct` yet), matching the same "grade once, at submission" boundary
Section 10 already established.

**CSV export (`GET /api/quizzes/:id/results/export`) reuses `papaparse`**,
already a dependency for CSV import (Section 8), via its `unparse()`
direction — one small route handler, no new `backend/reports/` module. A
`reports/` folder was forward-declared in earlier phases' folder-structure
notes as a placeholder for "whatever exporting needs eventually"; a single
CSV formatter inline in the route turned out to be the entire need, so no
new module exists for it — same "don't pre-scaffold empty" rule the folder
structure section has followed since Phase 0.

**Chart rendering is CSS bars, not a charting library.** The score
distribution and per-question difficulty visuals in
`app/teacher/quizzes/[id]/results/page.tsx` are `<div>` elements with a
`style={{ width: ... }}` percentage — no `recharts`/`chart.js`/shadcn chart
component added as a dependency. Five score buckets and a handful of
per-question bars don't need an interactive charting library's feature set
(tooltips, zoom, animated transitions); a static, server-rendered bar reads
identically to a "real" chart at this data scale and keeps the results page
fully server-rendered with no client JS at all.

## 14. Security hardening (Phase 11)

Every phase's own "Security posture" section (now consolidated into Section 20) has been deferring one line to this phase: _"a full audit... happens in
Phase 11."_ This section is that audit — what it covered, what it found,
and what it deliberately still leaves for a later phase.

### HTTP security headers

`next.config.ts` now sets, on every response (`headers()`, matching
`node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md`'s
own "Without Nonces" example almost verbatim):

- **`Content-Security-Policy`**: `default-src 'self'` plus explicit
  allow-lists per resource type, `object-src 'none'`, `frame-ancestors
'none'` (this is what actually blocks clickjacking now — CSP's own docs
  say it supersedes `X-Frame-Options`, which QuizGuard doesn't set), and
  `connect-src 'self' <realtime origin>` so the browser is allowed to open
  the Section 12 WebSocket connection at all.
- **`X-Content-Type-Options: nosniff`**, **`Referrer-Policy: strict-origin
-when-cross-origin`**, **`Permissions-Policy`** denying camera/microphone
  /geolocation/payment (none of which this app uses — an explicit deny
  means a future bug can't accidentally request one), and
  **`Strict-Transport-Security`** (harmless to set now; browsers only act
  on it over HTTPS, which is Phase 13).
- **`poweredByHeader: false`** removes `X-Powered-By: Next.js`.

**Nonce-based CSP (the stricter alternative the same doc describes) was
considered and deliberately not used.** It would block Radix UI's inline
`style` attributes (positioning popovers/dialogs/selects — confirmed by
inspecting how `components/ui/select.tsx` etc. render) unless `style-src
-attr` is separately relaxed anyway, and it requires careful interaction
with whatever reverse proxy eventually sits in front of this app (a nonce
must never be cached or reused across requests) — that proxy doesn't exist
until Phase 13. `script-src 'unsafe-inline'` is required regardless of
which approach is used, since Next.js itself emits inline `<script>` tags
to embed the RSC/hydration payload (the docs' own simpler example includes
it for exactly this reason). Given this app has no inline-script injection
vector today (next paragraph), the marginal defense-in-depth nonces would
add over the static policy didn't justify the added operational coupling
to infrastructure that isn't built yet — revisit once Phase 13 exists.

### What the audit actually checked

- **XSS**: grepped the entire `src/` tree for `dangerouslySetInnerHTML`,
  `innerHTML`, `document.write`, and `eval(` — zero matches. Every piece of
  user-supplied text (question text, quiz titles, student names, ...) is
  rendered through React's default text-node escaping; there is no
  injection point for this audit to have found.
- **RBAC completeness**: every one of the 45 `route.ts` files under
  `src/app/api/` was checked for a `requireApiUser` call. Three don't have
  one, and all three are correctly, deliberately public: `/api/health`
  (Phase 0, no sensitive data), `/api/auth/login` (can't require a session
  to create one), and `/api/auth/logout` (idempotent, `same-origin.ts`
  -gated, no benefit to an attacker beyond forcing a log-out). The Google
  OAuth callback (Section 8) does call `requireApiUser` inside its
  handler, alongside its own `state`-parameter check.
- **GET-safety / CSRF**: `SameSite=Lax` (Section 4) protects `POST`/`PUT`/
  `DELETE` from cross-site forgery, but explicitly does _not_ protect
  `GET` — a `GET` route with a side effect would be forgeable by nothing
  more than an `<img>` tag on a malicious page. Auditing every `GET`
  handler (and every backend function it transitively calls) for a write
  found exactly one: `GET /api/attempts/:id` → `getAttempt()` →
  (previously) `maybeExpire()` → a database `UPDATE` grading the attempt,
  whenever a student reopened a past-deadline attempt. **Fixed**:
  `getAttempt` (`backend/attempts/attempt.service.ts`) no longer calls
  `maybeExpire` — it returns the attempt exactly as stored, mutating
  nothing. `deadlineAt` alone is enough for the client to notice it's over;
  `exam-attempt.tsx`'s existing countdown effect fires the real `POST
/submit` within about a second of loading a page whose deadline has
  already passed, which is where finalization now always happens. If
  nothing ever touches an abandoned attempt again, it simply stays
  `in_progress` until `startAttempt`'s own expiry check closes it out the
  next time that student tries to begin a new one — a display-staleness
  question, never a dangling-state one. `tests/integration/attempt.service
.test.ts` was updated to assert the new (correct) behavior: a `GET` on
  an expired attempt leaves it `in_progress`, and only an explicit
  `submitAttempt` call grades it.
- **Dependency audit**: `pnpm audit` found two moderate transitive
  vulnerabilities — `esbuild` (via `drizzle-kit`'s outdated `@esbuild-kit`
  dependency) and `uuid` (via `exceljs`). Neither is called directly by
  application code, but both have patched versions; `pnpm-workspace.yaml`'s
  `overrides` field forces them project-wide without touching
  `package.json`'s own dependency versions. Verified clean afterward
  (`pnpm audit` → "No known vulnerabilities found") and re-ran the full
  test suite plus `pnpm db:generate` (exercises `drizzle-kit`/`esbuild`)
  to confirm neither override broke anything.
- **Secret handling**: grepped every `console.log`/`console.error` call —
  none log a password, session token, or request body; `api-response.ts`'s
  `console.error(error)` is server-side-only operational logging (Sentry,
  Phase 11's other reserved env var, would eventually structure this) and
  was already confirmed in Section 4 to never reach the client.
- **`any` usage**: zero occurrences of `: any` or `as any` anywhere in
  `src/`, and confirmed `@typescript-eslint/no-explicit-any` is configured
  at error severity (not just warning) in the resolved ESLint config — so
  this isn't luck, it's enforced.

### Rate limiting, expanded to its originally-named targets

Section 4 already noted `checkRateLimit` was "built to be reused by every
future endpoint Section 31 calls out (exam start, event sync, imports,
file upload)." This phase wires it into exactly those three route groups
(file upload and imports being the same endpoints):

- `POST /api/quizzes/:id/attempts` (exam start) — 20 / 5 min, keyed per
  student.
- `POST /api/attempts/:attemptId/violations` (event sync) — 60 / 5 min,
  keyed per student; deliberately generous, since legitimate rapid tab
  -switching or a flaky reconnect can fire several of these in a row during
  a real exam and a false-positive block mid-exam would be worse than a
  generous ceiling.
- `POST /api/imports/preview` and `POST /api/imports/:sessionId/commit`
  (imports / file upload) — 10 / 10 min, keyed per teacher, sharing one
  bucket across both since they're the same abuse surface.

All three reuse the identical `checkRateLimit` fixed-window function
`login` already used — no new mechanism, just new call sites. Verified
live: 11 rapid `POST /api/imports/preview` calls from one teacher session
returned `200` for the first 10 and `429` for the 11th.

Deliberately **not** rate-limited this phase: every admin/teacher CRUD
endpoint (users, classes, quizzes, questions) — lower-volume, higher-trust
-role operations where Section 31's named list didn't ask for it, and
`PUT /api/attempts/:id/answers` (answer autosave) — legitimately fires
many times per exam (every keystroke, debounced) and wasn't in the named
list either; rate-limiting it risks blocking a student's own answers mid
-exam for no corresponding abuse benefit.

### What this phase deliberately still defers

- **Request body size limits** on JSON-accepting routes (as opposed to the
  file-upload routes, which already check `Content-Length` — Section 8).
  Next.js Route Handlers have no documented `next.config.ts`-level body
  -size option the way Server Actions do (`serverActions.bodySizeLimit`);
  the standard place to solve this for a Next.js deployment is the reverse
  proxy in front of it (Nginx's `client_max_body_size`), which is Phase
  13's job, not built yet. Nearly every route already requires
  authentication before parsing its body (narrowing who could even attempt
  an oversized payload), and the one always-public route (`login`) is
  already gated by `same-origin.ts` and rate-limited before its body is
  ever read.
- **Socket.IO connection/event-level rate limiting** on the realtime
  server (Section 12) — an authenticated user could still open many
  connections or spam `join`/`leave` events. Not in Section 31's named
  list, and exactly the kind of abuse-under-load question Phase 12's load
  testing is positioned to actually measure before deciding what (if
  anything) needs throttling.
- **A CSRF double-submit token system** — unchanged from Section 4's
  original call: `SameSite=Lax` plus `same-origin.ts` remains the
  proportionate defense for what's exposed; this audit didn't find a
  reason to revisit that.

## 15. Performance & load testing (Phase 12)

Every earlier phase deferred a scaling question with some version of "don't
add infrastructure until load testing shows it's necessary." This phase is
that load testing. Four scripts under `scripts/load-test/` — `seed.ts`,
`exam-flow.ts`, `realtime-connections.ts`, `cleanup.ts` — were written,
run against a **production build** (`pnpm build`, then
`node .next/standalone/server.js`), not `next dev`. Dev mode's on-demand
compilation and lack of optimization were confirmed (by literally running
the same test against both) to produce latency numbers with no relationship
to real capacity — e.g. the identical 150-student flow completed 48/150
under `next dev` and only got worse once corrected for; the numbers below
are all against the production build. The synthetic data the scripts create
was torn down again with `cleanup.ts` once testing finished — the scripts
themselves remain in the repo for reuse.

### What was tested and how

- **`seed.ts`** creates 150 synthetic student accounts, a class, a
  10-question pool, a published quiz assigned to that class, and a batch of
  historical graded attempts (for the results-aggregation test below) — all
  direct `db.insert()` calls, not through the `backend/*` service layer,
  since those files carry a `"server-only"` guard that throws
  unconditionally outside Next's bundler (same reasoning as
  `session-lookup.ts`, Section 12).
- **`exam-flow.ts`** simulates all 150 students logging in and taking the
  quiz concurrently through the live HTTP API (login → start attempt →
  fetch questions → answer each → submit) — the same request path real
  traffic takes, not a shortcut through the service layer. The login rate
  limiter buckets by `x-forwarded-for` (Section 14), which collapses to one
  shared "unknown" bucket with no reverse proxy in front of it locally; the
  script assigns each simulated student a distinct synthetic IP via that
  header so the test measures exam-flow throughput rather than
  re-discovering the login rate limit as a local-only artifact.
- **`realtime-connections.ts`** connects one teacher socket plus 150 student
  sockets to the realtime server (Section 12) concurrently and checks the
  presence broadcast reflects all of them.
- **`cleanup.ts`** removes everything the above created, in
  foreign-key-safe order (`exam_attempts` → `quizzes` → `questions` →
  `classes` → `users`) — several of those relationships are deliberately
  `ON DELETE RESTRICT` (Section 5/9), so getting the order wrong fails
  loudly rather than silently.

**Stated plainly**: this is one dev laptop (8 cores, Docker Desktop's
default resource limits on Postgres/Redis) running the app and the load
generator on the same machine, competing for the same CPU, with no network
hop to the database. The absolute latency numbers below are not a
production capacity estimate — nothing about this topology resembles a real
deployment (separate app servers, a real network, multiple instances behind
a load balancer). What the exercise found are structural bottlenecks that
would reproduce at any scale, and the relative effect of fixing them.

### Finding 1: bcryptjs blocked the event loop under concurrent logins — fixed

The first `exam-flow.ts` run against 150 concurrent students collapsed
almost completely — only 28-48/150 completed the full flow, the rest timing
out or receiving `500`s. The server log pointed at Postgres:
`Error: timeout exceeded when trying to connect`. That diagnosis was wrong.
Isolating the two suspects — 30 concurrent hits to `/api/health` (no DB
query beyond a trivial check, no bcrypt) vs. 30 concurrent logins — showed
Postgres handling the former in ~0.2s flat with zero errors, while logins
took 7-8s with roughly a third failing outright.

The actual cause: `bcryptjs` (pure JavaScript, no native binding) hashes on
Node's single event-loop thread despite exposing a Promise-based "async"
API — its chunking via `setImmediate` still runs real CPU work on that one
thread. Twelve salt rounds costs roughly 200-300ms of wall-clock CPU per
compare; 150 of those queued onto one thread don't parallelize, they
serialize — and while the thread is busy grinding through bcrypt for one
request, it can't service the tick that would resolve an _already-finished,
already-fast_ Postgres query for another. Queued connection-pool
acquisitions timed out waiting for a JS tick that never came in time,
misattributing the failure to the pool.

**Fix**: swapped `bcryptjs` for `@node-rs/bcrypt` in
`src/backend/auth/password.ts` — a native (prebuilt-binary, no build
toolchain required on Windows) addon that runs the hash on a libuv worker
thread instead of the main one. Same `hash`/`verify` API shape, so the
change is contained to one file. Re-running the identical 30-concurrent
-login reproduction went from ~8s with ~30% failures to **3.3s with zero
failures**.

### Finding 2: `pg.Pool` was sized too small for a genuine simultaneous burst — tuned

With bcrypt off the main thread, the full 150-student `exam-flow.ts` run
improved to 144/150 completing, but the remaining failures were now
_genuinely_ pool-related (`Connection terminated due to connection
timeout`), spread across several different queries (login, get-attempt,
list-assignments) rather than concentrated at one step — consistent with
real contention, not an artifact of the bcrypt bug. `pg.Pool`'s `max` was
10 (`src/lib/db.ts`); Postgres itself allows `max_connections = 100`
(checked directly with `SHOW max_connections`), and Docker Desktop reported
~5.68 GiB / 8 cores of headroom on the container, so there was room to
raise it. Bumped to **20** — five app instances' worth of headroom within
Postgres's own ceiling, a deliberately conservative multiple rather than
maxing out one process's share of it.

When multiple app servers exist (Phase 13+), total connections to
PostgreSQL is `pool.max × number of app instances` — that product, not
either number alone, is what to watch when deciding whether PostgreSQL
eventually needs a connection pooler like PgBouncer in front of it; nothing
in this phase's testing (one instance) showed that need yet.

### Finding 3: the results-aggregation query is not a bottleneck

`results.service.ts`'s `getQuizResults` — flagged as worth profiling back
in Section 13 — was checked with `EXPLAIN ANALYZE` against the seeded data
(1,166 attempts × 10 questions = 11,660 `exam_attempt_questions` rows, all
through the same quiz). The three-way join
(`exam_attempt_questions` ⋈ `exam_attempts` ⋈ `questions`, left-joined to
`exam_answers`) ran in **34.8ms** for 11,640 result rows. The planner chose
sequential scans over the available indexes (`exam_attempts_quiz_id_idx`
etc.) — correctly: at this data volume nearly every row in
`exam_attempt_questions`/`exam_answers` belongs to the quiz being queried,
so a full scan is cheaper than tens of thousands of individual index
lookups. No index or query change was made; there was no evidence one was
needed.

`getClassResults` runs one query per quiz assigned to the class, in a loop
(an N+1 pattern across _quizzes_, not students) — left as-is. It's
teacher-facing, low-frequency, and each iteration is a fast indexed query;
even a class with 50 assigned quizzes would stay well under 100ms total.
Restructuring it into a single grouped query would be solving a problem the
evidence doesn't show exists.

### Finding 4: the realtime server itself scaled fine

`realtime-connections.ts` connected 150 student sockets plus one teacher
socket concurrently. Successful connections (131/150 — the rest failed at
the login step for the same pool-contention reason as Finding 2, not a
realtime-server problem) completed their handshake, including the per
-socket Redis session lookup (Section 12), in an average of **37ms** (p99
174ms). The teacher's presence broadcast correctly reflected exactly the
131 students who actually connected, with no dropped or duplicated entries.
The realtime server's single-process, in-memory presence design (Section
12, "not solved speculatively") held up at this scale; nothing here
motivates the `@socket.io/redis-adapter` / horizontal-scaling work Section
20 still lists as deferred.

### What's still an open, accepted residual

Even after both fixes, a small minority of requests (~2% in `exam-flow.ts`;
higher when every login fires in the exact same instant with zero stagger,
as `realtime-connections.ts` does) still hit the connection-pool timeout
under a maximally adversarial "all 150 students click 'start' at the exact
same millisecond" burst. Real classrooms don't produce a perfectly
simultaneous burst — human reaction time and network jitter naturally
stagger real logins by hundreds of milliseconds to seconds — so this
residual is treated as accepted, not chased further this phase: raising
`pool.max` again has diminishing returns without more evidence it matters
in practice, and a client-side retry-on-5xx is a reasonable future
improvement (not built speculatively here) rather than a Phase 12
requirement.

### What Phase 12 deliberately did not build

- **Kubernetes or any other new infrastructure** — Rule 14 (`AGENTS.md`)
  says not to add it until load testing shows it's necessary; this phase's
  testing showed the opposite — one Postgres instance and one correctly
  -tuned connection pool handled the tested load once the real bug (bcrypt,
  not infrastructure) was fixed. "Not yet, here's the evidence" is the
  honest conclusion, not silence.
- **Autocannon-based raw HTTP throughput testing** — `autocannon` /
  `@types/autocannon` were added as devDependencies anticipating this, but
  `exam-flow.ts`'s realistic multi-step flow (not a single hammered
  endpoint) was what actually surfaced both real findings above and is what
  the phase kept; the dependency is left in place for future ad hoc use,
  but no `scripts/load-test/throughput.ts` was written, since it wouldn't
  have found anything the flow test didn't already find more precisely.
- **`UV_THREADPOOL_SIZE` tuning** — `@node-rs/bcrypt` and the `pg` driver
  both draw from libuv's default 4-thread pool; not raised, since nothing
  in this phase's testing pointed at thread-pool contention as the binding
  constraint after the two fixes above.

## 16. Production infrastructure (Phase 13)

Nginx, HTTPS, and a production `docker-compose.prod.yml` — the reverse
proxy every earlier deferral (Section 14's body size limits, nonce-based
CSP) was waiting on. Verified live, end to end: `docker compose -f
docker-compose.prod.yml up`, then an HTTP→HTTPS redirect, a self-signed
-TLS health check, a CSP nonce that changes per request, an oversized
upload correctly rejected with `413`, and — the real test — a login
through Nginx followed by an _authenticated_ WebSocket connection through
Nginx to the realtime server, upgraded to the `websocket` transport, using
the session cookie the login response set. Every piece talking to every
other piece, through the actual reverse proxy, not simulated.

### Nonce-based CSP, finally

Section 14 shipped the static "Without Nonces" CSP from Next's own guide
specifically because nonces "require careful interaction with whatever
reverse proxy eventually sits in front of this app... that proxy doesn't
exist until Phase 13." It exists now, so `src/proxy.ts` generates a fresh
nonce per request (`crypto.randomUUID()`, base64-encoded) and sets it on
both the CSP response header and an `x-nonce` request header, matching
`node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md`'s
own pattern exactly. `next.config.ts`'s static `headers()` no longer sets
`Content-Security-Policy` at all — a per-request value can't come from a
config evaluated once at build time.

**What actually got stricter, and what didn't.** `script-src` dropped
`'unsafe-inline'` for `'nonce-<value>' 'strict-dynamic'` — a real
hardening: an HTML-injection attacker can no longer get an arbitrary
inline `<script>` to execute, since they can't guess the per-request
nonce, while Next's own hydration script gets the nonce automatically (Next
parses the CSP response header and attaches it to every framework/page
script it emits — confirmed live: every `<script>` tag on `/login`
carried the exact nonce from that response's own header, on every
request, with a different nonce each time). `style-src`/`style-src-attr`
did **not** get stricter — they still need `'unsafe-inline'`, and this is
worth being precise about since it's easy to assume nonces fix everything:
a nonce only covers `<script>`/`<style>`/`<link>` _elements_, never the
`style="..."` HTML _attribute_ Radix UI's positioning primitives (Select,
Popover, Dialog) set at runtime for floating-element placement. That's a
completely different CSP directive (`style-src-attr`) with no nonce
mechanism of its own. Section 14's original Radix constraint is unchanged
by this phase — only the `script-src` half of the trade-off actually moved.

**Cost paid**: nonces require dynamic rendering — a page prerendered at
build time has no per-request nonce to attach to its own hydration script.
Every route was already dynamic except two: `/login` and Next's default
`/_not-found`. Both now call `await connection()` (the documented way to
force dynamic rendering) — `/login` directly in its page component,
`/_not-found` via a new `src/app/not-found.tsx` overriding Next's static
default. Verified: `pnpm build`'s route table shows `ƒ` (dynamic) for
every single route now, zero `○` (static) ones remain.

### Nginx: one reverse proxy, path-routed

`infrastructure/nginx/nginx.conf` terminates TLS and routes by path:
`/socket.io/` (Socket.IO's default path) to the realtime service,
everything else to the Next.js app. This path-based split has a real
architectural payoff beyond "one entry point": the browser now reaches the
realtime server **same-origin**. `NEXT_PUBLIC_REALTIME_URL` — which used
to need a real public origin baked into the client bundle at Docker build
time, a genuine deployment-portability problem — is left unset in
production; `src/features/realtime/socket-client.ts` falls back to
`io({ withCredentials: true })` with no URL, which connects to
`window.location.origin` on its own, and `src/proxy.ts`'s
`connect-src 'self'` already covers a same-origin WebSocket without
needing the extra allow-list entry local dev still adds (verified live:
production's CSP header reads `connect-src 'self';` with nothing after
it). Local dev keeps setting `NEXT_PUBLIC_REALTIME_URL` explicitly in
`.env.local`, since the realtime server runs on its own port there with no
proxy in front of it.

**`client_max_body_size 10m;`** is Section 14's other deferred item, closed
out here. The framework itself has no config that rejects an oversized
request outright — `next.config.ts`'s experimental
`proxyClientMaxBodySize` (checked against
`node_modules/next/dist/docs/.../proxyClientMaxBodySize.md` before
assuming otherwise) only caps in-memory buffering and explicitly does
**not** error to the client, it silently truncates — so Nginx's directive
is the only thing that actually returns `413`. Sized with headroom over
`MAX_IMPORT_FILE_BYTES` (5MB, Section 8) for multipart form-data overhead.
Verified live: a 15MB upload to `/api/imports/preview` through Nginx got
`413` before reaching the app at all.

**`X-Forwarded-For` is set outright (`$remote_addr`), not appended
(`$proxy_add_x_forwarded_for`)** — the one security-relevant Nginx
directive in this file worth calling out by itself. Every rate-limited
route (Section 14) trusts the _first_ `X-Forwarded-For` entry as the real
client IP (`request.headers.get("x-forwarded-for")?.split(",")[0]`).
`$proxy_add_x_forwarded_for` appends Nginx's view of the client to
whatever the client already sent — meaning a client could send
`X-Forwarded-For: 1.2.3.4` themselves and have it survive as the first
(trusted) entry, completely undermining the rate limiter's IP-keying with
zero effort. Setting the header outright discards anything the client
sent and replaces it with Nginx's own `$remote_addr`, which is what
actually makes the header trustworthy for a single-reverse-proxy
deployment topology like this one.

### HTTPS

`infrastructure/nginx/certs/generate-dev-cert.sh` generates a **self
-signed** cert for `CN=localhost` — for demonstrating the stack locally
only, never for a real deployment (browsers correctly warn about it; that
warning is the point, not a bug to suppress). The `*.pem` output is
git-ignored (already covered by the repo's existing `*.pem` rule). Real
certs — Let's Encrypt via `certbot`, or a host-provided cert — replace
`fullchain.pem`/`privkey.pem` directly; nothing else in the Nginx config
changes. `infrastructure/deployment/` documents the fuller go-live
checklist for an actual VPS deployment (domain, DNS, firewall, cert
renewal) — written as deployment guidance, not live-verified against a
real OVHcloud account, the same honesty standard Section 8 already applies
to Google Sheets' OAuth flow (code complete and correct by inspection,
credentials-gated verification deferred to whoever actually deploys it).

### The production Docker Compose stack

`docker-compose.prod.yml` is a **separate file** from the existing
`docker-compose.yml`, not profiles on one — the two setups don't share
service definitions. Dev's `postgres`/`redis` expose host ports on purpose
(Drizzle Studio, `psql`, ad hoc debugging); prod's don't, keeping the
database and cache reachable only from other containers on the compose
network. Five services: `postgres`, `redis`, `app` (built from
`infrastructure/docker/Dockerfile`, `target: runner`), `realtime` (built
from the new `infrastructure/docker/Dockerfile.realtime`), and `nginx`.

**The realtime server runs via `tsx` directly in production**, not a
separate compiled bundle — a deliberate simplicity choice, not an
oversight. It's a small process with no build artifact worth isolating
(unlike the Next app's multi-stage build), and it's exactly how it already
runs in dev (`pnpm realtime:dev`) — one fewer thing to keep in sync
between environments. `tsx` moved from `devDependencies` to `dependencies`
in `package.json` since it's now a genuine production runtime requirement
for that image, not just a dev tool.

**Migrations run as a one-off `migrate` service**
(`docker compose -f docker-compose.prod.yml run --rm migrate`), never
automatically on container start. `.next/standalone` deliberately doesn't
bundle `drizzle-kit` — it's not part of the running app — so migrations
need a dedicated build target (`migrator`, using the `deps` stage's full
node_modules before it gets pruned down for `runner`) with its own
`profiles: ["tools"]` entry so `docker compose up` never starts it by
accident. Deliberate, not automatic, because auto-migrating on every boot
becomes a real race the moment there's more than one app replica — nobody
wants two containers racing to run the same migration concurrently.

### A real bug this phase found: standalone output silently missing `@swc/helpers`

The `app` container crashed on boot with `Cannot find module
'.../@swc/helpers/esm/_interop_require_default.js'` — worth documenting in
full since the fix isn't obvious and the failure mode (works in every
local `pnpm build` + `node .next/standalone/server.js` test, crashes only
inside the Docker image) is exactly the kind of gap "verify end-to-end in
the real deployment target" catches and a local check wouldn't. Next's
build-time file tracer (`@vercel/nft`, which follows only
statically-analyzable `require`/`import` calls to decide what belongs in
`.next/standalone`) copied `@swc/helpers`'s `cjs/` variant but missed
`esm/` entirely — confirmed by inspecting the built image directly
(`docker run --rm --entrypoint sh ... -c "find .../\@swc+helpers@*/"`)
before assuming anything, which showed the `.pnpm` store folder present
but empty of the file the crash named. This is a **documented** tracer
limitation, not a project bug: `node_modules/next/dist/docs/.../output.md`
— "Caveats" — says outright that tracing "might fail to include required
files" and names `outputFileTracingIncludes` as the fix. Two changes,
both required together: `@swc/helpers` added as an explicit direct
dependency (`package.json`) so pnpm hoists it to a top-level,
glob-resolvable path (it otherwise only exists nested inside pnpm's
isolated `.pnpm/next@.../node_modules/@swc/helpers` store, which an
`outputFileTracingIncludes` glob rooted at the project can't reach), and
`next.config.ts`'s `outputFileTracingIncludes: { "/*": ["./node_modules
/@swc/helpers/**/*"] }` telling the tracer to include it regardless of
whether static analysis would have found it. Verified fixed by rebuilding
the image and confirming `app` reached `✓ Ready` instead of crash
-looping.

### What's still deferred

- **Certificate automation** — `generate-dev-cert.sh` is a one-time local
  script; a real deployment's certbot renewal cadence, DNS validation, and
  firewall rules are `infrastructure/deployment/`'s job to document, not
  something this repo can run for you without a real domain.
- **Horizontal scaling of `app`/`realtime`** — `docker-compose.prod.yml`
  runs exactly one of each behind Nginx's single `upstream` entry per
  service. Nothing in Section 15's load testing or this phase's own
  testing showed a need for more than one, and the realtime server's
  in-memory presence design (Section 12/15) still assumes exactly one
  instance — scaling either is still the `@socket.io/redis-adapter` /
  shared-session-store work Section 21 lists as deferred, unbuilt because
  no evidence has asked for it yet.
- **A CDN in front of Nginx** — nothing here is cacheable anyway now that
  every route is dynamically rendered (the nonce-CSP trade-off above);
  adding one wouldn't currently help, so none was added speculatively.

## 17. Folder structure

```text
src/
  app/                  Next.js App Router — pages and route.ts handlers only
    admin/                layout.tsx (sidebar shell) + page.tsx, users/ (Phase 6)
    teacher/              layout.tsx (sidebar shell) + page.tsx, questions/ (Phase 3),
                         quizzes/ (Phase 4, +assignments UI Phase 6, +attempts/ review
                         Phase 8, +results/ Phase 10), import/ (Phase 5), classes/
                         (Phase 6, +quiz-results section on the roster page Phase 10)
    student/              page.tsx (assigned quizzes + past attempts), attempts/[attemptId]/
                         (the exam-taking + review page, Phase 7, +fullscreen gate and
                         violation reporting Phase 8)
  components/ui/        shadcn/ui primitives (generated, not hand-edited) — dialog.tsx
                         added Phase 6 for the create-account/reset-password/create-class
                         modals
  features/             Frontend feature modules: health/, auth/, teacher/ (sidebar),
                         questions/ (Phase 3), quizzes/ (Phase 4, +quiz-assignments.tsx
                         Phase 6), imports/ (Phase 5), admin/ (Phase 6 — sidebar,
                         user-list.tsx), classes/ (Phase 6 — class-list.tsx,
                         class-roster.tsx), attempts/ (Phase 7 — exam-attempt.tsx,
                         start-attempt-button.tsx; +fullscreen/violation handling Phase 8;
                         +presence join/leave Phase 9), realtime/ (Phase 9 —
                         socket-client.ts, the shared browser socket singleton),
                         monitoring/ (Phase 9 — live-monitor.tsx, the teacher-facing live
                         presence + event feed)
  layouts/               Reserved for shells shared *across* role areas (exam chrome, ...) —
                         still empty; the teacher/admin shells live in features/teacher and
                         features/admin instead since nothing else needs it yet
  backend/               Domain logic, one folder per bounded context:
                           health/      Phase 0
                           auth/        Phase 1 — login/session mechanics; +session
                                        -lookup.ts Phase 9, the Next-agnostic half of
                                        session.ts shared with src/realtime/server.ts
                           questions/   Phase 3 — question.schema.ts, question.service.ts
                           quizzes/     Phase 4 — quiz.schema.ts, quiz.service.ts
                           imports/     Phase 5 — csv-parser.ts, excel-parser.ts,
                                        google-sheets.service.ts, import-row.schema.ts,
                                        import-session.ts, import.service.ts
                           users/       Phase 6 — admin account management, distinct from
                                        backend/auth (login/session mechanics)
                           classes/     Phase 6 — class CRUD + roster
                           students/    Phase 6 — lightweight student search, shared by
                                        roster-add and quiz-assignment pickers
                           assignments/ Phase 6 — quiz ↔ class/student links
                           attempts/    Phase 7 — attempt.service.ts: start (sampling +
                                        snapshot), get (with lazy expiry), submit, history
                           answers/     Phase 7 — answer.service.ts: save one answer,
                                        grade a whole attempt
                           monitoring/  Phase 8 — monitoring.service.ts: recordViolation,
                                        teacher-facing listAttemptsForQuiz/
                                        getAttemptDetailForTeacher
                           realtime/    Phase 9 — realtime-event.schema.ts (shared event
                                        contract), realtime.service.ts
                                        (publishRealtimeEvent, the Next-app side of the
                                        Redis Pub/Sub bridge)
                           results/     Phase 10 (this phase) — results.service.ts:
                                        getQuizResults (score distribution, per-question
                                        difficulty), getClassResults (per-quiz pass rate
                                        for a class roster) — see Section 13
  database/
    schema/               Drizzle table definitions: users, teachers, students, classes,
                         class-students, questions, question-options, quizzes,
                         quiz-questions, quiz-assignments, exam-attempts,
                         exam-attempt-questions, exam-answers, exam-violations, imports,
                         import-errors (Phase 1-8) — notifications lands with its own
                         phase; Phase 9 added no new tables (only the Redis Pub/Sub
                         channel from Section 12), and Phase 10 added none either — see
                         Section 13 for why results don't get their own table
    migrations/           drizzle-kit generate output (committed)
    seed/                 upsert-user.ts (shared helper), users.seed.ts (Phase 1 accounts),
                         academic.seed.ts (Phase 2: teacher/student profiles, a class, and
                         enrollments), run.ts (pnpm db:seed entrypoint)
  realtime/               server.ts (Phase 9, this phase) — the standalone Socket.IO
                         process; see Section 12 for why it's separate from the Next app
  lib/                    Cross-cutting: env.ts, db.ts, redis.ts, rate-limit.ts,
                         api-response.ts, same-origin.ts, utils.ts
  proxy.ts               Optimistic route protection (Phase 1) — see Section 4
tests/
  unit/                   No external services required — `pnpm test`
  integration/            Requires `docker compose up` — `pnpm test:integration`
  e2e/                    Full user flows — still empty; the integration suite already
                         exercises the exam-taking and monitoring flows end to end at the
                         service layer (attempt.service.test.ts, monitoring.service
                         .test.ts, realtime.service.test.ts) — the full Socket.IO
                         connection lifecycle (Phase 9) and client-side violation
                         *detection* itself (Phase 8's `fullscreenchange`/
                         `visibilitychange`/`copy` listeners) both genuinely need a real
                         browser/process pair and are covered by live verification, not
                         the automated suite — see Section 12's verification note
infrastructure/
  docker/                 Production Dockerfile (built Phase 0, wired up Phase 13)
  nginx/                   Reverse proxy config (Phase 13)
  deployment/               OVHcloud runbook (Phase 13)
```

Only folders with real content today are created; the rest appear when their
phase lands (no empty scaffolding — see Rule "don't design for hypothetical
future requirements").

## 18. Next.js 16 specifics that affect this codebase

This project was scaffolded on **Next.js 16**, which changed a few
conventions from what most existing documentation/training data assumes:

- **Middleware → Proxy**, and **Proxy now runs the Node.js runtime by
  default** (not Edge, unlike older Next versions) — confirmed against the
  bundled `node_modules/next/dist/docs` rather than assumed, since this
  materially affects what Proxy is technically able to do (see Section 4).
- **Route Handlers are not cached by default.** `GET` handlers run per
  request unless explicitly opted into caching — matters for anything
  reading live exam/monitoring state.
- **`cookies()` is async** (`await cookies()`), used throughout
  `backend/auth/session.ts`.
- **`output: "standalone"`** is set in `next.config.ts` so
  `infrastructure/docker/Dockerfile` can copy a minimal server bundle. As of
  Phase 9, this also ruled out a hand-written custom `server.js` for hosting
  Socket.IO in-process — the docs are explicit that standalone's generated
  `server.js` and a custom one "cannot be used together." See Section 1 and
  Section 12 for what QuizGuard does instead.
- **Security headers have two documented mechanisms, and they're not
  interchangeable**: a static `headers()` function in `next.config.ts`
  (what Section 14 uses), or nonce-based CSP generated per-request in
  `proxy.ts` — the latter forces every page using it into dynamic
  rendering and requires the nonce to reach the client via a custom
  `x-nonce` header, a pattern specific enough that assuming "just add a
  CSP meta tag" (common in older docs/training data) would have been
  wrong for this version.

## 19. Design system

The visual language is fully specified in
[`stitch_quizguard_universal_exam_platform/academic_precision/DESIGN.md`](../stitch_quizguard_universal_exam_platform/academic_precision/DESIGN.md)
— an indigo-on-slate "Academic Precision" system (Inter for UI text,
JetBrains Mono for the exam timer and other numeric/stable-width text). Its
color, radius, and spacing tokens are ported into `src/app/globals.css` as
Tailwind v4 `@theme` CSS variables, which shadcn/ui components consume
automatically. Iconography is standardized on `lucide-react` (shadcn's
default) rather than the mockups' Material Symbols — same visual weight,
avoids a second icon-font dependency. The results page (Section 13) is
where charts finally appear, and they're `--primary`-filled `<div>` bars on
a `bg-muted` track, not a new chart-library palette — consistent with the
rest of the app rather than a visually distinct "analytics" sub-theme. The
`/admin` and `/teacher` dashboards are still minimal — Users (Phase 6),
Classes (Phase 6), the exam-taking flow (Phase 7), per-attempt monitoring
review (Phase 8), live monitoring (Phase 9), and now results (Phase 10)
have real screens, but the landing dashboards stay placeholders until later
phases give them real summary data to show. The exam timer
(`features/attempts/exam-attempt.tsx`) is the first place JetBrains Mono
actually gets used for its intended purpose — a countdown re-rendering
every second needs a fixed-width numeral font so the digits don't visibly
jitter. The `warning` token (already in `globals.css`, previously only used
for the "archived" quiz badge) is reused for the monitoring disclosure
banner and violation-count badges, rather than introducing a new color for
"something to be aware of, not yet an error." The `success` token's small
inline dot (`live-monitor.tsx`'s presence indicator) is the first "live"
status affordance in the app — a deliberately minimal treatment (a single
colored dot, not an animation) consistent with the design system not
otherwise using motion for state changes.

## 20. Security posture established through Phase 13

- No secrets committed: `.env.local`/`.env.test` are git-ignored (except the
  latter's harmless local-docker-compose defaults, deliberately committed
  per Next's own `.env.test` convention); `.env.example` documents every
  variable without values.
- `src/lib/env.ts` validates `process.env` with Zod at process startup and
  fails fast with a readable error rather than surfacing `undefined` deep in
  a query string later.
- The database driver (`pg` via Drizzle) parameterizes all queries —
  SQL injection protection is structural, not manual escaping.
- Passwords are bcrypt-hashed (never logged) — still bcrypt, 12 rounds,
  just a native implementation (`@node-rs/bcrypt`) since Phase 12
  (Section 15) swapped out the pure-JS `bcryptjs`; the hashing algorithm
  and cost factor are unchanged, only where the computation runs. Sessions
  are server-revocable Redis tokens; login is rate-limited and never
  reveals which failure case occurred; RBAC is enforced authoritatively
  server-side, never inferred from anything the client sends.
- `users` API responses use an explicit public-column projection (Section
  9), never a raw DB row — the pattern to follow for any future table that
  gains a secret column, established after Phase 6's own verification pass
  caught `passwordHash` leaking through the first draft of `/api/users`.
- `src/lib/api-response.ts` gives every route a consistent error shape and
  guarantees unexpected errors return a generic 500 — internals (stack
  traces, DB error text) never reach the client (Section 34).
- Relational integrity is enforced by the database, not just application
  code: FK constraints, `ON DELETE RESTRICT`/`CASCADE` chosen deliberately
  per relationship, and a partial unique index preventing duplicate active
  classes — see Section 5, verified in `tests/integration/academic-schema
.test.ts`.
- Every question-bank and quiz mutation (Sections 6-7) is server-side
  re-validated with the same Zod schema the client used, regardless of what
  the client actually sent — the discriminated-union option rules (exactly
  one correct answer for multiple choice, etc.) and the publish
  preconditions (non-empty pool, pool ≥ questions per attempt) can't be
  bypassed by calling the API directly.
- Uploaded files are never trusted (Section 9): size is checked against the
  `Content-Length` header before the body is even read, then against the
  parsed file's actual size; row count is capped
  (`MAX_IMPORT_ROWS`, `parse-limits.ts`) for CSV, Excel, and Google Sheets
  alike; every cell value flows through the same Zod validation real UI
  input does, regardless of source.
- The Google OAuth flow's CSRF protection (the `state` parameter, Section 8)
  is separate from — not a replacement for — `same-origin.ts`, since
  Google's callback is a genuine cross-site navigation that same-origin
  checking can't cover by definition.
- `quiz_assignments`' one-class-or-one-student rule (Section 9) is a
  database `CHECK` constraint, not just a Zod `.refine()` — an invariant the
  application layer can't bypass by calling the API with a malformed body.
- The exam engine (Section 10) never trusts the client for time or score:
  `deadlineAt` is computed and enforced server-side on every mutating
  request; `question_options.is_correct` is withheld from every response
  until the attempt is finished _and_ the quiz allows showing results;
  grading happens exactly once, server-side, from data the server already
  had (the snapshot and the saved answers), never from anything the client
  asserts about correctness.
- `exam_attempts`' one-in-progress-attempt-per-student-per-quiz rule
  (Section 10) is a database partial unique index, the same pattern as
  `quiz_assignments`' target constraint — another invariant the database
  guarantees rather than relying solely on application-level checks.
- Monitoring (Section 11) only ever reports what the page can honestly
  observe about itself — `fullscreenchange`, `visibilitychange`, `copy`/
  `cut` — with no attempt to inspect anything outside the browser tab, and
  the student is told exactly what's tracked before it starts. The teacher
  review endpoints (`listAttemptsForQuiz`, `getAttemptDetailForTeacher`)
  are admin/teacher-only, same as every other quiz-management endpoint.
- The realtime server (Section 12) reuses the existing Redis session token
  for its handshake auth rather than introducing a second credential —
  an unauthenticated or invalid-token connection is rejected before any
  event handler runs. Room membership is authorization, not just routing:
  `join:quiz` checks the connecting user's role; `join:attempt` re-verifies
  attempt ownership against PostgreSQL on every join, never trusting a
  client-supplied id pairing — confirmed live by a rejected unauthenticated
  handshake and a presence broadcast that only reflects attempts the
  connecting student actually owns.
- Every message crossing the Redis Pub/Sub hop (Section 12) is re-validated
  with `realtimeEventSchema.safeParse` on the subscribing side before it's
  ever forwarded to a browser — Redis Pub/Sub itself carries arbitrary
  bytes, so the schema, not the transport, is what guarantees a browser
  only ever receives a well-formed event.
- Results (Section 13) are admin/teacher-only, same RBAC as every other
  quiz/class-management endpoint — `getQuizResults`/`getClassResults` and
  the CSV export all sit behind `requireApiUser(["admin", "teacher"])`, and
  a student has no results endpoint of their own beyond their own attempt
  history (already covered by Section 10's access rules). Aggregating
  across all students' attempts is exactly the kind of data a student must
  never see about their peers.
- **This is the "full audit" every prior phase's version of this section
  deferred to** — Section 14 is the complete writeup: HTTP security
  headers (CSP, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions
-Policy`, HSTS, no `X-Powered-By`), an RBAC sweep of all 45 API routes,
  a `GET`-safety sweep that found and fixed one real CSRF-adjacent bug (a
  `GET` that could grade an exam attempt as a side effect), two patched
  dependency CVEs, and rate limiting extended to exam start / event sync /
  imports — Section 31's originally-named targets, alongside login.
- Phase 13 (Section 16) closed out this section's two remaining
  Section-14 deferrals: HTTPS/TLS termination now exists (Nginx, self
  -signed for local demonstration, real certs a drop-in replacement), and
  the nonce-based CSP upgrade Section 14 explicitly left for "once a
  reverse proxy exists to interact with correctly" now does — verified
  live with a per-request nonce that Next auto-attaches to every script
  tag, on both the standalone Docker build and plain `pnpm dev`.
  `X-Forwarded-For` is set outright by Nginx (`$remote_addr`, never
  appended), which is what makes every rate limiter's IP-keying (this
  section, Section 14) trustworthy behind a reverse proxy at all — an
  append-based header would let a client's own spoofed entry survive as
  the "first" one those checks trust.
- Phases 1-13 establish the foundation Phase 14 (CI/CD) builds on next,
  not the final word on it. Phase 12's load testing (Section 15) fixed one
  real concurrency bug (`bcryptjs` blocking the event loop); Phase 13
  found one real deployment-only bug (Section 16 — Next's standalone
  output silently missing `@swc/helpers`'s ESM variant, invisible to every
  local `pnpm build` check and only caught by actually running the built
  Docker image). Neither phase found evidence the security posture
  established through Phase 11 needed to change.

## 21. What's still deliberately missing after Phase 13

- Self-service registration — Section 3's role model has admins
  provisioning accounts (Section 9), not public sign-up. `db:seed` covers
  the bootstrap problem for dev/test.
- Forgot-password / email verification / MFA — not in Phase 1's scope
  (Section 47); can be added later without touching the session mechanism.
  Admin-driven password reset (Section 9) covers the "student forgot their
  password" case for now.
- A CSRF double-submit token system — see Section 4; SameSite + Origin
  check remains the proportionate defense for what's exposed, re-confirmed
  (not just inherited) by this phase's own audit (Section 14).
- Socket.IO connection/event-level rate limiting on the realtime server —
  Section 14 deferred this to whatever Phase 12's load testing showed
  needed throttling; it found none (Section 15, Finding 4 — 150 concurrent
  connections handshake cleanly in tens of milliseconds each, no evidence
  of abuse-surface strain), so it stays un-throttled rather than being
  built speculatively against a problem that hasn't shown up.
- Horizontal scaling of `app`/`realtime` behind Nginx (Section 16) — how
  each is built and run in Docker is now decided; running more than one
  of either isn't. The realtime server's in-memory presence design still
  assumes exactly one instance, and Section 15's load testing found no
  evidence more than one app instance is needed yet — scaling either is
  still the `@socket.io/redis-adapter` / shared-session-store work, unbuilt
  because no evidence has asked for it.
- Certificate automation for a real deployment (Section 16) — the repo
  ships a self-signed cert generator for local demonstration only; real
  certbot/Let's Encrypt renewal automation is `infrastructure/deployment/`'s
  job once an actual domain exists, not something committed here.
- The small residual connection-pool-timeout tail under a maximally
  simultaneous login burst (Section 15) — accepted rather than chased
  further; a client-side retry-on-5xx would close it but wasn't built
  speculatively against a scenario (a truly zero-jitter simultaneous burst)
  real classroom usage doesn't produce.
- `UV_THREADPOOL_SIZE` (Section 15) — left at Node's default of 4; nothing
  in Phase 12's testing pointed at libuv thread-pool contention as a
  binding constraint once the bcrypt and connection-pool fixes landed.
- Results are per-quiz and per-class (Section 13), not organization-wide —
  there's no "across every quiz a teacher owns" or "across every class"
  rollup, and no time-series view (score trends over the term). Nothing in
  the spec asked for that scope; today's two views answer the two concrete
  questions a teacher actually has ("how did this quiz go," "how's this
  class doing").
- Results are unfiltered by date/subject/difficulty — `getQuizResults`
  aggregates every attempt a quiz has ever had, with no "last 30 days" or
  "excluding early testing attempts" option. Not requested, and a quiz's
  full history is usually exactly what "how did this quiz go" means.
- Google Sheets import verified live against Google's actual APIs — the
  code is complete (OAuth flow, Drive/Sheets API calls, shared with CSV/
  Excel's preview-validate-commit pipeline) but this environment has no
  Google Cloud OAuth credentials configured; see Section 8 and `README.md`
  — "Google Sheets import setup." CSV and Excel are fully verified.
- A quiz _import_ — Section 8/9 are specifically about the question bank
  ("Import questions," Section 30's `POST /api/questions/import"). Bulk-
  creating whole quizzes (settings + pool) from a file isn't requested
  anywhere in the spec and doesn't exist.
- GitHub Actions / CI — that's Phase 14. Test scripts are already split
  (`pnpm test` vs `pnpm test:integration`) so wiring CI later is a matter of
  adding the workflow file, not restructuring tests.

## 22. Phase roadmap

| Phase | Name                                   |
| ----- | -------------------------------------- |
| 0     | Platform Foundation                    |
| 1     | Authentication                         |
| 2     | Database                               |
| 3     | Question Bank                          |
| 4     | Quiz Management                        |
| 5     | Import (Sheets/CSV/Excel)              |
| 6     | Student Management                     |
| 7     | Exam Engine                            |
| 8     | Exam Monitoring                        |
| 9     | Realtime Monitoring                    |
| 10    | Results                                |
| 11    | Security Hardening                     |
| 12    | Performance                            |
| 13    | Production Infrastructure (this phase) |
| 14    | CI/CD                                  |
