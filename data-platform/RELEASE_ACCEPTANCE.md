# BeeEVAL Light release acceptance — 2026-10-13

Published at https://www.beeeval.com/light/ with a private GitHub repository, https://github.com/kartoffelyang/BeeEVAL-Light. Original frontend/history was not pushed to the original repository. The Light gateway and static files run independently of the company homepage and BeeScene.

## Actual production verification

| Check | Evidence |
|---|---|
| Home, login and nested routes | HTTP 200; /light redirects to /light/ |
| JS and original logo assets | HTTP 200 under /light/ |
| Original account login | Real user login POST returned 200; user confirmed login |
| Model/version inventory | HTTP 200, 11 entries |
| Test records | HTTP 200, 7,415 records in the existing exclude-review scope |
| Keyword search | Sunroof keyword returned 49 matches; 30 records on the first page; cached response 26 ms |
| Vehicle scores, acceptance baseline and task comparison | All returned HTTP 200 |
| Task video cards | HTTP 200, two records for the tested task/grade/model |
| Review and account listing | HTTP 200 in the user's real admin scope |
| Video signature | HTTP 200; proxy quality, proxy ready |
| Actual video stream | HTTP 206, video/mp4, Range response; user confirmed playback |
| Invalid video token | HTTP 401 |
| Unauthenticated search/admin/sign requests | HTTP 401 |
| Company home and BeeScene | Both remain HTTP 200 |
| nginx and service | Syntax valid; beeeval-light service active |

Snapshot counts and timings may change with permissions and data updates. Server video timing log recorded real requests with upstream header times of 80, 112 and 192 ms. These are observed samples, not a latency guarantee or browser decode measurements. The user reported the second opening was fast.

## Performance changes

- Nginx directly forwards signed NAS/local video streams with Range support and upstream TLS keep-alive. The Node gateway remains responsible for auth/API forwarding and content search.
- Existing upstream cache/1080p proxy generation is retained. It reported 187 proxy files and no active warm jobs at the acceptance snapshot. A cold video can still require NAS retrieval and background processing.
- Actual question/dialogue content becomes searchable before optional canonical descriptions finish loading. Enrichment invalidates normalized text caches when it updates wording.
- Authenticated visits warm the per-account search index. Business/account writes continue through original backend authorization, unlike the deliberately read-only local preview.

## Automated checks

Production build, TypeScript, custom select interactions, content search/account scopes/cache behavior, stale-request/scroll behavior, task-video menu selection, score boundaries/industry averages/sorting, and production proxy method/body/Range forwarding passed. A regression test proves slow canonical enrichment cannot delay actual-content search and later wording updates remain searchable.

## Acceptance limits

- No real evaluation records were approved, edited or deleted; no real accounts were created, changed, reset or deleted. Read interfaces and forwarding contracts were checked; write operations have not been accepted through live business mutations.
- The user's actual admin scope was verified. Other roles were covered by local permission regression tests, not separate real-account production sessions.
- Export controls, report/tools/Dr Bee routes and detail-level Claude review controls intentionally remain removed. This is not a complete copy of the old frontend.
- Short-lived video signatures and original backend permissions remain in use. Export removal and signed URLs are not DRM and do not guarantee that playable video cannot be captured.

## Operations

Runtime listens on 127.0.0.1:5188. Production uses an isolated beeeval-light systemd service and nginx snippet. nginx configuration was backed up before the Light include was added. The optional BEEEVAL_VERIFY_ONCE switch has been disabled after acceptance. Logs contain endpoint statuses/counts/timings, not credentials, signed URLs or record contents.
