# TikTok delivery and Hetzner readiness

The TikTok URL compatibility fix is implemented and verified in the local candidate. No application release, gateway reload, live S3 activation or real social post was performed. Production remains on local storage.

## TikTok delivery

Production uses `APP_URL=https://sneepcut.com` and `TIKTOK_VERIFIED_URL_PREFIX=https://sneepcut.com/media/`. A read-only aggregate check found 44 TikTok posts recorded as published. This is historical evidence, not a new verification of the TikTok console's URL properties.

TikTok scheduling validation, enqueueing and dispatch now use a provider-aware media URL resolver. TikTok receives a four-hour signed URL under `https://sneepcut.com/media/publish/`; other providers and previews keep their existing storage-signed URLs. Ownership and media preparation checks still precede URL generation. Dispatch creates a fresh signature from the stored key.

The new GET/HEAD handler validates a path-bound HMAC, expiry and query cardinality before touching storage. It accepts prepared video/photo keys under `clips/` or `publishing/`, serves local files or streams private S3 bytes, supports byte ranges, stops storage requests when the caller disconnects and limits a download to one hour. It never follows storage redirects or forwards application cookies/authorization to S3, and it exposes only selected media headers. Candidate production and dev nginx configurations route this narrower prefix to Go with response buffering disabled. The existing static media route remains available for older links.

Keep the current TikTok URL prefix. No bucket ownership verification, new certificate, public bucket or CORS change is required by this design. TikTok's guide requires an owned HTTPS URL, no redirects and accessibility throughout its download window; the application origin preserves that URL boundary. See the [official media transfer guide](https://developers.tiktok.com/docs/en/content-posting-api-media-transfer-guide), [Go HTTP documentation](https://pkg.go.dev/net/http), and [nginx proxy documentation](https://nginx.org/en/docs/http/ngx_http_proxy_module.html#proxy_pass).

Verification passed for signature tampering/expiry/duplicates, invalid namespaces and methods, local delivery, private upstream-header isolation, redirect rejection, full/ranged/HEAD responses, disconnect cancellation and provider URL-prefix compatibility. A real 17,853,554-byte synthetic S3 video was uploaded from the deployment server and fetched through the candidate handler in a temporary loopback HTTP test server: complete SHA-256, byte range and HEAD checks passed in 1,498 ms. The test checked the issued production HTTPS origin and a lifetime exceeding one hour, but did not install the route into production or call TikTok.

Before reopening real dispatch after a future authorized release, verify that the actual public HTTPS URL returns bytes without redirects through Caddy/nginx/Go, including Range/HEAD and unsigned denial. No end-to-end post was sent to TikTok in this task. Database-backed scheduling integration and a new full browser generation run were not performed; the affected unit packages and real storage-delivery fixture cover this URL change.

## Hetzner measurements

Tests used the existing Helsinki bucket/key and random synthetic prefixes, with normal application recovery settings. No production heads or media bytes were changed. Independent Studio fixtures ran in a one-off container using the deployed Studio image, with no live data volume or database attached. Some transfer checks overlapped the two-client Studio workload; these measurements were not taken on an otherwise idle bucket.

| Check | Result |
| --- | --- |
| Three 17.9 MB video uploads, one sequential plus two concurrent | 9,919 / 10,115 / 10,894 ms |
| Corresponding full signed downloads, each hash-checked | 1,636 / 751 / 1,407 ms |
| Video byte ranges and metadata | Passed |
| Ordinary media compatibility: migration, private reads and conditional create conflict | Passed |
| Recorded Go SDK attempts | 34; zero retries, transport errors or 5xx responses |
| Studio soak | Two concurrent synthetic projects, ten save/cold-open cycles each, 30-second pauses between cycles |
| Studio saves | 20; median 1,201 ms, p95 3,559 ms, maximum 7,173 ms |
| Studio cold opens | 20; median 1,195 ms, p95 2,272 ms, maximum 4,269 ms |
| Competing Studio saves | Correctly accepted one writer and rejected the stale writer for both projects |
| Studio network failures / unexpected 5xx or throttling | Zero |
| Synthetic cleanup | Confirmed empty for each owned fixture prefix |

The soak used the standard three-attempt/120-second recovery policy, not the longer offline migration policy. Its acceptance gate required no operation failures, unexpected network/5xx/throttling errors, and each create/save/cold-open/competing-save operation below 30 seconds. It passed. These bounded samples do not establish long-term availability or production-scale throughput. The 1,003-object pagination burst and unrelated browser/render tests were intentionally not repeated in this task; the runner labels the reduced selection explicitly.

Final preservation checks at **14:14 Europe/Bucharest** (12:14 UTC) compared every original key, size and ETag with the completed migration inventory: all 5,290 objects were unchanged, with zero missing or extra objects. The bucket ACL remained private and versioning remained never enabled. Production still reported release `b6e587aafaaa9580`, local storage, readiness 200 and unsigned media denial 403. The affected Go media/publishing packages, API/router checks, seven Node storage/helper checks and candidate production nginx syntax validation passed. A final focused delivery rerun also passed after the bounded download deadline was added.

The Windows-hosted smoke runner needed two portability fixes: accept an explicitly supplied synthetic video fixture when host FFmpeg is unavailable, and restore the Linux executable bit after streaming a Windows-built binary. Those initial harness failures made no S3 requests and are not provider failures. The final successful runs are retained separately.

The reusable server runner now includes `TestHetznerPublishingDelivery` in normal selections. `node scripts/test-hetzner-s3-server.mjs sc --delivery-only` runs only that fixture, with explicit bucket confirmation/credentials supplied as JSON on stdin using the existing runner format. Set `SNEEPCUT_HETZNER_VIDEO_FIXTURE` to a generated 8–32 MiB MP4 when host FFmpeg is unavailable. The test never calls TikTok or changes deployed application settings. Use synthetic media only.

## Decision and deployment boundary

The functional TikTok/S3 compatibility gate passes for this candidate. The current ordinary transfer and Studio soak samples also pass. However, Hetzner still reports [Helsinki write degradation](https://status.hetzner.com/incident/dc7b91f2-74e9-4931-82f7-ddc5e405534e) as **In progress**, last updated 25 November at 20:05 Europe/Bucharest. Its [bucket-settings 403 incident](https://status.hetzner.com/incident/9428fdb1-f1c7-4d80-ac6c-23513bbd40ab) also remains in progress; no settings changes were attempted or required here.

Do not describe the provider incident as resolved based on this sample. The recommendation is to hold live S3 activation until the Helsinki incident is resolved and repeat the ordinary checks at the maintenance window. An application release that retains local storage has a separate readiness/approval boundary. Keep the original deployment requirement to review the exact source commit, preserve recovery images/backups, freeze writers, capture the final data snapshot, import Studio into a fresh final prefix and reconcile changed media keys.

The YouTube allowlist was checked for the related storage boundary: production has no explicit `YOUTUBE_MEDIA_URL_PREFIX`. Its configuration defaults to `AWS_PUBLIC_BASE_URL` when supplied, so the planned native bucket base keeps YouTube's server-fetch allowlist aligned with its direct signed URLs. Do not add an override pointing to the old local-media origin during S3 activation.

Sanitized evidence is in `artifacts/deploy-readiness-20261126/`: `delivery-tests.log`, `go-tests.log`, `final-go-tests.log`, `final-delivery-tests.log`, `server/`, `delivery-server/`, `studio-summary.json`, `studio-soak.jsonl`, `production-check.json` and `bucket-preservation.json`. The executed synthetic soak source is retained alongside those results. Credential values and signed URLs are excluded from reports.
