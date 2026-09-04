# Backend runtime isolation and upload scanning

Implementation in progress under CF041 and CF044. Do not treat this document
as production acceptance or a completed security audit.

## Verification so far

- 168 backend tests passed, including PostgreSQL and actual FFmpeg rendering.
- API image built successfully; all routes import without Torch/OpenCV/Whisper
  in a network-isolated, read-only container running as UID 10001.
- Actual ClamAV daemon started with the supplied configuration. The application
  INSTREAM client accepted a clean synthetic fixture and rejected the standard
  harmless EICAR antivirus test fixture. Test containers had no user-media mounts.
- Compose configuration validates. Production deployment, complete role policy,
  and live ML inference remain separate acceptance checks, not implied by these tests.
- Separate ML image also built successfully. Torch CPU, OpenCV, Whisper and the
  actual processing pipeline import under the same non-root/read-only/no-network
  restrictions. No model downloads or paid inference were used for that check.

## Runtime boundary

The API and dispatcher use the Dockerfile `api` target, which installs only
`requirements-api.txt`. The Celery worker uses the `ml` target and adds FFmpeg,
Whisper, Torch and tracking dependencies. Existing queue payloads and task names
are unchanged, so generation, trimming and recutting remain asynchronous.
Both images run as UID/GID 10001, without Linux capabilities or privilege
escalation. The worker has configurable CPU/memory and bounded process limits.

Existing media volumes may be root-owned. Before rollout, drain workers, back up
the specific media volume and arrange ownership for UID/GID 10001. Do not start
the new workers against an unwritable volume, and do not recursively change
ownership of an unrelated host directory. No existing volume was modified by
the implementation or image-build tests.

## Upload policy

Video uploads are written to exclusive hidden `.part` files, flushed, scanned,
and atomically renamed only after a clean verdict. Logo uploads are scanned in
their temporary location before image parsing and storage. Rejected files are
removed. Development/test can explicitly disable scanning; every other
`APP_ENV`, including production, requires it regardless of the enable flag.

Start the private scanner with the Compose `security` profile, or configure an
equivalent private ClamAV endpoint with CLAMAV_HOST/CLAMAV_PORT. Never publish
3310 publicly. Production upload requests return 503 while it is unavailable;
infected or limit-exceeded results return 422. Existing stored files are not
retroactively certified. Enable UPLOAD_SCANNER_ENABLED locally for integration
testing. Keep the signature database current and monitor scanner health.

The supplied configuration enables AlertExceedsMax so incomplete scans cannot
return an accepted clean verdict. ClamAV has an internal 2 GiB file-size limit;
boundary-size or complex files that exceed scanner limits are rejected, not
silently bypassed. A clean antivirus verdict is not proof that arbitrary media
decoders are safe; runtime isolation and resource bounds remain necessary.

References: [ClamAV protocol](https://docs.clamav.net/manual/Usage/ClamdProtocol.html),
[container configuration](https://docs.clamav.net/manual/Installing/Docker.html),
[scan limits](https://github.com/Cisco-Talos/clamav/blob/main/etc/clamd.conf.sample),
[Docker security](https://docs.docker.com/engine/security/).
