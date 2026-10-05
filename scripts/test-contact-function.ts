import assert from 'node:assert/strict';
import { onRequest } from '../functions/api/contact.ts';

const env = {
  TURNSTILE_SECRET_KEY: 'test-secret',
  RESEND_API_KEY: 'test-resend-key',
  CONTACT_FROM_EMAIL: 'feedback@example.com',
  CONTACT_TO_EMAIL: 'inbox@example.com',
};

const request = (body: unknown, headers: HeadersInit = {}) => new Request('https://intostl.com/api/contact', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', ...headers },
  body: typeof body === 'string' ? body : JSON.stringify(body),
});

const submit = (body: unknown, headers?: HeadersInit) => onRequest({ request: request(body, headers), env });
const expectError = async (response: Response, status: number, error: string) => {
  assert.equal(response.status, status);
  assert.equal((await response.json() as { error: string }).error, error);
};

await expectError(await onRequest({ request: new Request('https://intostl.com/api/contact', { method: 'GET' }), env }), 405, 'method_not_allowed');
await expectError(await onRequest({ request: new Request('https://intostl.com/api/contact', { method: 'POST', body: '{}' }), env }), 415, 'invalid_content_type');
await expectError(await submit('{'), 400, 'invalid_json');
await expectError(await submit({ category: 'Unknown', email: '', message: 'A valid message.', turnstileToken: 'token' }), 400, 'invalid_category');
await expectError(await submit({ category: 'Bug', email: '', message: '   ', turnstileToken: 'token' }), 400, 'invalid_message');
await expectError(await submit({ category: 'Bug', email: '', message: 'short', turnstileToken: 'token' }), 400, 'invalid_message');
await expectError(await submit({ category: 'Bug', email: 'not-an-email', message: 'A sufficiently long message.', turnstileToken: 'token' }), 400, 'invalid_email');
await expectError(await submit({ category: 'Bug', email: `${'a'.repeat(245)}@example.com`, message: 'A sufficiently long message.', turnstileToken: 'token' }), 400, 'invalid_email');
await expectError(await submit({ category: 'Bug', email: '', message: 'A sufficiently long message.', turnstileToken: '' }), 400, 'verification_failed');
await expectError(await submit({ category: 'Bug', email: '', message: 'A sufficiently long message.', turnstileToken: 'token', attachment: 'not allowed' }), 400, 'unexpected_field');
await expectError(await submit({ category: 'Bug', email: '', message: 'x'.repeat(17_000), turnstileToken: 'token' }), 413, 'payload_too_large');

const originalFetch = globalThis.fetch;
let calls: Array<{ url: string; authorization: string | null; body: unknown }> = [];

try {
  globalThis.fetch = async (input, init) => {
    calls.push({
      url: String(input),
      authorization: new Headers(init?.headers).get('Authorization'),
      body: JSON.parse(String(init?.body ?? '{}')),
    });
    return Response.json({ success: false, 'error-codes': ['invalid-input-response'] });
  };
  await expectError(await submit({ category: 'Suggestion', email: '', message: 'A sufficiently long message.', turnstileToken: 'bad-token' }), 400, 'verification_failed');
  assert.equal(calls.length, 1);

  calls = [];
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
    calls.push({ url, authorization: new Headers(init?.headers).get('Authorization'), body });
    if (url.includes('/siteverify')) return Response.json({ success: true });
    return Response.json({ id: 'test-email-id' });
  };
  const success = await submit({
    category: 'Conversion issue',
    email: 'person@example.com',
    message: '<script>alert("escaped")</script>\nSecond line',
    turnstileToken: 'valid-token',
    sourcePage: '/contact/',
  });
  assert.equal(success.status, 200);
  assert.equal((await success.json() as { success: boolean }).success, true);
  assert.equal(calls.length, 2);
  const emailCall = calls[1];
  const emailBody = emailCall.body as Record<string, unknown>;
  assert.equal(emailCall.url, 'https://api.resend.com/emails');
  assert.equal(emailCall.authorization, 'Bearer test-resend-key');
  assert.equal(emailBody.from, 'feedback@example.com');
  assert.deepEqual(emailBody.to, ['inbox@example.com']);
  assert.equal(emailBody.reply_to, 'person@example.com');
  assert.match(String(emailBody.subject), /^\[IntoSTL Feedback\] Conversion issue$/);
  assert.match(String(emailBody.html), /&lt;script&gt;/);
  assert.doesNotMatch(String(emailBody.html), /<script>/);

  calls = [];
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    calls.push({
      url,
      authorization: new Headers(init?.headers).get('Authorization'),
      body: JSON.parse(String(init?.body ?? '{}')),
    });
    if (url.includes('/siteverify')) return Response.json({ success: true });
    return Response.json({ message: 'provider failure' }, { status: 500 });
  };
  await expectError(await submit({ category: 'Other', email: '', message: 'A sufficiently long message.', turnstileToken: 'valid-token' }), 502, 'delivery_failed');
  assert.equal(calls.length, 2);
  assert.equal(calls[1].url, 'https://api.resend.com/emails');
  assert.equal(calls[1].authorization, 'Bearer test-resend-key');
  assert.equal(Object.hasOwn(calls[1].body as object, 'reply_to'), false);
} finally {
  globalThis.fetch = originalFetch;
}

console.log('Contact Function validation and delivery tests passed.');
