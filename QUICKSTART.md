# Quick Start Guide

Get the Sarina's Bat Mitzvah website up and running locally in 2 minutes.

## Prerequisites
- Node.js 18+ installed
- Git (already initialized in this repo)

## Local Development

### 1. Install dependencies
```bash
npm install
```

### 2. Start dev server
```bash
npm start
```

### 3. Open browser
Visit http://localhost:8080

### 4. Make changes
Edit files in `src/` and the site updates automatically. Press Ctrl+C to stop the server.

## Build for production
```bash
npm run build
```

Output goes to `_site/` directory.

## File Locations

- **Pages:** `src/*.njk` (index, rsvp, itinerary, directions, hotel, mitzvah-project)
- **Layout:** `src/_includes/base.njk`
- **Styles:** `src/assets/css/styles.css`
- **Images:** `src/assets/img/`
- **Config:** `.eleventy.js`

## Next Steps

See [SETUP_CHECKLIST.md](SETUP_CHECKLIST.md) for full setup instructions (Cloudflare, Resend, GitHub Actions, custom domain, etc.).

## Troubleshooting

**Port 8080 already in use?**
```bash
npm start -- --port 8081
```

**Build errors?**
```bash
rm -rf node_modules _site
npm install
npm run build
```

**Need help?**
- Check [DEPLOYMENT.md](DEPLOYMENT.md) for detailed deployment info
- Check [README.md](README.md) for project overview
