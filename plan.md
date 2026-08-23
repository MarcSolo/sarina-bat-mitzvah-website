# Project Plan: Sarina's Bat Mitzvah Website

> **Audience:** GitHub Copilot (coding agent) + human reviewer
> **Goal:** Build and deploy an accessible, static bat mitzvah website with an RSVP workflow that emails the admin, records RSVPs to a Markdown file in the repo, and resists spam.
> **Owner:** Marc Solomon
> **Target domain:** `sarinabatmitzvah.com` (GitHub Pages + custom domain, HTTPS enforced)

---

## 1. Project Overview

Build a small, fast, fully static website to share event details for Sarina's Bat Mitzvah and collect RSVPs. The site must meet **WCAG 2.2 Level AA**. Because GitHub Pages only serves static files, all "dynamic" behavior (email + writing RSVPs back to the repo) is handled by a small serverless function plus a GitHub Actions workflow.

### Success criteria (Definition of Done for the whole project)
- All 6 pages exist, are reachable from a persistent site header, and render correctly on mobile and desktop.
- The site logo appears on every page and links to the home page.
- The home page shows a large hero image of Sarina with appropriate alt text.
- The RSVP form works end-to-end: valid submissions (a) send an email to the admin, (b) append the RSVP to a Markdown file in the repo, and (c) show an accessible confirmation.
- Spam protection is in place and verified server-side.
- Automated + manual accessibility checks pass at WCAG 2.2 AA (see §8).
- Site is deployed to `sarinabatmitzvah.com` over HTTPS.
- Site content is responsive and adapts for both small and large screen sizes
- do not use a disclosure menu on the small screen design of the site, keep all site navigation links visible 
- supports the user's device preferences for appearance (dark, light)
- has a skip to main content link as first focusable element that appears on focus

---

## 2. Recommended Tech Stack & Architecture

Keep it simple, free-tier friendly, and easy to audit for accessibility.

| Layer | Recommendation | Why |
|---|---|---|
| Static site generator | **Eleventy (11ty)** with Nunjucks templates | DRY shared header/nav/footer across pages; full control over semantic HTML (important for WCAG). Plain HTML is an acceptable fallback if no build step is desired. |
| Styling | Hand-written CSS (or a small system like Pico.css) | Full control of color contrast, focus styles, spacing. Avoid heavy frameworks that fight accessibility. |
| Hosting | **GitHub Pages** | Free, HTTPS, custom domain, already in use. |
| Form backend | **Cloudflare Worker** (serverless function) | Free tier; validates spam token, sends email, triggers the repo commit. |
| Email delivery | **Resend** (or SendGrid/Mailgun) transactional email API | Reliable delivery to admin inbox; free tier for low volume. |
| Spam protection | **Cloudflare Turnstile** + honeypot field + server-side validation | Turnstile is privacy-friendly and accessible (no image puzzles by default). |
| RSVP storage | Markdown/data file committed via **GitHub Actions** (`repository_dispatch`) | Satisfies "adds details to a file in the repo." **Not displayed publicly.** |
| CI/CD | GitHub Actions | Build 11ty + deploy to Pages; append RSVP data on dispatch. |

### Architecture at a glance
```
Browser (RSVP form + Turnstile widget)
        │  POST JSON (form data + Turnstile token)
        ▼
Cloudflare Worker  ──►  1) Verify Turnstile token + honeypot
                        2) Send email to admin (Resend API)
                        3) Fire GitHub repository_dispatch event
        │
        ▼
GitHub Actions (on: repository_dispatch)
        └─► Append RSVP record to /src/_data/rsvps.json (private data file, NOT rendered publicly)
            └─► Commit + push
```

> **Privacy note:** RSVP records are stored in the repo as required, but the guest list is **never displayed on the website**. Admin reviews RSVPs via the emailed notifications and/or the raw data file in the repo.

> **Hosting decision (locked):** The site is hosted on **GitHub Pages** with a **Cloudflare Worker** serverless backend for the RSVP email + repo-commit workflow. Do not use Netlify.

---

## 3. Information Architecture (Pages)

| Page | Route | Purpose |
|---|---|---|
| Home / Welcome | `/` | Hero image of Sarina, warm welcome, event date/overview, primary CTA to RSVP. |
| RSVP | `/rsvp/` | The RSVP form (see §5). |
| Events | `/events/` | Schedule of events (Friday service, Saturday service, Saturday party). |
| Hotel Info | `/hotel/` | Room block details, booking link, cutoff date. |
| Mitzvah Project | `/mitzvah-project/` | Sarina's project story and how guests can contribute. |

**Global elements (every page):**
- **Header** containing the **site logo (links to `/`)** and the **main navigation**: RSVP, Events, Hotel Info, Mitzvah Project.
- **Footer** with event date and a contact email.
- A **"Skip to main content"** link as the first focusable element.

---

## 4. Repository Structure

```
/
├─ .github/
│  └─ workflows/
│     ├─ build-deploy.yml        # Build 11ty + deploy to GitHub Pages
│     └─ record-rsvp.yml         # on: repository_dispatch → append RSVP + commit
├─ src/
│  ├─ _includes/
│  │  ├─ base.njk                # HTML skeleton, <head>, skip link, header, footer
│  │  ├─ header.njk              # logo (link to /) + main nav
│  │  └─ footer.njk
│  ├─ _data/
│  │  └─ rsvps.json              # RSVP records (private data file — NOT rendered on the site)
│  ├─ assets/
│  │  ├─ css/styles.css
│  │  ├─ img/logo.svg
│  │  └─ img/sarina-hero.jpg     # provide optimized 1x/2x versions
│  ├─ index.njk                  # Home
│  ├─ rsvp.njk
│  ├─ events.njk
│  ├─ hotel.njk
│  └─ mitzvah-project.njk
├─ rsvp-worker/                   # Cloudflare Worker (form backend)
│  ├─ index.js
│  └─ wrangler.toml
├─ CNAME                          # sarinabatmitzvah.com
├─ .eleventy.js                   # 11ty config
├─ package.json
└─ README.md
```

---

## 5. Feature: RSVP Workflow (the core deliverable)

### 5.1 RSVP form fields
| Field | Type | Required | Notes |
|---|---|---|---|
| Full name | text | Yes | Primary guest. |
| Email | email | Yes | For confirmation + admin follow-up. |
| Number in party | number | Yes | Min 1. |
| Additional guest names | textarea | No | One per line. |
| Attending **Friday night service** | radio (Yes/No) | Yes | |
| Attending **Saturday morning service** | radio (Yes/No) | Yes | |
| Attending **Saturday party** | radio (Yes/No) | Yes | |
| Dietary restrictions | textarea | No | |
| Message / note | textarea | No | |
| Turnstile token | hidden (widget) | Yes | Spam check. |
| Honeypot ("website") | text, visually hidden | Must be empty | Spam trap; ignore submissions where filled. |

### 5.2 Submission flow (acceptance criteria)
1. **Client-side:** Validate required fields and email format before submit; render the Turnstile widget; POST form data as JSON to the Worker endpoint.
2. **Server-side (Worker):**
   - Reject if honeypot field is non-empty (return 200 silently to not tip off bots).
   - Verify the Turnstile token with Cloudflare's `siteverify` API; reject on failure.
   - Validate/sanitize all inputs (trim, length limits, escape).
   - Send an email to the admin containing all RSVP details (see §5.3).
   - Fire a GitHub `repository_dispatch` event with the sanitized RSVP payload.
   - Return a JSON success/error response.
3. **Client-side:** On success, hide the form and show an accessible confirmation message; **move keyboard focus** to the confirmation and announce it via `aria-live="polite"`. On error, show an accessible error summary and keep entered values.

### 5.3 Email to admin (acceptance criteria)
- Sent on every valid submission to the admin address (store as a Worker secret, not in code).
- Subject: `New RSVP — {Full name}`.
- Body includes: name, email, party size, guest names, Friday/Saturday service + party answers, dietary restrictions, message, and a timestamp.
- Must not be triggered by spam/honeypot/failed-Turnstile submissions.

### 5.4 Write RSVP to a file in the repo (acceptance criteria)
- A GitHub Actions workflow (`record-rsvp.yml`) listens for the `repository_dispatch` event.
- It appends the new record to a data/Markdown file in the repo (`src/_data/rsvps.json` and/or a `rsvps.md` log).
- The commit is made by the Action bot with a message like `Add RSVP: {name} ({timestamp})`.
- **The guest list is NOT displayed anywhere on the public website.** There is no attendee page and no template renders the RSVP records. The file exists purely as an admin-accessible record inside the repository.
- The RSVP data file is the admin's record of who responded and what they selected (events attending, party size, dietary needs, notes). The admin reviews it via the repo and/or the emailed notifications (§5.3).
- To avoid any accidental exposure, ensure the RSVP data file is excluded from the built site output (e.g., keep it in `_data/` which 11ty does not publish, and do not reference it from any page template).

### 5.5 Spam reduction (acceptance criteria)
- **Cloudflare Turnstile** widget on the form; token verified server-side (never trust client).
- **Honeypot** hidden field; submissions with it filled are silently dropped.
- **Basic rate limiting** in the Worker (e.g., reject bursts from the same IP).
- Server-side input length caps to prevent payload abuse.

---

## 6. Backend Setup (Cloudflare Worker)

1. Create a Cloudflare account; install `wrangler`.
2. Create a Turnstile site + secret keys (add the site key to the form, secret key to the Worker).
3. Worker secrets (via `wrangler secret put`): `TURNSTILE_SECRET`, `RESEND_API_KEY`, `ADMIN_EMAIL`, `GITHUB_DISPATCH_TOKEN` (fine-grained PAT with `repo` dispatch permission), `GITHUB_REPO`.
4. Worker responsibilities: verify Turnstile → send email (Resend) → `POST` to GitHub `repository_dispatch` → return JSON.
5. Configure CORS to allow only the site origin.
6. Deploy the Worker; note its URL for the form `fetch()` target.

> **Do not commit any secrets.** All keys live in Cloudflare/GitHub secrets, never in the repo.

---

## 7. Deployment

1. Add `CNAME` file with `sarinabatmitzvah.com`.
2. Configure GitHub Pages to build from the `main` branch (or Actions).
3. `build-deploy.yml`: install deps → `eleventy` build → deploy `_site` to Pages.
4. Configure DNS at Namecheap:
   - Apex `A`/`ALIAS` records to GitHub Pages IPs (and `www` `CNAME` to `username.github.io`).
   - Enable **"Enforce HTTPS"** in Pages settings once the cert is issued.
5. Verify the site loads over HTTPS at the custom domain.

---

## 8. Accessibility and Design Requirements (WCAG 2.2 AA)

Treat this as a hard requirement, not a nice-to-have. Build accessibly from the start. Follow the first rule of ARIA (only use it when there isn't a native HTML element or attribute to achieve the goal)

### 8.1 Structure & semantics
- Valid HTML5 with landmarks: one `<header>`, `<nav>`, `<main>` (one per page), `<footer>`.
- A single, logical heading order per page (one `<h1>`; no skipped levels).
- **Skip to main content** link as the first focusable element (WCAG 2.4.1).
- Nav marked up as a list; the current page indicated with `aria-current="page"`.

### 8.2 Images & media
- Hero image of Sarina has meaningful `alt` text (WCAG 1.1.1). Decorative images use empty `alt=""`.
- Logo link has an accessible name (e.g., alt text like "Sarina's Bat Mitzvah — home").
- Provide responsive/optimized image sizes for performance.

### 8.3 Color & contrast
- Text contrast ≥ 4.5:1 (normal) / 3:1 (large) — WCAG 1.4.3.
- Non-text UI (form borders, focus indicators, icons) ≥ 3:1 — WCAG 1.4.11.
- Don't rely on color alone to convey meaning — WCAG 1.4.1.

### 8.4 Keyboard & focus (includes new WCAG 2.2 criteria)
- All interactive elements reachable and operable by keyboard; no traps (2.1.1/2.1.2).
- **Visible focus indicator** on every focusable element — 2.4.7 and **2.4.11 Focus Not Obscured (Minimum)** (new in 2.2): focused element not hidden behind sticky headers.
- **2.5.8 Target Size (Minimum)** (new in 2.2): interactive targets ≥ 24×24 CSS px (nav links, buttons, radios/labels).
- Logical DOM/tab order matches visual order (2.4.3).

### 8.5 Forms (RSVP)
- Every field has a programmatically associated `<label>` (1.3.1, 3.3.2).
- Group related radios in a `<fieldset>` with a `<legend>` (e.g., "Attending Friday night service?").
- Errors identified in text with clear instructions; error summary receives focus (3.3.1).
- **3.3.7 Redundant Entry** (new in 2.2): don't force re-entering info already provided in the same session.
- **3.3.8 Accessible Authentication (Minimum)** (new in 2.2): the spam mechanism must not require a cognitive test. Turnstile satisfies this (no image/puzzle by default) — avoid old-style CAPTCHAs.
- Confirmation/status messages use `aria-live` and move focus appropriately.
- Autocomplete attributes on name/email fields (1.3.5).

### 8.6 Responsive & resilience
- Content reflows at 320px width with no horizontal scroll (1.4.10).
- Usable at 200% zoom and with 1.5× line-height text spacing (1.4.4, 1.4.12).
- Respects `prefers-reduced-motion` for any animation.
- Language of page set via `<html lang="en">` (3.1.1).

### 8.7 Accessibility testing (Definition of Done)
- Automated: run **axe** / Lighthouse / Pa11y in CI; zero critical violations.
- Manual: keyboard-only pass on every page; screen reader smoke test (VoiceOver/NVDA) on nav, hero, and the RSVP form incl. error + success states.
- Verify color contrast on the final palette.

### 8.8 Styles and Colors
 - Sarina likes purples and teals, try to use these colors to create a modern and clean color palette for the site
 - Use bat_mitzvah_website_sample.webp as inspiration for the site layout and logo

---

## 9. Milestones / Phased Delivery

| Phase | Deliverable | Notes |
|---|---|---|
| **0. Scaffold** | Repo, 11ty config, base template with header (logo→home), nav, footer, skip link | Foundation for all pages. |
| **1. Static pages** | Home (hero), Events, Hotel Info, Mitzvah Project | Content can be placeholder; structure must be final + accessible. |
| **2. Styling & a11y baseline** | CSS, focus styles, contrast, responsive layout | Pass automated a11y checks. |
| **3. RSVP form (frontend)** | Accessible form + client validation + Turnstile widget | No backend yet; stub submit. |
| **4. Backend** | Cloudflare Worker: Turnstile verify + email + dispatch | Wire form to Worker. |
| **5. RSVP persistence** | `record-rsvp.yml` appends each RSVP to the repo data file | Record only — **not displayed on the site** (§5.4). |
| **6. Deploy** | GitHub Pages + custom domain + HTTPS | `sarinabatmitzvah.com` live. |
| **7. QA & a11y audit** | Manual keyboard + screen reader pass; fix issues | Final sign-off. |

---

## 10. Environment Variables / Secrets (never commit)

| Secret | Location | Purpose |
|---|---|---|
| `TURNSTILE_SITE_KEY` | Public (in form HTML) | Renders widget. |
| `TURNSTILE_SECRET` | Cloudflare Worker | Server-side token verification. |
| `RESEND_API_KEY` | Cloudflare Worker | Send admin email. |
| `ADMIN_EMAIL` | Cloudflare Worker | Recipient of RSVP emails. |
| `GITHUB_DISPATCH_TOKEN` | Cloudflare Worker | Fine-grained PAT to fire `repository_dispatch`. |
| `GITHUB_REPO` | Cloudflare Worker | `owner/repo` target for dispatch. |

---

## 11. Open Questions (please confirm before/while building)
1. **Static generator** — 11ty (recommended) or plain HTML with no build step?
2. **Email provider** — Resend, SendGrid, or Mailgun?
3. **Event details** — final dates/times, venue addresses, hotel block, and mitzvah project copy.

> **Decided:** RSVP records are stored in the repo but **never displayed publicly**. Backend is **GitHub Pages + Cloudflare Worker** (not Netlify).

---

## 12. Notes for the Copilot coding agent
- Prioritize **semantic HTML and WCAG 2.2 AA** at every step; do not add a component unless it is keyboard- and screen-reader-accessible.
- Never hardcode secrets; read them from environment/secrets.
- Keep dependencies minimal.
- Each phase should be a separate PR with a short checklist of the acceptance criteria it satisfies.
- Include an automated accessibility check (axe/Pa11y) in CI and fail the build on critical violations.
