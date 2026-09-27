#!/usr/bin/env bash
# Update an existing Linux WhitePrivateDns service without running the fresh installer.
# The release tag is mandatory so a script fetched from one release cannot silently
# install a binary or version file from a different, moving release.
set -Eeuo pipefail
umask 077

die() { printf 'Error: %s\n' "$*" >&2; exit 1; }
info() { printf '%s\n' "$*"; }

TEST_MODE="${WHITEPRIVATEDNS_TEST_MODE:-0}"
if [[ "$TEST_MODE" != '1' ]]; then
    [[ "${EUID}" -eq 0 ]] || die 'Run as root (or use sudo).'
fi
for command in curl sha256sum tar mktemp systemctl install; do
    command -v "$command" >/dev/null 2>&1 || die "Required command missing: $command"
done

INSTALL_DIR="${WHITEPRIVATEDNS_INSTALL_DIR:-/opt/whiteprivatedns}"
BACKUP_DIR="${WHITEPRIVATEDNS_BACKUP_DIR:-/root}"
SERVICE='whiteprivatedns'
if [[ "$TEST_MODE" == '1' ]]; then
    # Tests run with disposable paths and a fake service, including on Git Bash.
    # The physical root must be a direct child of /tmp with our test prefix.
    # An explicit, exact child layout prevents this mode from targeting /opt
    # or the production service even if the invoking process is privileged.
    TEST_ROOT="${WHITEPRIVATEDNS_TEST_ROOT:-}"
    [[ -n "$TEST_ROOT" && -d "$TEST_ROOT" && ! -L "$TEST_ROOT" ]] || die 'Test mode requires a disposable test root.'
    TEST_ROOT="$(cd "$TEST_ROOT" && pwd -P)"
    TMP_ROOT="$(cd /tmp && pwd -P)"
    [[ "$TEST_ROOT" == "$TMP_ROOT"/wpdns-update-test-* && "$INSTALL_DIR" == "$TEST_ROOT/install" && "$BACKUP_DIR" == "$TEST_ROOT/backups" ]] || die 'Test mode requires the exact disposable /tmp install and backup paths.'
    SERVICE='whiteprivatedns-test'
fi
REF="${WHITEPRIVATEDNS_REF:-}"
REPOSITORY="${WHITEPRIVATEDNS_REPOSITORY:-DarkPoesidon/WhitePrivateDns}"
HEALTH_WAIT="${WHITEPRIVATEDNS_HEALTH_WAIT_SECONDS:-5}"

[[ "$INSTALL_DIR" == /* && "$INSTALL_DIR" != '/' && "$INSTALL_DIR" != *'/../'* && "$INSTALL_DIR" != */.. && "$INSTALL_DIR" != *'/./'* ]] || die 'Install directory must be an absolute, non-root path without parent traversal.'
[[ "$BACKUP_DIR" == /* && -d "$BACKUP_DIR" && ! -L "$BACKUP_DIR" ]] || die 'Backup directory must be an existing, real absolute directory.'
[[ "$REF" =~ ^v[0-9]+\.[0-9]+\.[0-9]+(-[A-Za-z0-9][A-Za-z0-9.-]*)?$ ]] || die 'Set WHITEPRIVATEDNS_REF to an exact release tag, such as v2.2.0-beta.4.'
[[ "$REPOSITORY" =~ ^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$ ]] || die 'WHITEPRIVATEDNS_REPOSITORY must be owner/repository.'
[[ "$HEALTH_WAIT" =~ ^[0-9]+$ ]] || die 'WHITEPRIVATEDNS_HEALTH_WAIT_SECONDS must be an integer.'
[[ -d "$INSTALL_DIR" && ! -L "$INSTALL_DIR" && -x "$INSTALL_DIR/whiteprivatedns" && ! -L "$INSTALL_DIR/whiteprivatedns" && -f "$INSTALL_DIR/config.json" ]] || die "No complete WhitePrivateDns installation at $INSTALL_DIR."
[[ ! -L "$INSTALL_DIR/version.json" ]] || die 'Refusing to replace a symlinked version.json.'
for state_path in config.json data.db master.key data.db-wal data.db-shm certs; do
    [[ ! -L "$INSTALL_DIR/$state_path" ]] || die "Refusing to back up symlinked state path: $state_path"
done
[[ "$(systemctl show "$SERVICE" --property=LoadState --value 2>/dev/null)" == 'loaded' ]] || die 'whiteprivatedns.service is not loaded by systemd.'

case "$(uname -m)" in
    x86_64|amd64) ARCH='amd64' ;;
    aarch64|arm64) ARCH='arm64' ;;
    *) die "Unsupported Linux architecture: $(uname -m)" ;;
esac
if [[ "$TEST_MODE" != '1' ]]; then
    [[ "$(uname -s)" == 'Linux' ]] || die 'This updater supports Linux systemd installations only.'
fi

RELEASE_BASE="${WHITEPRIVATEDNS_RELEASE_BASE:-https://github.com/${REPOSITORY}/releases/download/${REF}}"
RAW_BASE="${WHITEPRIVATEDNS_RAW_BASE:-https://raw.githubusercontent.com/${REPOSITORY}/${REF}}"
[[ "$RELEASE_BASE" == https://* && "$RAW_BASE" == https://* ]] || die 'Download base URLs must use HTTPS.'
RELEASE_BASE="${RELEASE_BASE%/}"
RAW_BASE="${RAW_BASE%/}"
ASSET="whiteprivatedns-linux-${ARCH}"

DOWNLOAD_DIR="$(mktemp -d /tmp/whiteprivatedns-update.XXXXXXXX)"
STAGE_DIR=''
BACKUP_ARCHIVE=''
BACKUP_READY=0
WAS_ACTIVE=0
SERVICE_TOUCHED=0
CHANGED=0
HAD_VERSION=0
if [[ -e "$INSTALL_DIR/version.json" ]]; then HAD_VERSION=1; fi
if systemctl is-active --quiet "$SERVICE"; then WAS_ACTIVE=1; fi

cleanup() {
    local code=$? rollback_ok=1
    trap - EXIT INT TERM
    set +e
    if (( code != 0 && CHANGED && BACKUP_READY )); then
        info 'Update failed; restoring the pre-update installation from the verified backup.' >&2
        systemctl stop "$SERVICE" >/dev/null 2>&1 || true
        if (( HAD_VERSION == 0 )); then rm -f -- "$INSTALL_DIR/version.json"; fi
        if ! tar -xzf "$BACKUP_ARCHIVE" -C "$(dirname "$INSTALL_DIR")"; then
            rollback_ok=0
            # The archive remains on disk. Recover the executable and version
            # from the staged copies when extraction itself is unavailable.
            if [[ -f "$STAGE_DIR/old-binary" ]]; then
                cp -p -- "$STAGE_DIR/old-binary" "$INSTALL_DIR/whiteprivatedns" || true
            fi
            if (( HAD_VERSION )) && [[ -f "$STAGE_DIR/old-version.json" ]]; then
                cp -p -- "$STAGE_DIR/old-version.json" "$INSTALL_DIR/version.json" || true
            fi
            printf 'Automatic data rollback failed. Keep the service stopped and restore %s manually.\n' "$BACKUP_ARCHIVE" >&2
        fi
    fi
    if (( code != 0 && SERVICE_TOUCHED && WAS_ACTIVE && rollback_ok )); then
        if ! systemctl start "$SERVICE"; then
            printf 'The previous service could not restart. Backup: %s\n' "$BACKUP_ARCHIVE" >&2
        fi
    fi
    if [[ -n "$STAGE_DIR" ]]; then
        rm -f -- "$STAGE_DIR/next-binary" "$STAGE_DIR/next-version.json" "$STAGE_DIR/old-binary" "$STAGE_DIR/old-version.json"
        rmdir -- "$STAGE_DIR" 2>/dev/null || true
    fi
    rm -f -- "$DOWNLOAD_DIR/binary" "$DOWNLOAD_DIR/checksums.txt" "$DOWNLOAD_DIR/version.json"
    rmdir -- "$DOWNLOAD_DIR" 2>/dev/null || true
    exit "$code"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

info "Downloading $REF for Linux $ARCH..."
curl -fsSL --proto '=https' --proto-redir '=https' --retry 3 --connect-timeout 10 --max-time 120 \
    "${RELEASE_BASE}/${ASSET}" -o "$DOWNLOAD_DIR/binary" || die 'Binary download failed. Existing installation was not touched.'
curl -fsSL --proto '=https' --proto-redir '=https' --retry 3 --connect-timeout 10 --max-time 120 \
    "${RELEASE_BASE}/checksums.txt" -o "$DOWNLOAD_DIR/checksums.txt" || die 'Checksum download failed. Existing installation was not touched.'
curl -fsSL --proto '=https' --proto-redir '=https' --retry 3 --connect-timeout 10 --max-time 120 \
    "${RAW_BASE}/offline-bundle/version.json" -o "$DOWNLOAD_DIR/version.json" || die 'Version metadata download failed. Existing installation was not touched.'

EXPECTED_SHA="$(awk -v name="$ASSET" '$2 == name { print $1 }' "$DOWNLOAD_DIR/checksums.txt")"
ACTUAL_SHA="$(sha256sum "$DOWNLOAD_DIR/binary" | awk '{ print $1 }')"
[[ "$EXPECTED_SHA" =~ ^[A-Fa-f0-9]{64}$ && "${EXPECTED_SHA,,}" == "${ACTUAL_SHA,,}" ]] || die 'Binary SHA-256 mismatch. Existing installation was not touched.'
chmod 0700 "$DOWNLOAD_DIR/binary"
VERSION_OUTPUT="$("$DOWNLOAD_DIR/binary" -version)" || die 'Downloaded binary failed its version check.'
[[ "$VERSION_OUTPUT" == "WhitePrivateDns $REF (hash:"* ]] || die "Downloaded binary reports '$VERSION_OUTPUT', expected $REF."
META_VERSION="$(sed -n 's/.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$DOWNLOAD_DIR/version.json" | head -n 1)"
META_CHANNEL="$(sed -n 's/.*"channel"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$DOWNLOAD_DIR/version.json" | head -n 1)"
META_CODENAME="$(sed -n 's/.*"codename"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$DOWNLOAD_DIR/version.json" | head -n 1)"
[[ "$META_VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ && "$META_CHANNEL" =~ ^[A-Za-z0-9.-]*$ && "$META_CODENAME" =~ ^[A-Za-z0-9_-]*$ ]] || die 'Invalid version metadata.'
META_REF="v${META_VERSION}"
if [[ -n "$META_CHANNEL" ]]; then META_REF="${META_REF}-${META_CHANNEL}"; fi
[[ "$META_REF" == "$REF" ]] || die "Version metadata reports $META_REF, expected $REF."
META_HASH="$(printf '{"channel":"%s","codename":"%s","version":"%s"}' "$META_CHANNEL" "$META_CODENAME" "$META_VERSION" | sha256sum | cut -c 1-8)"
[[ "$VERSION_OUTPUT" == *"(hash:${META_HASH})"* ]] || die 'Version metadata hash does not match the binary.'
info "Verified release binary SHA-256: $ACTUAL_SHA"

# Stop before creating the archive so SQLite state and related files are a
# consistent snapshot. An initially inactive service remains inactive.
if (( WAS_ACTIVE )); then
    SERVICE_TOUCHED=1
    systemctl stop "$SERVICE" || die 'Could not stop the service; no files were replaced.'
    if systemctl is-active --quiet "$SERVICE"; then
        die 'Service remained active after stop; no files were replaced.'
    fi
fi
BACKUP_ARCHIVE="$(mktemp "$BACKUP_DIR/whiteprivatedns-update-XXXXXXXX.tar.gz")"
tar -C "$(dirname "$INSTALL_DIR")" -czf "$BACKUP_ARCHIVE" -- "$(basename "$INSTALL_DIR")" || die 'Backup failed; no files were replaced.'
tar -tzf "$BACKUP_ARCHIVE" >/dev/null || die 'Backup verification failed; no files were replaced.'
BACKUP_READY=1
info "Backup: $BACKUP_ARCHIVE"
info "Backup SHA-256: $(sha256sum "$BACKUP_ARCHIVE" | awk '{ print $1 }')"

# Stage on the installation filesystem. mv is atomic for each file there.
STAGE_DIR="$(mktemp -d "$INSTALL_DIR/.update.XXXXXXXX")"
cp -p -- "$INSTALL_DIR/whiteprivatedns" "$STAGE_DIR/old-binary"
if (( HAD_VERSION )); then cp -p -- "$INSTALL_DIR/version.json" "$STAGE_DIR/old-version.json"; fi
install -m 0755 "$DOWNLOAD_DIR/binary" "$STAGE_DIR/next-binary"
install -m 0644 "$DOWNLOAD_DIR/version.json" "$STAGE_DIR/next-version.json"
CHANGED=1
mv -f -- "$STAGE_DIR/next-binary" "$INSTALL_DIR/whiteprivatedns"
mv -f -- "$STAGE_DIR/next-version.json" "$INSTALL_DIR/version.json"

if (( WAS_ACTIVE )); then
    systemctl start "$SERVICE" || die 'New service failed to start.'
    sleep "$HEALTH_WAIT"
    systemctl is-active --quiet "$SERVICE" || die 'New service did not remain active after restart.'
fi
CHANGED=0
info "Updated WhitePrivateDns to $REF. Configuration, database, key, and certificates were kept in place."
if (( WAS_ACTIVE == 0 )); then info 'Service was inactive before the update and remains inactive.'; fi
info "Retain this backup until you have verified the dashboard: $BACKUP_ARCHIVE"
