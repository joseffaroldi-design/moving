import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/siteUrl";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // Keep private, authenticated, tokenized, and operational surfaces out of search indexes.
        disallow: [
          "/dashboard",
          "/portal",
          "/mobile",
          "/login",
          "/forgot-password",
          "/auth",
          "/q",
          "/print",
          "/api",
        ],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
