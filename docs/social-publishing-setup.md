# Social publishing setup

The Publish page connects user-owned Facebook Pages, Instagram professional
accounts, TikTok accounts and YouTube channels through separate OAuth flows.
These are the only supported platforms. Scenarios remains a
separate page. Publishing requires an explicit review and confirmation.

## Recorded provider resources

These identifiers were recorded during setup; they do not certify current provider approval or production readiness. Recheck the relevant provider console before activation.

- Meta business portfolio: `1430619835587283`; developer app: `2537942060040854`.
- Instagram product app: `1586978439836014`.
- TikTok app: `7682736403670894599`; organization: `7682737535008785426`.
- Production browser domain: `https://sneepcut.com`; provider callbacks must use the configured public origin.

Use the [production operations guide](production-backend.md) for an explicitly authorized deployment. Preserve existing secrets and provider identities; server/DNS availability alone does not prove publishing is configured.

## Callbacks and public pages

Register these exact OAuth redirect URLs in the corresponding product:

| Provider | Redirect URL |
| --- | --- |
| Facebook | `https://sneepcut.com/api/publishing/callback/facebook` |
| Instagram | `https://sneepcut.com/api/publishing/callback/instagram` |
| TikTok | `https://sneepcut.com/api/publishing/callback/tiktok` |
| YouTube | `https://sneepcut.com/api/publishing/callback/youtube` |

Serve `/privacy`, `/terms` and `/data-deletion` publicly on the production domain.
The data-deletion page is a human-readable instructions URL, not a webhook.
Do not enter it into a field expecting a signed-request deletion callback.
Meta rejected the instructions URL during setup before public deployment;
re-enter it after the page is reachable. Google login settings are independent.

## Backend configuration and rollout

See [social-publishing.env.example](social-publishing.env.example) for the exact
backend variables. Keep secrets in the backend deployment's secret store.
Use a cryptographically random 32-byte base64 encryption key and retain it;
changing it without migrating credentials makes stored authorizations unreadable.
Do not replace local APP_URL while configuring the production environment.

1. Deploy the compatible Go API, media worker and frontend, following
   [the deployment guide](production-backend.md). Keep publishing disabled.
2. Apply the current embedded Go SQL migrations to the intended production database
   after arranging the normal backup and migration rollout.
3. Configure credentials for each provider and the canonical HTTPS APP_URL.
   Configure publicly accessible signed media URLs. TikTok requires ownership
   verification of the media URL prefix used for PULL_FROM_URL.
4. Complete business/product verification, required permissions and provider
   review using an accurate end-to-end recording and permitted test accounts.
5. Enable `SOCIAL_PUBLISHING_ENABLED` in the intended environment. Verify OAuth
   round trips, owner-scoped account selection and disconnect. Perform a real
   publishing check only with an explicitly authorized test clip and account.

Facebook uses `pages_show_list`, `pages_read_engagement`, `pages_manage_posts`.
Instagram uses Instagram API with Instagram Login and separate product credentials,
with `instagram_business_basic` and `instagram_business_content_publish`.
TikTok uses `user.info.basic` and `video.publish`.
YouTube uses `youtube.readonly` and `youtube.upload` for channel connection and
user-confirmed video publishing. See [the YouTube integration guide](youtube-integration.md)
for current migrations, Google setup, private-only audit mode and data lifecycle.

## Behavior and limitations

Credentials are encrypted at rest and are never returned in browser responses.
Accounts for retired platforms are excluded from connections and publishing
destinations. Existing calendar entries, scripts and media are retained; editing
a retired destination requires an explicit supported replacement. Queued work
for an unsupported platform fails without contacting that provider.
OAuth states are single-use and bound to browser, user and session. Posting is
durably queued with per-user idempotency; ambiguous provider outcomes are shown
as unknown and are not blindly retried. A changed clip is rejected before it can
replace the clip the user reviewed. Disconnect removes local credentials and
cancels pending work; an operation already accepted remotely can still complete.
Published Facebook posts can be deleted remotely when the user
explicitly selects that option; other posts must be managed as described in the UI.

TikTok creator options are fetched before confirmation. Privacy has no default;
interaction restrictions and commercial disclosures are enforced. TikTok blocks
clips with a Sneep Cut promotional badge, including older clips whose badge
provenance is unknown. Unaudited TikTok apps are limited to permitted private
testing; public publishing requires TikTok approval.

## Verification

Local automated checks use mocked provider HTTP responses and the isolated
`sneepcut_integration_test` database, never actual social posts. Frontend browser
coverage uses synthetic account/API fixtures in English and Romanian. Passing
these checks does not establish approval or successful production OAuth.

Provider references:

- [Meta Instagram API](https://www.postman.com/meta/instagram/documentation/6yqw8pt/instagram-api)
- [Meta Facebook API](https://www.postman.com/meta/facebook/documentation/r56bjfd/facebook-api)
- [TikTok content sharing requirements](https://developers.tiktok.com/doc/content-sharing-guidelines/)
- [TikTok application review](https://developers.tiktok.com/docs/en/app-review-guidelines)
