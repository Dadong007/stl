# IntoSTL — Contact Email Provider Swap Report

- Cloudflare Email Service delivery and its `CF_ACCOUNT_ID` / `CF_EMAIL_API_TOKEN` variables were removed.
- Direct Resend REST delivery through `POST https://api.resend.com/emails` was added without an npm package.
- Production configuration now requires exactly `PUBLIC_TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY`, `RESEND_API_KEY`, `CONTACT_FROM_EMAIL` and `CONTACT_TO_EMAIL`.
- The existing route, Turnstile flow, validation, size limits, escaped email content, Contact UI, privacy wording and user-facing states were not changed.
- Mocked tests verify successful delivery, non-2xx provider failure, bearer authorization, fixed From/To values, conditional `reply_to` and escaped HTML. No real email is sent by automated tests.

All required checks passed:

- `npm run test:contact`
- `npm exec tsc -- --noEmit`
- `npm run build`
- `npm run smoke:production`
- `npm run spike`

No other Contact behavior changed.
