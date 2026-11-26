# Production data backfill to Hetzner

Status: the authorized offline snapshot backfill is complete and verified. Production still uses local storage; application deployment and live S3 activation remain on hold.

Planning refresh, 26 November at 17:07 Europe/Bucharest: read-only checks still show release `b6e587aafaaa9580`, local storage, and healthy API/Studio. No data or settings were changed by this refresh. The current [deployment plan](production-deployment-plan-2026-11-26.md) records the committed application candidate, provider hold and final migration gates. **Do not clean this bucket:** it now contains the verified production snapshot.

## Accepted storage layout

The user selected the existing `sneepcut-test` bucket in `hel1` for production and the existing Hetzner credentials. Development now uses local SeaweedFS at `http://s3.localhost:8334`, bucket `sneepcut-dev`; Studio uses its internal `http://seaweedfs:8334` endpoint. The production bucket is no longer a dev cleanup target. No new cloud bucket or key was created.

The Hetzner profile was checked against the previously active dev credentials before separation. It remains in the ignored local profile. The original dev environment was preserved in an ignored backup before the switch. Dev API readiness and Studio health returned 200, and local S3 save/read/conditional-conflict checks passed with their probe removed.

## Destination and source safeguards

The destination contained zero objects before import, so no deletion was necessary. Its ACL was private, it had no bucket policy, and versioning had never been enabled. A real conditional-create/update/readback probe passed and was removed before backfill.

The source is the consistent snapshot captured at approximately **12:07 Europe/Bucharest on 26 November 2026** (10:07 UTC), from release `7c79c40f05d0c1e3`. An independent release held the deployment lock first; snapshot capture waited until that operation completed.

Application writers were paused for 113.39 seconds, then resumed before archive/restore verification. The database was restored into an isolated `sneepcut_integration_test` database with no network access; all 52 public-table row counts matched the captured source. The first verification fixture hit the PostgreSQL initialization restart; the rerun waited for the final server process and passed without another production pause.

| Snapshot | Files | Bytes |
| --- | ---: | ---: |
| Media | 1,923 | 12,478,342,841 |
| Studio raw directories | 3,150 | 13,551,103,819 |

Every file in both archives matched its source SHA-256. Original production volumes are retained. The protected server backup is `/opt/sneepcut-backups/hetzner-import-20261126T100730Z`; it includes the database dump, file archives/manifests, original environment, source release and writer image identities. Its database dump SHA-256 is `cadec3957104bef4ce94af846f0ed2e4aaa2c4ac3ce18372a1b29f9ef156b90c`.

## Import method and verification

Offline migration helpers/scripts and a private destination profile were transferred over SSH. No application release was uploaded or activated by this task, and the running production environment was not switched to S3.

Large serial transfers were slow. The import therefore uses eight disjoint media partitions, with original relative keys preserved. Their source files are hardlinks to the immutable staging snapshot. Each instance of the existing importer retains originals, refuses conflicting destination bytes, and verifies the complete downloaded object against its source hash.

Some initial destination-read checks failed. The media importer was updated to retry verification reads at most three times with a fresh signature, accepting only a complete matching size and SHA-256. Tests cover transient HTTP errors, truncated responses and continued refusal of permanently different bytes. The resumed helper's SHA-256 is `e279ad47564cd7595560bd5ebc01a5d209be9c54d07348e2638718e33863e2df`. Existing objects are reverified, not overwritten; no mismatching object is accepted merely because a retry was attempted.

Studio uses four disjoint groups of complete project directories, preserving all files and empty directories within each project. No project is split across workers. Snapshots, baselines, receipts, import/workspace heads and deletion markers are imported through the existing Studio migrator. Each import verifies its remote readback. A separate empty-cache recovery check and unsigned-media denial check follow the full import.

The image captured with the source snapshot was removed by independent release activity before the Studio phase. The replacement image was checked explicitly: migration, state configuration, S3 object client and object-project-store files matched the reviewed local source; the filesystem-store difference was formatting only. Its image identity is recorded in `studio-import-image.json`. A temporary stopped container holds that image during import and cold recovery, without restarting or modifying the live services.

Two Studio partitions exhausted the normal recovery budget with temporary storage-unavailable errors. Their original processes settled before independent retries of those same disjoint source groups began. Only the offline helpers use the longer policy: at most eight attempts and a ten-minute total budget per storage operation, with a one-minute non-streaming attempt limit. The application defaults were not changed. Existing identical heads/blobs are reused and fully downloaded for verification; different heads remain an error. This backfill does not establish acceptable live save latency or provider stability.

Detailed non-secret evidence and current status are in `artifacts/storage-migration-20261126/`. Worker logs and the private S3 destination profile remain in the protected server backup directory; credential values and signed URLs are not included in reports.

## Cutover boundary

The snapshot copy is complete and the live app remains on local storage. Files or database changes accepted after the snapshot are not part of this backfill. A consistent final delta, refreshed verification and a separately authorized live switch are still required. Do not clear this bucket again or switch a single service independently.

In particular, `studio/v1` now belongs to this snapshot. The existing Studio importer refuses a changed remote head; the final frozen Studio tree must use a fresh recorded cutover prefix and full verified import. For media, new keys and unchanged bytes are resumable; any changed existing key requires an explicit reviewed preservation/replacement procedure. The deployment plan records these constraints.

The deployment plan's previous Nuremberg/new-project suggestion is superseded by the selected existing Helsinki bucket and key. TikTok URL ownership/prefix compatibility is resolved in commit `5b9cb581f88cb8f4b6ea5adff0585fa18f112958`, retained by the current candidate: TikTok receives a signed URL under the existing `https://sneepcut.com/media/publish/` origin, streamed by the application from private storage. The isolated delivery checks pass; the actual public route must still be verified after an authorized application release. See [the readiness evidence](tiktok-hetzner-readiness-2026-11-26.md).

The newer 10 GB YouTube path introduces multipart saves above 128 MiB. Local S3 verification passes, but the exact candidate's conditional multipart completion, no-overwrite, readback and cleanup must be qualified on Hetzner before activation. The earlier small-object provider soak does not cover that path. Keep the existing Helsinki write-degradation hold; do not increase normal live retry budgets based on offline backfill success.

## Completed verification and cleanup

The import and cold recovery completed at **13:23 Europe/Bucharest** (11:23 UTC). Final live health and storage configuration checks passed at approximately **13:25**. The destination contains **5,290 objects / 25,786,328,730 bytes**:

| Verified coverage | Count | Evidence |
| --- | ---: | --- |
| Media keys | 1,923 | Complete source/destination size and SHA-256 verification; final inventory matches every key |
| Studio state entries | 267 | Four complete partition results; every import downloaded and verified its contents |
| Included Studio file references | 2,990 | Derived independently from the archived source hashes |
| Distinct Studio content blobs | 2,832 | Every expected content-addressed key and size present |
| Studio heads / immutable revision manifests | 267 / 268 | Complete expected project coverage; one additional identical revision retained |

The 160 excluded Studio files total 659,707 bytes and belong to the documented disposable paths. Saved revisions, renders and other durable project files were retained. One retry left an extra immutable revision manifest. Both manifests were downloaded and confirmed byte-for-byte identical, with the active head referencing one of them; neither was deleted. Their verification is recorded in `extra-revision-verified.json`.

A real video workspace recovered successfully into a separate empty temporary cache using the normal Studio storage configuration. Unsigned native Hetzner media access returned 403. The bucket remained private, without a bucket policy or versioning. Final object coverage contained no unexplained keys.

Production API readiness and Studio health both returned 200. Backend, worker and Studio were running and unpaused, still configured for local storage with no live AWS destination. Independent release activity advanced production to `b6e587aafaaa9580`; this task did not activate that release or restore an older one.

Development API readiness and Studio health also returned 200 on local S3. Recreating the dev API initially exposed older image source; the API was synchronized to the merged checkout, and additive dev migrations 060/061 were applied after a private database backup. Dev now reports revision `20261125_feedback_images`. This verification covered storage probes and service readiness; a new browser generation run was not performed during this data-backfill task.

Subsequent feature verification is separate from the backfill: the rebuilt local API/worker, YouTube download, browser flow, multipart local S3 and Studio import/render checks are recorded in the updated deployment plan. They do not change the backfill's point-in-time boundary or constitute production activation.

The disposable server `snapshot/` tree, its hardlinked partitions and import caches were removed after verification, together with the temporary image-holder container. Original live volumes, verified media/Studio archives, database dump, manifests, private destination profile and logs remain in the protected backup directory. The dev database backup and ignored original dev environment backup were retained locally. Task scratch files were removed; the repository storage check passed.

Final reports are `artifacts/storage-migration-20261126/final-verification.json`, `completion-evidence.json`, `studio-expected-inventory.json`, `extra-revision-verified.json` and `cleanup-verified.json`. The media and CLI Linux Go test packages passed, including transient-response, truncated-read, permanent-corruption and no-overwrite checks. No application release was committed, pushed or deployed by this task.
