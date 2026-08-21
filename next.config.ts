import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Produces a minimal .next/standalone server for infrastructure/docker/Dockerfile.
  output: "standalone",
  // Removes the `X-Powered-By: Next.js` response header — no reason to advertise the stack.
  poweredByHeader: false,
  // Phase 13's Docker build (docs/ARCHITECTURE.md — Section 16) crashed on boot with
  // `Cannot find module '.../@swc/helpers/esm/_interop_require_default.js'` — the standalone
  // output's file tracer (@vercel/nft, which only follows statically-analyzable require/import
  // calls) copied @swc/helpers' `cjs/` variant but missed `esm/`, a documented, known tracing
  // gap (node_modules/next/dist/docs/.../output.md, "Caveats"). `@swc/helpers` was also added
  // as a direct dependency (package.json) so pnpm hoists it to a top-level, glob-resolvable
  // path — without that, this glob had nothing to match at all.
  outputFileTracingIncludes: {
    "/*": ["./node_modules/@swc/helpers/**/*"],
  },
  async headers() {
    return [
      {
        // `Content-Security-Policy` is deliberately not set here — Phase 13 (docs/ARCHITECTURE
        // .md — Section 16) moved it into src/proxy.ts as a nonce-based policy, which needs
        // per-request generation this static `headers()` config can't do. These headers don't
        // need per-request dynamism, so they stay here; proxy.ts's matcher excludes /api, so
        // API routes keep these (nosniff matters for a JSON response) but not CSP, which
        // governs script/style execution in an HTML document — meaningless for a JSON reply.
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), payment=()",
          },
          // `includeSubDomains`/`preload` are commitments about the production domain's own
          // subdomains — still Phase 13's call to make, deferred to whichever real domain
          // actually gets deployed (infrastructure/deployment/), not decided speculatively here.
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
