# QuizGuard

A universal online quiz and exam management platform for schools, trainers,
and organizations — any subject, from DBA and JavaScript to English and
General Education.

This repository is being built **phase by phase**. See
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the full system design and
phase roadmap. This document only covers what exists today.

## Status: Phase 13 — Production Infrastructure

This phase built and verified a real production deployment path: Nginx as
a TLS-terminating reverse proxy, a nonce-based Content-Security-Policy
(Phase 11 shipped a static one specifically because "nonces need a reverse
proxy to interact with correctly" — that proxy exists now), and
`docker-compose.prod.yml` running the whole stack (Postgres, Redis, the
Next.js app, the standalone realtime server, Nginx) in containers.
Verified live, end to end, not just built: an HTTP→HTTPS redirect, a
per-request CSP nonce Next auto-attaches to every script tag, a login
through Nginx followed by an _authenticated_ WebSocket connection routed
through Nginx to the realtime service, and a 15MB upload correctly
rejected with `413` (Nginx's `client_max_body_size`, since Next.js itself
has no config that actually rejects an oversized request rather than
silently truncating it). Along the way, this phase also found and fixed a
real deployment-only bug: Next's standalone build output was silently
missing `@swc/helpers`'s ESM variant — invisible to every local `pnpm
build` check, only caught by actually running the built Docker image. See
"Running the production stack" below to try it yourself, and
`docs/ARCHITECTURE.md` — Section 16 for the complete writeup, including
what's still deliberately deferred (certificate automation, horizontal
scaling).

Phase 12 (Performance) is load testing — every earlier phase deferred a scaling
question with some version of "don't add infrastructure until load testing
shows it's necessary" (Rule 14). Four scripts under `scripts/load-test/`
(seed 150 synthetic students, simulate them all taking a quiz concurrently
over the live HTTP API, simulate 150 concurrent realtime connections, clean
up afterward) ran against a **production build**, not `next dev` — dev
mode's numbers don't relate to real capacity. That testing found and fixed
one real concurrency bug: `bcryptjs` hashes on Node's single event-loop
thread despite its Promise-based API, so 150 concurrent logins serialized
into 7-8 second waits with a third failing outright, misleadingly
resembling a database connection-pool problem. Swapped for
`@node-rs/bcrypt` (same algorithm, native thread-offloaded implementation)
— identical concurrent-login reproduction went from ~30% failures to zero.
The connection pool itself was then evidence-tuned from 10 to 20
connections after the bcrypt fix revealed genuine (if much smaller) pool
contention under a full 150-student simultaneous burst. The
results-aggregation query flagged back in Phase 10 was checked with
`EXPLAIN ANALYZE` against ~11,600 seeded rows and found to already run in
35ms — no index or query change needed. See `docs/ARCHITECTURE.md` —
Section 15 for the complete writeup, including honest caveats about what a
single dev laptop can and can't tell you about production capacity.

Phase 11 (Security Hardening) shipped a full security audit two phases
before this one. Every response still carries `X-Content-Type-Options`,
`Referrer-Policy`, `Permissions-Policy`, and `Strict-Transport-Security`
(`next.config.ts`), and `X-Powered-By` is removed — `Content-Security
-Policy` moved to `src/proxy.ts` as a per-request nonce in Phase 13 (above),
replacing the static policy this phase originally shipped. An audit of all
45 API routes confirmed correct RBAC
everywhere and found (and fixed) one real bug: `GET /api/attempts/[id]`
could silently grade an overdue exam attempt as a side effect — a `GET`
should never mutate, since `SameSite=Lax` doesn't protect `GET` from
cross-site triggering the way it protects `POST`/`PUT`. Two dependency
vulnerabilities (`esbuild`, `uuid`, both moderate, both transitive) were
patched via `pnpm` overrides. Rate limiting — previously only on login —
now also covers starting an exam attempt, reporting a monitoring flag, and
bulk imports, matching exactly the endpoints the original spec named for
it. See `docs/ARCHITECTURE.md` — Section 14 for the complete writeup.

Every published quiz now has a **Results** page
(`/teacher/quizzes/[id]/results`, linked from the quiz's preview) — total
attempts, average score, pass rate, a score-distribution bar chart, and a
per-question difficulty breakdown (which questions students actually got
wrong), plus an **Export CSV** button for every attempt's score. Each
class's roster page also gets a **Quiz results** section: pass rate for
that class, per quiz assigned to it. Nothing is stored twice — every number
here is computed live from the same `exam_attempts`/`exam_answers` data
already written when a student submits (Phase 7).

A teacher watching a published quiz's **View Attempts** page now sees a
live **Currently taking** list and **Live activity** feed that update the
moment something happens — a student starting, submitting, or triggering a
monitoring flag — instead of only on page load. This runs over a WebSocket
connection to a separate realtime server process (`src/realtime/server.ts`,
`pnpm realtime:dev`) — see "Running the realtime server" below; Next.js
16's production build can't host a WebSocket server in the same process
(confirmed against the framework's own docs, not assumed — see
`docs/ARCHITECTURE.md`, Section 1 and Section 12), so it's a second small
process alongside `next dev`, sharing the same Redis and PostgreSQL.

Quizzes with **Require fullscreen** and/or **Monitor activity** turned on
(set on the quiz form since Phase 4) now actually enforce and track that
while a student is taking them. Requiring fullscreen shows a gate before the
questions — the timer keeps running behind it — and exiting fullscreen
mid-exam reopens the gate and logs it. Monitoring activity watches for tab
switches and copy/cut on the exam page and logs those too. A banner tells
the student exactly what's being watched before it starts: only signals the
browser tab can honestly observe about itself, never anything about other
applications or windows. Teachers get a new review surface — from a
published quiz's preview page, **View Attempts** lists every student
attempt with a flagged-activity count, and opening one shows the full
per-question review (always with correct answers marked, regardless of the
quiz's "show results" setting) plus a timeline of what was flagged and when.

Students can take an assigned quiz end to end. From `/student`, "Start"
begins an attempt — the server picks a random subset of questions from the
quiz's pool (or the fixed pool order, if randomization is off), computes a
deadline from the quiz's duration, and only ever tells the client that
deadline, never the elapsed time. Answer each question (autosaved as you
go), then Submit — or let the countdown reach zero, which submits
automatically. Grading happens entirely server-side the moment the attempt
ends; correct answers are never sent to the client before then, and only
appear afterward at all if the quiz's "show results" setting allows it.
Reopening an in-progress attempt resumes it exactly where you left off;
reopening a finished one shows the score and (if allowed) a per-question
review. `maxAttempts` and the assignment's open window are enforced
server-side on every attempt start.

Admins manage accounts for every role at `/admin/users`: create an admin,
teacher, or student account, search/filter, disable/enable, reset a
password, or delete one. Teachers manage classes at `/teacher/classes`:
create a class, then open it to search active students and add or remove
them from the roster. On a published quiz's preview page
(`/teacher/quizzes/[id]/preview`), teachers can assign it to a whole class
or to individual students — a quiz has to be published first.

Teachers can also bulk-add questions at `/teacher/import` from a CSV file,
an Excel workbook, or a connected Google Sheet: upload/connect, get a
preview with auto-detected column mapping and per-row validation (fix the
mapping and it re-validates live), then commit — valid rows become
questions, every row (valid or not) is recorded in an audit trail, and
invalid rows show exactly why. **Google Sheets import needs your own Google
Cloud OAuth credentials to actually run** — see "Google Sheets import
setup" below; without them, connecting fails with a clear error rather than
a silent one.

## Tech stack

| Layer      | Choice                                          |
| ---------- | ----------------------------------------------- |
| Frontend   | Next.js 16 (App Router), React 19, TypeScript   |
| Styling    | Tailwind CSS v4, shadcn/ui (Radix primitives)   |
| Validation | Zod                                             |
| Backend    | Next.js Route Handlers, modular domain services |
| Database   | PostgreSQL 16 + Drizzle ORM                     |
| Cache      | Redis 7 (ioredis)                               |
| Testing    | Vitest, Testing Library                         |
| Tooling    | ESLint (flat config), Prettier, pnpm            |
| Infra      | Docker Compose (dev), Docker (prod, Phase 13)   |

## Prerequisites

- Node.js 22+
- pnpm (`corepack enable` will provide it)
- Docker Desktop (for PostgreSQL and Redis)

## Getting started

```bash
# 1. Install dependencies
pnpm install

# 2. Configure environment variables
cp .env.example .env.local
# Defaults in .env.example already match docker-compose.yml — no edits needed for local dev.

# 3. Start PostgreSQL and Redis
pnpm docker:up

# 4. Run the app
pnpm dev
```

Visit http://localhost:3000 — the home page shows live App / PostgreSQL /
Redis status. Check http://localhost:3000/api/health directly for the raw
JSON.

Stop the containers with `pnpm docker:down` (data persists in Docker volumes
between runs).

### Running the realtime server

Live monitoring (Phase 9) needs a second process running alongside
`pnpm dev`:

```bash
pnpm realtime:dev
```

It listens on `REALTIME_PORT` (default `4001`, see `.env.example`) and
needs the same PostgreSQL/Redis containers `pnpm docker:up` already starts.
Everything else — logging in, taking quizzes, question/quiz management —
works fine without it; only the live "Currently taking" list and event feed
on a quiz's **View Attempts** page need it running.

### Running the production stack

`docker-compose.prod.yml` runs everything — Postgres, Redis, the app,
the realtime server, and Nginx with TLS — in containers (Phase 13, see
`docs/ARCHITECTURE.md` — Section 16). This is a different stack from the
one above: the dev flow runs the app natively via `pnpm dev` for fast
HMR, with only Postgres/Redis in Docker.

```bash
# 1. Generate a local self-signed cert (never use this for a real deployment)
infrastructure/nginx/certs/generate-dev-cert.sh

# 2. Build and start
pnpm prod:up postgres redis
pnpm prod:migrate
pnpm prod:up
```

Visit `https://localhost` (the browser will warn about the self-signed
cert — expected). Deploying to a real server instead: see
`infrastructure/deployment/README.md`.

### Load testing

`scripts/load-test/` holds the tooling from Phase 12 (see
`docs/ARCHITECTURE.md` — Section 15 for the findings). Run against a
production build for numbers that mean anything:

```bash
pnpm build
node .next/standalone/server.js   # copy .next/static and public/ into
                                   # .next/standalone first — see Section 15
pnpm loadtest:seed                # 150 students, a quiz, historical attempts
pnpm loadtest:exam-flow           # simulates them all taking it concurrently
pnpm loadtest:realtime            # needs `pnpm realtime:dev` running too
pnpm loadtest:cleanup             # removes everything the above created
```

`seed.ts`'s synthetic accounts (`loadtest-student-0@quizguard.test` etc.,
password `LoadTest1!`) and quiz ("Load Test Quiz") are easy to spot and
`cleanup.ts` removes them by that same naming convention — safe to leave
seeded between runs, or to run `loadtest:cleanup` immediately after.

### Test accounts

After migrating (`pnpm db:migrate`), seed dev-only data with `pnpm db:seed`:
3 core accounts for testing each role, plus (new in Phase 2) 4 more student
accounts, a sample class taught by the seeded teacher, and all 5 students
enrolled in it. Safe to re-run — every seed function upserts.

| Role    | Email                     | Password    |
| ------- | ------------------------- | ----------- |
| Admin   | `admin@quizguard.test`    | `Passw0rd!` |
| Teacher | `teacher@quizguard.test`  | `Passw0rd!` |
| Student | `student@quizguard.test`  | `Passw0rd!` |
| Student | `student2@quizguard.test` | `Passw0rd!` |
| Student | `student3@quizguard.test` | `Passw0rd!` |
| Student | `student4@quizguard.test` | `Passw0rd!` |
| Student | `student5@quizguard.test` | `Passw0rd!` |

Sign in at `/login` — each account lands on its own dashboard (`/admin`,
`/teacher`, `/student`); visiting another role's dashboard bounces you back
to your own. As admin, use the sidebar to reach **Users** (`/admin/users`)
to create a new account of any role. As admin or teacher, use the sidebar
to reach **Question Bank** (`/teacher/questions`) — create a question, then
search/filter for it, edit it, and delete it. Reach **Quizzes**
(`/teacher/quizzes`) to create a quiz, add pooled questions and save, then
Publish (only works once the pool has at least as many questions as
"questions per attempt") — once published, its preview page lets you
assign it to a class or individual students. Reach **Classes**
(`/teacher/classes`) to create a class and add students to its roster.
Reach **Import** (`/teacher/import`) to bulk-add questions from a `.csv` or
`.xlsx` file — try it with the header row
`question,option_a,option_b,correct_answer,points,subject,category,difficulty`.

To try the exam flow end to end: as teacher/admin, publish a quiz and
assign it to `student@quizguard.test` (directly, or via the seeded class);
sign in as that student, find it under **Assigned quizzes** on `/student`,
and hit **Start**. Answer the question(s), watch the countdown, and Submit
(or wait it out — it auto-submits at zero). The result appears immediately
on `/student` under **Past attempts**.

To try monitoring: before publishing, turn on **Require fullscreen** and/or
**Monitor activity** on the quiz's settings form, then run the flow above.
As the student, you'll see a fullscreen gate (if required) and a banner
naming what's tracked; exit fullscreen or switch tabs mid-attempt and it's
logged. As teacher/admin, open the quiz's preview page and click
**View Attempts** to see every attempt with a flagged-activity count, then
open one for the full per-question review and violation timeline.

To try live monitoring: make sure `pnpm realtime:dev` is running, then open
**View Attempts** as teacher/admin _before_ the student starts — the
**Currently taking** and **Live activity** cards at the top update in real
time as the student starts the attempt, gets flagged, and submits, with no
page refresh needed.

To try results: after a student or two have submitted a quiz, open its
preview page as teacher/admin and click **Results** — score distribution,
pass rate, and per-question difficulty appear immediately (no extra setup
needed, it reads the same attempt data everything else already wrote).
**Export CSV** downloads the same attempt list as a spreadsheet. On the
assigned class's roster page (`/teacher/classes/[id]`), the **Quiz results**
section shows that class's pass rate for the same quiz.

## Google Sheets import setup

Not configured by default — connecting returns a clear error until you add
your own Google Cloud OAuth credentials:

1. In [Google Cloud Console](https://console.cloud.google.com/), create (or
   select) a project.
2. **APIs & Services → Library**: enable the **Google Sheets API** and
   **Google Drive API**.
3. **APIs & Services → OAuth consent screen**: configure it (External is
   fine for testing; add your own Google account as a test user while the
   app is unpublished).
4. **APIs & Services → Credentials → Create Credentials → OAuth client ID**,
   type **Web application**. Add an authorized redirect URI:
   `http://localhost:3000/api/imports/google/callback` (adjust the host for
   non-local environments).
5. Copy the generated **Client ID** and **Client Secret** into
   `.env.local`:
   ```bash
   GOOGLE_CLIENT_ID=your-client-id
   GOOGLE_CLIENT_SECRET=your-client-secret
   ```
6. Restart `pnpm dev`. "Connect Google Account" on the Import page should
   now start a real OAuth flow.

The connection is per-session (an access token cached in Redis for about an
hour, not a persistent refresh token) — reconnecting after it expires is
expected, not a bug.

## Scripts

| Script                           | Purpose                                                 |
| -------------------------------- | ------------------------------------------------------- |
| `pnpm dev`                       | Start the Next.js dev server                            |
| `pnpm realtime:dev`              | Start the realtime (Socket.IO) server — see above       |
| `pnpm build` / `start`           | Production build / run                                  |
| `pnpm lint` / `lint:fix`         | ESLint                                                  |
| `pnpm format` / `format:check`   | Prettier                                                |
| `pnpm typecheck`                 | `tsc --noEmit`                                          |
| `pnpm test`                      | Unit tests (no external services required)              |
| `pnpm test:watch`                | Unit tests in watch mode                                |
| `pnpm test:integration`          | Integration tests — requires `pnpm docker:up`           |
| `pnpm db:generate`               | Generate a Drizzle migration from `src/database/schema` |
| `pnpm db:migrate`                | Apply pending migrations                                |
| `pnpm db:studio`                 | Open Drizzle Studio against the local database          |
| `pnpm db:seed`                   | Seed the three dev test accounts (see above)            |
| `pnpm docker:up` / `docker:down` | Start/stop PostgreSQL + Redis containers                |
| `pnpm prod:up` / `prod:down`     | Start/stop the full production stack (Nginx, TLS, ...)  |
| `pnpm prod:migrate`              | Run migrations against the production stack             |
| `pnpm loadtest:seed`             | Seed 150 synthetic students + a load-test quiz/class    |
| `pnpm loadtest:exam-flow`        | Simulate 150 concurrent students taking it (HTTP)       |
| `pnpm loadtest:realtime`         | Simulate 150 concurrent realtime connections            |
| `pnpm loadtest:cleanup`          | Remove everything the load-test scripts created         |

## Project structure

```text
src/
  app/                # Next.js App Router — pages and route handlers
    login/, admin/, teacher/, student/, dashboard/   # Phase 1 pages
    admin/users/          # account management (Phase 6)
    teacher/questions/    # list, new/, [id]/edit/ (Phase 3)
    teacher/quizzes/       # list, new/, [id]/edit/, [id]/preview/ (Phase 4, +assignments Phase 6),
                         # [id]/attempts/[attemptId]/ — teacher's monitoring review (Phase 8),
                         # [id]/results/ — score distribution + question difficulty (Phase 10)
    teacher/classes/        # list, [id]/ roster (Phase 6, +quiz results section Phase 10)
    teacher/import/         # single-page import flow (Phase 5)
    student/attempts/       # [attemptId]/ — the exam-taking + review page (Phase 7, +fullscreen
                         # gate and violation reporting Phase 8)
    api/auth/           # login, logout, me
    api/users/            # list/create, [id] (get/update/delete), [id]/reset-password
    api/questions/       # list/create, [id] (get/update/delete), facets
    api/quizzes/          # list/create, [id] (get/update/delete), publish, unpublish,
                         # archive, duplicate, [id]/questions (pool), [id]/assignments,
                         # [id]/attempts (start, +teacher list Phase 8), [id]/attempts/[attemptId]
                         # (teacher detail, Phase 8), [id]/results (+/export, Phase 10)
    api/classes/           # list/create, [id] (get/update/delete), [id]/students (roster),
                          # [id]/students/[studentId] (remove), [id]/available-students,
                          # [id]/results (Phase 10)
    api/students/           # lightweight active-student search (roster/assignment pickers)
    api/student/            # assignments/ (assigned quizzes), attempts/ (attempt history)
    api/attempts/           # [attemptId] (get), [attemptId]/answers (save), [attemptId]/submit,
                          # [attemptId]/violations (report, Phase 8)
    api/imports/           # preview, [sessionId]/mapping, [sessionId]/commit,
                          # google/{auth,callback,status,disconnect,spreadsheets,preview}
  components/ui/       # shadcn/ui primitives (+ dialog.tsx, Phase 6)
  features/            # Frontend feature modules: health/, auth/, teacher/ (sidebar shell),
                       # questions/ (list + builder form), quizzes/ (list, settings form,
                       # question picker, lifecycle actions, assignments), imports/ (single
                       # import page), admin/ (sidebar, user list), classes/ (list, roster),
                       # attempts/ (exam-taking UI, start button, fullscreen/violation
                       # handling, live presence join Phase 9), realtime/ (Phase 9 — the
                       # shared browser socket singleton), monitoring/ (Phase 9 — the
                       # teacher-facing live-monitor.tsx). The results pages (Phase 10) are
                       # plain server components with no client state, so they live directly
                       # under app/ rather than needing a features/results/ module.
  backend/              # Domain logic, one folder per bounded context (health/, auth/,
                       # questions/, quizzes/, imports/, users/, classes/, students/,
                       # assignments/, attempts/, answers/, monitoring/, realtime/,
                       # results/ so far)
  database/
    schema/              # users, teachers, students, classes, class-students, questions,
                         # question-options, quizzes, quiz-questions, quiz-assignments,
                         # exam-attempts, exam-attempt-questions, exam-answers,
                         # exam-violations, imports, import-errors (Phase 1-8 — Phases 9
                         # and 10 added no new tables; results are computed live off
                         # exam-attempts/exam-answers, see docs/ARCHITECTURE.md Section 13)
    migrations/          # drizzle-kit generate output
    seed/                 # upsert-user.ts, users.seed.ts, academic.seed.ts, run.ts
  realtime/              # server.ts (Phase 9) — the standalone Socket.IO process, run via
                       # `pnpm realtime:dev`; see "Running the realtime server" above
  lib/                  # env.ts, db.ts, redis.ts, rate-limit.ts, api-response.ts, ...
  proxy.ts              # Optimistic route protection (Next 16's renamed middleware) +
                       # nonce-based CSP generation (Phase 13)
  app/not-found.tsx      # Overrides Next's static default — needed a per-request nonce too
tests/
  unit/                 # No external services required — this is `pnpm test`
  integration/           # Requires docker compose services running
infrastructure/
  docker/               # Dockerfile (app, `target: runner`/`migrator`), Dockerfile.realtime
                       # (Phase 13)
  nginx/                 # nginx.conf (TLS termination, path-routed reverse proxy),
                       # certs/generate-dev-cert.sh (Phase 13)
  deployment/             # README.md — real-server deployment guide (Phase 13)
docs/
  ARCHITECTURE.md        # Full system design and phase roadmap
```

`src/backend/` currently has `health/`, `auth/`, `questions/`, `quizzes/`,
`imports/`, `users/`, `classes/`, `students/`, `assignments/`, `attempts/`,
`answers/`, `monitoring/`, `realtime/`, and `results/` — that's every
module the spec calls for; nothing is pre-scaffolded ahead of the phase
that actually implements it.

## Design reference

[stitch_quizguard_universal_exam_platform/](stitch_quizguard_universal_exam_platform/)
contains the source-of-truth visual design (the "Academic Precision" system —
colors, type scale, spacing, component styling) as static HTML mockups for
every major screen. `src/app/globals.css` ports its color/typography/radius
tokens into the Tailwind theme so the built app matches. Dark mode is a
derived approximation — the mockups themselves are light-only.

## Notes on this Next.js version

This project uses **Next.js 16**, which changed some conventions from
earlier versions relevant to this codebase:

- Middleware is renamed **Proxy** (`src/proxy.ts`, not `middleware.ts`) — it
  runs the Node.js runtime by default now, not Edge. Used for route
  protection since Phase 1 (see docs/ARCHITECTURE.md — Section 4).
- Route Handlers are **not cached by default**.
- `cookies()` is **async** (`await cookies()`).
- `AGENTS.md` / `CLAUDE.md` at the repo root are auto-generated and
  auto-restored by `next dev`/`next build`; they are intentionally committed.
