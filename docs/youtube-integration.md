# YouTube integration

The YouTube connection uses the same connected-account card, post editor,
calendar and durable publishing worker as the other destinations. Existing
read-only YouTube connections must reconnect to grant upload permission and
accept the current privacy policy and YouTube terms.

## Operator setup

Enable YouTube Data API v3 in Google Cloud, configure an External OAuth app,
verify the application domain, and create a Web application client. Register
`APP_URL/api/publishing/callback/youtube` exactly. The current publishing
handler requires public HTTPS even in development, so use a stable development
HTTPS origin; registering a localhost callback alone does not enable this flow.
Keep Google sign-in credentials separate from YouTube publishing credentials.

Backend settings:

```dotenv
SOCIAL_PUBLISHING_ENABLED=true
SOCIAL_TOKEN_ENCRYPTION_KEY=<base64 encoding of 32 random bytes>
YOUTUBE_CLIENT_ID=<Google OAuth web client ID>
YOUTUBE_CLIENT_SECRET=<Google OAuth web client secret>
YOUTUBE_AUDIT_APPROVED=false
YOUTUBE_MEDIA_URL_PREFIX=https://your-public-media-origin.example/path/
YOUTUBE_IMPORT_APPROVED=false
```

The media prefix must match the actual signed URLs returned by storage,
including a path-style bucket when applicable. The default is
`AWS_PUBLIC_BASE_URL`, falling back to `APP_URL/media/`. Only HTTPS, public
addresses and matching paths are accepted; media redirects are rejected.
Secrets stay on the backend. Preserve the encryption key across deployments.

Apply the Go migration chain through `20260922_youtube_lifecycle` before
starting the compatible API. Migration `20260922_youtube_options` adds calendar
metadata; the following migration adds consent and data-validation timestamps.
Use the normal backup and migration process for production; this change does
not apply production migrations or submit reviews.

## Permissions and publishing

- OAuth requests `youtube.readonly` and `youtube.upload`, PKCE, browser-bound
  single-use state and offline access. Both scopes must actually be granted.
- Users review a separate YouTube title and description, visibility, audience,
  altered/synthetic-content declaration, subscriber notifications and terms.
  One video is accepted per YouTube destination. Text is never silently
  truncated or decorated before upload.
- Until `YOUTUBE_AUDIT_APPROVED=true`, only explicitly selected private uploads
  are accepted. Change that flag only after YouTube approves the project audit.
- The backend streams media through a resumable-upload session and polls video
  processing. An interrupted/ambiguous mutation becomes `unknown`; it is never
  automatically uploaded again. Check YouTube Studio before reposting.
- The upload operation has a bounded 30-minute worker budget. This implementation
  uses the resumable protocol without retrying interrupted sessions. A timed-out
  upload requires manual inspection; it is not a guarantee that no video exists.
- `published` means YouTube completed processing; the chosen private/unlisted/
  public visibility remains in force. Calendar removal or disconnect does not
  delete a video from YouTube; manage that video in YouTube Studio.

## Data lifecycle

Access/refresh tokens are encrypted with AES-GCM and bound to the local user,
provider and remote channel. Tokens are never returned to the browser. The
database stores the channel ID, display name, handle, avatar URL, permission
markers, expiry, consent time and validation time to serve the requested flow.

The API maintenance loop checks channel authorization and refreshes channel
metadata daily, including when new publishing is disabled. Temporary failures
back off for an hour. Confirmed revocation purges connection data; a connection
that cannot be verified for six days is also purged. Stale connections are
excluded from the UI and cannot schedule or publish. Run the API continuously
and monitor `YouTube data maintenance failed` logs; operational downtime can
prevent timely cleanup and must be handled by the operator.

Disconnect attempts Google token revocation and deletes local YouTube account,
OAuth state and posting/API-result rows transactionally. Pending calendar
destinations are removed and affected scheduled posts fail visibly. Local
deletion succeeds independently of Google availability; users can also revoke
access in Google account permissions. Account deletion erases YouTube rows at
the initial freeze, even if billing or original-media deletion must retry.
Historical terminal posting results are deleted after 29 days during channel
maintenance rather than retained as stale API data indefinitely. User-authored
calendar drafts and original files are separate data and retain their normal
deletion controls. YouTube API data is not passed into AI processing or used to
train models by this integration.

## Audiovisual imports

OAuth publishing approval does not authorize downloading YouTube audiovisual
content. YouTube imports, including previously queued remote processing, are
disabled by default. Set `YOUTUBE_IMPORT_APPROVED=true` only after obtaining
YouTube's prior written approval. Original file uploads remain supported. The
flag is separate from the upload audit and must not be enabled merely because
the user owns a channel or an OAuth grant exists.

## External acceptance

Complete Google OAuth verification and the separate YouTube API audit using
the actual deployed flow. In Testing mode, Google limits test users and
expires the YouTube authorization/refresh token after seven days. Verify a real
authorized test channel connection, private upload, processing result, token
refresh, external revocation and disconnect before public rollout. Never use
customer data or publish a real video as an automated test fixture.

Official references:

- [OAuth web-server flow](https://developers.google.com/youtube/v3/guides/auth/server-side-web-apps)
- [Resumable uploads](https://developers.google.com/youtube/v3/guides/using_resumable_upload_protocol)
- [Upload API and audit restriction](https://developers.google.com/youtube/v3/docs/videos/insert)
- [Required functionality](https://developers.google.com/youtube/terms/required-minimum-functionality)
- [Data handling and developer policies](https://developers.google.com/youtube/terms/developer-policies)
- [Google API user-data policy](https://developers.google.com/terms/api-services-user-data-policy)

## Verification performed

On September 22, 2026, the affected publishing, calendar, account, configuration,
jobs, worker, migration and API packages passed Go tests. PostgreSQL-dependent
tests ran against a disposable `sneepcut_integration_test` database with the full
SQL migration chain; they were not counted as passing through skips. Provider
calls used controlled HTTP fixtures. Coverage includes exact metadata through
direct and calendar upload/polling, idempotency, permission and consent checks,
revoked/stale data purge, deletion freeze, secret-free export and import gates.
`go vet` passed for the affected packages.

Frontend TypeScript, focused tests and lint passed. A mocked browser exercised
connection consent, missing-field blocking, audit restrictions, the exact
publishing payload and mobile layout without real account mutations. React
Doctor reported 71/100 with three existing large-component complexity warnings.
Live Google OAuth, actual YouTube upload and production rollout remain external
acceptance steps requiring the configured project and an authorized test channel.
