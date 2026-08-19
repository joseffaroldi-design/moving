# Local SEO Audit — 2026-08-19

## Scope

Repository: `joseffaroldi-design/moving`

The audit focused on the production marketing site, service-area architecture, structured data, sitemap behavior, robots directives, canonicals, and internal linking.

## What already exists

The site already has a strong local SEO foundation:

- Dynamic service-area pages under `/service-areas/[slug]`.
- Unique city metadata, H1s, introductory copy, neighborhoods, landmarks, FAQs, and nearby-area links sourced from `src/lib/cities.ts`.
- Service pages under `/services/[slug]`.
- Canonical metadata for city pages.
- Open Graph and Twitter metadata for city pages.
- Breadcrumb and FAQ JSON-LD.
- Service JSON-LD connecting each city page to the canonical Southern Magnolia Movers business entity.
- An XML sitemap generated from the service and city registries.
- A robots route intended to keep private application surfaces out of search.

Existing city/neighborhood pages include New Orleans, Metairie, Kenner, Lakeview, Uptown, Mid-City, Garden District, French Quarter, Harahan, Jefferson, Elmwood, and River Ridge.

## Issues corrected in this branch

### 1. Duplicate/fictitious city business entities

Each city page previously emitted a separate `MovingCompany` entity named `Southern Magnolia Movers — <City>` and assigned a `PostalAddress` in that city. That can imply separate physical business locations where no such location has been established.

Fix: city pages now emit a city-specific `Service` entity whose provider references the single canonical business entity at `/#business`. The root business schema no longer invents a partial postal address. Service areas are represented through `areaServed`.

### 2. Robots coverage gaps

The previous robots configuration covered `/dashboard/`, `/portal/`, `/mobile/`, `/login`, and `/api/`, but did not cover several private or tokenized routes.

Fix: crawl exclusions now use prefix-safe paths for dashboard, portal, mobile, login, forgot-password, auth, quote-token (`/q`), print, and API routes.

### 3. False sitemap `lastModified` dates

The sitemap previously used `new Date()` for every URL on every generation, which can claim that all pages were modified at the current time even when content did not change.

Fix: `lastModified` is omitted until trustworthy per-page modification timestamps are available. Canonical URLs, change frequencies, and priorities remain.

## Existing strengths preserved

- No city page URLs were changed.
- No working public pages were removed.
- No service pages were duplicated.
- Existing canonical metadata remains intact.
- Existing city-specific content, FAQs, neighborhood context, images, CTAs, and internal links remain intact.
- Private application functionality and backend code were not changed.

## Recommended next content expansion

The current `MovingCompany` schema already lists several broader Southeast Louisiana markets as service areas, but dedicated city pages are not currently present for every one of them. Before adding them, confirm that Southern Magnolia Movers actively wants to target and serve each market. High-priority candidates are:

- Covington
- Mandeville
- Slidell
- Hammond
- Gretna
- Laplace
- Houma

Each should receive original, useful content rather than templated city-name swaps.

## Owner actions outside code

- Complete/verify Google Business Profile as a service-area business if customers are not served at the business address.
- Keep the real-world business name consistent across the website and listings.
- Add accurate service areas, services, phone, hours, website, and photos to Google Business Profile.
- Set up Google Search Console and submit the sitemap.
- Claim/update Bing Places and Apple Business Connect.
- Build a repeatable post-move Google review request process.
- Pursue legitimate local citations and relationships with real estate agents, storage facilities, apartment communities, chambers, and neighborhood organizations.

## Validation still required before production merge

- Run the frontend production build/typecheck.
- Inspect rendered `/robots.txt` and `/sitemap.xml`.
- Validate the homepage and a sample service-area page in Google's Rich Results Test.
- Verify private routes remain protected independently of robots directives.
