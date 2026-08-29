/**
 * Welcome to Cloudflare Workers! This is your first worker.
 *
 * - Run `npm run dev` in your terminal to start a development server
 * - Open a browser tab at http://localhost:8787/ to see your worker in action
 * - Run `npm run deploy` to publish your worker
 *
 * Learn more at https://developers.cloudflare.com/workers/
 */

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
    let data;
    try {
      data = await request.json();
    } catch {
      return new Response("Invalid RSVP data", { status: 400, headers: cors });
    }

    if (env.TURNSTILE_SECRET) {
      if (!data.turnstileToken || !(await verifyTurnstile(data.turnstileToken, env.TURNSTILE_SECRET))) {
        return new Response("Spam verification failed", { status: 403, headers: cors });
      }
    }
    const validation = validateRsvpData(data);
    if (!validation.valid) {
      return new Response(`Invalid RSVP data: ${validation.errors.join("; ")}`, {
        status: 400,
        headers: cors,
      });
    }

    const sanitizedName = sanitizeText(data.name);
    const onegGuests = sanitizeGuestCount(data["oneg-guests"]);
    const batMitzvahServiceGuests = sanitizeGuestCount(data["bat-mitzvah-service-guests"]);
    const batMitzvahPartyGuests = sanitizeGuestCount(data["bat-mitzvah-party-guests"]);
    const dietRestrictions = data.diet ? sanitizeText(data.diet) : "";

    const rateLimit = await checkRateLimit(
      env,
      request.headers.get("CF-Connecting-IP") || "unknown",
    );
    if (!rateLimit.allowed) {
      return new Response("Too many RSVP submissions", { status: 429, headers: cors });
    }

    // Build the notification email
    const recipients = env.RSVP_EMAILS.split(",").map((e) => e.trim());
    const body = [
		"<h1>New RSVP received</h1>",
    `<p><strong>Name:</strong> ${escapeHtml(sanitizedName)}</p>`,
    `<p><strong>Number of Friday evening guests:</strong> ${onegGuests}</p>`,
    `<p><strong>Number of Saturday morning guests:</strong> ${batMitzvahServiceGuests}</p>`,
    `<p><strong>Number of Saturday evening guests:</strong> ${batMitzvahPartyGuests}</p>`,
    ...(dietRestrictions ? [`<p><strong>Dietary restrictions:</strong> ${escapeHtml(dietRestrictions)}</p>`] : []),
	].join("");

    // Send the email through Resend
    const send = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "noreply@sarinabatmitzvah.com", // change to your domain later
				to: recipients,
        subject: `New RSVP: ${sanitizedName}`,
        html: body,
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

async function verifyTurnstile(token, secret) {
  try {
    const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ secret, response: token }),
    });

    const result = await response.json();
    return result.success === true;
  } catch {
    return false;
  }
}

function validateRsvpData(data) {
  const errors = [];

  if (typeof data.name !== "string" || data.name.trim().length === 0 || data.name.trim().length > 200) {
    errors.push("name must be between 1 and 200 characters");
  }

  for (const field of ["oneg-guests", "bat-mitzvah-service-guests", "bat-mitzvah-party-guests"]) {
    const value = Number(data[field]);
    if (!Number.isInteger(value) || value < 0 || value > 999) {
      errors.push(`${field} must be a whole number from 0 to 999`);
    }
  }

  if (data.diet && typeof data.diet !== "string") {
    errors.push("diet restrictions must be a string");
  }

  return { valid: errors.length === 0, errors };
}

function sanitizeText(value) {
  return value.trim().replace(/[\r\n]/g, " ").slice(0, 200);
}

function sanitizeGuestCount(value) {
  return String(Number(value));
}

function escapeHtml(text) {
  const map = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  };
  return text.replace(/[&<>"']/g, (character) => map[character]);
}

async function checkRateLimit(env, ipAddress) {
  const namespace = env.RATE_LIMIT_KV;
  if (!namespace) {
    return { allowed: true };
  }

  const key = `rsvp:${ipAddress}`;
  const current = await namespace.get(key);
  const count = (Number.parseInt(current || "0", 10) || 0) + 1;

  if (count > 5) {
    return { allowed: false };
  }

  await namespace.put(key, String(count), { expirationTtl: 60 });
  return { allowed: true };
}
