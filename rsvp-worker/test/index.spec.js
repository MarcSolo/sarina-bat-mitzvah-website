import { afterEach, describe, expect, it, vi } from "vitest";
import worker from "../src";


const env = {
	RESEND_API_KEY: "test-api-key",
	RSVP_EMAILS: "admin@example.com, backup@example.com",
};

afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

describe("RSVP worker", () => {
	it("handles CORS preflight requests", async () => {
		const response = await worker.fetch(
			new Request("https://example.com", { method: "OPTIONS" }),
			env,
		);

		expect(response.status).toBe(200);
		expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
		expect(response.headers.get("Access-Control-Allow-Methods")).toBe("POST, OPTIONS");
	});

	it("rejects non-POST requests", async () => {
		const response = await worker.fetch(
			new Request("https://example.com", { method: "GET" }),
			env,
		);

		expect(response.status).toBe(405);
		expect(await response.text()).toBe("Method not allowed");
	});

	it("rejects a submission without a valid Turnstile token", async () => {
		const response = await worker.fetch(
			new Request("https://example.com", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ name: "Sarina" }),
			}),
			{ ...env, TURNSTILE_SECRET: "test-secret" },
		);

		expect(response.status).toBe(403);
		expect(await response.text()).toBe("Spam verification failed");
	});

	it("verifies a Turnstile token before sending an RSVP", async () => {
		const turnstile = vi.fn(async () => new Response('{"success":true}', { status: 200 }));
		const resend = vi.fn(async () => new Response("{}", { status: 200 }));
		vi.stubGlobal("fetch", vi.fn()
			.mockImplementationOnce(turnstile)
			.mockImplementationOnce(resend));

		const response = await worker.fetch(
			new Request("https://example.com", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					name: "Sarina",
					turnstileToken: "valid-token",
					"oneg-guests": "0",
					"bat-mitzvah-service-guests": "2",
					"bat-mitzvah-party-guests": "3",
				}),
			}),
			{ ...env, TURNSTILE_SECRET: "test-secret" },
		);
		const [turnstileUrl, turnstileOptions] = turnstile.mock.calls[0];

		expect(response.status).toBe(200);
		expect(turnstileUrl).toBe("https://challenges.cloudflare.com/turnstile/v0/siteverify");
		expect(JSON.parse(turnstileOptions.body)).toEqual({
			secret: "test-secret",
			response: "valid-token",
		});
		expect(resend).toHaveBeenCalledOnce();
	});

	it("rejects invalid RSVP values before sending an email", async () => {
		const resend = vi.fn();
		vi.stubGlobal("fetch", resend);
		const response = await worker.fetch(
			new Request("https://example.com", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					name: "",
					"oneg-guests": "-1",
					"bat-mitzvah-service-guests": "two",
					"bat-mitzvah-party-guests": "1000",
				}),
			}),
			env,
		);

		expect(response.status).toBe(400);
		expect(await response.text()).toContain("Invalid RSVP data");
		expect(resend).not.toHaveBeenCalled();
	});

	it("escapes special characters in the email HTML", async () => {
		const resend = vi.fn(async () => new Response("{}", { status: 200 }));
		vi.stubGlobal("fetch", resend);
		const request = new Request("https://example.com", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				name: "<Sarina & family>",
				"oneg-guests": "0",
				"bat-mitzvah-service-guests": "1",
				"bat-mitzvah-party-guests": "2",
			}),
		});

		await worker.fetch(request, env);
		const email = JSON.parse(resend.mock.calls[0][1].body);

		expect(email.html).toContain("&lt;Sarina &amp; family&gt;");
		expect(email.html).not.toContain("<Sarina & family>");
	});

	it("blocks the sixth RSVP from the same IP within one minute", async () => {
		const resend = vi.fn(async () => new Response("{}", { status: 200 }));
		vi.stubGlobal("fetch", resend);
		const values = new Map();
		const rateLimitKv = {
			get: vi.fn(async (key) => values.get(key) || null),
			put: vi.fn(async (key, value) => values.set(key, value)),
		};
		const request = () => new Request("https://example.com", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"CF-Connecting-IP": "203.0.113.10",
			},
			body: JSON.stringify({
				name: "Sarina Solomon",
				"oneg-guests": "0",
				"bat-mitzvah-service-guests": "1",
				"bat-mitzvah-party-guests": "2",
			}),
		});

		const responses = [];
		for (let attempt = 0; attempt < 6; attempt += 1) {
			responses.push(await worker.fetch(request(), { ...env, RATE_LIMIT_KV: rateLimitKv }));
		}

		expect(responses.slice(0, 5).every((response) => response.status === 200)).toBe(true);
		expect(responses[5].status).toBe(429);
		expect(resend).toHaveBeenCalledTimes(5);
		expect(rateLimitKv.put).toHaveBeenCalledTimes(5);
	});

	it("sends a valid RSVP to Resend", async () => {
		const resend = vi.fn(async () => new Response("{}", { status: 200 }));
		vi.stubGlobal("fetch", resend);
		const request = new Request("https://example.com", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				name: "Sarina Solomon",
				"oneg-guests": "2",
				"bat-mitzvah-service-guests": "3",
				"bat-mitzvah-party-guests": "4",
			}),
		});

		const response = await worker.fetch(request, env);
		const [url, options] = resend.mock.calls[0];
		const email = JSON.parse(options.body);

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ success: true });
		expect(url).toBe("https://api.resend.com/emails");
		expect(options.method).toBe("POST");
		expect(options.headers.Authorization).toBe("Bearer test-api-key");
		expect(email.to).toEqual(["admin@example.com", "backup@example.com"]);
		expect(email.subject).toBe("New RSVP: Sarina Solomon");
		expect(email.html).toContain("Number of Friday evening guests:</strong> 2");
		expect(email.html).toContain("Number of Saturday morning guests:</strong> 3");
		expect(email.html).toContain("Number of Saturday evening guests:</strong> 4");
	});

	it("returns an error when Resend rejects the email", async () => {
		vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 500 })));

		const request = new Request("https://example.com", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				name: "Sarina",
				"oneg-guests": "0",
				"bat-mitzvah-service-guests": "2",
				"bat-mitzvah-party-guests": "3",
			}),
		});

		const response = await worker.fetch(request, env);

		expect(response.status).toBe(500);
		expect(await response.text()).toBe("Failed to send email");
	});

	it("includes dietary restrictions in the email when provided", async () => {
		const resend = vi.fn(async () => new Response("{}", { status: 200 }));
		vi.stubGlobal("fetch", resend);
		const request = new Request("https://example.com", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				name: "Sarina Solomon",
				"oneg-guests": "2",
				"bat-mitzvah-service-guests": "3",
				"bat-mitzvah-party-guests": "4",
				diet: "Vegetarian, gluten-free",
			}),
		});

		const response = await worker.fetch(request, env);
		const [url, options] = resend.mock.calls[0];
		const email = JSON.parse(options.body);

		expect(response.status).toBe(200);
		expect(email.html).toContain("Dietary restrictions:</strong> Vegetarian, gluten-free");
	});

	it("escapes special characters in dietary restrictions", async () => {
		const resend = vi.fn(async () => new Response("{}", { status: 200 }));
		vi.stubGlobal("fetch", resend);
		const request = new Request("https://example.com", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				name: "Sarina Solomon",
				"oneg-guests": "2",
				"bat-mitzvah-service-guests": "3",
				"bat-mitzvah-party-guests": "4",
				diet: "No <peanuts> & shellfish",
			}),
		});

		await worker.fetch(request, env);
		const email = JSON.parse(resend.mock.calls[0][1].body);

		expect(email.html).toContain("No &lt;peanuts&gt; &amp; shellfish");
		expect(email.html).not.toContain("No <peanuts> & shellfish");
	});

	it("omits dietary restrictions from email when not provided", async () => {
		const resend = vi.fn(async () => new Response("{}", { status: 200 }));
		vi.stubGlobal("fetch", resend);
		const request = new Request("https://example.com", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				name: "Sarina Solomon",
				"oneg-guests": "2",
				"bat-mitzvah-service-guests": "3",
				"bat-mitzvah-party-guests": "4",
			}),
		});

		await worker.fetch(request, env);
		const email = JSON.parse(resend.mock.calls[0][1].body);

		expect(email.html).not.toContain("Dietary restrictions:");
	});

});
