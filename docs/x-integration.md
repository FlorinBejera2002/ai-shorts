# X integration

Sneep Cut implements the current X API v2 OAuth, chunked video upload, post
creation, explicit post deletion and local connection-data deletion. It remains
unavailable until the X developer App is configured, funded where required, and
the backend feature flag is enabled.

## Developer Console setup

Create an X Project and App in the Developer Console and configure it as a
confidential **Web App**. Register this callback exactly:

```text
https://sneepcut.com/api/publishing/callback/twitter
```

Enable OAuth 2.0 Authorization Code with PKCE. Sneep Cut requests only:

- `tweet.read` and `users.read` to identify the connected account;
- `tweet.write` to create and delete the user's approved posts;
- `media.write` to upload the approved video;
- `offline.access` to receive a refresh token for scheduled publishing.

The code uses an S256 PKCE challenge, single-use state bound to the browser,
user and session, and HTTP Basic client authentication at the token, refresh and
revoke endpoints. Tokens are encrypted at rest and never returned to the browser.

## Configuration

```text
SOCIAL_PUBLISHING_ENABLED=true
SOCIAL_TOKEN_ENCRYPTION_KEY=<base64 encoding of 32 random bytes>
X_CLIENT_ID=<OAuth 2.0 client ID>
X_CLIENT_SECRET=<OAuth 2.0 client secret>
X_MEDIA_URL_PREFIX=https://your-public-media-origin.example/path/
```

Apply migration `20260922_x_lifecycle`. The media prefix must be an HTTPS origin
controlled by Sneep Cut. The backend validates the signed source URL, rejects
redirects, stages at most 2 GB because that is the application's upload ceiling,
and sends only the selected MP4.

X API v2 currently uses credit-based pay-per-usage billing. Prices can change;
check the Developer Console before enabling production. Quotas and the posting
account's Premium or verified status can further limit video length and size.
Sneep Cut does not claim that its 2 GB application limit equals X's account
limits.

## Publishing flow

The connection UI explains X data use and requires acknowledgement of the X
Developer Agreement and Policy, Sneep Cut Privacy Policy and deletion controls.
After OAuth, Sneep Cut calls `/2/users/me` only for ID, name, username and profile
image. It does not request timelines, followers, likes, bookmarks or messages.

For each user-approved post, the worker:

1. initializes `POST /2/media/upload/initialize` with `tweet_video`;
2. uploads multipart chunks of at most 5 MB to the dedicated append path;
3. finalizes and polls `GET /2/media/upload?command=STATUS&media_id=...`;
4. creates the post with `POST /2/tweets` and the returned media ID;
5. stores the post ID and canonical `x.com/i/web/status/...` URL.

Sneep Cut supports one MP4 and text of at most 280 Unicode code points per X
destination. X applies its official weighted character rules and final account
eligibility checks at creation, so X may reject content that passes this
conservative local check.

The calendar offers remote deletion only after publication and only when the
user explicitly selects X. It calls `DELETE /2/tweets/{id}` and removes the local
published state only after X confirms deletion.

## Data lifecycle

Sneep Cut stores the connected X account ID, name, username, image URL, internal
capability labels, token expiry, encrypted OAuth credentials, and IDs and status
of posts submitted through Sneep Cut. It does not use X data for advertising,
sale, surveillance, profiling, CRM enrichment or AI training.

The account is checked daily. Disconnect revokes the refresh token through
`POST /2/oauth2/revoke` and immediately deletes the local token, cached profile
record and X API-derived publishing records. Detected revocation or an
unrefreshable expiry triggers the same local deletion. Source media and projects
remain under the user's separate Sneep Cut controls. Posts already delivered to
X remain until the user explicitly selects supported remote deletion or deletes
them on X.

Public production pages must expose `/privacy`, `/terms` and `/data-deletion`
with these practices and links to the X rules. Users can also revoke access from
X's connected-app settings.

## Verification and launch

Before enabling production, verify current billing and endpoint access in the X
Developer Console, deploy the callback and legal pages, run automated provider
fixtures and isolated database tests, then perform one explicitly authorized
OAuth and video-post test. Automated checks do not establish paid access or X
approval.

Official references:

- [OAuth 2.0 Authorization Code with PKCE](https://docs.x.com/fundamentals/authentication/oauth-2-0/authorization-code)
- [OAuth user access, refresh and revoke](https://docs.x.com/fundamentals/authentication/oauth-2-0/user-access-token)
- [Chunked media upload](https://docs.x.com/x-api/media/quickstart/media-upload-chunked)
- [Create posts](https://docs.x.com/x-api/posts/create-post)
- [Delete posts](https://docs.x.com/x-api/posts/delete-post)
- [Usage and billing](https://docs.x.com/x-api/fundamentals/post-cap)
- [Current pricing](https://docs.x.com/x-api/getting-started/pricing)
- [Developer Agreement and Policy](https://developer.x.com/en/developer-terms/agreement-and-policy)
- [X Rules](https://help.x.com/en/rules-and-policies/x-rules)
