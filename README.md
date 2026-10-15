# BeeEVAL Main

Unified company website, scenario library and evaluation database.

- `/`: company homepage, HTML reports, membership and contact.
- `/scenes/`: protected scenario library, with the same account in the bottom-left menu.
- `/data/`: protected BeeEVAL data platform, case/video search and benchmarks.
- `/login.html`: unified login, free registration and account centre.
- `/api/`: membership/session/contact broker.
- `/scenes/api/`: private scenario workspace API.
- `/data/api/`: authenticated evaluation API gateway to the existing evaluation service.

## Source layout

`site/` company pages; `scenario-library/` scenario frontend and backend; `data-platform/` database frontend and gateway; `server/` shared membership/contact; `integrations/evaluation/` original account backend extension. Account databases, videos, evaluation records, models, private files and credentials remain outside Git.

## Build and preview

Node 24 and Python 3. Run `npm ci`, `npm --prefix scenario-library ci`, `npm --prefix data-platform ci`, then `npm run build`. The single artifact is `dist/`, containing the root website, `scenes/`, and `data/`. Run `python3 scripts/preview.py` for localhost acceptance at port 8771. Local demo accounts never become production accounts.

## Membership and reports

Production uses the existing BeeEVAL identity API and a Secure HttpOnly shared cookie. Role and membership checks are enforced by the server and nginx, not by a visual badge. `l9livis` is Free after registration. Other reports require eligible membership or an individual sales grant. Free members cannot access scenarios or evaluation data. Purchases are handled by sales; no online checkout is enabled. Reports have browser reading controls and account watermarks, which cannot guarantee protection against screenshots or determined extraction.

## Deployment

See `deploy/unified-site.conf`, `deploy/data.conf` and the three service units. Releases live under `/opt/beeeval-main/releases/`, `current` selects one consolidated release, and `/var/www/beeeval-main` points to its `dist/`. The existing `beeeval-light` and `beescene` systemd unit names are retained for operational compatibility; their source code comes from this repository. Back up nginx, units, account data and scenario SQLite before changing the release. Validate nginx before reload.

Old `/main`, `/main/scenes/library`, `/light` and `/scene` page URLs redirect to canonical addresses. Old website pages are no longer served on the main domain. Other domains and service data remain unchanged.

Self-service registration/profile routes require the paired original account backend integration, see `integrations/evaluation/README.md`. SMTP settings belong in server-owned environment files; never include them in a release archive or Git. Contact messages go only to `beeeval@xailab.cn`.

## Checks

`node tests/unified-auth.mjs`; `node --test tests/contact.mjs`; `python3 tests/free-membership.py`; `npm --prefix data-platform run test:case-search`.
