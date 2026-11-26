# Production deployment and Hetzner migration plan

Status: planning only; **do not deploy, push, upload a release or activate S3 yet**. The previously authorized snapshot backfill is complete and recorded in [the migration report](hetzner-production-data-migration-2026-11-26.md). Its objects must be preserved. Development uses local S3; production still uses local filesystem storage.

Latest read-only production inspection: **26 November 2026, 17:07 Europe/Bucharest (15:07 UTC)**. Release remains `b6e587aafaaa9580`, API readiness and Studio health return 200, and all three storage services remain local without AWS credentials. The original morning inventory and later backfill describe earlier snapshots; their counts are not a new live inventory. Independent releases advanced production during those tasks; this task did not initiate them.

Source baseline: `tristan` contains remote main `e40fc1d1889b6bdb9e631ffbac92ad55cfa377d5` (verified against GitHub during this update), the earlier integration commit `5b9cb581f88cb8f4b6ea5adff0585fa18f112958`, and the verified runtime changes in `95079c7f372d848b0bfdcc9f6856997586068cea`. No rebase is needed against that main snapshot. This plan is committed afterward as documentation; before a future release, recheck main/production and pin the approved final branch tip. No push or release staging is authorized now.

## Recommendation

Use two separately approved operations:

1. Approve and stage the verified application candidate, then release it with **local storage still enabled**.
2. Rehearse the accepted production bucket and recovery, then switch the API, worker and Studio together during a maintenance window.

The user's accepted layout supersedes the earlier Nuremberg/new-key proposal: production will use the existing private `sneepcut-test` bucket in Helsinki with the same Hetzner key; dev uses local SeaweedFS. The snapshot data backfill is authorized before application deployment. PostgreSQL and Redis remain on the existing server; they are not migrated into S3.

Do not schedule the storage cutover while required provider operations are failing. Recheck Hetzner's incidents immediately before provisioning and activation.

## Observed production state

| Area | Observation |
| --- | --- |
| Access | Existing SSH alias `sc` works; application is under `/opt/sneepcut` |
| Platform | Initial inventory: Debian 13; Docker 29.8.0; Compose 5.5.1; 16 logical CPUs; about 62.8 GiB RAM. Latest free disk: 1,386,295,922,688 bytes (about 1,291 GiB) |
| Release | Latest observed release `b6e587aafaaa9580`; preserve actual per-component image identities before building |
| Services | API, Studio, frontend, landing, admin, PostgreSQL, Redis and ClamAV healthy; worker and gateways running; old migrate/job-dispatcher containers exited |
| Public checks | Latest API readiness and Studio health: 200. Earlier home/login/admin checks: 200; unauthenticated Studio listing: 401; unsigned media: 403. Repeat the full set at release |
| Media | Still `STORAGE_TYPE=local`; volume `sneepcut-production_media_data`. Initial inventory: 1,910 files / 12,437,782,027 bytes; use final frozen manifests for cutover |
| Studio | Still local; `/data/projects` and `/data/projects-compositions` in `sneepcut-production_studio_data`. Initial inventory: 3,131 files / 13,548,840,836 bytes |
| Database | Latest revision `20261125_feedback_images`. Initial inventory: about 16.9 MiB; 19 users, 52 clips, 36 clip-generation projects, 268 source assets and 48 versions |
| Activity | Latest selected active job/project counts: zero. Earlier agent/publishing checks were also quiet. Neither observation proves all writers are drained |
| Credentials | No AWS credentials configured in production API, worker or Studio. Existing core signing/encryption secrets are present; Stripe is in test mode and social publishing is enabled |

Media includes sources, uploads, music, working artifacts, clips, brand assets and publishing media. Copy the complete media tree; do not migrate only final MP4 files. The two raw trees in the initial inspection totaled 25,986,622,863 bytes (24.20 GiB); the later backfill snapshot has its own exact manifest. Studio excludes known caches, dependency folders and local Git data, while retaining saved generations and renders. Content manifests and duplicate blobs mean destination object counts and stored bytes differ from raw directory counts.

The Studio structure contains 47 editable projects plus 218 project-like entries across composition namespaces, including snapshots, baselines, receipts, import/workspace heads and deletion markers. No unexpected directory entries, symlinks or unfinished `.prepare-*` entries were found. The largest inspected project directory is about 495 MiB, below the current 2 GiB composition limit. Preserve deletion markers and receipts as well as visible projects.

Evidence is retained in `artifacts/production-plan-20261126/`: `inventory-final.json`, `details.json`, `compatibility.json` and `source-review.json`. These contain selected non-secret settings, aggregate counts and source hashes; no credentials or signed media links.

The latest read-only snapshot is `artifacts/youtube-link-20261126/production-plan-refresh.json`. SSH access through `sc` is available. No production setting, container, file, bucket object or release was changed by this plan refresh.

## Candidate source and release pin

The main integration is complete. The candidate includes production migration 061; the YouTube/S3 changes add no schema migration. Do not use an older recovery checkout's migrator against the production revision. Any new main or production release after the recorded snapshot requires a fresh source/schema comparison.

Keep the reviewed changes together on `tristan`:

- Carry the tested multi-clip planning, distinct sibling Studio identity, authored-edit classification, stable session renewal, cancelled-range streaming and thumbnail fixes, with their regression coverage.
- Include the standalone `migrate-media-s3` target/command, conditional imports and production-storage configuration tests. The final Compose check exposed missing S3 wiring; the runtime commit restores it with local defaults, private API/worker/Studio credentials and no AWS secrets in web environments or build arguments.
- Include Paste link beside the connected-channel library, best quality up to 2160p, the decimal 10 GB cap, restricted pinned downloader, multipart storage, large-source Studio windows and both rendering timing fixes. See [runtime details](youtube-link-downloads.md).
- Main's model-download retries, newer agent routes and migration history are already integrated; do not reapply old whole-file copies.
- Review deployed-source differences from main, especially Studio session/theme behavior, frontend Studio handoff and workspace-agent behavior. Some byte differences are formatting only; the hash report is a review list, not a list of semantic hotfixes.
- Preserve the current Caddy routes and its private `/config` import. Caddy serves another application as well; retain its persistent configuration/certificates and verify those routes after any gateway recreation.

Test the resulting exact commit, not just yesterday's source. Run the affected Go packages, Studio server regressions/type checking, production Compose storage tests and the full isolated browser flow against the new bucket configuration. UI mutations must use a synthetic account and an isolated `sneepcut_integration_test` database with separate Redis. Disable real publishing, billing and mail side effects in that fixture. Test the latest frontend/Studio handoff and restored-project compatibility too.

After separate release authorization, publish the approved branch and record its full 40-character SHA and source manifest. The documentation-only successor must have the same runtime tree as the verified runtime commit; otherwise rerun affected checks. Stage on the server with `DEPLOY_BRANCH=tristan DEPLOY_EXPECTED_COMMIT=<approved-40-character-sha> bash scripts/deploy-github.sh build all`. The script clones that branch and refuses a different tip. This command stages source and replaces image tags even though it does not activate containers; do not run it now. Pin recovery images **before** any build. Avoid `scripts/deploy.sh` for this release because it packages working-tree source, including uncommitted files.

## Hetzner setup and current provider conditions

The following official reports were still **In progress** when rechecked for this update on 26 November:

- [Helsinki bucket creation unavailable](https://status.hetzner.com/incident/b009f3fc-8508-48b3-877f-dcaada10e7bc): use another location or wait; existing Helsinki buckets remain available.
- [Helsinki storage latency](https://status.hetzner.com/incident/dc7b91f2-74e9-4931-82f7-ddc5e405534e): writes can be slow, fail or time out; last update 25 November, 18:05 UTC (20:05 Bucharest). This is consistent with earlier slow writes, without proving the cause of every slow request.
- [Bucket-settings 403 incident across NBG, FSN and HEL](https://status.hetzner.com/incident/9428fdb1-f1c7-4d80-ac6c-23513bbd40ab): policy, CORS, lifecycle and versioning updates may fail; last update 25 November, 16:21 UTC (18:21 Bucharest). Hetzner says object reads/writes/deletes are unaffected by this settings incident. The earlier CORS failure is not evidence that the key needs an extra console permission.

The user selected the existing Helsinki bucket rather than provisioning in NBG. Its actual conditional-write/readback probe passed, but the provider's latency incident remains relevant. Copying an offline snapshot does not require exposing live writes to the provider; validate stability again before a live cutover.

**New compatibility gate:** saves above 128 MiB now use conditional multipart completion. A 128 MiB + 123 byte object passed upload, complete-byte/hash/range checks, no-overwrite and cleanup against local S3. The earlier Hetzner transfer/soak used approximately 17.9 MB objects and does not qualify this path. Hetzner's supported-actions page does not explicitly guarantee conditional `CompleteMultipartUpload`. Before activation, rehearse the exact candidate against an owned synthetic prefix in this bucket: >128 MiB multipart upload, full hash/readback/ranges, conflicting completion without overwrite, abort/cleanup and ambiguous-completion recovery. If this operation is unsupported, resolve the adapter compatibility before cutover; do not silently remove the no-overwrite condition. No new cloud writes were made during this plan refresh.

Use the existing production target as follows:

| Setting | Proposed value |
| --- | --- |
| Location | `hel1` |
| Visibility | Private |
| Versioning/Object Lock | Never enable on the active bucket |
| Media keys | Preserve existing relative keys at the bucket root |
| Studio prefix | Preserve snapshot `studio/v1`; final live prefix must be a fresh `studio/cutover-<final-snapshot-id>` |
| Application credentials | Existing supplied Hetzner key; dev uses local S3; no credentials embedded in web builds |
| Backups | Independent encrypted, restorable copies with separate access; not just another prefix writable by the application |

Hetzner does not support conditional PUT/DELETE on versioned buckets; Studio requires conditional writes. A bucket with versioning suspended is insufficient for the current importer. Use only a bucket confirmed never to have enabled versioning; this check passed for the accepted existing bucket. See [supported actions](https://docs.hetzner.com/storage/object-storage/supported-actions/).

Hetzner keys normally reach every bucket in their project. The user chose to reuse the supplied key and existing bucket, with development separated onto local S3; no additional Hetzner credential is needed for this migration. A future move to another project would require credentials or a policy for that project. See [key scope](https://docs.hetzner.com/storage/object-storage/faq/s3-credentials/).

Keep native Hetzner HTTPS URLs. No custom domain or custom certificate is required. Ordinary video downloads/playback use signed bucket URLs; Studio media and fonts use authenticated same-origin routes. Uploads, Google exports, narration and music retain scanning; only the server-controlled direct YouTube download path skips antivirus, as requested. Keep `UPLOAD_SCANNER_ENABLED=true` in production and the bucket private. The 10 GB direct-download cap does not raise the ordinary upload limit or Studio's 2 GiB per-composition limit.

Do not add a general media proxy solely to work around CORS. The verified current paths do not need bucket CORS. If a specific browser fetch/canvas path is introduced, configure only its real origins and required methods/headers and test it. A CORS change is neither authentication nor a certificate change.

## TikTok compatibility gate

Production currently has `TIKTOK_VERIFIED_URL_PREFIX=https://sneepcut.com/media/`. Moving its media to S3 without the candidate URL resolver would send a native bucket URL that fails that prefix check.

Resolved in commit `5b9cb581f88cb8f4b6ea5adff0585fa18f112958`, retained by this candidate: TikTok receives a four-hour signed URL under `/media/publish/`, while Go streams from local storage or private S3. Scheduling validation, enqueueing and dispatch all use this provider-aware resolver. Candidate nginx routes that narrower prefix to Go without buffering; normal previews and other providers keep direct signed storage URLs. Keep `TIKTOK_VERIFIED_URL_PREFIX=https://sneepcut.com/media/`; no bucket-domain verification or new certificate is needed. TikTok requires an owned HTTPS domain/prefix without redirects and access throughout the download, up to one hour. See the [media transfer guide](https://developers.tiktok.com/docs/en/content-posting-api-media-transfer-guide).

The signed handler, range/HEAD support, privacy, redirect denial, cancellation and prefix compatibility passed regression checks. Real S3 video delivery through the candidate handler also passed from the deployment server in an isolated loopback fixture. The live public route was not changed and no TikTok post was sent. Include the Go URL resolver/handler and nginx route together in the candidate application release, initially retaining local storage. After an authorized release, verify the actual public HTTPS route before reopening real dispatch. See [TikTok and Hetzner readiness evidence](tiktok-hetzner-readiness-2026-11-26.md).

## Target configuration

The following is a template for the private **future** live production environment, not a file to apply now. It matches the accepted existing bucket and migration profile. Preserve all unrelated production values, current database identifiers, signing/encryption keys, Stripe test mode and social credentials.

```dotenv
STORAGE_TYPE=s3
LOCAL_MEDIA_ROOT=/app/media
AWS_REGION=hel1
AWS_ENDPOINT_URL=https://hel1.your-objectstorage.com
AWS_S3_BUCKET=sneepcut-test
AWS_S3_FORCE_PATH_STYLE=false
AWS_PUBLIC_BASE_URL=https://sneepcut-test.hel1.your-objectstorage.com
AWS_ACCESS_KEY_ID=<existing-supplied-key>
AWS_SECRET_ACCESS_KEY=<existing-supplied-secret>
AWS_SESSION_TOKEN=
SNEEPCUT_STUDIO_STORAGE=s3
SNEEPCUT_STUDIO_S3_ENDPOINT=https://hel1.your-objectstorage.com
SNEEPCUT_STUDIO_S3_PREFIX=studio/cutover-FINAL_SNAPSHOT_ID
SNEEPCUT_MEDIA_S3_ORIGIN=https://sneepcut-test.hel1.your-objectstorage.com
SNEEPCUT_MEDIA_S3_INTERNAL_ORIGIN=
```

`AWS_PUBLIC_BASE_URL` identifies the reference origin; it does not make the bucket public. Go uses virtual-hosted signed media URLs. Studio's Bun client uses the regional endpoint with path-style addressing. Both must use the same production bucket. Do not carry `seaweedfs`, `s3.localhost` or development URL overrides into production.

Replace `FINAL_SNAPSHOT_ID` with the recorded final frozen snapshot identifier. `studio/v1` belongs to the completed backfill. Since live writers resumed after that snapshot, import the full final Studio tree into the fresh prefix and use exactly that prefix for the importer and live Studio. The importer refuses different remote heads; rerunning against `studio/v1` is not a delta-update procedure. Retain the backfill prefix until separately reviewed cleanup. Budget a full final Studio import and readback.

The candidate Compose wiring passes these values with local defaults. Both configuration tests pass, including the fresh Studio prefix, temporary session credentials and absence of AWS credentials from web environments/build arguments. The deployed Compose file is still the older version. Merely editing the production `.env` is insufficient: release the candidate first and verify effective configuration privately before activation. `scripts/production-compose.sh` uses `PRODUCTION_ENV_FILE` for both interpolation and container env files; use the intended private production file, not a dev profile. Never paste complete resolved configuration containing secrets into reports.

## Operation 1: application release, storage remains local

1. Coordinate with other release work. Recheck release ID, image IDs, migration revision, health and source differences. Hold the deployment lock only during the future authorized release operation.
2. Pin every running application image with recovery tags before staging builds; retain the tag manifest, source manifests, Compose configuration and private production environment outside rotating release directories. A release ID alone does not identify every running component. Confirm the actual image-cleanup policy too: a tag alone does not protect an unused image from `docker image prune -a`. Preserve a container reference or separately restorable image artifact for the required image set throughout the operation. During the data backfill, an independently removed image required an explicit source-compatible replacement; avoid that race at cutover.
3. Back up the database and file volumes, preserve ownership and verify an isolated restore. Existing recent database dumps were found. The latest inspected full media/Studio backup is from 25 November; its `restore-preflight.log` is empty, so this inspection does not establish a successful restore. Refresh the full backup for the final operation and verify it rather than relying on filenames.
4. Stage the exact reviewed Git commit with local storage explicitly retained. Validate Compose and Caddy, including the private `/config` import. Confirm the new migrator recognizes the production revision. No S3-specific schema migration is planned; any new application migrations need their own compatibility review.
5. After authorization, activate that candidate, run read-only production readiness/auth/TLS checks and verify its isolated end-to-end fixture. Preserve the raw local volumes and the previous coherent release/images. Check worker limits explicitly: the currently running worker has no Docker memory/CPU/PID limit, despite limit-like environment names in the example.

The worker now needs its disk-backed `processing_tmp:/app/processing-tmp` volume, writable only as UID/GID 10001, outside served media and memory-backed `/tmp`. The image creates the mount point with mode 0700. Confirm at least **40 GB available per concurrent maximum-size job**; keep concurrency at the reviewed setting and inspect inactive crash leftovers before cleanup. Verify the shipped checksum-pinned yt-dlp 2026.11.23, Node 24, FFmpeg and outbound YouTube/media access through the restricted downloader. Existing auth-required/age-restricted/live sources remain unsupported. Test an authorized public video and the real funded AI provider in the isolated fixture, then playback, save/reopen and render in Studio. Preserve ordinary upload scanning. Do not raise Studio's project limit merely to accommodate the retained 4K original: the candidate supplies short full-resolution source windows.

Do not move on merely because containers are healthy. The candidate must pass the browser flow, source compatibility and provider gates first.

## Operation 2: storage rehearsal and final cutover

### Rehearsal before the maintenance window

1. Verify the selected existing private bucket and independent backup destination. Credential, privacy, never-enabled versioning and conditional create/update checks passed for the backfill; refresh them, pagination and the new conditional multipart gate before cutover. Wait for the Helsinki write incident to resolve and repeat application/Studio latency checks using normal live retry budgets. Offline import retries do not qualify live availability. If required operations fail, stop here.
2. Use a consistent restored copy of database/media/Studio data, isolated from live writers and external publishing. Rehearse complete imports with the candidate images. Keep rehearsal Studio heads and conditional-write probes in a separate prefix/bucket. The authorized backfill has already populated `studio/v1`; use a fresh final prefix rather than attempting to overwrite those older heads.
3. Verify all imported media bytes and Studio manifests/content. Check existing clips, source assets, thumbnails, brand assets, caption fonts, publishing media, receipts, deletion markers and an older editable project. Run synthetic generation, playback, thumbnails, editor save/conflict/reopen and cold-cache recovery against the selected region.
4. Carry and test the implemented TikTok owned-origin delivery handler and nginx route without publishing. After the authorized application release, verify the actual public HTTPS path before real dispatch. Confirm other providers can fetch the newly signed HTTPS URLs and that URL lifetimes cover the workflow.
5. Measure transfer and metadata latency, error/retry counts and recovery time. Agree on acceptable measurements before production. Recommended smoke gate: no unexplained timeouts/failed saves during repeated save/reopen and generation checks; investigate multi-second metadata tails rather than treating retries alone as success.

Do not promise a fixed downtime from the raw byte count. Upload plus full readback of both raw trees is roughly 48.4 GiB before exclusions/deduplication, with thousands of metadata requests. The media importer is serial and has a three-hour outer deadline. A slow provider can exceed it even with sufficient bandwidth. Set the window from the full rehearsal, with contingency; defer rather than stretching the freeze indefinitely.

### Final maintenance window

1. Hold the deployment coordination lock for the full maintenance operation so another release cannot replace the frozen services or prune their images. Close public write admission to API, Studio and media uploads; preserve the current proxy configuration. Drain active generation, edits, agent runs, imports and publishing. Pause dispatch and cleanup writers. Recheck counters; an empty Redis list alone does not prove quiescence.
2. Stop backend, worker and Studio writers. Keep PostgreSQL/Redis and their volumes. Prevent external webhooks from being acknowledged and lost during the window; retain an appropriate retryable maintenance response. Capture the final database dump, media/Studio manifests, full file backups, environment and component image manifest. Verify the final backup/restore checks before changing storage.
3. Compare final media hashes to the backfill manifest before importing. New keys can be conditionally created; unchanged keys must pass full readback. If a key's local bytes changed after the backfill, the current importer stops rather than replacing it. Review those exact conflicts and prepare a tested, conditional replacement procedure that preserves the previous bytes before proceeding; do not clear the bucket or silently overwrite. Build/use the candidate's standalone media importer. Mount `sneepcut-production_media_data` read-only, preserve every key and verify full destination bytes. Required confirmations are explicit; examples below are for future authorized execution only.

```sh
docker build --target storage-migrate -t sneepcut-media-migration:<candidate> ./backend
docker run --rm --env-file /secure/path/production-s3.env \
  -e LOCAL_MEDIA_ROOT=/app/media \
  -e SNEEPCUT_S3_MIGRATION_WRITERS_STOPPED=true \
  -e SNEEPCUT_S3_MIGRATION_CONFIRM_BUCKET=sneepcut-test \
  -v sneepcut-production_media_data:/app/media:ro \
  sneepcut-media-migration:<candidate>
```

The importer checks privacy/versioning, never overwrites conflicting keys and accepts existing objects only after full-byte verification. It retains originals. Preserve its verified counts and hashes; do not run a destructive sync or delete orphan-looking files during this migration.

4. Import the entire final Studio snapshot into its fresh cutover prefix with the candidate image and `SNEEPCUT_STUDIO_DATA=/data/projects` (substitute the actual recorded final snapshot identifier):

```sh
docker run --rm --env-file /secure/path/production-s3.env \
  -e SNEEPCUT_STUDIO_DATA=/data/projects \
  -e SNEEPCUT_STUDIO_STORAGE=s3 \
  -e SNEEPCUT_STUDIO_S3_PREFIX=studio/cutover-FINAL_SNAPSHOT_ID \
  -v sneepcut-production_studio_data:/data \
  sneepcut-production-studio:<candidate> \
  bun packages/sneepcut-server/src/migrate-state.ts
```

The Studio importer creates writable cache siblings under `/data`, so mounting that entire volume read-only would fail. Prefer a verified final staging copy of the Studio volume if strict source immutability is required; otherwise retain the final backup and use the original volume as above. The importer copies into cache, verifies remote readback and retains original project directories. Ensure UID 1000 can create cache directories. Import every namespace, including tombstones. If a remote head conflicts, stop and investigate; do not overwrite or force-delete it.

5. Activate the reviewed S3 values in the private environment and recreate backend, Studio and worker together in dependency order. Keep local media and Studio volumes mounted for working caches, older signed links and reviewed recovery. No blanket SQL path rewrite is expected: all 52 clips have storage keys, and the resolver recognizes the observed legacy `/app/media/` references while `LOCAL_MEDIA_ROOT` is retained. Verify the older job/source references against the final manifest before reopening.
6. With public write admission still closed, check readiness, TLS, unsigned denial, signed download SHA/ranges, Studio authorized restoration and the isolated synthetic full-flow fixture. A separate cold-cache test must use its own writable cache; do not delete the original Studio volume to test recovery.
7. Reopen writes and dispatch only after verification and the TikTok gate pass. Record the first new S3 writes, then monitor generation, save/conflict behavior, cold recovery, provider fetch failures and latency. Retain originals, recovery tags and restorable backups until a separate retention decision.

## Recovery boundaries

| Point of failure | Recovery |
| --- | --- |
| Before activation | Keep local storage active. Original volumes and database remain the source of truth; review partial imports without deletion |
| S3 active, public writes still blocked | Return all three services to the known local-storage candidate and saved environment. Originals remain current. Check for internal background writes before claiming this boundary is safe |
| New production S3 writes accepted | Freeze writers again. Prefer fixing forward or restoring service against S3. A return to local requires a separately verified reverse migration of all new media, Studio revisions/tombstones and database references; the old local snapshot is stale |
| Application rollback | Use the recorded component image set/coherent source release only after schema compatibility is checked. `make rollback` rebuilds and migrates with the current environment; it is not an automatic S3 or database rollback |

Never restore an older database over later user writes, switch only one storage-using service back to local, enable versioning on the active bucket, delete original volumes or run Docker volume pruning as recovery.

Independent scheduled backups and a tested restore are required beyond this cutover. No Sneep Cut backup timer/root-cron entry was identified in this inspection; unrelated backup timers are not evidence of coverage. Verify the off-server destination and retention explicitly. PostgreSQL, media, Studio metadata and production encryption secrets must be recoverable together.

## What is complete and what remains

| Completed verification | Result and scope |
| --- | --- |
| Main integration | `tristan` contains main `e40fc1d1889b6bdb9e631ffbac92ad55cfa377d5`; runtime commit recorded above |
| Go/API/worker | Complete local image build, `go test -race ./...`, `go vet ./...`; both native rendering regressions pass |
| Frontend | 427 tests pass without skips; typecheck and affected lint pass; React Doctor 100/100 across nine changed files |
| Browser | English desktop/light and Romanian mobile/dark validation, failure/retry, retained input/settings and job navigation; dashboard header/sidebar identity preserved. Component Fast Refresh is checked without restarting the frontend |
| Isolated database | Authenticated link creation, queue binding, retries, credits/refunds and ownership fencing in `sneepcut_integration_test` |
| Real YouTube downloader | Restricted application downloader fetched a 743,401,676-byte, 3840×2160, 91.81-second public fixture; temporary download discarded |
| Local S3 and Studio | Multipart object above 128 MiB fully read/hash/range checked, conditional conflict and cleanup pass; private S3 source import, thumbnail and MP4 Studio render pass in disposable fixtures |
| Existing funded AI flow | Earlier real upload/clip generation/Studio verification is retained under `artifacts/fullflow-20261125/`; the latest downloader fixture is not a claim of a fresh real-AI 4K end-to-end production test |
| Production configuration | Two synthetic Compose tests pass for local defaults and explicit S3 settings; no service was activated |
| Hetzner backfill | Consistent 12:07 snapshot: 1,923 media keys, 267 Studio entries; 5,290 objects / 25,786,328,730 bytes; cold recovery passed. All original objects unchanged at the later 14:14 preservation check |
| TikTok / ordinary Hetzner | Owned-origin handler, real private S3 delivery, 20-save/20-cold-open two-client Studio soak pass with normal retries. Public deployed route and new multipart path remain separate gates |
| Production refresh | Read-only 17:07 check: release `b6e587aafaaa9580`, local storage, API/Studio healthy; no mutation |

Local runtime evidence is under `artifacts/youtube-link-20261126/`; earlier storage/provider evidence is linked in [the readiness assessment](tiktok-hetzner-readiness-2026-11-26.md) and [backfill report](hetzner-production-data-migration-2026-11-26.md). These artifacts and all private environments stay out of Git. Local builds and tests do not constitute production staging or approval.

Before application release: authorize the exact final SHA, recheck production/main, preserve recovery images and verified backups, and rehearse the isolated full flow with candidate images and actual runtime configuration. Keep local storage active for that release. Verify the public TikTok route after activation before reopening dispatch.

Before S3 activation: wait for provider recovery, pass the new conditional multipart and normal-budget latency checks in Helsinki, verify independent backup access/restore, reconcile changed media keys, and rehearse the complete final Studio import into a fresh prefix. Agree a measured maintenance window, freeze all writers and capture the final consistent delta. The backfill is a retained snapshot, not a live mirror. No bucket cleaning is authorized or needed.

Application release and live storage cutover both require separate execution authorization. No deploy command, release upload/build, Git push, production configuration change or bucket mutation was performed during this update.
