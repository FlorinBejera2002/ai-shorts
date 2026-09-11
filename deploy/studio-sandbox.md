# Studio execution policy

Studio runs unprivileged (UID 1000) on a separate Docker network, without the
Docker socket or application secrets. Its only persistent volume is Studio
project storage. Application files are read-only. The service has CPU, memory,
PID, shared-memory and temporary-storage limits.

Rendering, thumbnails and background removal execute in per-job Bubblewrap
namespaces. Each job receives a bounded copy of one project, read-only runtime
files, a cleared environment and no network interface other than loopback.
There are at most two concurrent jobs. CPU/file limits and wall-clock timeout
apply, and outputs must be regular files rather than symlinks.

`studio-seccomp.json` is a snapshot of the official Moby default seccomp profile
(https://github.com/moby/profiles/blob/main/seccomp/default.json), retrieved on
2026-09-11, with an additional allow rule for `clone`, `unshare`, `mount`,
`umount2`, `pivot_root`, `setns`, `sethostname` and `setdomainname`. These calls
are required to construct nested unprivileged namespaces; kernel capability
checks still apply. The inherited default-deny policy remains active for other
syscalls. The upstream license is retained in `studio-seccomp.LICENSE`.

Docker's default AppArmor policy disallows the nested mounts, so this service
uses `apparmor=unconfined`; it retains seccomp, all capabilities dropped and
no-new-privileges. Other application services keep their existing policies.
`systempaths=unconfined` allows Bubblewrap to mount a fresh `/proc` for each
private PID namespace. Docker's masked proc paths otherwise prevent that mount.
The outer container consequently does not use Docker's default masked/read-only
system-path list; it remains unprivileged with a read-only root filesystem.
Moby applies these defaults in
https://github.com/moby/moby/blob/master/daemon/pkg/oci/defaults.go;
the nested rootless proc-mount restriction is documented in
https://github.com/opencontainers/runc/issues/1658.
The outer container can read more system metadata; Unix ownership and capability
checks still prevent privileged writes. It does not share the host PID namespace.
The host must permit unprivileged user namespaces. Studio must not fall back
to an in-process renderer when namespace creation fails.

This is Linux process/container isolation, not a separate VM per tenant.
Persistent project/export storage is retained across releases; it is not part
of the per-job temporary-storage quota and needs normal capacity monitoring
and backups.
