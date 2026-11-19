# Import users' own YouTube videos

Create clips → YouTube → Own videos imports the connected user's uploaded
videos using **Google Data Portability API**, then feeds the stored files into
the existing upload-to-clips pipeline. It does not use browser cookies or the
legacy YouTube URL downloader. `YOUTUBE_IMPORT_APPROVED` is unrelated to this
flow and may remain false.

## Google setup

1. Use a dedicated Google Cloud project and Web OAuth client for Data
   Portability, separate from sign-in and YouTube publishing. Link an active
   Cloud Billing account, then enable the
   [Data Portability API](https://console.cloud.google.com/apis/library/dataportability.googleapis.com).
   Google requires active billing before API requests; API enablement and OAuth
   client creation alone are insufficient. See Google's
   [project setup requirements](https://developers.google.com/data-portability/user-guide/setup).
   This separation is required: Google's token revocation affects every client
   in the same Cloud project. Configuration rejects matching project-number
   prefixes in the standard OAuth client IDs.
2. Register the exact redirect URI:
   `https://sneepcut.com/v1/youtube/import/callback` (or the configured APP_URL
   origin for an isolated environment).
3. Configure only the required Data Portability scopes:
   - `https://www.googleapis.com/auth/dataportability.youtube.public_videos`
   - `https://www.googleapis.com/auth/dataportability.youtube.unlisted_videos`
   - `https://www.googleapis.com/auth/dataportability.youtube.private_videos`

   Public is selected initially. Users explicitly opt into unlisted/private
   videos and may grant only a subset in Google's consent screen. The app
   exports only the granted subset. No email, profile, YouTube Data API or
   publishing scope is mixed into the request; `include_granted_scopes=false`.
4. Complete Google's [app verification](https://developers.google.com/data-portability)
   before public activation. A controlled real test can use an External app in
   Testing status with an explicitly listed Google test account. Set
   `YOUTUBE_PORTABILITY_TEST_MODE=true` for that deployment: only authenticated
   Sneep Cut admins can start new imports. This app-role check does not replace
   Google's test-user allowlist or the account owner's consent. The application
   must disclose transfer,
   storage, AI processing to create clips, sharing with processing providers,
   and users' deletion/revocation controls. Test-mode grants expire after seven
   days even if the user selected a longer period.
5. Set `YOUTUBE_PORTABILITY_CLIENT_ID`, `YOUTUBE_PORTABILITY_CLIENT_SECRET`,
   a valid base64-encoded 32-byte `SOCIAL_TOKEN_ENCRYPTION_KEY`, and finally
   `YOUTUBE_PORTABILITY_ENABLED=true`. The callback defaults to
   `${APP_URL}/v1/youtube/import/callback` and must remain on that origin.
   The global switch also applies to admins. `YOUTUBE_PORTABILITY_TEST_MODE`
   defaults to false; set it to false for the verified public release. Mode
   changes do not stop an already authorized transfer or remove library access.

Google currently supports this transfer in the EEA (including Romania), the UK
and Switzerland; account restrictions can still apply. Check the current
[eligibility list](https://support.google.com/accounts/answer/14452558).
Users without access can upload an original video file instead.

## Import behavior and operation

The Google flow authorizes copying a visibility category of the user's own
uploads; it is not an instant download endpoint for one arbitrary YouTube URL.
Google prepares an archive asynchronously, which can take minutes or hours.
Users select an imported file for clip generation once it is available.

The API process runs a durable database-backed poller independently of the
media-generation queue. Import state, archive identity and encrypted OAuth
credentials survive page closure and process restarts. Claims are leased and
fenced; retries cannot repeatedly start ambiguous archive requests. There is
one active import per owner. A new import requires explicit consent again.

The archive reader accepts bounded ZIP and tar.gz exports, validates paths and
entry types, and downloads signed Google Storage URLs without forwarding OAuth
tokens or cookies. Each supported video passes the normal upload size, magic
signature, malware scanning and ownership checks. Imported library metadata
contains stable owned storage keys; tokens and signed export URLs are never
returned to the browser or account data export.

Defaults are 4 GiB compressed and expanded per import, 100 videos, and the
normal `MAX_UPLOAD_SIZE_MB` limit per video. Adjust
`YOUTUBE_PORTABILITY_MAX_IMPORT_MB` (64–32768) and
`YOUTUBE_PORTABILITY_MAX_VIDEOS` (1–500) for the deployment's disk budget.
The reader fails safely on an over-limit export; it does not silently truncate
a successful import. Metadata and supported file-format coverage should be
verified against real Google exports during app verification.

MP4, MOV, AVI, MKV and WebM keep their original bytes. M4V, MPG/MPEG, 3GP, FLV,
WMV and MPEG-TS variants are converted to bounded H264/AAC MP4 before upload
validation. Conversion uses restricted local demuxers/protocols, two threads
and a twenty-minute deadline per video. Generated storage filenames avoid
rejecting long or non-Latin YouTube titles; display metadata remains intact.

Production Docker Compose mounts the `youtube_import_tmp` volume at
`/app/youtube-import-tmp`; local Compose mounts the runtime root's
`tmp/youtube-import` directory there (created by `make ensure-runtime`). Both
are owned by UID 10001 and separate from served media, so multi-GB exports do
not land in the API's `/tmp`.
Budget disk for the compressed archives, extracted video files and upload
scanner staging at the same time. Ordinary attempts clean their temporary
directories on exit; monitor and review stale scratch directories after abrupt
container/host termination.

Disconnect stops further import and erases the stored grant, while keeping
already imported videos. Removing a video hides it from the import library and
removes its stored source when no existing project needs it. Existing jobs
retain their source; account deletion covers the complete owned upload prefix.
Account deletion immediately fences imports and erases credentials even if
billing or media cleanup needs a retry.

## Verification

Use mock Google OAuth/API and archive fixtures for automated checks. PostgreSQL
tests use only the dedicated loopback `sneepcut_integration_test` database and
isolated schemas. Browser tests use synthetic authentication and mocked APIs;
they do not import real user data or spend credits.

```sh
cd backend
go test ./internal/youtubeimport ./internal/media ./internal/jobs ./internal/account ./internal/config ./internal/migrate ./migrations ./cmd/api
```

A real Google import additionally requires configured credentials, active Cloud
Billing, and an eligible account giving consent. Use an allowlisted Google test
account for External/Testing, or verified credentials for public access. Passing
mock checks does not prove Google has approved the application.

Protocol references:
[OAuth restrictions](https://developers.google.com/data-portability/user-guide/configure-oauth),
[archive initiation](https://developers.google.com/data-portability/reference/rest/v1/portabilityArchive/initiate),
[archive state](https://developers.google.com/data-portability/reference/rest/v1/archiveJobs/getPortabilityArchiveState),
[YouTube export schema](https://developers.google.com/data-portability/schema-reference/youtube),
[data use policy](https://developers.google.com/data-portability/policy).
