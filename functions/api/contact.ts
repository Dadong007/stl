interface ContactEnv {
  TURNSTILE_SECRET_KEY?: string;
  CF_ACCOUNT_ID?: string;
  CF_EMAIL_API_TOKEN?: string;
  CONTACT_FROM_EMAIL?: string;
  CONTACT_TO_EMAIL?: string;
}

interface ContactContext {
  request: Request;
  env: ContactEnv;
}

interface TurnstileResult {
  success?: boolean;
}

interface EmailApiResult {
  success?: boolean;
}

const ALLOWED_CATEGORIES = ['Conversion issue', 'Bug', 'Suggestion', 'Other'] as const;
const MAX_BODY_BYTES = 16_384;
const MAX_EMAIL_LENGTH = 254;
const MIN_MESSAGE_LENGTH = 10;
const MAX_MESSAGE_LENGTH = 4_000;
const MAX_TURNSTILE_TOKEN_LENGTH = 2_048;
const MAX_SOURCE_PAGE_LENGTH = 200;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const ALLOWED_FIELDS = new Set(['category', 'email', 'message', 'turnstileToken', 'sourcePage']);

const jsonResponse = (status: number, body: Record<string, unknown>, headers: HeadersInit = {}) => new Response(
  JSON.stringify(body),
  {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'Content-Type': 'application/json; charset=utf-8',
      ...headers,
    },
  },
);

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (character) => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}[character] ?? character));

const readJsonBody = async (request: Request): Promise<{ body?: Record<string, unknown>; response?: Response }> => {
  const contentType = request.headers.get('content-type')?.toLowerCase() ?? '';
  if (contentType.split(';', 1)[0].trim() !== 'application/json') {
    return { response: jsonResponse(415, { error: 'invalid_content_type', message: 'The request must use JSON.' }) };
  }

  const declaredLength = Number(request.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    return { response: jsonResponse(413, { error: 'payload_too_large', message: 'The feedback request is too large.' }) };
  }

  let rawBody = '';
  try {
    rawBody = await request.text();
  } catch {
    return { response: jsonResponse(400, { error: 'invalid_request', message: 'The feedback request could not be read.' }) };
  }

  if (new TextEncoder().encode(rawBody).byteLength > MAX_BODY_BYTES) {
    return { response: jsonResponse(413, { error: 'payload_too_large', message: 'The feedback request is too large.' }) };
  }

  try {
    const parsed = JSON.parse(rawBody) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Invalid body');
    return { body: parsed as Record<string, unknown> };
  } catch {
    return { response: jsonResponse(400, { error: 'invalid_json', message: 'The request body is not valid JSON.' }) };
  }
};

export const handleContactPost = async ({ request, env }: ContactContext): Promise<Response> => {
  const parsed = await readJsonBody(request);
  if (parsed.response) return parsed.response;

  const body = parsed.body ?? {};
  if (Object.keys(body).some((field) => !ALLOWED_FIELDS.has(field))) {
    return jsonResponse(400, { error: 'unexpected_field', message: 'The request contains an unsupported field.' });
  }
  const category = typeof body.category === 'string' ? body.category : '';
  const email = typeof body.email === 'string' ? body.email.trim() : '';
  const message = typeof body.message === 'string' ? body.message.trim() : '';
  const turnstileToken = typeof body.turnstileToken === 'string' ? body.turnstileToken.trim() : '';
  const sourcePage = typeof body.sourcePage === 'string' ? body.sourcePage.trim() : '';

  if (!ALLOWED_CATEGORIES.includes(category as typeof ALLOWED_CATEGORIES[number])) {
    return jsonResponse(400, { error: 'invalid_category', message: 'Select a valid feedback category.' });
  }
  if (email.length > MAX_EMAIL_LENGTH || (email && !EMAIL_PATTERN.test(email))) {
    return jsonResponse(400, { error: 'invalid_email', message: 'Enter a valid email address or leave the field empty.' });
  }
  if (message.length < MIN_MESSAGE_LENGTH || message.length > MAX_MESSAGE_LENGTH) {
    return jsonResponse(400, { error: 'invalid_message', message: 'The message must be between 10 and 4000 characters.' });
  }
  if (!turnstileToken || turnstileToken.length > MAX_TURNSTILE_TOKEN_LENGTH) {
    return jsonResponse(400, { error: 'verification_failed', message: 'Please complete the verification and try again.' });
  }
  if (sourcePage.length > MAX_SOURCE_PAGE_LENGTH) {
    return jsonResponse(400, { error: 'invalid_source_page', message: 'The source page value is too long.' });
  }

  const requiredConfiguration = [
    env.TURNSTILE_SECRET_KEY,
    env.CF_ACCOUNT_ID,
    env.CF_EMAIL_API_TOKEN,
    env.CONTACT_FROM_EMAIL,
    env.CONTACT_TO_EMAIL,
  ];
  if (requiredConfiguration.some((value) => !value)) {
    return jsonResponse(503, { error: 'service_unavailable', message: 'Feedback delivery is temporarily unavailable.' });
  }

  const remoteIp = request.headers.get('CF-Connecting-IP')?.trim();
  const siteverifyBody: Record<string, string> = {
    secret: env.TURNSTILE_SECRET_KEY!,
    response: turnstileToken,
  };
  if (remoteIp) siteverifyBody.remoteip = remoteIp;

  let turnstileResult: TurnstileResult;
  try {
    const turnstileResponse = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(siteverifyBody),
    });
    if (!turnstileResponse.ok) {
      return jsonResponse(503, { error: 'verification_unavailable', message: 'Verification is temporarily unavailable. Please try again.' });
    }
    turnstileResult = await turnstileResponse.json() as TurnstileResult;
  } catch {
    return jsonResponse(503, { error: 'verification_unavailable', message: 'Verification is temporarily unavailable. Please try again.' });
  }

  if (turnstileResult.success !== true) {
    return jsonResponse(400, { error: 'verification_failed', message: 'Please complete the verification and try again.' });
  }

  const submittedAt = new Date().toISOString();
  const submittedEmail = email || 'Not provided';
  const sourceText = sourcePage ? `\nSource page: ${sourcePage}` : '';
  const sourceHtml = sourcePage ? `<p><strong>Source page:</strong> ${escapeHtml(sourcePage)}</p>` : '';
  const emailPayload: Record<string, unknown> = {
    from: env.CONTACT_FROM_EMAIL,
    to: [env.CONTACT_TO_EMAIL],
    subject: `[IntoSTL Feedback] ${category}`,
    text: `Category: ${category}\nSubmitted email: ${submittedEmail}${sourceText}\nUTC submission timestamp: ${submittedAt}\n\nMessage:\n${message}`,
    html: `<p><strong>Category:</strong> ${escapeHtml(category)}</p><p><strong>Submitted email:</strong> ${escapeHtml(submittedEmail)}</p>${sourceHtml}<p><strong>UTC submission timestamp:</strong> ${escapeHtml(submittedAt)}</p><p><strong>Message:</strong><br>${escapeHtml(message).replace(/\r?\n/g, '<br>')}</p>`,
  };
  if (email) emailPayload.reply_to = email;

  try {
    const emailResponse = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(env.CF_ACCOUNT_ID!)}/email/sending/send`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.CF_EMAIL_API_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(emailPayload),
      },
    );
    const emailResult = await emailResponse.json().catch(() => null) as EmailApiResult | null;
    if (!emailResponse.ok || emailResult?.success !== true) {
      return jsonResponse(502, { error: 'delivery_failed', message: 'Your feedback could not be sent. Please try again.' });
    }
  } catch {
    return jsonResponse(502, { error: 'delivery_failed', message: 'Your feedback could not be sent. Please try again.' });
  }

  return jsonResponse(200, { success: true, message: 'Thanks — your feedback was sent.' });
};

export const onRequest = async (context: ContactContext): Promise<Response> => {
  if (context.request.method !== 'POST') {
    return jsonResponse(
      405,
      { error: 'method_not_allowed', message: 'Only POST requests are supported.' },
      { Allow: 'POST' },
    );
  }
  return handleContactPost(context);
};
