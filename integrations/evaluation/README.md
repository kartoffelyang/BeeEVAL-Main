# Self-service free members — original identity backend integration

This directory extends the existing BeeEVAL `users` identity store. It does not create a separate production account system or change existing account roles. Everything in this change remains local until deployment is authorized.

Before deployment:
1. Review and apply `membership.sql` to the existing account database (back up first).
2. Run `python3 integrations/evaluation/apply_membership.py /path/to/beeeval_data_analyze` against the evaluation API source, then deploy that backend. This adds verification/register/profile routes and includes `membership_tier` and per-report entitlements in login/me responses.
3. Reuse that backend's existing `SMTP_*` configuration for email codes. No real credentials belong in Git. For optional phone verification, configure an HTTPS `SMS_VERIFICATION_URL` accepting `{phone,code,expires_in}` and `SMS_VERIFICATION_TOKEN` server-side. Until configured, phone verification is disabled, not simulated.
4. Deploy the updated Main broker, scenario identity integration and nginx report/scene checks together. Nginx passes the requested report path to the policy check. A Free label alone is never access control.
5. Validate real email code delivery and shared sign-in, then free/paid report and scene/database denials using a new account. Local preview covers these flows with private-file OTPs but cannot establish production delivery or cross-service migration.

Self-registered users have role `viewer`, membership `free`, no expiry and a verified contact. Their authenticated business API calls are denied; identity/profile/password endpoints remain available. Free report access follows the current report catalog; the L9 Livis, ZEEKR 9X and i8-to-Livis studies are marked free. Both report language versions inherit the same server-side report entitlement. Legacy roles are preserved until the separately agreed migration is authorized.

Paid reports are sold offline: after sales confirms purchase, an administrator grants a report using the original API's `POST /api/auth/report-entitlements` with `{user_id,report_key}`. This records an individual grant; it is not an order/payment endpoint and does not unlock scenarios or the evaluation database. Existing report grants are returned by `/api/auth/me`; the Main broker enforces them server-side.

OTP codes expire in 5 minutes, have a 60-second resend interval, are HMAC-hashed in the DB, and stop after five attempts. Registration consumes a code atomically. Profile updates cannot alter role or membership. Existing password changes invalidate sessions through password_version.

Local tests: `python3 tests/free-membership.py`, `node tests/unified-auth.mjs`, `node --test tests/contact.mjs`. Local synthetic accounts live under ignored `.local/preview-members.sqlite`; the current test code is in `.local/verification-code.txt` with owner-only file permissions, never returned by an API or exposed through static routes.

## Account experience and email password recovery

The website account home is `/account.html`, with separate overview, access, profile and security sections. Password settings are collapsed by default. Login returns to the original page; persistence is opt-in for seven days. The browser password manager handles password storage. Phone registration stays hidden while no SMS provider is configured.

Before releasing the new recovery UI, back up the account database, apply `password_recovery.sql`, and run `apply_password_recovery.py` against the active API source. Deploy its router together with `member_accounts.py` (the SMTP sender uses keyword-only arguments) and the Main broker. Recovery proofs are separate from registration codes, expire in five minutes and allow at most five attempts. A reset consumes the proof and increments `password_version` atomically to invalidate old sessions. Existing accounts are not changed during deployment.

Run `python3 tests/password-recovery.py`, `python3 tests/account-journey.py`, `node tests/identity-return.mjs` and `node tests/unified-auth.mjs`. Local OTP demos do not send production mail.

## Read performance integration

`apply_read_performance.py <current-api-source>` installs `paged_case_search.py`
and `read_performance.py` while patching only named read handlers. Apply to a
copy of the current runtime source and compile/test it before building an image.
Keep the existing image available for rollback. The website gateway must be
updated after the API exposes `/api/video/case-search`.

Run `performance_indexes.sql` with autocommit: the three partial indexes use
`CREATE INDEX CONCURRENTLY` and do not rewrite evaluation records or scores.
They accelerate valid case counts, domain pagination and Trial video checks.
Failed concurrent builds must be checked for invalid indexes before retrying.
Then apply `case_search_projection.sql`: it builds compact normalized case text
and keeps it in sync on source insert/update/delete. Install the trigger before
the conflict-safe initial backfill. This is a derived search table, never an
independent permission source; reads still check current publication and account
scope. Keep it when rolling back application code, so updates remain synchronized.

Case counts and each page use one SQL/MVCC snapshot; no full-bank per-account
download, automatic warming, snapshot-count retry loop or canonical-question
enrichment crawl is needed. Taxonomy facets load separately after the rows.
All queries retain publication and live account scope, with travel-only Trial
evidence and legacy viewer redaction. Aggregate read caches last 20 seconds,
are bounded and include the resolved principal; authentication is never cached.
Synchronous database work runs outside the API event loop so one expensive read
cannot block signing or streaming. No write, scoring or evaluation job is patched.

## Full benchmark loading

Apply `benchmark_read_model.sql` after `case_search_projection.sql`. The maintained
small metadata view preserves the original source columns and scalar JSON types.
Run `apply_benchmark_performance.py` against the current runtime source: only
vehicle inventory, acceptance summaries, shared read analytics and PK case lists
use the view. All original publication filters, model/version identity, score
formulas, Trial checks, full evidence, signing and write handlers stay in place.
The synchronization trigger must be the latest migration; do not reapply an
older projection migration after this one without rerunning this migration.

Frontend regressions: `node preview/tests/benchmark-loading-runtime.cjs` checks
cached inventory rendering, one-request metric ranking with acceptance deferred,
and lightweight video cards with full evidence loaded on click. Compare original
and patched live read outputs before switching the API image.

## Persistent benchmark snapshots

`benchmark_snapshots.sql` creates two derived tables: a transactional publication
revision and JSON response snapshots. `apply_benchmark_snapshots.py` installs the
cache only on vehicle inventory, stored scores, bulk rankings, acceptance and
the five shared aggregate analytics reads. It removes the older 20-second cache
from those paths; metadata lookup caches are unchanged. No AI evaluation or
score recalculation runs during preparation.

All users/processes with the same effective aggregate scope share a snapshot,
including explicit Trial (which can see all aggregate domains). Legacy viewer
brand filtering is a separate scope. Authentication, active/expiry checks and
the existing per-model guard still run for every request. Questions, raw cases,
PK evidence and temporary video URLs are never placed in this shared cache.

Changes to published results, their metric scores, publication membership,
stored vehicle scores or the case pool invalidate the snapshots in the same
transaction. Unpublished draft writes do not trigger rebuilds. A hit checks the
current revision, so invalid data is never served while waiting for preparation.
Cold builds coalesce across processes; revision changes during a build prevent
publishing a mixed response. A database cache error falls back to the original
read and its original access filters. A cache hit performs no source aggregation.

An API startup thread prepares the finite vehicle/version/domain/core-metric
matrix in the background, checks for changes every 15 seconds and elects one
preparer with a PostgreSQL session lock. Each snapshot commits individually.
Snapshots survive API restarts. Code/config inputs have a deployment fingerprint;
restart workers after changing config/taxonomy files. Old fingerprints are
cleaned after seven days on a successful new preparation. The worker never
creates accounts, signs videos, republishes data or invokes an AI/scoring job.

Release order: validate the installer against a copy of current runtime source;
commit/push Git; back up the original source/image; apply the additive SQL;
build a layer over the current image with the patched five Python files; verify
health **inside** the API container (port 8004 is not host-published); switch only
the API service and verify warm/hot output equality. Keep the prior image for
rollback. Rollback code can leave the derived tables/triggers in place safely.

Tests run in the API Python environment: `tests/benchmark-snapshots.py` covers
durability, scope and live guards, model restoration, concurrency, revision races
and cache failure; `tests/benchmark-snapshot-triggers.py` tests real PostgreSQL
invalidation in a rolled-back isolated schema; `tests/benchmark-snapshot-live.py`
compares real source outputs against cold/hot snapshots and verifies zero source
queries on hits, with all temporary cache writes rolled back. No real evaluation,
score, publication or account is modified by these verification scripts.

2026-11-23 candidate verification: all 15 stored vehicle/version score outputs
matched the source, and the warm matrix held 395 responses. Median hot backend
reads (five calls, no source-table queries) were: inventory 0.39 ms versus 415.76
ms source read; bulk scores 1.67 versus 8.49 ms; criteria 0.95 versus 44.39 ms;
scenario completion 1.08 versus 8.32 ms; metrics 0.64 versus 22.45 ms. These are
API-side timings, not complete browser/network/video load times.
