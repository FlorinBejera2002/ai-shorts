# Disposable production-image browser verification

Use the release image, with its production entry point and render isolation settings.
Never point this fixture at a production auth service or mount persistent Studio data.

1. Create a dedicated internal Docker network for the verification containers.
   Bind-mount this verification directory read-only into both containers at
   `/app/packages/sneepcut-server/verification`; it is excluded from the image.
2. Start a mock auth container from the release image on that network, named
   `studio-verification-auth`, overriding its command with
   `bun packages/sneepcut-server/verification/mock-auth.ts` and `NODE_ENV=test`.
   Do not publish its port.
3. Start a separate Studio container from the same image on that network with
   its normal production command and isolation settings. Use a disposable tmpfs
   at `/data` and `/tmp` writable by the image user and these environment overrides:

   ```text
   SNEEPCUT_AUTH_BASE_URL=http://studio-verification-auth:8080
   SNEEPCUT_STUDIO_ORIGIN=http://127.0.0.1:5191
   SNEEPCUT_APP_ORIGIN=http://127.0.0.1:5191
   SNEEPCUT_STUDIO_DATA=/data/projects
   ```

4. Execute the browser check inside that Studio container:

   ```sh
   docker exec -e STUDIO_VERIFICATION_ORIGIN=http://127.0.0.1:5191 studio-verification \
     bun packages/sneepcut-server/verification/browser.ts
   ```

   The check creates a synthetic authenticated session and project through the
   production HTTP routes, loads the preview, checks playback, edits and reads
   back the composition, requests a render, waits for completion, and validates
   the downloaded MP4 signature. Screenshot and MP4 artifacts are written in
   `/tmp/studio-verification` (override with `STUDIO_VERIFICATION_OUTPUT`). Copy
   them out before cleanup if needed. The trusted fixture browser uses
   `--no-sandbox` inside this disposable container; production render isolation
   remains enabled.
5. Remove only these two verification containers and their dedicated network.
   Their disposable project data must not be retained or reused by production.

The default invocation without `STUDIO_VERIFICATION_ORIGIN` continues to use
the existing local browser fixture on port 5193. The production-image mode
rejects non-loopback origins to prevent accidentally testing against a live site.

## Source scene editing regression

`story-sources.browser.ts` starts its own loopback-only server on port 5195 with
an isolated synthetic owner and disposable project store. It uses the real Story
importer and Studio runtime, generates a colored H.264/AAC source with a 440 Hz
tone, and checks decoded pixels, native camera audio, karaoke, native touch trim,
extension, Undo/Redo, source settings and cut sound effects. A second project
checks 11 cuts over 46 seconds: loaded filmstrips before playback, usable phone
zoom and handles, horizontal touch pan, and explicit Fit. It does not call a
production API or use a persistent database. Build Studio and the core runtime first.

Run from the repository root with Bun and FFmpeg available:

```sh
bun editor/packages/sneepcut-server/verification/story-sources.browser.ts
```

For the disposable Linux image, mount this verification directory read-only as
above and provide writable artifact and scratch directories:

```text
STUDIO_SOURCES_OUTPUT=/tmp/studio-source-results
STUDIO_SOURCES_SCRATCH=/tmp
STUDIO_SOURCES_FONT=/usr/share/fonts/truetype/liberation2/LiberationSans-Bold.ttf
STUDIO_SOURCES_TRUSTED_CONTAINER=1
```

Only the explicit trusted-container flag disables the fixture browser sandbox.
Production render isolation is unchanged. The font can instead point to the
mounted backend Inter font to verify the exact brand face. `FFMPEG_PATH` can name
a local executable. In the image, invoke
`bun packages/sneepcut-server/verification/story-sources.browser.ts`.

To run the same editing checks on supplied H.264/AAC footage, set
`STUDIO_SOURCES_MEDIA` and optionally `STUDIO_SOURCES_SECOND_MEDIA` to read-only
local files. Set their verified full durations using `STUDIO_SOURCES_DURATION`
and `STUDIO_SOURCES_SECOND_DURATION` (both default to 6 seconds). The fixture
uses ranges 1–3 and 2–4 seconds and synthetic caption cues. This mode checks
real camera audio signal rather than the generated 440 Hz tone; actual speech
recognition and transcript approval are covered by the Story pipeline checks.
