# Automatic YouTube import tokens

The worker supports bgutil's HTTP PO token provider 2.0.2. Its plugin archive
is checksum-pinned in `backend/Dockerfile`; the production Compose service is
image-digest-pinned and has no host-published port. The provider generates and
refreshes playback tokens without exporting a Google account session.

Set `YOUTUBE_TOKEN_PROVIDER_URL=http://youtube-pot-provider:4416` in the worker.
Production Compose supplies this default. For a native worker, configure a
reachable provider explicitly and install the plugin in `/opt/yt-dlp/plugins`.
The downloader uses the `mweb,tv,web_safari` clients in token mode. Account
cookie files are not opened or copied in this mode, including expired exports.
An empty URL preserves the existing optional cookie-based downloader.

Build the updated worker and start the provider before activating the worker.
Production uses `docker-compose.production.yml` and `.env.production.local`,
not the development Compose stack. Follow the production deployment procedure;
do not activate a configuration solely because the provider healthcheck passes.

## Acceptance and limitation

Test a real media fragment, not just metadata or the plugin presence. Verbose
yt-dlp output must show a token-generation request to establish that the token
flow was exercised. Do not print account cookies or token values in reports.

On 2026-11-09 an isolated test used the production worker image, the pinned
plugin and provider 2.0.2, without account cookies, for:
`https://www.youtube.com/live/_6f6RnHmde0?si=BqS1jHBaAqByS8Mo`.
The plugin loaded, but YouTube rejected the player request with
"Sign in to confirm you're not a bot" before requesting a PO token. No video
was downloaded and no production job, media or credits were created. The
temporary containers and plugin directory were removed.

A separate direct call to the provider's `/get_pot` endpoint with this video ID
returned HTTP 200 and a generated token with an expiration time. Token values
were not printed. This verifies automatic generation independently of the
YouTube player request, which remains blocked.

This is a failed end-to-end acceptance test. PO tokens do not resolve IP-based
login restrictions. Do not report cookie-free import as working on this host.
The remaining requirement is a YouTube-accepted network/session; no proxy
service is provisioned or purchased by this change. Retrying the same rejected
request indefinitely is not a recovery mechanism.

## Proxy provisioning and activation

Save an authorized HTTP(S) proxy URL in `YOUTUBE_PROXY` in the private production
environment file. Both Compose stacks explicitly forward it to the worker.
The bgutil HTTP plugin passes the selected request proxy to the token provider,
while calls to the internal provider itself bypass that proxy. This keeps token
generation and media requests on the selected outbound connection.

Do not put proxy credentials in this repository, chat, diagnostic output or
browser-visible job errors. Downloader failures through a proxy use a generic
error because upstream diagnostics may include the authenticated proxy URL.

Before activating services, use disposable containers and temporary files to
verify metadata and a playable media fragment for the requested YouTube link
with the proxy, automatic provider, and no account cookies. A proxy subscription
alone does not prove that its addresses can access YouTube. Record acceptance
before deploying; retain the existing worker for recovery.

No outbound proxy credentials were present in the known local or production
application configuration during provisioning checks. The server has working
IPv6 connectivity to YouTube, but a separate cookie-free yt-dlp test of the
same video over IPv6 also failed with the login/bot-check response. The owner
declined additional costs; no proxy subscription was created and no production
proxy configuration was activated. A real proxy/media acceptance test remains
blocked until an authorized, usable endpoint is available.

Upstream setup and limitations:
https://github.com/Brainicism/bgutil-ytdlp-pot-provider#verification
https://github.com/yt-dlp/yt-dlp/wiki/PO-Token-Guide
