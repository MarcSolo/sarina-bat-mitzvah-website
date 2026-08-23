# RSVP Feature - Implementation Plan (Simplified)

This plan adds RSVP functionality to the Bat Mitzvah website with the least
possible complexity. Every RSVP submission will send you an email. You track
responses from your inbox.

**Architecture:**

```text
RSVP Form (on your website)
        |
        v
Cloudflare Worker  (tiny server that runs only when the form is submitted)
        |
        v
Resend  (sends the email)
        |
        v
Your inbox  (you get notified of every RSVP)
```

**What this plan intentionally avoids:**

- No nameserver changes (your GitHub Pages site keeps working as-is)
- No GitHub personal access tokens
- No GitHub Actions
- No database (added later as an optional second milestone)
- No spam protection (added later only if spam appears)

---

## Before You Start

Make sure you have the following ready:

1. Your Eleventy website is already deployed and working on GitHub Pages.
2. Your custom domain (`sarinabatmitzvah.com`) is working with HTTPS.
3. Node.js is installed on your computer.
4. You can open a Terminal window.

> **Important:** You will NOT change your nameservers. Namecheap DNS and GitHub
> Pages stay exactly as they are today. The Worker runs on its own free
> `workers.dev` web address.

---

## Milestone 1: Get RSVPs Arriving by Email (The MVP)

### Part A: Create a Cloudflare Account

1. Go to https://dash.cloudflare.com and sign up for a free account.
2. Verify your email address.
3. Stop here. Do NOT add your domain and do NOT change nameservers. You only
   need the account so you can create a Worker.

### Part B: Create a Resend Account and Get an API Key

1. Go to https://resend.com and create a free account.
2. When you first sign up, Resend gives you a shared test address you can send
   from immediately (something like `onboarding@resend.dev`). This is perfect
   for getting started.
3. Go to the **API Keys** section.
4. Create a new API key and give it a name like `bat-mitzvah-rsvp`.
5. Copy the key (it starts with `re_...`) and paste it somewhere safe. You will
   only see it once.

> **Optional (do later):** To send email *from* your own domain
> (for example `rsvp@sarinabatmitzvah.com`), you can verify your domain in
> Resend by adding a few DNS records in Namecheap. This is not required for the
> MVP, so skip it for now.

### Part C: Create the Worker

1. Open Terminal.
2. Install the Cloudflare command-line tool:
   ```bash
   npm install -g wrangler
   ```
3. Log in to Cloudflare (a browser window will open, approve access):
   ```bash
   wrangler login
   ```
4. Create a new Worker project inside your website folder:
   ```bash
   npm create cloudflare@latest rsvp-worker
   ```
5. When prompted, choose:
   - Template: **Hello World / Worker only**
   - Language: **JavaScript**
   - Deploy now: **No** (you will deploy after adding the code)
6. Move into the new folder:
START HERE
   ```bash
   cd rsvp-worker
   ```

### Part D: Store Your Secrets

Secrets are private values (like your Resend key) that your code can use without
showing them on the website.

1. Add your Resend API key:
   ```bash
   wrangler secret put RESEND_API_KEY
   ```
   Paste the `re_...` key when prompted.
2. Add the email address(es) that should receive RSVP notifications. Separate
   multiple addresses with commas:
   ```bash
   wrangler secret put RSVP_EMAILS
   ```
   Example value to paste:
   ```text
   mrmarcsolomon@gmail.com,mrsjessicasolomon@gmail.com
   ```

### Part E: Add the Worker Code

1. Open the project in your editor:
   ```bash
   code .
   ```
2. Replace the contents of `src/index.js` with the following:
   ```javascript
   export default {
  async fetch(request, env) {
    // Allow the browser to call this Worker (CORS)
    const cors = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    // Browsers send a preflight OPTIONS request first
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: cors });
    }

    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405, headers: cors });
    }

    // Read the submitted form data
    const data = await request.json();
    const name = data.name || "Unknown";
    const email = data.email || "Not provided";
    const attending = data.attending || "Not provided";
    const guests = data.guests || "0";
    const message = data.message || "";

    // Build the notification email
    const recipients = env.RSVP_EMAILS.split(",").map((e) => e.trim());
    const body = [
      `New RSVP received`,
      ``,
      `Name: ${name}`,
      `Attending: ${attending}`,
      `Number of guests: ${guests}`,
      `Email: ${email}`,
      `Message: ${message}`,
    ].join("\n");

    // Send the email through Resend
    const send = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "onboarding@resend.dev", // change to your domain later
        to: recipients,
        subject: `New RSVP: ${name} (${attending})`,
        text: body,
      }),
    });

    if (!send.ok) {
      return new Response("Failed to send email", { status: 500, headers: cors });
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  },
};
   ```

### Part F: Deploy the Worker

1. Deploy from Terminal:
   ```bash
   wrangler deploy
   ```
2. At the end, Wrangler prints your Worker's web address. Copy it. It looks
   like:
   ```text
   https://marc-solomon.workers.dev
   ```
3. Your RSVP endpoint is that address plus `/`:
   ```text
   https://marc-solomon.workers.dev
   ```

### Part G: Connect Your Website Form

1. Open your RSVP page in the Eleventy project (for example `src/rsvp.njk`).
2. Make sure your form has fields for name, email, attending, guests, and an
   optional message.
3. Add the following script, replacing the URL with your Worker address:
   ```html
   <form id="rsvp-form">
     <label>Name <input name="name" required></label>
     <label>Email <input name="email" type="email"></label>
     <label>Attending?
       <select name="attending">
         <option value="Yes">Yes</option>
         <option value="No">No</option>
       </select>
     </label>
     <label>Number of guests <input name="guests" type="number" min="0"></label>
     <label>Message <textarea name="message"></textarea></label>
     <button type="submit">Send RSVP</button>
     <p id="rsvp-status" role="status" aria-live="polite"></p>
   </form>

   <script>
     const form = document.getElementById("rsvp-form");
     const status = document.getElementById("rsvp-status");

     form.addEventListener("submit", async (event) => {
       event.preventDefault();
       status.textContent = "Sending your RSVP...";

       const formData = Object.fromEntries(new FormData(form).entries());

       try {
         const response = await fetch(
           "https://rsvp-worker.yourname.workers.dev", // <-- your Worker URL
           {
             method: "POST",
             headers: { "Content-Type": "application/json" },
             body: JSON.stringify(formData),
           }
         );

         if (response.ok) {
           status.textContent = "Thank you! Your RSVP has been received.";
           form.reset();
         } else {
           status.textContent = "Sorry, something went wrong. Please try again.";
         }
       } catch (error) {
         status.textContent = "Sorry, something went wrong. Please try again.";
       }
     });
   </script>
   ```

### Part H: Test It End to End

1. Run your site locally or push it live.
2. Fill out the RSVP form and submit it.
3. Confirm you see the success message on the page.
4. Check your inbox for the notification email.
5. If nothing arrives, check the Resend dashboard **Logs** section and run
   `wrangler tail` in Terminal to watch for errors while you test.

At this point the MVP is complete. Every RSVP now arrives in your inbox.

---

## Milestone 2 (Optional, Later): Save RSVPs and Add an Admin Page

Only build this after Milestone 1 is working reliably. It adds a simple database
so you can see all responses in one table instead of scrolling your inbox.

1. In the Cloudflare dashboard, go to **Storage & Databases > KV** and create a
   namespace named `RSVPS`.
2. Bind the namespace to your Worker by adding it to `wrangler.toml`, then run
   `wrangler deploy` again.
3. In the Worker code, after the email is sent, also save the RSVP to KV using
   the guest's name (or a timestamp) as the key.
4. Add a new route to the Worker (for example `/admin`) that reads all KV
   entries and returns a simple HTML table of responses.
5. Protect that admin page with a password or a hidden URL.

Example of what the admin table would show:

| Family | Attending | Guests |
|--------|-----------|--------|
| Cohen  | Yes       | 4      |
| Levy   | No        | 0      |
| Solomon| Yes       | 3      |

---

## Milestone 3 (Optional, Only If Needed): Spam Protection

If you start receiving fake or bot RSVPs:

1. In the Cloudflare dashboard, create a **Turnstile** widget.
2. Add the widget to your RSVP form.
3. In the Worker, verify the Turnstile token before sending the email.

For a private family event, you may never need this.

---

## Quick Reference

| Piece            | What it does                                   |
|------------------|------------------------------------------------|
| Cloudflare Worker| Receives the form data (the "mini server")     |
| Resend           | Sends the notification email                   |
| RSVP_EMAILS      | The address(es) that get notified              |
| RESEND_API_KEY   | Private key that lets the Worker send email     |
| workers.dev URL  | The Worker's free web address (no DNS changes) |
| Cloudflare KV    | Optional database for Milestone 2              |
| Turnstile        | Optional spam protection for Milestone 3       |
