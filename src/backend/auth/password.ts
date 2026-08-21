// No "server-only" guard here (unlike session.ts/rbac.ts/auth.service.ts): this module is
// also imported by src/database/seed/users.seed.ts, which runs standalone via tsx, outside
// Next's bundler — "server-only" throws unconditionally there. Nothing client-side imports
// this module today; it lives under src/backend/ specifically to signal it shouldn't.
//
// `@node-rs/bcrypt`, not `bcryptjs`: Phase 12 load testing found bcryptjs's pure-JS hashing
// runs synchronously on Node's single event-loop thread despite its Promise-based API — under
// concurrent logins it starved the event loop badly enough to look like Postgres connection-pool
// timeouts (queued queries never got a tick to resolve within connectionTimeoutMillis), not an
// actual pool-sizing problem. @node-rs/bcrypt is a native (prebuilt, no node-gyp needed) addon
// that runs the hash on a libuv worker thread — see docs/ARCHITECTURE.md — Section 22.
import { hash, verify } from "@node-rs/bcrypt";

const SALT_ROUNDS = 12;

export function hashPassword(plain: string): Promise<string> {
  return hash(plain, SALT_ROUNDS);
}

export function verifyPassword(
  plain: string,
  hashed: string,
): Promise<boolean> {
  return verify(plain, hashed);
}
