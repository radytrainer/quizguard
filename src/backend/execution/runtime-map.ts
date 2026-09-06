/**
 * The one place empirically-confirmed Piston language/version identifiers live — do not
 * hand-edit without re-checking against a live `GET {PISTON_URL}/api/v2/runtimes` (or run
 * `pnpm piston:install`, which prints the exact available strings). A Piston image upgrade can
 * rename an alias or bump a version, silently breaking execution if this drifts.
 */
// Confirmed against a live `GET {PISTON_URL}/api/v2/runtimes` on the ghcr.io/engineer-man/piston
// image, after `pnpm piston:install` — the javascript runtime is backed by "node" (version
// 20.11.1), not a "javascript" package name, but its execute-time `language` field really is
// "javascript". Re-check after any Piston image upgrade.
export const PISTON_RUNTIME: Record<
  "python" | "javascript",
  { language: string; version: string }
> = {
  python: { language: "python", version: "3.12.0" },
  javascript: { language: "javascript", version: "20.11.1" },
};
