# Social publishing setup

The Publish page connects user-owned Facebook Pages, Instagram professional
accounts, TikTok accounts, YouTube channels and LinkedIn member profiles or approved organization Pages through separate OAuth flows. Scenarios remains a
separate page. Publishing requires an explicit review and confirmation.

## Current external setup

Meta business portfolio Sneep Cut: `1430619835587283` (verification pending).
Meta developer app Sneep Cut: `2537942060040854` (unpublished).
Instagram product app Sneep Cut-IG: `1586978439836014`.
Owner contact: Florin Bejera, `admin@sneepcut.com`.
Production domain: `https://sneepcut.com`.
Facebook brand Page: https://www.facebook.com/profile.php?id=61594209031373 .
Instagram brand profile: https://www.instagram.com/sneepcut/ (Business / Software).
Meta confirmed that the Facebook Page and Instagram profile are associated.
Facebook and Instagram OAuth callback URLs have been entered in Meta.
TikTok app: `7682736403670894599`, owned by organization `7682737535008785426`.
Production app exists as Draft. Login Kit, Content Posting API, Direct Post,
callback and basic details were entered in the open form; Save currently reports
missing verified URLs, icon and demonstration video, so these edits are not yet
confirmed persisted. Do not treat the draft as approved or enabled.
An empty duplicate TikTok organization `7682737535008818194` remains to remove.
GoDaddy manages domain DNS. The production server IP supplied on 2026-09-08 is
`159.195.254.38`. Authenticated SSH access as root was verified on 2026-09-08.
The user assigned deployment to Tristan; application deployment is still pending.

### Infrastructure verification (2026-09-08)

- The domain A records still resolve to `13.248.243.5` and `76.223.105.230`.
- HTTP on `159.195.254.38:80` refused connections during the initial check;
  the application gateway has not been started.
- Public `/privacy`, `/terms`, `/data-deletion` and `/api/ready` return HTTP 404.
- Added `api.sneepcut.com` A record pointing to `159.195.254.38` in GoDaddy;
  the server resolver confirmed it.
- Added the TikTok verification TXT record below in GoDaddy and confirmed it
  in the DNS table. Provider-side verification remains pending.
- The local `.env` has no social provider credentials or social encryption key.
  This does not establish the contents of the server environment.

Next, Tristan handles deployment using [the current handoff](publish-handoff.md).
GoDaddy and Cloudflare login succeeded; provider sessions still need verification.
Preserve the documented
Cloudflare frontend architecture: the server IP is a backend origin, and is not
by itself a replacement for the canonical frontend domain or OAuth callbacks.
Complete HTTPS origins and deploy the compatible release before validating
provider URLs. Keep this setup pending until production OAuth is verified;
an available IP alone does not make publishing operational.

TikTok production DNS verification pending in GoDaddy:

```text
Type: TXT
Host: @
Value: tiktok-developers-site-verification=KvAuujEfOVdi9yxp6hgSfZQiYrU6MC4j
```

Add this record without replacing existing TXT/MX records, then use Verify in
the TikTok URL properties panel. This public ownership proof is not an API secret.

Creating these resources does not grant public API access. Instagram product
secret configuration, TikTok application credentials and provider reviews remain needed.
No production migration, activation or live post has been performed.

### TikTok follow-up (2026-09-16)

- TikTok now shows `sneepcut.com` as verified.
- Sandbox app `7683612649498593301` is saved with the Web platform, Login Kit,
  Direct Post, the production callback URL and the 1024px app icon.
- A sandbox target account still needs to be added through TikTok's interactive
  login. No sandbox post, production app review or Direct Post audit has been
  submitted yet.
- TikTok uses the existing connected-accounts card and the existing calendar
  post dialog alongside Instagram and Facebook; there is no separate TikTok
  publishing page. The dialog refreshes creator options, requires a manual
  audience choice, keeps viewer interactions and commercial disclosure off by
  default, shows the selected clip preview and supports the AI-generated-content
  disclosure. Scheduled and immediate posts use the same durable publishing
  worker and status history.
- The production server still needs TikTok credentials and the verified media
  URL prefix before this flow can be used for the sandbox recording. Keep the
  production app in Draft until the deployed end-to-end flow can be recorded.

## Callbacks and public pages

Register these exact OAuth redirect URLs in the corresponding product:

| Provider | Redirect URL |
| --- | --- |
| Facebook | `https://sneepcut.com/api/publishing/callback/facebook` |
| Instagram | `https://sneepcut.com/api/publishing/callback/instagram` |
| TikTok | `https://sneepcut.com/api/publishing/callback/tiktok` |
| YouTube | `https://sneepcut.com/api/publishing/callback/youtube` |
| LinkedIn | `https://sneepcut.com/api/publishing/callback/linkedin` |

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

1. Deploy the compatible Python model/workers, Go API and frontend, following
   [the deployment guide](cloudflare-deployment.md). Keep publishing disabled.
2. Apply Alembic migration `20260907_0001` to the intended production database
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
LinkedIn uses `openid`, `profile` and `w_member_social` for member video posts.
Organization destinations additionally require approved Community Management
access and `rw_organization_admin`, `r_organization_social` and
`w_organization_social`. See [the LinkedIn integration guide](linkedin-integration.md).
X uses OAuth 2.0 Authorization Code with PKCE and the minimum scopes
`tweet.read`, `users.read`, `tweet.write`, `media.write` and `offline.access`.
See [the X integration guide](x-integration.md).

## Behavior and limitations

Credentials are encrypted at rest and are never returned in browser responses.
OAuth states are single-use and bound to browser, user and session. Posting is
durably queued with per-user idempotency; ambiguous provider outcomes are shown
as unknown and are not blindly retried. A changed clip is rejected before it can
replace the clip the user reviewed. Disconnect removes local credentials and
cancels pending work; an operation already accepted remotely can still complete.
Published Facebook and LinkedIn posts can be deleted remotely when the user
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
- [LinkedIn Share on LinkedIn](https://learn.microsoft.com/en-us/linkedin/consumer/integrations/self-serve/share-on-linkedin)
- [LinkedIn Community Management API](https://learn.microsoft.com/en-us/linkedin/marketing/community-management/community-management-overview)
