# Self-service free members — original identity backend integration

This directory extends the existing BeeEVAL `users` identity store. It does not create a separate production account system or change existing account roles. Everything in this change remains local until deployment is authorized.

Before deployment:
1. Review and apply `membership.sql` to the existing account database (back up first).
2. Run `python3 integrations/evaluation/apply_membership.py /path/to/beeeval_data_analyze` against the evaluation API source, then deploy that backend. This adds verification/register/profile routes and includes `membership_tier` and per-report entitlements in login/me responses.
3. Reuse that backend's existing `SMTP_*` configuration for email codes. No real credentials belong in Git. For optional phone verification, configure an HTTPS `SMS_VERIFICATION_URL` accepting `{phone,code,expires_in}` and `SMS_VERIFICATION_TOKEN` server-side. Until configured, phone verification is disabled, not simulated.
4. Deploy the updated Main broker, scenario identity integration and nginx report/scene checks together. Nginx passes the requested report path to the policy check. A Free label alone is never access control.
5. Validate real email code delivery and shared sign-in, then free/paid report and scene/database denials using a new account. Local preview covers these flows with private-file OTPs but cannot establish production delivery or cross-service migration.

Self-registered users have role `viewer`, membership `free`, no expiry and a verified contact. Their authenticated business API calls are denied; identity/profile/password endpoints remain available. Only the Livis `l9livis` report is currently free; `i8-livis` remains paid. Both report language versions inherit the same server-side report entitlement. Legacy roles are preserved until the separately agreed migration is authorized.

Paid reports are sold offline: after sales confirms purchase, an administrator grants a report using the original API's `POST /api/auth/report-entitlements` with `{user_id,report_key}`. This records an individual grant; it is not an order/payment endpoint and does not unlock scenarios or the evaluation database. Existing report grants are returned by `/api/auth/me`; the Main broker enforces them server-side.

OTP codes expire in 5 minutes, have a 60-second resend interval, are HMAC-hashed in the DB, and stop after five attempts. Registration consumes a code atomically. Profile updates cannot alter role or membership. Existing password changes invalidate sessions through password_version.

Local tests: `python3 tests/free-membership.py`, `node tests/unified-auth.mjs`, `node --test tests/contact.mjs`. Local synthetic accounts live under ignored `.local/preview-members.sqlite`; the current test code is in `.local/verification-code.txt` with owner-only file permissions, never returned by an API or exposed through static routes.
