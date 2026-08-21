// Vitest stub for the `server-only` package, which otherwise throws unconditionally outside
// Next.js's bundler (it only resolves to a no-op via the "react-server" export condition,
// which we deliberately don't set globally — that condition also changes how `react`/
// `react-dom` resolve and would break component tests). Aliased in vitest.config.mts.
export {};
