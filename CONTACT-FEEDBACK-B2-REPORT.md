# IntoSTL — Batch B2 Contact Feedback Submission Report

## 1. Files changed

- `functions/api/contact.ts` — added the single Cloudflare Pages Function.
- `src/pages/contact.astro` — enabled the existing form, added Turnstile and inline form states.
- `src/pages/privacy.astro` — corrected only the contact/feedback statements.
- `src/styles/global.css` — added minimal verification and status styling.
- `scripts/test-contact-function.ts` — added mocked Function validation and delivery tests.
- `scripts/production-browser-smoke.mjs` — added mocked contact-form interaction checks.
- `package.json` — added the contact test to the production smoke command.
- `CONTACT-FORM-SETUP.md` — documented the required Cloudflare configuration.
- `CONTACT-FEEDBACK-B2-REPORT.md` — recorded this implementation and validation.

## 2. API route created

The only new backend route is `POST /api/contact`, implemented as the Pages Function `functions/api/contact.ts`. Other HTTP methods receive a JSON `405 Method Not Allowed` response with `Allow: POST`. The Astro site remains statically generated.

## 3. Input validation

The Function accepts JSON only and caps the complete request body at 16 KiB. It allows only the five expected properties and rejects attachments or other unexpected fields. Categories must exactly match `Conversion issue`, `Bug`, `Suggestion` or `Other`. Email is optional, conservatively validated and limited to 254 characters. The trimmed message is required and limited to 10–4000 characters. The Turnstile token is required and bounded. Responses are JSON and do not expose credentials or stack traces.

## 4. Turnstile flow

The browser renders Turnstile from `PUBLIC_TURNSTILE_SITE_KEY` and submits the resulting token with the form. The Pages Function sends the token and `TURNSTILE_SECRET_KEY` directly to Cloudflare Siteverify. `CF-Connecting-IP` is included as `remoteip` only when available. Email delivery starts only when Siteverify returns `success: true`; verification failures return concise user-facing errors.

## 5. Email Service flow

After validation, the Function calls the Cloudflare Email Service REST endpoint for `CF_ACCOUNT_ID` with the bearer token in `CF_EMAIL_API_TOKEN`. The fixed sender and recipient come from `CONTACT_FROM_EMAIL` and `CONTACT_TO_EMAIL`. The subject includes the validated category; both plain-text and escaped HTML bodies include the category, submitted email or `Not provided`, message, optional source page and UTC timestamp. A validated user email is set only as `reply_to`, never as `from`. IP addresses and raw headers are not placed in the email.

## 6. Privacy page update

The inaccurate statement that feedback was disabled was replaced. The page now identifies the submitted category, optional email, message and request-processing information, while retaining the explicit boundary that converter files are not attached or uploaded.

## 7. Required Cloudflare environment variables

The deployment requires `TURNSTILE_SECRET_KEY`, `PUBLIC_TURNSTILE_SITE_KEY`, `CF_ACCOUNT_ID`, `CF_EMAIL_API_TOKEN`, `CONTACT_FROM_EMAIL` and `CONTACT_TO_EMAIL`. Secret and deployment setup instructions are in `CONTACT-FORM-SETUP.md`; no real credentials were added to the repository.

## 8. Tests performed

- `npm run test:contact` — passed with mocked Turnstile and Email Service responses.
- `npm exec tsc -- --noEmit` — passed.
- `npm run build` — passed; Astro check reported 0 errors, 0 warnings and 0 hints, and 10 static pages were built.
- `npm run smoke:production` — passed; all contact submissions were intercepted, all public and mobile checks passed, and no real mailbox or external request was used.
- `npm run spike` — passed; existing image, STL and 3MF conversion and round-trip checks remained successful.

Coverage includes unsupported methods, non-JSON/malformed/oversized bodies, unexpected fields, invalid categories, empty/short messages, malformed/overlong email, missing or failed Turnstile verification, successful UI submission and simulated Email Service failure.

## 9. Scope confirmation

No database, KV, D1, R2, file upload, attachment, analytics, account system, third-party email service or conversion behavior was added. Image, STL and 3MF processing remains browser-local and unchanged.

CONTACT FEEDBACK B2 — READY FOR CLOUDFLARE CONFIGURATION
