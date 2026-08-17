# Setup Checklist: Sarina's Bat Mitzvah Website

This checklist guides you through completing the website setup. Most of the infrastructure is built; you'll need to configure the external services and update some configuration values.

## ✅ Completed (Automated)

### Project Structure & Configuration
- [x] Eleventy 11ty project initialized with Nunjucks templates
- [x] Git repository with .gitignore configured
- [x] npm dependencies configured (package.json)
- [x] Base layout template with header, nav, footer, skip link
- [x] WCAG 2.2 AA compliant CSS with dark mode support
- [x] Logo SVG created

### Pages (All 6)
- [x] Home page with hero and event highlights
- [x] RSVP page with complete form (honeypot, validation, error handling)
- [x] Itinerary page with timeline
- [x] Directions page with venue info
- [x] Hotel Info page with room block details
- [x] Mitzvah Project page with contribution options

### Backend Infrastructure
- [x] Cloudflare Worker code (RSVP API endpoint)
  - Turnstile token verification
  - Form validation & sanitization
  - Email sending (Resend integration)
  - GitHub repository_dispatch triggering
  - Rate limiting
  - CORS headers

### GitHub Actions Workflows
- [x] `build-deploy.yml` - Builds site & deploys to GitHub Pages on push
- [x] `record-rsvp.yml` - Records RSVPs to JSON file on dispatch event

### Documentation
- [x] README.md with project overview
- [x] DEPLOYMENT.md with detailed setup instructions
- [x] .env.example with configuration template

---

## 📋 Manual Setup Required

Follow these steps in order. Estimated time: **45-60 minutes**

### Step 1: Create Cloudflare Account & Configure Domain

**Time: 10-15 minutes**

1. [ ] Go to https://dash.cloudflare.com and create account (or login)
2. [ ] Add domain `sarinabatmitzvah.com` to Cloudflare
3. [ ] Update nameservers at your domain registrar (Namecheap, GoDaddy, etc.) to Cloudflare's nameservers
   - Cloudflare will provide exact nameservers after you add the domain
4. [ ] Wait for DNS propagation (check status in Cloudflare dashboard)
   - This usually takes 5-30 minutes but can take up to 48 hours

**Verification:** Run in terminal:
```bash
dig sarinabatmitzvah.com +short
# Should show Cloudflare nameservers
```

### Step 2: Create Cloudflare Turnstile Widget

**Time: 5 minutes**

1. [ ] In Cloudflare Dashboard, go to **Turnstile** (left sidebar)
2. [ ] Click **Create Site**
3. [ ] Fill in:
   - **Domain:** `sarinabatmitzvah.com`
   - **Mode:** Managed (recommended)
4. [ ] Copy **Site Key** and **Secret Key**
5. [ ] Store them safely (you'll need them in the next steps)

### Step 3: Create Resend Email Account

**Time: 5 minutes**

1. [ ] Go to https://resend.com and create account
2. [ ] Go to **Domains** and add `sarinabatmitzvah.com`
3. [ ] Follow Resend's DNS verification steps
   - You'll need to add DNS records in Cloudflare
   - Go to Cloudflare Dashboard → DNS → Add records per Resend instructions
4. [ ] Once verified, copy your **API Key** from Resend dashboard
5. [ ] Store it safely

### Step 4: Deploy Cloudflare Worker

**Time: 10-15 minutes**

1. [ ] Install Wrangler CLI globally:
   ```bash
   npm install -g wrangler
   ```

2. [ ] Authenticate with Cloudflare:
   ```bash
   wrangler auth
   # Opens browser, approve access
   ```

3. [ ] Add Worker secrets:
   ```bash
   cd worker/
   
   # Add Turnstile Secret
   wrangler secret put TURNSTILE_SECRET
   # Paste your Turnstile Secret Key (from Step 2)
   
   # Add Resend API Key
   wrangler secret put RESEND_API_KEY
   # Paste your Resend API Key (from Step 3)
   
   # Add admin email
   wrangler secret put ADMIN_EMAIL
   # Type: your-email@example.com
   
   # Add GitHub token (created in Step 5)
   wrangler secret put GITHUB_DISPATCH_TOKEN
   # Paste GitHub PAT (from Step 5)
   
   # Add GitHub repo
   wrangler secret put GITHUB_REPO
   # Type: username/sarina-bat-mitzvah-website
   ```

4. [ ] Deploy worker:
   ```bash
   wrangler deploy
   ```
   
5. [ ] **Note the worker URL** printed at the end (looks like: `https://sarina-worker.username.workers.dev`)
   - You'll use this in Step 6

### Step 5: Create GitHub Personal Access Token

**Time: 5 minutes**

1. [ ] Go to https://github.com/settings/personal-access-tokens/new
2. [ ] Configure token:
   - **Token name:** `sarina-bat-mitzvah-dispatch`
   - **Expiration:** 90 days (you'll need to refresh periodically)
   - **Repository access:** Select "Only select repositories" → Choose this repo
   - **Permissions:**
     - Repository permissions → Contents: **Read and write**
     - Repository permissions → Actions: **Read-only**
3. [ ] Click "Generate token"
4. [ ] **Copy the token immediately** (you won't see it again!)
5. [ ] Store it for Step 4 above

### Step 6: Update Configuration Files

**Time: 10 minutes**

Now update your site with the configuration values from the previous steps.

#### 6a. Update RSVP Form Endpoint

Edit [`src/rsvp.njk`](src/rsvp.njk) and find the `defaultConfig` section:

```javascript
const defaultConfig = {
  workerUrl: 'https://your-worker-name.username.workers.dev/api/rsvp', // ← UPDATE THIS
  turnstileSiteKey: 'your-site-key-here', // ← UPDATE THIS
  skipTurnstile: false,
  debugMode: false,
};
```

Replace with your actual values:
- `workerUrl`: From Step 4 (your deployed worker URL + `/api/rsvp`)
- `turnstileSiteKey`: From Step 2 (Cloudflare Turnstile Site Key)

#### 6b. Update GitHub Actions Secrets

Add secrets to GitHub repository (Settings → Secrets and variables → Actions):

1. [ ] Click "New repository secret"
2. [ ] Add `TURNSTILE_SITE_KEY`:
   - Name: `TURNSTILE_SITE_KEY`
   - Value: Your Cloudflare Turnstile Site Key (from Step 2)
3. [ ] Add `WORKER_URL`:
   - Name: `WORKER_URL`
   - Value: Your Cloudflare Worker URL (from Step 4, format: `https://worker-name.username.workers.dev/api/rsvp`)

### Step 7: Enable GitHub Pages

**Time: 5 minutes**

1. [ ] Go to your repository → **Settings** → **Pages**
2. [ ] Under "Build and deployment":
   - **Source:** Select "GitHub Actions"
   - This tells GitHub to use the workflow in `.github/workflows/build-deploy.yml`
3. [ ] Scroll down to "Custom domain":
   - [ ] Enter: `sarinabatmitzvah.com`
   - [ ] Check "Enforce HTTPS" (may not be available until DNS is properly configured)

4. [ ] Update DNS at your domain registrar:
   - Log in to Namecheap (or your registrar)
   - Go to DNS settings for `sarinabatmitzvah.com`
   - Add these records:
     ```
     Type    Host    Value
     A       @       185.199.108.153
     A       @       185.199.109.153
     A       @       185.199.110.153
     A       @       185.199.111.153
     CNAME   www     sarinabatmitzvah.github.io
     ```
   - (GitHub Pages IPs - verify current ones at https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site)

5. [ ] Wait for DNS propagation and SSL certificate issuance (can take 15-30 minutes)

6. [ ] In GitHub Pages settings, check "Enforce HTTPS" once available

### Step 8: Update Event Content

**Time: 20-30 minutes**

The site currently has placeholder content. Update these files with actual event details:

- [ ] [src/index.njk](src/index.njk) - Update hero image, event dates/times
- [ ] [src/itinerary.njk](src/itinerary.njk) - Fill in actual event times and locations
- [ ] [src/directions.njk](src/directions.njk) - Add venue addresses, maps, parking info
- [ ] [src/hotel.njk](src/hotel.njk) - Add hotel details, room rates, reservation code
- [ ] [src/mitzvah-project.njk](src/mitzvah-project.njk) - Add Sarina's project details and story

#### Images
- [ ] Replace hero image: Add actual photo of Sarina to `src/assets/img/`
  - Recommended: Create two versions for responsive design
  - Update the `src` in [src/index.njk](src/index.njk)

### Step 9: Test Locally

**Time: 10 minutes**

1. [ ] Install dependencies:
   ```bash
   npm install
   ```

2. [ ] Build the site:
   ```bash
   npm run build
   ```

3. [ ] Start dev server:
   ```bash
   npm start
   ```

4. [ ] Open http://localhost:8080 in browser

5. [ ] Test each page:
   - [ ] Home page loads with navigation
   - [ ] All pages are reachable from nav menu
   - [ ] Logo links to home
   - [ ] Responsive design works at 320px, 768px, and desktop sizes
   - [ ] Dark/light mode toggle works

6. [ ] Test RSVP form (in development mode):
   - [ ] Form fields validate
   - [ ] Error messages display clearly
   - [ ] No actual submission needed for local testing

### Step 10: Deploy to GitHub Pages

**Time: 5 minutes**

1. [ ] Commit and push all changes:
   ```bash
   git add .
   git commit -m "Configure production deployment"
   git push origin main
   ```

2. [ ] GitHub Actions will automatically:
   - Build the site with Eleventy
   - Deploy to GitHub Pages
   - **Check status:** Go to repository → Actions tab

3. [ ] Wait a few minutes (usually 1-2 minutes)

4. [ ] Visit https://sarinabatmitzvah.com
   - [ ] Site loads successfully
   - [ ] All pages are accessible
   - [ ] HTTPS is enabled (lock icon in browser)

### Step 11: Test RSVP Form (Live)

**Time: 10 minutes**

1. [ ] Go to https://sarinabatmitzvah.com/rsvp/
2. [ ] Fill out test RSVP with:
   - Full name: Test Guest
   - Email: your-email@example.com
   - Party size: 2
   - Attendance selections: Yes for all events
3. [ ] Submit form
4. [ ] Verify:
   - [ ] Success message displays
   - [ ] Email received in your inbox (check spam folder)
   - [ ] RSVP was recorded in repo: Check GitHub → `src/_data/rsvps.json`
     - Go to your repo → click `src/_data/rsvps.json`
     - Should show the test RSVP recorded

### Step 12: Manual Accessibility Testing

**Time: Varies**

Test with keyboard and screen reader as needed:

#### Keyboard Navigation
- [ ] Tab through all pages - verify logical tab order
- [ ] Focus indicators visible on all interactive elements
- [ ] Skip to main content link appears and works
- [ ] All form fields keyboard-accessible
- [ ] All links and buttons reachable via Tab

#### Screen Reader (VoiceOver on Mac / NVDA on Windows)
- [ ] Page headings announced correctly
- [ ] Navigation menu structure clear
- [ ] Form labels associated with fields
- [ ] Error messages announced
- [ ] Success message announced after RSVP

#### Color Contrast
- [ ] Text readable in both light and dark modes
- [ ] No reliance on color alone to convey information

#### Responsive Design
- [ ] Test at 320px (mobile)
- [ ] Test at 768px (tablet)
- [ ] Test at 1024px+ (desktop)
- [ ] No horizontal scroll at any size
- [ ] Navigation visible on mobile (not hidden in menu)

---

## 📊 Project Summary

### Architecture
```
Browser (RSVP form)
    ↓ POST JSON
Cloudflare Worker (verify Turnstile, validate, send email)
    ↓ repository_dispatch
GitHub Actions (record RSVP)
    ↓ commit to src/_data/rsvps.json
GitHub Pages (serves static site)
    ↓ HTTPS
sarinabatmitzvah.com
```

### File Structure
```
/
├── src/
│   ├── _includes/
│   │   └── base.njk          # Layout template
│   ├── _data/
│   │   └── rsvps.json        # RSVP records (private)
│   ├── assets/
│   │   ├── css/styles.css    # WCAG 2.2 AA styles
│   │   └── img/              # Logo, hero, assets
│   ├── index.njk             # Home
│   ├── rsvp.njk              # RSVP form
│   ├── itinerary.njk         # Schedule
│   ├── directions.njk        # Venue info
│   ├── hotel.njk             # Hotel details
│   └── mitzvah-project.njk   # Project story
├── worker/
│   ├── wrangler.toml         # Cloudflare config
│   └── src/index.js          # Worker code
├── .github/workflows/
│   ├── build-deploy.yml      # Build & deploy
│   └── record-rsvp.yml       # Record RSVPs
├── .eleventy.js              # Eleventy config
├── package.json
├── README.md
├── DEPLOYMENT.md             # Deployment guide
└── CNAME                      # Custom domain
```

### Technology Stack
- **Static Site:** Eleventy (11ty) + Nunjucks
- **Styling:** Hand-written CSS (no heavy frameworks)
- **Hosting:** GitHub Pages
- **Backend:** Cloudflare Worker (serverless)
- **Email:** Resend API
- **Spam Protection:** Cloudflare Turnstile + honeypot + rate limiting
- **RSVP Storage:** Git (JSON file in repo)
- **CI/CD:** GitHub Actions

### Security & Privacy
- ✅ All secrets stored in secure vaults (Cloudflare, GitHub)
- ✅ No API keys in code
- ✅ Honeypot field catches spam bots
- ✅ Turnstile provides privacy-friendly captcha
- ✅ Rate limiting prevents abuse
- ✅ RSVPs private (never displayed publicly)
- ✅ HTTPS enforced
- ✅ CORS restricted to domain only

### Accessibility (WCAG 2.2 AA)
- ✅ Semantic HTML with proper landmarks
- ✅ Keyboard navigation throughout
- ✅ Focus indicators on all interactive elements
- ✅ Skip to main content link
- ✅ Form validation with error summaries
- ✅ Color contrast ≥ 4.5:1
- ✅ Responsive design (320px - desktop)
- ✅ Dark mode support
- ✅ Screen reader support
- ✅ Target size ≥ 44×44 CSS px

---

## 🚀 Quick Reference

### Development Commands
```bash
npm install              # Install dependencies
npm start                # Start dev server (http://localhost:8080)
npm run build            # Build for production
```

### Deploy Worker
```bash
cd worker/
wrangler auth           # Login to Cloudflare
wrangler secret put     # Add secrets
wrangler deploy         # Deploy worker
```

### Commit & Deploy Site
```bash
git add .
git commit -m "Your message"
git push origin main    # Triggers GitHub Actions deploy
```

### Check RSVP Data
```bash
cat src/_data/rsvps.json | jq .  # View RSVPs
git log --oneline | grep "RSVP"   # See RSVP history
```

---

## ⚠️ Important Notes

1. **Never commit secrets** - Use GitHub Secrets and Cloudflare Secrets only
2. **Keep GitHub token secure** - It has write access to your repo
3. **Monitor RSVP submissions** - Check emails and `src/_data/rsvps.json`
4. **Update event content** - Replace all [TBD] placeholders
5. **Test RSVP flow end-to-end** - Verify email, repo recording, and site success message
6. **DNS can be slow** - DNS changes can take up to 48 hours to propagate globally
7. **SSL certificate** - GitHub will auto-issue once DNS is set up (5-30 minutes typical)

---

## 📞 Support

If something doesn't work:

1. **Build fails:** Check GitHub Actions logs (Actions tab)
2. **Site not deploying:** Verify GitHub Pages settings (Settings → Pages)
3. **RSVP not submitting:** Check Cloudflare Worker logs (Dashboard → Workers)
4. **Email not sending:** Verify Resend API key and domain verification
5. **DNS issues:** Use `dig` or `nslookup` to verify DNS propagation

---

## ✅ Final Checklist

Once complete, verify:

- [ ] All steps 1-12 completed
- [ ] Site live at https://sarinabatmitzvah.com with HTTPS
- [ ] All 6 pages accessible and displaying correctly
- [ ] Logo on every page links to home
- [ ] Navigation menu shows current page (aria-current="page")
- [ ] RSVP form submits successfully
- [ ] Admin email received RSVP submission
- [ ] RSVP recorded in `src/_data/rsvps.json`
- [ ] Keyboard navigation works throughout site
- [ ] Site responsive at mobile (320px) and desktop
- [ ] Dark mode toggle works
- [ ] No console errors in browser
- [ ] All event content updated (dates, locations, etc.)

**🎉 You're done! The website is ready for guests to RSVP.**
