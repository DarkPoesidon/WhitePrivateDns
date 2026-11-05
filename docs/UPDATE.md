# Update an existing Linux installation

Use `scripts/update.sh` for an existing systemd installation. The online
`scripts/install.sh` is a **fresh installer**: it archives and replaces the old
installation after a `FRESH` confirmation. It is not the update command.

The updater downloads the Linux binary and `version.json` from one exact tag,
checks the binary against that release's `checksums.txt`, and creates a verified
root-only backup before replacing either file. It keeps `config.json`,
`data.db`, `master.key`, certificates, and other installation files in place.
If the new service fails to start, it restores the pre-update archive and the
previous running or stopped state.

## Update from a published release

Replace the tag below with the published release you want to install. Run
these commands at the `root@my-vps` prompt. They need no Go toolchain
or repository checkout:

```bash
TAG='v2.2.0-beta.5'
curl -fsSLo /tmp/whiteprivatedns-update.sh \
  "https://raw.githubusercontent.com/DarkPoesidon/WhitePrivateDns/${TAG}/scripts/update.sh"
env WHITEPRIVATEDNS_REF="$TAG" \
  WHITEPRIVATEDNS_REPOSITORY='DarkPoesidon/WhitePrivateDns' \
  bash /tmp/whiteprivatedns-update.sh
```

If you are logged in as a non-root user with `sudo`, prefix only the final
`env ... bash` command with `sudo`.

The update does not prompt for `FRESH`. It needs a working `systemd` service
and `curl`, `sha256sum`, `tar`, and `mktemp` on a Linux amd64 or arm64 host.
An inactive service stays inactive. An active service is stopped for the backup
and started again after replacement, so expect a short DNS interruption.

The updater prints the backup archive path and its SHA-256 digest. Keep that
archive until you have checked the dashboard and DNS resolution. It contains
the configuration, database, master key, and certificates, so keep it private.

```bash
systemctl status whiteprivatedns --no-pager
/opt/whiteprivatedns/whiteprivatedns -version
```

If a later problem appears after the updater has reported success, stop the
service and restore the specific backup archive printed by the update. Replace
`/root/whiteprivatedns-update-XXXXXXXX.tar.gz` with that exact path:

```bash
systemctl stop whiteprivatedns
tar -xzf /root/whiteprivatedns-update-XXXXXXXX.tar.gz -C /opt
systemctl start whiteprivatedns
```

Use `sudo` for those status and rollback commands when logged in as a non-root
operator.

The archive contains the installation directory as a whole, including the
previous binary and version file. Restoring it also restores data to the time
of the backup, so do this only when you actually need to roll back.

## Mirrors and other repositories

`WHITEPRIVATEDNS_REPOSITORY=owner/repo` changes the GitHub repository.
`WHITEPRIVATEDNS_RELEASE_BASE` and `WHITEPRIVATEDNS_RAW_BASE` can point to
HTTPS mirrors with the same release asset and source tree layout. Always set
`WHITEPRIVATEDNS_REF` to the exact tag of the binary and version file. The
updater rejects a checksum, binary version, or metadata version mismatch before
stopping the service.

## Updating from the dashboard

The daemon checks GitHub Releases for a newer version at start-up and every six
hours. When one exists, a banner appears at the top of the dashboard with the
version change and a link to the release notes. A stable install is only offered
stable releases; a beta install is offered betas too.

Press **Update now**, enter your current password (and a 2FA code if 2FA is on)
and the daemon:

1. downloads `whiteprivatedns-update.sh` for that exact release and refuses it
   unless its SHA-256 matches the release's `checksums.txt`;
2. starts it as a separate systemd unit (`whiteprivatedns-update`), so it
   survives the service restart;
3. the script then backs up `/opt/whiteprivatedns`, replaces the binary, restarts
   the service and rolls back automatically if the new version fails its health
   check.

The panel reloads to the login page when the service is back. If something goes
wrong, read the updater's log with `journalctl -u whiteprivatedns-update`.

Self-update works only for the standard install: Linux, systemd, running as root,
binary at `/opt/whiteprivatedns/whiteprivatedns`. Docker and other layouts still
get the notification, and the button explains why it cannot proceed.

Environment variables for the service:

| Variable | Effect |
| :--- | :--- |
| `WHITEPRIVATEDNS_UPDATE_CHECK=0` | Disable the GitHub check and the banner. |
| `WHITEPRIVATEDNS_REPOSITORY=owner/repo` | Check a fork instead of the default repository. |

The check sends one request to `api.github.com` and nothing about your install.
