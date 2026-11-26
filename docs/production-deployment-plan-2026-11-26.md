# Production deployment and Hetzner migration plan

Status: the original inspection and planning were read-only. The user subsequently authorized an existing-bucket data backfill and moving dev to local S3. That backfill is recorded in [the migration report](hetzner-production-data-migration-2026-11-26.md). Application deployment and the live production storage switch remain on hold.

Inspected on 26 November 2026, approximately 09:15–09:25 Europe/Bucharest (07:15–07:25 UTC). Recheck this snapshot before execution. An independent release was active during inspection: the release ID changed from `ff6bef251021fc77` to `2dd9793aaf62f67a`. The final inventory records the latter. This task did not initiate that release.

Local integration follow-up: branch `tristan` has since been fast-forwarded to main at `b5388844e05d88d9278dd8f0a061bf03d87427c0`, with the existing tracked and untracked work restored and integration conflicts resolved. Focused Go, Studio, storage and type checks passed. The local changes remain uncommitted, and the recovery stash is retained. Nothing was uploaded, pushed, staged as a release or deployed. The full candidate rehearsal and production gates below still apply.

## Recommendation

Use two separately approved operations:

1. Integrate the verified development fixes with the current application source, test that exact commit, and release it with **local storage still enabled**.
2. Rehearse the accepted production bucket and recovery, then switch the API, worker and Studio together during a maintenance window.

The user's accepted layout supersedes the earlier Nuremberg/new-key proposal: production will use the existing private `sneepcut-test` bucket in Helsinki with the same Hetzner key; dev uses local SeaweedFS. The snapshot data backfill is authorized before application deployment. PostgreSQL and Redis remain on the existing server; they are not migrated into S3.

Do not schedule the storage cutover while required provider operations are failing. Recheck Hetzner's incidents immediately before provisioning and activation.

## Observed production state

| Area | Observation |
| --- | --- |
| Access | Existing SSH alias `sc` works; application is under `/opt/sneepcut` |
| Platform | Debian 13; Docker 29.8.0; Compose 5.5.1; 16 logical CPUs; about 62.8 GiB RAM; about 1,336 GiB free disk |
| Release | Final observed release `2dd9793aaf62f67a`; components were built at different times |
| Services | API, Studio, frontend, landing, admin, PostgreSQL, Redis and ClamAV healthy; worker and gateways running; old migrate/job-dispatcher containers exited |
| Public checks | Home, login, admin, API health/readiness and Studio health returned 200; unauthenticated Studio listing returned 401; unsigned media returned 403 |
| Media | `STORAGE_TYPE=local`; volume `sneepcut-production_media_data`; 1,910 files, 12,437,782,027 bytes (11.58 GiB) |
| Studio | Local storage; `/data/projects` and `/data/projects-compositions` in `sneepcut-production_studio_data`; 3,131 files, 13,548,840,836 bytes (12.62 GiB) |
| Database | About 16.9 MiB; revision `20261125_feedback_images`; 19 users, 52 clips, 36 clip-generation projects, 268 source assets and 48 versions |
| Activity | No queued/running job or workspace-agent status observed; no pending scheduled-post status observed. These are snapshot observations, not a maintenance guarantee |
| Credentials | No AWS credentials configured in production API, worker or Studio. Existing core signing/encryption secrets are present; Stripe is in test mode and social publishing is enabled |

Media includes sources, uploads, music, working artifacts, clips, brand assets and publishing media. Copy the complete media tree; do not migrate only final MP4 files. The two raw trees in the initial inspection totaled 25,986,622,863 bytes (24.20 GiB); the later backfill snapshot has its own exact manifest. Studio excludes known caches, dependency folders and local Git data, while retaining saved generations and renders. Content manifests and duplicate blobs mean destination object counts and stored bytes differ from raw directory counts.

The Studio structure contains 47 editable projects plus 218 project-like entries across composition namespaces, including snapshots, baselines, receipts, import/workspace heads and deletion markers. No unexpected directory entries, symlinks or unfinished `.prepare-*` entries were found. The largest inspected project directory is about 495 MiB, below the current 2 GiB composition limit. Preserve deletion markers and receipts as well as visible projects.

Evidence is retained in `artifacts/production-plan-20261126/`: `inventory-final.json`, `details.json`, `compatibility.json` and `source-review.json`. These contain selected non-secret settings, aggregate counts and source hashes; no credentials or signed media links.

## Source integration is a prerequisite

At initial inspection, the working checkout was based on `45e423a49e9e1d273befa194cbe353f53afa0910` and migration 059. The inspected remote main was `b5388844e05d88d9278dd8f0a061bf03d87427c0`, 22 commits ahead, with 761 changed paths. Production already had migration 061. The local integration now includes migration 061; do not use an old recovery checkout's migrator against a newer database revision.

Prepare a `codex/` release branch from the latest agreed main after other release activity has settled. Preserve this working tree and integrate only the reviewed changes. In particular:

- Carry the tested multi-clip planning, distinct sibling Studio identity, authored-edit classification, stable session renewal, cancelled-range streaming and thumbnail fixes, with their regression coverage.
- Carry production S3 environment wiring, the standalone `migrate-media-s3` build target/command and production-storage configuration tests. They are currently local changes, not part of the inspected main.
- Merge `backend/Dockerfile` with main's model-download retry changes and merge `app.ts` with the newer agent API routes. Avoid replacing these files wholesale from the older checkout.
- Review deployed-source differences from main, especially Studio session/theme behavior, frontend Studio handoff and workspace-agent behavior. Some byte differences are formatting only; the hash report is a review list, not a list of semantic hotfixes.
- Preserve the current Caddy routes and its private `/config` import. Caddy serves another application as well; retain its persistent configuration/certificates and verify those routes after any gateway recreation.

Test the resulting exact commit, not just yesterday's source. Run the affected Go packages, Studio server regressions/type checking, production Compose storage tests and the full isolated browser flow against the new bucket configuration. UI mutations must use a synthetic account and an isolated `sneepcut_integration_test` database with separate Redis. Disable real publishing, billing and mail side effects in that fixture. Test the latest frontend/Studio handoff and restored-project compatibility too.

Commit and push the candidate only after review. Record its full 40-character SHA and source manifest. Stage through `deploy-github.sh build all` with `DEPLOY_EXPECTED_COMMIT` pinned to that SHA. Do not use `scripts/deploy.sh` from this stale, dirty checkout: it packages working-tree source, including uncommitted files. A build does not activate containers, but does replace reusable image tags, so pin recovery images **before** building.

## Hetzner setup and current provider conditions

The following official reports were still active when inspected:

- [Helsinki bucket creation unavailable](https://status.hetzner.com/incident/b009f3fc-8508-48b3-877f-dcaada10e7bc): use another location or wait; existing Helsinki buckets remain available.
- [Helsinki storage latency](https://status.hetzner.com/incident/dc7b91f2-74e9-4931-82f7-ddc5e405534e): writes can be slow, fail or time out. This is consistent with the slow development recovery/write observations, although it does not establish the cause of every slow request.
- [Bucket-settings 403 incident across NBG, FSN and HEL](https://status.hetzner.com/incident/9428fdb1-f1c7-4d80-ac6c-23513bbd40ab): policy, CORS, lifecycle and versioning updates may fail. Hetzner says object reads/writes/deletes are unaffected. The earlier CORS failure is therefore not evidence that the supplied key needs an extra console permission.

The user selected the existing Helsinki bucket rather than provisioning in NBG. Its actual conditional-write/readback probe passed, but the provider's latency incident remains relevant. Copying an offline snapshot does not require exposing live writes to the provider; validate stability again before a live cutover.

Use the existing production target as follows:

| Setting | Proposed value |
| --- | --- |
| Location | `hel1` |
| Visibility | Private |
| Versioning/Object Lock | Never enable on the active bucket |
| Media keys | Preserve existing relative keys at the bucket root |
| Studio prefix | `studio/v1` |
| Application credentials | Existing supplied Hetzner key; dev uses local S3; no credentials embedded in web builds |
| Backups | Independent encrypted, restorable copies with separate access; not just another prefix writable by the application |

Hetzner does not support conditional PUT/DELETE on versioned buckets; Studio requires conditional writes. A bucket with versioning suspended is insufficient for the current importer. Use only a bucket confirmed never to have enabled versioning; this check passed for the accepted existing bucket. See [supported actions](https://docs.hetzner.com/storage/object-storage/supported-actions/).

Hetzner keys normally reach every bucket in their project. The user chose to reuse the supplied key and existing bucket, with development separated onto local S3; no additional Hetzner credential is needed for this migration. A future move to another project would require credentials or a policy for that project. See [key scope](https://docs.hetzner.com/storage/object-storage/faq/s3-credentials/).

Keep native Hetzner HTTPS URLs. No custom domain or custom certificate is required for that design. Ordinary video downloads/playback use signed bucket URLs; Studio media and fonts use authenticated same-origin application routes. Upload ingestion continues through the existing application/scanning path. Do not bypass ClamAV or make the bucket public.

Do not add a general media proxy solely to work around CORS. The verified current paths do not need bucket CORS. If a specific browser fetch/canvas path is introduced, configure only its real origins and required methods/headers and test it. A CORS change is neither authentication nor a certificate change.

## TikTok compatibility gate

Production currently has `TIKTOK_VERIFIED_URL_PREFIX=https://sneepcut.com/media/`. Go's S3 adapter returns signed bucket URLs. The current TikTok validator rejects those URLs because they do not match that prefix; simply moving the files would regress TikTok publishing.

Resolved in the local candidate: TikTok now receives a four-hour signed URL under the existing application prefix, `/media/publish/`, while the Go handler streams from local storage or private S3. Scheduling validation, enqueueing and dispatch all use this provider-aware resolver. Candidate nginx configuration routes that narrower prefix to Go without buffering; normal previews and other providers keep direct signed storage URLs. Keep `TIKTOK_VERIFIED_URL_PREFIX=https://sneepcut.com/media/`; do not switch it to the native bucket URL. No new bucket-domain verification or certificate is needed for this path. TikTok requires an owned domain/prefix, HTTPS without redirects and access throughout the download, up to one hour. See the [media transfer guide](https://developers.tiktok.com/docs/en/content-posting-api-media-transfer-guide).

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
SNEEPCUT_STUDIO_S3_PREFIX=studio/v1
SNEEPCUT_MEDIA_S3_ORIGIN=https://sneepcut-test.hel1.your-objectstorage.com
SNEEPCUT_MEDIA_S3_INTERNAL_ORIGIN=
```

`AWS_PUBLIC_BASE_URL` identifies the reference origin; it does not make the bucket public. Go uses virtual-hosted signed media URLs. Studio's Bun client uses the regional endpoint with path-style addressing. Both must use the same production bucket. Do not carry `seaweedfs`, `s3.localhost` or development URL overrides into production.

The template's `studio/v1` is the point-in-time backfill prefix. Because live local writers resumed after that snapshot, the final frozen Studio tree must be imported into a fresh, recorded prefix such as `studio/cutover-<final-snapshot-id>`. Set `SNEEPCUT_STUDIO_S3_PREFIX` to that exact prefix for both the final importer and the live services. The existing importer deliberately refuses different remote heads; rerunning it against `studio/v1` is not a delta-update procedure. Retain the backfill prefix until separately reviewed cleanup. This requires a full final Studio import and readback; budget the window accordingly.

The current production Compose file does not pass all these values to Studio/API/worker; the reviewed S3 wiring must be included in the candidate before the variables are activated. The local configuration test passed for both local defaults and explicit S3 values, including absence of AWS credentials from frontend, landing and admin environments.

## Operation 1: application release, storage remains local

1. Coordinate with other release work. Recheck release ID, image IDs, migration revision, health and source differences. Hold the deployment lock only during the future authorized release operation.
2. Pin every running application image with recovery tags before staging builds; retain the tag manifest, source manifests, Compose configuration and private production environment outside rotating release directories. A release ID alone does not identify every running component. Confirm the actual image-cleanup policy too: a tag alone does not protect an unused image from `docker image prune -a`. Preserve a container reference or separately restorable image artifact for the required image set throughout the operation. During the data backfill, an independently removed image required an explicit source-compatible replacement; avoid that race at cutover.
3. Back up the database and file volumes, preserve ownership and verify an isolated restore. Existing recent database dumps were found. The latest inspected full media/Studio backup is from 25 November; its `restore-preflight.log` is empty, so this inspection does not establish a successful restore. Refresh the full backup for the final operation and verify it rather than relying on filenames.
4. Stage the exact reviewed Git commit with local storage explicitly retained. Validate Compose and Caddy, including the private `/config` import. Confirm the new migrator recognizes the production revision. No S3-specific schema migration is planned; any new application migrations need their own compatibility review.
5. After authorization, activate that candidate, run read-only production readiness/auth/TLS checks and verify its isolated end-to-end fixture. Preserve the raw local volumes and the previous coherent release/images. Check worker limits explicitly: the currently running worker has no Docker memory/CPU/PID limit, despite limit-like environment names in the example.

Do not move on merely because containers are healthy. The candidate must pass the browser flow, source compatibility and provider gates first.

## Operation 2: storage rehearsal and final cutover

### Rehearsal before the maintenance window

1. Verify the selected existing private bucket and independent backup destination. Credential, privacy, never-enabled versioning and conditional create/update checks passed for the backfill; refresh them and verify pagination again before cutover. If required operations are failing because of the provider incident, stop here.
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

Completed before backfill: production inspection, aggregate/reference and source compatibility review, official provider/TikTok documentation checks, local production-storage Compose tests (2 passed), source integration with main, and this plan. The subsequently authorized data backfill is tracked separately in the migration report. No application release build or activation was performed by this task.

Before live execution: agree the candidate/source baseline and maintenance window; use the accepted existing bucket/key; establish independent backups; resolve/verify provider conditions; include the tested TikTok owned-origin handler and verify its actual public route after release; rehearse the exact candidate and perform a consistent final delta after the snapshot backfill. Separate authorization is required to execute the application release and live storage cutover.

Backfill follow-up at approximately 13:25 Europe/Bucharest: the accepted existing bucket now holds the verified 12:07 snapshot, with 1,923 media keys, 267 Studio state entries and successful empty-cache recovery. The total is 5,290 objects / 25,786,328,730 bytes. Production readiness and Studio health returned 200 and live storage remains local. The current observed release is `b6e587aafaaa9580`, advanced by independent release activity; recheck that baseline before preparing a candidate. Full evidence and cleanup details are in the migration report. Temporary storage errors required longer retries in two offline Studio partitions, so this successful backfill is not proof that live save latency is acceptable. The final Studio prefix must be fresh, and changed media keys must be reconciled before cutover.

Readiness follow-up after 14:14 Europe/Bucharest: TikTok compatibility is implemented in the local candidate and verified with real S3 video delivery through an isolated handler fixture. The ordinary server transfer checks and a two-client, 20-save/20-cold-open Studio soak passed using normal recovery settings, without transport failures or SDK retries. All 5,290 original objects were confirmed unchanged after cleanup. Production still uses local storage. The official Helsinki degradation remains active, so the recommendation is to hold S3 activation until it is resolved and rerun checks at the maintenance window. See [the detailed readiness assessment](tiktok-hetzner-readiness-2026-11-26.md); this is not a claim of long-term provider stability or an authorization to deploy.
