# Deploying QuizGuard to a real server

This is deployment **guidance**, not a script — written and reviewed
against how `docker-compose.prod.yml` and `infrastructure/nginx/` actually
behave (verified locally end to end: HTTP→HTTPS redirect, TLS, CSP
nonces, WebSocket routing, body-size limits — see
`docs/ARCHITECTURE.md` — Section 16), but not run against a real
OVHcloud (or any other host's) account. The same honesty standard this
repo applies to Google Sheets import (Section 8): code and config are
complete and correct by inspection; live verification against a real
account is whoever actually deploys it.

OVHcloud is named because that's the target this checklist was written
for, but nothing here is OVHcloud-specific beyond "a VPS you can SSH into
and point DNS at" — any provider works the same way.

## 1. Provision a server

- A small VPS is enough to start: 2 vCPU / 4GB RAM comfortably runs
  Postgres, Redis, the Next.js app, the realtime server, and Nginx
  together (Phase 12's load testing, Section 15, ran the same stack on a
  dev laptop under real concurrent load without resource pressure).
- Install Docker Engine + the Docker Compose plugin on it. Everything
  else runs in containers — nothing else needs installing on the host.
- Open firewall ports 80 and 443 (inbound). Nothing else needs to be
  exposed — `docker-compose.prod.yml` deliberately doesn't publish
  Postgres/Redis/app/realtime ports to the host at all (Section 16);
  Nginx is the only public entry point.

## 2. Point DNS at it

Create an `A` record (and `AAAA` if the host has IPv6) for your domain
pointing at the server's IP. Wait for it to propagate before requesting a
certificate — Let's Encrypt's domain validation needs it resolvable.

## 3. Get a real certificate

`infrastructure/nginx/certs/generate-dev-cert.sh` is **local-demo-only**
(self-signed, `CN=localhost`) — do not use it here. Use `certbot`:

```bash
docker run --rm -p 80:80 \
  -v "$(pwd)/infrastructure/nginx/certs:/etc/letsencrypt/live/yourdomain" \
  certbot/certbot certonly --standalone -d yourdomain.example
```

Certbot's own filenames (`fullchain.pem`/`privkey.pem`) already match
what `infrastructure/nginx/nginx.conf` expects — no config change needed,
just replace the files. Set up renewal (certbot's own cron/systemd timer,
or re-run the command above periodically) — this repo doesn't automate
that for you (Section 21, "still deliberately missing").

## 4. Configure environment

Copy `.env.example` to a `.env` file next to `docker-compose.prod.yml`
(Docker Compose reads `.env` automatically) and set, at minimum:

```bash
POSTGRES_PASSWORD=<generate a real one>
APP_URL=https://yourdomain.example
AUTH_SECRET=<openssl rand -base64 32>
```

`GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` (Section 8) and `SENTRY_DSN` are
optional — leave them unset if you don't need Sheets import or error
monitoring yet.

## 5. Bring up the stack

```bash
docker compose -f docker-compose.prod.yml up -d postgres redis
docker compose -f docker-compose.prod.yml run --rm migrate
docker compose -f docker-compose.prod.yml up -d
```

Migrations run as a deliberate, separate step (Section 16) — never
automatically on container start. Run `migrate` again after pulling any
update that includes a new migration, before restarting `app`.

## 6. Seed the first admin account

`pnpm db:seed` (Section 9) creates dev-only test accounts with known
passwords — do **not** run it against production. Instead, insert the
first admin directly, then use `/admin/users` for everyone else from
there on:

```bash
docker compose -f docker-compose.prod.yml exec app node -e "
const { hash } = require('@node-rs/bcrypt');
hash('<a real password>', 12).then(console.log);
"
```

Then insert a `users` row with that hash and `role = 'admin'` via
`docker compose -f docker-compose.prod.yml exec postgres psql -U quizguard -d quizguard`.

## 7. Verify

- `https://yourdomain.example/api/health` returns `{"status":"healthy", ...}`.
- `http://yourdomain.example/` redirects to `https://`.
- Sign in as the admin account created above.
- Open a quiz's **View Attempts** page and confirm the live presence feed
  connects (Section 12/16) — this is the one thing that specifically
  depends on the WebSocket route (`/socket.io/`) working correctly through
  Nginx to the `realtime` service.

## What this doesn't cover

- Backups. `quizguard_prod_postgres_data` is a Docker named volume; back
  it up the same way you'd back up any Postgres data directory
  (`pg_dump`, volume snapshots, whatever your host provides). Not
  automated here.
- Zero-downtime deploys / multiple app replicas — Section 16/21 already
  documents this as unbuilt: today's stack is one `app` instance, one
  `realtime` instance, behind Nginx's single `upstream` entry each.
- Monitoring/alerting beyond `SENTRY_DSN` (optional, Phase 11) and
  `/api/health`. Wiring either into an actual paging/alerting system is
  outside this repo's scope.
