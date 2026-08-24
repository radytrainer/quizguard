import type { MetadataRoute } from "next";

import { SITE_URL } from "@/lib/site";

// Everything role-protected redirects an unauthenticated crawler straight to /login anyway
// (proxy.ts), so there's nothing indexable behind these prefixes — disallowing them outright
// saves crawl budget instead of spending it on redirect chains.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/admin", "/teacher", "/student", "/dashboard"],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
