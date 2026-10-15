# BeeEVAL Light

Light interface for authenticated BeeEVAL case search, vehicle comparison, scenario performance and test-video viewing. Reuses the original BeeEVAL backend for accounts, permissions and internal administration.

## Local development

```sh
npm ci
npm run dev
```

Local preview binds 127.0.0.1:5186 and blocks business writes. Authentication and video-read signing remain allowed.

## Production build

```sh
npm ci
npm run build:light
```

Serve dist at /light/. Run server/dist/index.mjs with Node 20+ on loopback PORT=5188. BEEEVAL_UPSTREAM defaults to https://open.beeeval.com. Include deploy/beeeval-light.conf inside the www.beeeval.com HTTPS server block and install deploy/beeeval-light-video-upstream.conf under /etc/nginx/conf.d/. Use deploy/beeeval-light.service with a concrete release path. The production proxy forwards business requests to the original backend, whose authentication and role enforcement remains authoritative. No credentials are bundled.

The content-search runtime must be deployed alongside the frontend. Static files alone do not provide /light/api/cases/search. Authenticated video playback and admin writes require production acceptance; removing exports does not implement DRM.

## Checks

npm run check; npm run test:select; npm run test:case-search; npm run test:query-ui

node preview/tests/task-video-menu.cjs; node preview/tests/benchmark-refinements.cjs; node preview/tests/production-proxy.cjs (after build:server)

Production acceptance evidence and its limits are recorded in RELEASE_ACCEPTANCE.md. The optional BEEEVAL_VERIFY_ONCE=1 performs one read-only acceptance pass in the first real caller scope; leave it disabled in normal operation.
