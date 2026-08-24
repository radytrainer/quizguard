import type { MetadataRoute } from "next";

import { SITE_URL } from "@/lib/site";

// Only the public marketing pages worth indexing — /login and /register carry no unique
// content for a search query and are marked noindex in their own metadata, so they're left out
// here too rather than pointing crawlers at a page that then tells them not to index it.
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: SITE_URL,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: `${SITE_URL}/pricing`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.6,
    },
  ];
}
