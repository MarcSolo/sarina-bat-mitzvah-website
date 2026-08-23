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
    const data = await request.json();
    const name = data.name || "Unknown";
    const oneg_guests = data["oneg-guests"] || "Not provided";
    const batmitzvah_service_guests = data["bat-mitzvah-service-guests"] || "Not provided";
    const batmitzvah_party_guests = data["bat-mitzvah-party-guests"] || "Not provided";

    // Build the notification email
    const recipients = env.RSVP_EMAILS.split(",").map((e) => e.trim());
    const body = [
		"<h1>New RSVP received</h1>",
		`<p><strong>Name:</strong> ${name}</p>`,
		`<p><strong>Number of Friday evening guests:</strong> ${oneg_guests}</p>`,
		`<p><strong>Number of Saturday morning guests:</strong> ${batmitzvah_service_guests}</p>`,
		`<p><strong>Number of Saturday evening guests:</strong> ${batmitzvah_party_guests}</p>`,
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
        subject: `New RSVP: ${name}`,
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
