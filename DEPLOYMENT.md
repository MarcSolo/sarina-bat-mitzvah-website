# Deployment & Setup Guide

This guide walks through setting up the Sarina's Bat Mitzvah website for production deployment.

## Overview

The website consists of:
- **Static site** (Eleventy) hosted on GitHub Pages
- **Serverless backend** (Cloudflare Worker) for RSVP processing
- **GitHub Actions** for build/deploy and RSVP recording

## Prerequisites

- GitHub account with repository access
- Cloudflare account (free tier works)
- Resend account for email sending (free tier available)
- Custom domain (sarinabatmitzvah.com)

## Step 1: GitHub Pages Setup

1. **Enable GitHub Pages:**
   - Go to repository Settings → Pages
   - Select "GitHub Actions" as the build and deployment source
   - The site will deploy on every push to `main`

2. **Connect custom domain:**
   - Add `CNAME` file pointing to `sarinabatmitzvah.com` (already done)
   - In GitHub Pages settings, add custom domain `sarinabatmitzvah.com`
   - Update DNS at your domain registrar (see below)

3. **DNS Configuration (Namecheap or similar):**
   ```
   ALIAS record:  @  →  sarinabatmitzvah.github.io
   CNAME record:  www  →  sarinabatmitzvah.github.io
   ```
   - GitHub will issue an SSL certificate automatically
   - Enforce HTTPS in Pages settings once certificate is issued

## Step 2: Cloudflare Setup

### 2.1 Create Cloudflare Account & Configure Domain

1. Sign up at https://cloudflare.com
2. Add your domain `sarinabatmitzvah.com`
3. Update nameservers at your registrar (follow Cloudflare prompts)
4. Wait for DNS propagation (usually 5-30 minutes)

### 2.2 Create Turnstile Widget

1. Go to Cloudflare Dashboard → Turnstile
2. Create new site:
   - Domain: `sarinabatmitzvah.com`
   - Mode: Managed (recommended, no image puzzles)
3. Copy **Site Key** and **Secret Key**

### 2.3 Create KV Namespace (for rate limiting)

1. Cloudflare Dashboard → Workers & Pages → KV Namespaces
2. Create new namespace: `SARINA_RSVP_KV`
3. Note the ID for later

### 2.4 Create Cloudflare Worker

1. Dashboard → Workers & Pages → Create Application
2. Create a new Worker service
3. Copy the worker code from `worker/src/index.js` into the editor
4. Deploy
5. Note the worker URL (will look like `https://worker-name.username.workers.dev`)

### 2.5 Add Worker Secrets

Via Cloudflare Dashboard or `wrangler` CLI:

```bash
cd worker/

# Install wrangler if not already installed
npm install -g wrangler

# Login to Cloudflare
wrangler auth

# Add secrets
wrangler secret put TURNSTILE_SECRET
# Paste your Turnstile Secret Key

wrangler secret put RESEND_API_KEY
# Paste your Resend API key

wrangler secret put ADMIN_EMAIL
# Enter admin email (e.g., admin@example.com)

wrangler secret put GITHUB_DISPATCH_TOKEN
# Paste GitHub fine-grained PAT

wrangler secret put GITHUB_REPO
# Enter repo in format: owner/repo

# Deploy worker
wrangler deploy
```

## Step 3: Resend Email Setup

1. Sign up at https://resend.com
2. Add verified sender domain: `sarinabatmitzvah.com`
3. Follow verification steps (update DNS records)
4. Copy API key for Cloudflare Worker secret

## Step 4: GitHub Setup

### 4.1 Create Fine-Grained Personal Access Token

1. GitHub Settings → Developer settings → Personal access tokens → Fine-grained tokens
2. Create new token:
   - Name: `sarina-bat-mitzvah-dispatch`
   - Resource owner: Select your account
   - Repository access: Select this repository only
   - Permissions → Repository permissions:
     - Contents: Read & write (for recording RSVPs)
     - Actions: Read (for triggering workflows)
   - Generate and copy token

### 4.2 Add Repository Secrets

Store in GitHub (Settings → Secrets and variables → Actions):

- `TURNSTILE_SITE_KEY`: From Cloudflare Turnstile
- `WORKER_URL`: Your Cloudflare Worker URL (e.g., `https://worker-name.username.workers.dev`)

## Step 5: Update Configuration Files

### 5.1 Update RSVP Form Endpoint

In `src/rsvp.njk`, update the `WORKER_URL`:

```javascript
const WORKER_URL = 'https://your-worker-name.username.workers.dev/api/rsvp';
```

### 5.2 Update Turnstile Site Key

In `src/rsvp.njk`, update:

```javascript
const TURNSTILE_SITE_KEY = 'your-turnstile-site-key';
```

Or use an environment variable if available.

## Step 6: Test the Setup

1. **Build locally:**
   ```bash
   npm install
   npm run build
   ```

2. **Preview site:**
   ```bash
   npm start
   ```
   Visit http://localhost:8080

3. **Test RSVP form:**
   - Fill out form with test data
   - Submit and verify:
     - Form shows success message
     - Email is sent to admin
     - RSVP is recorded in GitHub (check `src/_data/rsvps.json`)

4. **Run accessibility checks:**
   ```bash
   npm run test:a11y
   ```

## Step 7: Deploy

1. Commit changes:
   ```bash
   git add .
   git commit -m "Configure production deployment"
   git push origin main
   ```

2. Verify deployment:
   - Check GitHub Actions (repository → Actions tab)
   - Verify site is live at https://sarinabatmitzvah.com
   - Test RSVP form on live site

## Monitoring & Maintenance

### Check RSVP Submissions

RSVPs are stored in `src/_data/rsvps.json` (private to repo, not published):
```bash
git log --oneline | grep "Add RSVP"  # See recent RSVPs
cat src/_data/rsvps.json | jq .      # View RSVP data
```

### Monitor Worker Logs

Cloudflare Dashboard → Workers & Pages → Your Worker → Logs

### Update Site Content

Edit pages in `src/` and push to `main` branch. Site rebuilds automatically via GitHub Actions.

## Troubleshooting

### RSVP form not submitting

1. Check Cloudflare Worker logs
2. Verify CORS headers allow your domain
3. Check browser console for JavaScript errors

### Emails not sending

1. Verify Resend API key is correct
2. Check Resend dashboard for bounced emails
3. Ensure admin email is correct

### RSVPs not recorded in repo

1. Check GitHub Actions workflow logs (`record-rsvp.yml`)
2. Verify `GITHUB_DISPATCH_TOKEN` has correct permissions
3. Check repo default branch is `main`

### Site not deploying

1. Check GitHub Actions `build-deploy.yml` logs
2. Verify Node.js dependencies installed correctly
3. Check for build errors in Eleventy output

## Security Notes

- Never commit API keys or tokens
- Use GitHub Secrets and Cloudflare Secrets
- Turnstile is privacy-friendly (no cookies tracked)
- Honeypot field helps catch spam bots
- Server-side rate limiting prevents abuse
- RSVP data is private (never published to site)

## Support

For issues:
1. Check GitHub Actions logs for deployment errors
2. Review Cloudflare Worker logs for RSVP processing errors
3. Test RSVP form locally with `npm start`
4. Verify all secrets and environment variables are set correctly
