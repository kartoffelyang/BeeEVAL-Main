# BeeEVAL Main

Corporate website for BeeEVAL: HTML research reports, evaluation displays, scenario research and POC validation.

Production URL: https://www.beeeval.com/main/

## Build

Use Node.js 24 and Python 3. Install the library dependencies with `npm --prefix scenario-library ci`, then run `npm run build` in this repository. The deployable artifact is `dist/`.

## Routes and membership

- `/main/`: corporate homepage.
- `/main/reports.html`: seven actual HTML reports and public abstracts, with Chinese and English full-text versions.
- `/main/scenes/`: redirects to the independent scenario product login.
- `/main/scenes/login.html`: scenario product sign-in.
- `/main/scenes/library/`: complete scene research, protected by server membership checks.
- `/main/login.html`: existing BeeScene account login and registration.
- Full HTML reports are protected by administrator authorization. Paid report orders are not enabled yet; ordinary members retain preview access.

The admin/admin test account is restricted to localhost previews. Published hosts always use server authentication through the existing `/scene/api/` service and HttpOnly session cookie. The independent read-only authorization service validates current database sessions; no account database or credentials are included in this repository.

## Deployment

Install `deploy/main.conf` inside the existing HTTPS vhost and run the service defined by `deploy/beeeval-main-auth.service`. Publish versioned releases under `/opt/beeeval-main/releases/`, with `/var/www/beeeval-main` pointing to the current release artifact. Validate nginx before reloading; preserve existing root and scene routes. SSH keys, host credentials, account databases and local settings must remain outside Git.

## Languages

Corporate pages support Chinese/English with a persisted preference. Full reports use `index.html` for Chinese and `en.html` for English; report links follow the selected language. Scenario product language preferences are synchronized with the corporate site.

## Unified BeeEVAL membership

The company site is the single sign-in entry at `/main/login.html`. Production credentials are verified by the existing BeeEVAL account API. A Secure, HttpOnly cookie shared across BeeEVAL domains lets the evaluation platform and scenario library recognize the same identity. The existing `admin` account retains full access; capability checks are centralized for future membership tiers. No production password is stored in this repository. Local preview alone supports the `admin / admin` fixture.

`integrations/beescene/identity.mjs` and `patch.py` integrate the existing scene API without changing ownership of the original administrator's private scenes. Platform integration changes belong to the BeeEVAL evaluation repository (`api/auth/deps.py`, `api/routers/auth.py`, `src/api.ts`, `src/contexts/AuthContext.tsx`, `src/pages/Login.tsx`). Existing bearer-token sessions migrate to the shared browser cookie after validation. Registration is invitation-based while membership tiers are pending.

Run `node tests/unified-auth.mjs` to verify the login broker, cookie attributes, role policy, invalid sessions, origin checking and sign-out.

## Visitor summaries and product previews

`preview.html?report=<id>` publishes a short summary, key findings and content outline for each report. `preview.html?product=platform` shows the platform overview and four anonymous metric examples; `preview.html?product=scenes` shows the library overview and three concept examples. Full content uses the existing shared login and server authorization. Sign-in retains the report language or product destination. No purchase flow is shown during this test phase. Old public scenario detail assets are retired.

Local acceptance preview: run `python3 scripts/preview.py` on port 8771. Its fixture account is `admin / admin`; it is a local-only account, separate from production BeeEVAL credentials. Visitor HTTP requests cannot fetch full report or scenario-library resources; the fixture uses an HttpOnly session cookie. Run `python3 tests/visitor-preview.py` against the running preview for visitor, member, language destinations and logout acceptance checks.
