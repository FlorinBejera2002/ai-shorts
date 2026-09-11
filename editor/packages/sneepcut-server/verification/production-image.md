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
