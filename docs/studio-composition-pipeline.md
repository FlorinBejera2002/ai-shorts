# Shared Studio composition pipeline

The Go worker handles source inspection, transcription, editorial decisions,
caption selection, audio cleanup and output review. It sends a typed composition
plan to Studio for montage and final rendering. Ordinary generated clips, Story
Builder, and clip edits share this boundary. An unavailable Studio service is a
rendering error; production does not fall back to the former Go compositor.

## Document lifecycle

1. The worker signs a bounded request to `POST /sneepcut/composition`, identifying
   the owner and one idempotent rendering request. Asset URLs use the application's
   signed media route.
2. Studio resolves one stable editable project through the saved artifact's
   lineage. It captures that project's saved files and revision, then combines
   the previous automatic baseline, the current manual document and the new
   automatic plan. Manual properties and added files survive; untouched generated
   properties receive the requested automatic changes. This produces a staged,
   immutable snapshot with editable source windows, audio, captions and graphics.
3. Studio runs the same sandbox renderer used for manual exports. HDR projects
   also receive an SDR video preview. The worker probes the returned file, saves
   it to normal media storage, and retains the Studio artifact identity. Story
   review still inspects the actual produced audio and video.
4. Only an accepted output is committed to the shared project. Publication compares
   the whole-project revision captured before rendering. A newer manual save causes
   a conflict and leaves the current project intact. Failed, cancelled and rejected
   Story candidates never replace it. Retrying the same accepted commit is
   idempotent while that committed revision remains current.
5. Opening any output in the same lineage opens that same editable project, with
   its current saved sources. A native trim uses the current document and preserves
   its nested layers. The clean TikTok export derives from the primary candidate
   and does not replace the primary editable project.

Automatic artifacts are immutable output revisions; the main Studio workspace is
the single current editing source. All clip links open that Studio directly on
its own origin. The dashboard no longer mounts editor frames or maintains a
same-origin iframe save barrier. Studio flushes pending edits when it loses focus;
only saved server content can be captured for automatic rendering. Finish saving
in Studio before requesting an automatic revision from another tab. Server-side
revision checks reject publication if a newer manual save arrives during rendering.

Merging operates on HTML, styles, animation statements and project files, not just
the original scene recipe. Manual topology changes preserve the user's source
windows. Unsupported or ambiguous changes fail without replacing the current
project. A manual Story revision can require editorial review: output integrity
is checked, but old speech/caption expectations must not undo deliberate mute or
text edits. Historical Story rollback still selects an earlier reviewed output;
it does not rewind or erase the current manual workspace. Subsequent regeneration
continues from that workspace and its current automatic baseline.

Every generated revision has a job scope. Deleting a Story removes that scope's
snapshots and imported workspaces, including failed and superseded revisions.
Account deletion purges both automatic snapshots and editable Studio projects.
Deletion is acknowledged only after active render/file operations have stopped;
durable tombstones reject delayed retries. If Studio cleanup fails, database
deletion remains pending and can be retried.

Clips generated before this change have no native artifact reference. Their
existing compatibility importer remains available. Previously flattened effects
cannot be recovered as separate layers from the exported MP4 alone.
If such a clip already has a legacy editable Studio project, automatic regeneration
refuses to fork away from it: continue editing that project in Studio. Without an
original automatic baseline, its manual changes cannot be merged reliably.

## Runtime configuration

Studio is part of the default Compose stack. `docker-compose.studio.yml` remains
an empty compatibility overlay for older commands. Local `make ensure-env` (or
`node scripts/ensure-env.mjs`) creates a missing `STUDIO_AGENT_SECRET` without
printing it or replacing existing values. Production requires its own independent
secret of at least 32 characters.

The API and worker use `STUDIO_AGENT_URL`, normally `http://studio:5191`, and the
same service credential as Studio. Studio accepts signed assets only from
`SNEEPCUT_MEDIA_ORIGIN`; `SNEEPCUT_MEDIA_INTERNAL_ORIGIN=http://nginx` routes those
downloads through the internal gateway while preserving signatures. Browser
requests cannot invoke the composition service.

In production nginx joins Studio's network to serve those signed downloads.
The public proxy chain uses the network-specific `nginx-gateway` and
`backend-gateway` aliases on the default network, preserving nginx and Caddy's
fixed addresses used for trusted forwarded headers. Network alias scope follows
the [Compose service network contract](https://docs.docker.com/reference/compose-file/services/#aliases).

S3 deployments must set `SNEEPCUT_MEDIA_S3_ORIGIN` to the exact origin of their
configured bucket's signed asset URLs. This explicit allowlist does not allow
redirects to other origins. Local-storage deployments leave it empty.

Deploy the API, migrations, worker and Studio together for the first transition.
The release script starts Studio before the worker. Manual edits and generated
snapshots live in the persistent Studio volume and need normal storage monitoring
and backups; render scratch data remains disposable.

## Limits and verification

The typed request, asset downloads, project size, render time and output size are
bounded. `SNEEPCUT_COMPOSITION_MAX_BYTES` defaults to 2 GiB of input project files;
the source-count limit does not guarantee that every collection fits this byte
budget. Both originals and preview proxies count. Oversized projects fail with an
explicit error. Legacy imports retain their existing byte limit. Do not increase
the input budget without provisioning corresponding render scratch space.

The shared engine uses editable music gain automation for fades and ducking.
This is shared by preview and export; it is not a claim of bit-identical audio to
the previous FFmpeg sidechain compressor. Typography likewise follows Studio's
caption renderer for both automatic and manual work.

Verify authentication and owner isolation, retry behavior, exact snapshot copies,
native trim layers, SDR/HDR output and browser preview/export source selection.
Actual sandbox rendering requires Linux namespaces; a passing mocked transport
test does not establish render fidelity. Use disposable synthetic media and project
storage as described in [the production image fixture](../editor/packages/sneepcut-server/verification/production-image.md).

`editor/packages/sneepcut-server/verification/manual-regeneration-render.ts` exercises
the signed service with synthetic media and the native renderer. It checks shared
project identity, preserved manual text and assets, actual overlay pixels and audio
gain, new automatic layers, and rejection of a commit after a newer manual save.
Set the FFmpeg, FFprobe and browser paths described below and run it with Bun from
the checkout root. Its disposable media and projects are removed on exit.

The existing Go pixel/audio assertions have an opt-in Studio integration lane:
set `SNEEPCUT_TEST_STUDIO_RENDER=1`, `SNEEPCUT_TEST_BUN` to Bun's executable,
`HYPERFRAMES_FFMPEG_PATH` and `HYPERFRAMES_FFPROBE_PATH`, and
`PRODUCER_HEADLESS_SHELL_PATH` to an installed browser, then run the affected
processing tests. The test working directory must be within the checkout (or an
isolated fixture workspace containing `editor/`). The fixture starts a signed,
loopback-only media server and uses disposable project storage under `.cache/tmp/`.
It renders trusted synthetic documents with Studio's producer adapter; it does
not exercise Linux sandbox confinement. Without the opt-in these media tests
explicitly skip, so their absence is not a render pass.

`story-eval` also renders through Studio. Use a separate evaluation Studio with
synthetic credentials and disposable project storage. Set `STORY_EVAL_MEDIA_LISTEN`
to a fixed loopback address such as `127.0.0.1:19081`, and point that Studio's
`SNEEPCUT_MEDIA_INTERNAL_ORIGIN` to the listener in the same network namespace.
The evaluator signs access to its isolated run directory using `INTERNAL_API_KEY`;
its synthetic UUID does not identify a customer account. The application media
origin must match `APP_URL`. End-to-end CLI tests additionally require
`SNEEPCUT_TEST_STUDIO_EVALUATION=1`; media-signature and configuration tests run
without that flag. Historical local-evaluation replay files remain supported.
