# LinkedIn integration

Sneep Cut implements LinkedIn OAuth 2.0, member video publishing, optional
organization publishing, status polling, explicit remote deletion and local
connection-data deletion. The integration stays unavailable until the backend
has production credentials and social publishing is enabled.

## Developer application and products

Create the LinkedIn developer application for the legal operator and associate
the company Page when LinkedIn permits it. Register this redirect URL exactly:

```text
https://sneepcut.com/api/publishing/callback/linkedin
```

Request **Sign In with LinkedIn using OpenID Connect** and **Share on LinkedIn**.
Those products provide `openid`, `profile` and `w_member_social`, which are
sufficient for member identification and member posts. Do not require a company
Page for the member-only flow.

Organization destinations are a separate capability. Apply for the Community
Management API and obtain the applicable development or standard access before
setting `LINKEDIN_ORGANIZATION_ENABLED=true`. The implementation requests
`rw_organization_admin`, `r_organization_social` and `w_organization_social`,
lists only organizations for which LinkedIn returns an approved administrator
ACL, and rechecks that ACL before scheduled publication.

## Configuration

```text
SOCIAL_PUBLISHING_ENABLED=true
SOCIAL_TOKEN_ENCRYPTION_KEY=<base64 encoding of 32 random bytes>
LINKEDIN_CLIENT_ID=<OAuth client ID>
LINKEDIN_CLIENT_SECRET=<OAuth client secret>
LINKEDIN_API_VERSION=202609
LINKEDIN_ORGANIZATION_ENABLED=false
LINKEDIN_MEDIA_URL_PREFIX=https://your-public-media-origin.example/path/
```

`LINKEDIN_API_VERSION` uses LinkedIn's `YYYYMM` version format. Before rollout,
choose a version still supported by LinkedIn, verify the affected endpoints, and
update it during LinkedIn's published migration window. The media prefix must be
an HTTPS origin controlled by Sneep Cut. The backend validates the prefix, blocks
redirects to unsafe destinations, stages at most 500 MB, and sends only the
selected MP4 to LinkedIn's upload URLs.

Apply migration `20260922_linkedin_lifecycle`. Keep organization publishing off
until the organization products and permissions are approved.

## Product behavior

The connection screen explains data use and requires the member to acknowledge
the LinkedIn terms, privacy notice, and deletion instructions before OAuth begins.
Sneep Cut stores encrypted credentials, the member or organization URN, display
metadata, granted internal capability labels, expiry and the identifiers and
status of posts submitted through Sneep Cut. It does not fetch social graphs,
member feeds, reactions, comments, messages or other members' profile data.

Publishing supports one MP4 video and commentary of at most 3,000 UTF-8 bytes.
The worker initializes and uploads the video through the versioned Videos API,
waits for `AVAILABLE`, creates the post through `/rest/posts`, and records the
returned post URN. A calendar deletion removes the LinkedIn post only when the
user explicitly selects LinkedIn.

## Data lifecycle and user control

Connections are checked daily. Disconnect, detected revocation, lost Page admin
access or expired authorization deletes the local token, cached member or Page
record, and LinkedIn API-derived post records immediately. Scheduled work using
that destination is failed clearly. Source files and projects remain under the
user's separate Sneep Cut controls, and already published LinkedIn posts remain
unless the user selects supported remote deletion or deletes them on LinkedIn.

LinkedIn does not document a general OAuth token-revocation endpoint for this
flow. Sneep Cut therefore removes its local authorization immediately and points
users to LinkedIn's permitted-services controls for provider-side revocation.

Public production pages must expose `/privacy`, `/terms` and `/data-deletion`.
They disclose LinkedIn data use, retention, deletion and the applicable LinkedIn
agreements. No LinkedIn data is used for ads, sales, recruiting, CRM enrichment,
profiling, resale or AI training.

## Review and launch

Development access is limited and organization features require LinkedIn review.
For standard Community Management access, deploy the completed flow first, then
prepare LinkedIn's requested screen recording and test credentials. The recording
must show consent, OAuth, destination selection, a user-approved video post,
status, explicit post deletion and disconnect/data deletion without implying
access that is still pending.

Run automated provider fixtures and isolated database tests before enabling the
feature. Then verify production OAuth and one explicitly authorized test post.
Passing local tests does not establish LinkedIn approval.

Official references:

- [OAuth authorization code flow](https://learn.microsoft.com/en-us/linkedin/shared/authentication/authorization-code-flow)
- [OpenID Connect](https://learn.microsoft.com/en-us/linkedin/consumer/integrations/self-serve/sign-in-with-linkedin-v2)
- [Share on LinkedIn](https://learn.microsoft.com/en-us/linkedin/consumer/integrations/self-serve/share-on-linkedin)
- [Posts API](https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/posts-api)
- [Videos API](https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/videos-api)
- [Organization access control](https://learn.microsoft.com/en-us/linkedin/marketing/community-management/organizations/organization-access-control-by-role)
- [Community Management access tiers](https://learn.microsoft.com/en-us/linkedin/marketing/community-management/community-management-api-development-tier)
- [API versioning](https://learn.microsoft.com/en-us/linkedin/marketing/versioning)
- [LinkedIn API Terms](https://www.linkedin.com/legal/l/api-terms-of-use)
- [LinkedIn Marketing API Terms](https://www.linkedin.com/legal/l/marketing-api-terms)
