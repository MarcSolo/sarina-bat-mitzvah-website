/**
 * Sarina's Bat Mitzvah - RSVP Form Backend
 * Cloudflare Worker for handling RSVP submissions
 * 
 * Responsibilities:
 * 1. Verify Cloudflare Turnstile token
 * 2. Validate and sanitize form data
 * 3. Send confirmation email to admin (Resend)
 * 4. Trigger GitHub Actions workflow (repository_dispatch)
 */

export default {
  async fetch(request, env, ctx) {
    // Only allow POST requests to /api/rsvp
    if (request.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Parse request URL
    const url = new URL(request.url);
    if (url.pathname !== '/api/rsvp') {
      return new Response(JSON.stringify({ error: 'Endpoint not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // CORS headers
    const corsHeaders = {
      'Access-Control-Allow-Origin': 'https://sarinabatmitzvah.com',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Content-Type': 'application/json',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders, status: 204 });
    }

    try {
      // Parse request body
      let formData;
      try {
        formData = await request.json();
      } catch {
        return errorResponse('Invalid JSON in request body', corsHeaders, 400);
      }

      // Check honeypot field
      if (formData.website) {
        console.warn('Honeypot field filled - spam detected');
        // Return 200 silently to not tip off bots
        return successResponse(corsHeaders);
      }

      // Validate Turnstile token if provided
      if (formData.turnstileToken) {
        const turnstileValid = await verifyTurnstile(
          formData.turnstileToken,
          env.TURNSTILE_SECRET
        );
        if (!turnstileValid) {
          console.warn('Turnstile verification failed');
          return errorResponse('Turnstile verification failed', corsHeaders, 401);
        }
      }

      // Validate and sanitize inputs
      const sanitized = sanitizeFormData(formData);
      const validation = validateFormData(sanitized);
      if (!validation.valid) {
        return errorResponse(validation.errors.join('; '), corsHeaders, 400);
      }

      // Rate limiting check (basic IP-based)
      const clientIp = request.headers.get('CF-Connecting-IP') || 'unknown';
      const rateLimitKey = `rsvp:${clientIp}`;
      const rateLimit = await checkRateLimit(env, rateLimitKey);
      if (!rateLimit.allowed) {
        return errorResponse('Too many requests. Please try again later.', corsHeaders, 429);
      }

      // Send email to admin
      const emailResult = await sendAdminEmail(sanitized, env.RESEND_API_KEY, env.ADMIN_EMAIL);
      if (!emailResult.success) {
        console.error('Email send failed:', emailResult.error);
        return errorResponse('Failed to send email. Please try again.', corsHeaders, 500);
      }

      // Trigger GitHub Actions workflow
      const dispatchResult = await triggerGitHubDispatch(
        sanitized,
        env.GITHUB_DISPATCH_TOKEN,
        env.GITHUB_REPO
      );
      if (!dispatchResult.success) {
        console.warn('GitHub dispatch failed, but email was sent:', dispatchResult.error);
        // Still return success since email was sent
      }

      // Success!
      return successResponse(corsHeaders);
    } catch (error) {
      console.error('Unexpected error:', error);
      return errorResponse('Internal server error', corsHeaders, 500);
    }
  },
};

/**
 * Verify Turnstile token with Cloudflare API
 */
async function verifyTurnstile(token, secret) {
  if (!secret) {
    console.warn('Turnstile secret not configured');
    return true; // Allow if not configured
  }

  try {
    const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret, response: token }),
    });

    const data = await response.json();
    return data.success === true;
  } catch (error) {
    console.error('Turnstile verification error:', error);
    return false;
  }
}

/**
 * Sanitize form data
 */
function sanitizeFormData(data) {
  const sanitize = (str) => {
    if (typeof str !== 'string') return str;
    return str.trim().substring(0, 1000).replace(/[<>]/g, '');
  };

  return {
    fullName: sanitize(data.fullName),
    email: sanitize(data.email),
    partySize: Math.max(1, Math.min(999, parseInt(data.partySize) || 1)),
    additionalGuests: sanitize(data.additionalGuests),
    fridayService: (data.fridayService === 'yes' || data.fridayService === 'no')
      ? data.fridayService
      : 'no',
    saturdayMorningService: (data.saturdayMorningService === 'yes' || data.saturdayMorningService === 'no')
      ? data.saturdayMorningService
      : 'no',
    saturdayParty: (data.saturdayParty === 'yes' || data.saturdayParty === 'no')
      ? data.saturdayParty
      : 'no',
    dietary: sanitize(data.dietary),
    message: sanitize(data.message),
    timestamp: new Date().toISOString(),
  };
}

/**
 * Validate sanitized form data
 */
function validateFormData(data) {
  const errors = [];

  if (!data.fullName || data.fullName.length < 2) {
    errors.push('Full name is required and must be at least 2 characters');
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(data.email)) {
    errors.push('Valid email is required');
  }

  if (data.partySize < 1) {
    errors.push('Party size must be at least 1');
  }

  const validAttendance = (val) => val === 'yes' || val === 'no';
  if (!validAttendance(data.fridayService)) {
    errors.push('Invalid Friday service attendance value');
  }
  if (!validAttendance(data.saturdayMorningService)) {
    errors.push('Invalid Saturday morning service attendance value');
  }
  if (!validAttendance(data.saturdayParty)) {
    errors.push('Invalid Saturday party attendance value');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Basic rate limiting per IP
 */
async function checkRateLimit(env, key) {
  // Simple rate limit: max 5 requests per minute per IP
  // Using KV for distributed rate limiting
  if (!env.KV_NAMESPACE) {
    return { allowed: true }; // Skip if KV not configured
  }

  const current = await env.KV_NAMESPACE.get(key);
  const count = parseInt(current || '0') + 1;

  if (count > 5) {
    return { allowed: false };
  }

  // Set counter with 1 minute TTL
  await env.KV_NAMESPACE.put(key, count.toString(), { expirationTtl: 60 });
  return { allowed: true };
}

/**
 * Send email to admin with RSVP details
 */
async function sendAdminEmail(data, apiKey, adminEmail) {
  if (!apiKey || !adminEmail) {
    console.warn('Email configuration incomplete');
    return { success: false, error: 'Email not configured' };
  }

  const attendingEvents = [
    data.fridayService === 'yes' ? 'Friday evening service' : null,
    data.saturdayMorningService === 'yes' ? 'Saturday morning service' : null,
    data.saturdayParty === 'yes' ? 'Saturday evening party' : null,
  ].filter(Boolean).join(', ');

  const emailBody = `
New RSVP Submission
==================

Name: ${data.fullName}
Email: ${data.email}
Party Size: ${data.partySize}
Attending: ${attendingEvents || 'None selected'}

Additional Guests:
${data.additionalGuests || '(none)'}

Dietary Restrictions:
${data.dietary || '(none)'}

Message:
${data.message || '(none)'}

Timestamp: ${data.timestamp}
`;

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'noreply@sarinabatmitzvah.com',
        to: adminEmail,
        subject: `New RSVP — ${data.fullName}`,
        text: emailBody,
        html: `<pre>${escapeHtml(emailBody)}</pre>`,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      return { success: false, error };
    }

    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Trigger GitHub Actions workflow via repository_dispatch
 */
async function triggerGitHubDispatch(data, token, repo) {
  if (!token || !repo) {
    console.warn('GitHub dispatch configuration incomplete');
    return { success: false, error: 'GitHub not configured' };
  }

  try {
    const response = await fetch(`https://api.github.com/repos/${repo}/dispatches`, {
      method: 'POST',
      headers: {
        'Authorization': `token ${token}`,
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        event_type: 'rsvp_submission',
        client_payload: {
          fullName: data.fullName,
          email: data.email,
          partySize: data.partySize,
          additionalGuests: data.additionalGuests,
          fridayService: data.fridayService,
          saturdayMorningService: data.saturdayMorningService,
          saturdayParty: data.saturdayParty,
          dietary: data.dietary,
          message: data.message,
          timestamp: data.timestamp,
        },
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      return { success: false, error };
    }

    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Helper: Escape HTML
 */
function escapeHtml(text) {
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  };
  return text.replace(/[&<>"']/g, (m) => map[m]);
}

/**
 * Helper: Error response
 */
function errorResponse(message, headers, status = 400) {
  return new Response(JSON.stringify({ success: false, message }), {
    status,
    headers,
  });
}

/**
 * Helper: Success response
 */
function successResponse(headers) {
  return new Response(JSON.stringify({ success: true, message: 'RSVP received' }), {
    status: 200,
    headers,
  });
}
