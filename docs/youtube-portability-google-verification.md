# Google verification preparation

This is the prepared application information for the own-video import feature.
Google approval, a real consent/export test and any assessment required by
Google are separate release prerequisites.

Setup observed on 2026-11-17: the dedicated project and Data Portability API are created,
the application information and all three approved video scopes are saved,
and the production Web OAuth client has been created. The owner supplied its
credential JSON, and the client ID, secret and exact callback are installed in
the server's private environment (mode 0600). The API was reloaded and its
readiness check passed. Public activation remains disabled pending the
remaining Google project and verification prerequisites.

API release `e5fae0fa62137155` is live with
`YOUTUBE_PORTABILITY_TEST_MODE=true` and the global enable flag false. Focused
authenticated authorization/config tests, affected-package vet and the Linux
release's full race-test/vet build passed. The live process has the intended
client, secret and callback loaded, and readiness is healthy. No real Google
consent, export or clip generation from an exported file has been completed.

The Cloud app is **External / Testing**, with homepage, privacy and terms URLs
saved. Verification Center confirms that public verification is not required
while in Testing. One owner account, identified through its signed-in YouTube
Studio channel, has been added to Google's test-user list. Its channel contains
an unlisted video suitable for a controlled test; actual account consent has
not been granted. Keep the account's personal address in the private setup
record rather than this repository document.

The billing page still shows no linked billing account. A separate signup tab
is at its final “Start free” step with an existing payment profile; only the
owner may complete this financial-account setup. The signed-in administrator
cannot currently manage an existing billing account. The owner must complete
setup or have a billing administrator link an account before real Data
Portability API requests. No payment setup or financial commitment has been
made by this implementation.

Update 2026-11-20: production now runs with `YOUTUBE_PORTABILITY_ENABLED=true`
and `YOUTUBE_PORTABILITY_TEST_MODE=true` (owner-approved). The backend is
healthy and the import routes respond. With the owner's approval, the
`sneepcut.com` billing account (free trial) is linked to
`sneepcut-youtube-import`, and the Data Portability API shows as enabled. A real
consent/export test is still pending.

For the controlled real test, use `YOUTUBE_PORTABILITY_ENABLED=true` with
`YOUTUBE_PORTABILITY_TEST_MODE=true`. New import access is limited to Sneep Cut
admins, and Google separately requires an explicitly listed test account. Leave
the global switch false until those prerequisites are ready. After public
verification, remove the app-role restriction with `TEST_MODE=false`.

## Application information

| Field | Prepared value |
| --- | --- |
| Google Cloud project | `sneepcut-youtube-import` |
| Organization | `sneepcut.com` |
| OAuth application name | Sneep Cut YouTube Import |
| Homepage | https://sneepcut.com |
| Privacy policy | https://sneepcut.com/privacy |
| Terms | https://sneepcut.com/terms |
| User support email | support@sneepcut.com |
| Developer contact | admin@sneepcut.com |
| Web OAuth redirect | `https://sneepcut.com/v1/youtube/import/callback` |

Keep this Cloud project separate from Google sign-in and YouTube publishing.
Do not add identity scopes or publishing permissions to its import consent.
Store the generated client secret only in the server's private environment;
never commit it, put it into frontend build arguments, or include it in a demo.

## Proposed use case for the verification form

Sneep Cut allows creators to transfer a copy of videos they have uploaded to
their own YouTube account into their Sneep Cut workspace. The user starts the
transfer explicitly in Create clips, chooses which visibility categories to
include, reads an import and AI-processing disclosure, and grants access through
Google's consent screen. Public videos are selected initially; unlisted and
private categories require an additional choice by the user.

After Google prepares the export, Sneep Cut imports supported video files into
the user's owned media storage. The user chooses an imported video and requests
short clips, vertical reframing and subtitles. The imported source is processed
only to provide the requested creator-facing features. The application contains
no model-training workflow. Before submission, verify the configured AI
providers' data-use and retention settings against Google's limited-use rules.

Users can stop copying, revoke access through Google, remove imported library
videos, or delete their Sneep Cut account. Existing projects retain their source
until those projects' retention controls or account deletion remove it. Encrypted
authorization credentials are retained only for the transfer and necessary
authorization cleanup, then erased. Account deletion erases locally stored
credentials immediately and fences background work. Temporary archives are
removed after each normal processing attempt; downloaded archive URLs and OAuth
tokens are not exposed to the browser or account exports.

## Scope justifications

The owner explicitly approved all three categories, which are registered in
the dedicated project. Keep the app's choices consistent with these scopes.

| Scope suffix after `dataportability.youtube.` | Purpose | Google category |
| --- | --- | --- |
| `public_videos` | Transfer the creator's own public video files and metadata for clip generation. | Sensitive |
| `unlisted_videos` | Optional transfer of the creator's own unlisted files, used when a creator keeps long source recordings unlisted. | Sensitive |
| `private_videos` | Optional transfer of the creator's own private source recordings after an explicit private-video choice. | Restricted |

Google lists private-video access as restricted. Review the assessment
requirements before committing to that scope's public launch. Registering scopes
does not itself grant access to anyone's videos; each user must consent.

## Real demonstration to prepare

Use an eligible test account that owns the demonstrated uploads. The account
used to administer Google Cloud need not be the YouTube account being imported.

1. Show Sneep Cut's public homepage, privacy policy and the signed-in Create
   clips → YouTube → My YouTube videos screen.
2. Show the visibility choices and disclosure. Demonstrate the exact categories
   requested for verification, including explicit opt-in for non-public video.
3. Start the real OAuth flow. Show Google's app identity, the relevant scopes
   and consent choices. Keep passwords, authentication codes, client secrets and
   token values out of the recording.
4. Return to Sneep Cut and show the real pending export followed by its imported
   library. Google may take minutes or hours; an edited waiting interval should
   be explained rather than replaced with a synthetic success state.
5. Select an imported video and generate a short clip with the existing
   settings. Show the resulting playable clip and subtitles.
6. Show the stop-import and delete-video controls and Google account revocation
   instructions. Verify the account-deletion explanation in the privacy policy.

Google asks for an accessible demonstration link as part of verification.
Prepare the recording and review it for secrets and other people's data before
publishing or submitting it. No demonstration has been submitted by this setup.

## References

- [Data Portability overview and app verification](https://developers.google.com/data-portability)
- [Project and active billing prerequisites](https://developers.google.com/data-portability/user-guide/setup)
- [OAuth configuration and Testing grant lifetime](https://developers.google.com/data-portability/user-guide/configure-oauth)
- [Scope categories](https://developers.google.com/data-portability/user-guide/scopes)
- [Verification requirements](https://support.google.com/cloud/answer/13464321)
- [Demo video requirements](https://support.google.com/cloud/answer/13804565)
- [Data Portability data use policy](https://developers.google.com/data-portability/policy)
