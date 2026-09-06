/**
 * One-time (per `quizguard_piston_packages`/`quizguard_prod_piston_packages` volume) setup step
 * for the self-hosted Piston sandbox (Phase 16, code_answer questions) — installs the python and
 * javascript/node runtimes so src/backend/execution/ has something to execute against. Run
 * explicitly after `piston` is healthy (`docker compose up -d piston`), never automatically —
 * same "documented manual step" precedent as `prod:migrate`.
 *
 * Deliberately queries Piston's own `/api/v2/packages` for the exact available language/version
 * strings rather than hardcoding a guess — Piston's package list changes with image updates, and
 * the execute-time language alias (e.g. is the JS runtime installed as "node" or exposed to
 * `/api/v2/execute` as "javascript"?) isn't something to assume from outside a running instance.
 */
import { env } from "@/lib/env";

interface PistonPackage {
  language: string;
  language_version: string;
  installed: boolean;
}

const WANTED_LANGUAGES = ["python", "node", "javascript", "deno"];

async function main() {
  if (!env.PISTON_URL) {
    throw new Error(
      "PISTON_URL is not set — add it to .env.local (see .env.example) before running this.",
    );
  }
  const baseUrl = env.PISTON_URL;

  const listRes = await fetch(`${baseUrl}/api/v2/packages`);
  if (!listRes.ok) {
    throw new Error(
      `GET /api/v2/packages returned ${listRes.status} — is Piston up and healthy?`,
    );
  }
  const packages = (await listRes.json()) as PistonPackage[];

  console.log(
    `Found ${packages.length} known packages. Candidates matching ${WANTED_LANGUAGES.join(", ")}:`,
  );
  const candidates = packages.filter((p) => WANTED_LANGUAGES.includes(p.language));
  for (const p of candidates) {
    console.log(`  ${p.language} ${p.language_version} — installed: ${p.installed}`);
  }

  // Pick the highest not-yet-installed version per language — good enough for "latest
  // available," and installing an already-installed package is a harmless no-op if this ever
  // runs twice, so this isn't strictly necessary, just avoids a pointless request. Numeric
  // segment-by-segment comparison, not string comparison — "3.9.4" > "3.12.0" as plain strings
  // (since "9" > "1"), which is wrong for versions.
  function isNewer(a: string, b: string): boolean {
    const partsA = a.split(".").map(Number);
    const partsB = b.split(".").map(Number);
    for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
      const diff = (partsA[i] ?? 0) - (partsB[i] ?? 0);
      if (diff !== 0) return diff > 0;
    }
    return false;
  }

  const toInstall = new Map<string, PistonPackage>();
  for (const p of candidates) {
    if (p.installed) continue;
    const existing = toInstall.get(p.language);
    if (!existing || isNewer(p.language_version, existing.language_version)) {
      toInstall.set(p.language, p);
    }
  }

  if (toInstall.size === 0) {
    console.log("Nothing to install — all candidate languages are already installed.");
    return;
  }

  for (const p of toInstall.values()) {
    console.log(`Installing ${p.language} ${p.language_version}...`);
    const res = await fetch(`${baseUrl}/api/v2/packages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ language: p.language, version: p.language_version }),
    });
    const body = await res.json().catch(() => null);
    console.log(`  -> ${res.status}`, body);
  }

  console.log(
    "\nDone. Confirm with: curl " +
      baseUrl +
      "/api/v2/runtimes — then update src/backend/execution/runtime-map.ts with the exact " +
      "language/version strings shown there.",
  );
}

main().catch((error: unknown) => {
  console.error("Piston package install failed:", error);
  process.exitCode = 1;
});
