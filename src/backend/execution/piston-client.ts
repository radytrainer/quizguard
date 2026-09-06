import "server-only";

import { env } from "@/lib/env";

export interface PistonExecuteResult {
  run: {
    stdout: string;
    stderr: string;
    code: number | null;
    signal: string | null;
  };
  compile?: { stdout: string; stderr: string; code: number | null };
}

/**
 * Thin wrapper around Piston's `POST /api/v2/execute` — the only HTTP call this whole feature
 * makes to the sandbox. `AbortController`-based timeout with headroom over Piston's own
 * `run_timeout` payload field, so a runaway sandbox process (Piston's own timeout failing to
 * fire for some reason) can't hang this request indefinitely either.
 */
export async function pistonExecute(params: {
  language: string;
  version: string;
  code: string;
  stdin: string;
  runTimeoutMs: number;
}): Promise<PistonExecuteResult> {
  if (!env.PISTON_URL) {
    throw new Error("PISTON_URL is not configured");
  }

  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    params.runTimeoutMs + 3000,
  );
  try {
    const res = await fetch(`${env.PISTON_URL}/api/v2/execute`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        language: params.language,
        version: params.version,
        files: [{ content: params.code }],
        stdin: params.stdin,
        run_timeout: params.runTimeoutMs,
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error(`Piston returned ${res.status}`);
    }
    return (await res.json()) as PistonExecuteResult;
  } finally {
    clearTimeout(timer);
  }
}
