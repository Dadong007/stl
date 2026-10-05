# IntoSTL contact form setup

The contact form uses one Cloudflare Pages Function, Cloudflare Turnstile and the Cloudflare Email Service REST API. No production credentials belong in Git.

## Required Cloudflare values

Configure these values for the Production environment of the IntoSTL Pages project:

| Name | Where it is used | Recommended setting |
| --- | --- | --- |
| `PUBLIC_TURNSTILE_SITE_KEY` | Astro build and browser widget | Plain-text build variable; this value is intentionally public |
| `TURNSTILE_SECRET_KEY` | Pages Function Siteverify request | Encrypted secret |
| `CF_ACCOUNT_ID` | Pages Function Email Service URL | Plain-text runtime variable |
| `CF_EMAIL_API_TOKEN` | Pages Function Email Service authorization | Encrypted secret |
| `CONTACT_FROM_EMAIL` | Fixed sender address | Plain-text runtime variable |
| `CONTACT_TO_EMAIL` | Fixed destination inbox | Plain-text runtime variable |

Add the same names to Preview only if preview deployments should have a working form. Keep production and test credentials separate.

## Cloudflare configuration

1. Create a Turnstile widget for the production hostname and copy its site key and secret into the matching variables above.
2. Enable Cloudflare Email Service for the account and configure an approved sender domain/address for `CONTACT_FROM_EMAIL`.
3. Create a least-privileged Cloudflare API token that can send through Email Service, and store it as `CF_EMAIL_API_TOKEN`.
4. Set `CONTACT_TO_EMAIL` to the one inbox that should receive feedback. The browser cannot choose or override this address.
5. Save the variables in the Pages project and trigger a new deployment. `PUBLIC_TURNSTILE_SITE_KEY` is embedded during the Astro build; the other values are read by the Function at request time.
6. After deployment, submit one non-sensitive test message and confirm the success state and inbox delivery.

The Pages project remains a static Astro build. The only server route is `POST /api/contact` from `functions/api/contact.ts`.

## Local and automated testing

Cloudflare documents these Turnstile test values for non-production testing:

- Always-pass site key: `1x00000000000000000000AA`
- Always-pass secret key: `1x0000000000000000000000000000000AA`

Never substitute a production secret into an automated test. The repository's contact Function test mocks both Cloudflare requests, and the browser smoke test intercepts `/api/contact`; neither sends a real email.

For an end-to-end local Pages Function check, put temporary values in a local, ignored `.dev.vars` file and use the Cloudflare Pages development runtime. Do not commit `.dev.vars`, `.env`, API tokens, Turnstile secrets or mailbox credentials.

## Request and privacy boundary

The endpoint accepts only JSON containing `category`, optional `email`, `message`, `turnstileToken` and optional `sourcePage`. Unexpected fields are rejected. Converter files, attachments and browsing history are not accepted or transmitted.
