# Sarina's Bat Mitzvah Website

A modern, accessible static website built with Eleventy, featuring event information and an RSVP workflow.

## Quick Start

```bash
npm install
npm start
```

Visit http://localhost:8080

## Building for production

```bash
npm run build
```

The site will be built to `_site/`.

## Testing

Run accessibility checks:
```bash
npm run test:a11y
```

## Tech Stack

- **Static Site Generator:** Eleventy (11ty)
- **Hosting:** GitHub Pages
- **Backend (RSVP):** Cloudflare Worker
- **Email:** Resend
- **Spam Protection:** Cloudflare Turnstile
- **Domain:** sarinabatmitzvah.com

## Deployment

The site automatically builds and deploys to GitHub Pages via GitHub Actions on push to main.

## Structure

```
src/
├── _includes/       # Reusable templates
├── _data/          # Data files (RSVP records - private)
├── assets/         # Images, stylesheets
└── *.njk           # Page templates
```

## Accessibility

This site is built to meet WCAG 2.2 Level AA standards with:
- Semantic HTML
- Keyboard navigation
- Screen reader support
- Color contrast compliance
- Focus indicators
- Responsive design

## License

MIT
