# BeeEVAL Main

Corporate website for BeeEVAL: HTML research reports, evaluation displays, scenario research and POC validation.

Production URL: https://www.beeeval.com/main/

## Build

Use Node.js 24 and Python 3. Install the library dependencies with `npm --prefix scenario-library ci`, then run `npm run build` in this repository. The deployable artifact is `dist/`.

## Routes and membership

- `/main/`: corporate homepage.
- `/main/reports.html`: report catalog and public abstracts.
- `/main/scenes/`: six free scenarios and public directory.
- `/main/scenes/library/`: complete scene research, protected by server membership checks.
- `/main/login.html`: existing BeeScene account login and registration.
- Full HTML reports are protected by administrator authorization. Paid report orders are not enabled yet; ordinary members retain preview access.

The published site does not contain the local admin/admin demo login. Authentication uses the existing `/scene/api/` service and HttpOnly session cookie. The independent read-only authorization service validates current database sessions; no account database or credentials are included in this repository.

## Deployment

Install `deploy/main.conf` inside the existing HTTPS vhost and run the service defined by `deploy/beeeval-main-auth.service`. Publish versioned releases under `/opt/beeeval-main/releases/`, with `/var/www/beeeval-main` pointing to the current release artifact. Validate nginx before reloading; preserve existing root and scene routes. SSH keys, host credentials, account databases and local settings must remain outside Git.
