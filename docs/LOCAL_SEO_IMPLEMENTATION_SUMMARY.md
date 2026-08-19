# Local SEO Implementation Summary

Branch: `agent/local-seo-hardening`

Changes in this branch are intentionally narrow and production-safe:

1. Reuse one canonical Southern Magnolia Movers business entity across location pages.
2. Remove implied city-specific business addresses from structured data.
3. Preserve city-specific `Service`, breadcrumb, and visible FAQ structured data.
4. Expand robots exclusions to private/tokenized application routes.
5. Stop emitting false current-time `lastModified` values for every sitemap URL.
6. Document the existing local SEO foundation and remaining owner actions.

No backend, Supabase, authentication, operational workflow, quote, job, portal, or crew logic is changed.
