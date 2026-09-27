#!/usr/bin/env python3
"""Disposable updater smoke tests; no real service, network, or /opt writes.

Run with ``python tests/scripts/test_update.py``. On Windows, Git Bash is used.
The updater's test mode requires explicit temporary install/backup paths and
selects a fake service name; all systemctl and curl calls are local stubs.
"""

import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tarfile
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / "scripts" / "update.sh"


def bash_executable():
    if os.name == "nt":
        candidate = Path(r"C:\Program Files\Git\bin\bash.exe")
        return str(candidate) if candidate.exists() else None
    return shutil.which("bash")


def posix_path(path):
    path = Path(path)
    if os.name != "nt":
        return str(path)
    try:
        relative_temp = path.relative_to(Path(tempfile.gettempdir()))
    except ValueError:
        pass
    else:
        return "/tmp/" + relative_temp.as_posix()
    drive, tail = os.path.splitdrive(str(path))
    return f"/{drive[0].lower()}{tail.replace(chr(92), '/')}"


@unittest.skipUnless(bash_executable(), "Bash or Git Bash is required")
class UpdateTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="wpdns-update-test-")
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.install = self.root / "install"
        self.install.mkdir()
        self.backups = self.root / "backups"
        self.backups.mkdir()
        self.release = self.root / "release"
        self.release.mkdir()
        self.stubs = self.root / "stubs"
        self.stubs.mkdir()
        self.state = self.root / "state"
        self.state.mkdir()
        (self.install / "certs").mkdir()
        (self.install / "certs" / "panel.crt").write_bytes(b"original certificate")
        (self.install / "config.json").write_bytes(b'{"admin_password":"private"}\n')
        (self.install / "data.db").write_bytes(b"original client database")
        (self.install / "master.key").write_bytes(b"original encryption key")
        (self.install / "version.json").write_text(json.dumps({"version": "2.2.0", "channel": "beta.3"}))
        self.old_binary = self._binary("beta.3", "12345678")
        (self.install / "whiteprivatedns").write_bytes(self.old_binary)
        (self.install / "whiteprivatedns").chmod(0o755)
        self.version_meta = {"version": "2.2.0", "channel": "beta.4", "codename": "WhitePrivateDns"}
        semantic = json.dumps({k: self.version_meta[k] for k in ("channel", "codename", "version")},
                              sort_keys=True, separators=(",", ":")).encode()
        self.new_binary = self._binary("beta.4", hashlib.sha256(semantic).hexdigest()[:8])
        (self.release / "binary").write_bytes(self.new_binary)
        self._write_checksums()
        (self.release / "version.json").write_text(json.dumps(self.version_meta))
        self._write_stubs()

    @staticmethod
    def _binary(channel, version_hash):
        return ("#!/usr/bin/env bash\n"
                "if [[ \"${1:-}\" == '-version' ]]; then\n"
                f"  echo 'WhitePrivateDns v2.2.0-{channel} (hash:{version_hash})'\n"
                "  exit 0\n"
                "fi\n"
                "exit 0\n").encode()

    def _write_checksums(self):
        digest = hashlib.sha256((self.release / "binary").read_bytes()).hexdigest()
        (self.release / "checksums.txt").write_text(f"{digest}  whiteprivatedns-linux-amd64\n")

    def _write_stubs(self):
        curl = self.stubs / "curl"
        curl.write_text("""#!/usr/bin/env bash
set -e
url=''; out=''
while (($#)); do
    if [[ "$1" == '-o' ]]; then out="$2"; shift 2; continue; fi
    if [[ "$1" == https://* ]]; then url="$1"; fi
    shift
done
printf '%s\\n' "$url" >> "$FAKE_STATE_DIR/urls"
case "$url" in
    */whiteprivatedns-linux-amd64) cp "$FAKE_RELEASE_DIR/binary" "$out" ;;
    */checksums.txt) cp "$FAKE_RELEASE_DIR/checksums.txt" "$out" ;;
    */offline-bundle/version.json) cp "$FAKE_RELEASE_DIR/version.json" "$out" ;;
    *) exit 22 ;;
esac
""")
        ctl = self.stubs / "systemctl"
        ctl.write_text("""#!/usr/bin/env bash
set -e
printf '%s\\n' "$*" >> "$FAKE_STATE_DIR/calls"
case "$*" in
    'show whiteprivatedns-test --property=LoadState --value') echo loaded ;;
    'is-active --quiet whiteprivatedns-test')
        if [[ -f "$FAKE_STATE_DIR/health-fail" && -f "$FAKE_STATE_DIR/started-new" && ! -f "$FAKE_STATE_DIR/health-failed" ]]; then
            touch "$FAKE_STATE_DIR/health-failed"
            rm -f "$FAKE_STATE_DIR/active"
            exit 3
        fi
        test -f "$FAKE_STATE_DIR/active" ;;
    'stop whiteprivatedns-test') rm -f "$FAKE_STATE_DIR/active" ;;
    'start whiteprivatedns-test')
        if [[ -f "$FAKE_STATE_DIR/fail-new-start" ]]; then
            rm -f "$FAKE_STATE_DIR/fail-new-start"
            printf '%s' 'modified by failed new daemon' > "$FAKE_INSTALL_DIR/data.db"
            exit 1
        fi
        touch "$FAKE_STATE_DIR/active" "$FAKE_STATE_DIR/started-new" ;;
    *) exit 97 ;;
esac
""")
        curl.chmod(0o755)
        ctl.chmod(0o755)

    def run_update(self, active=True):
        if active:
            (self.state / "active").touch()
        else:
            (self.state / "active").unlink(missing_ok=True)
        env = dict(os.environ,
                   WHITEPRIVATEDNS_TEST_MODE="1",
                   WHITEPRIVATEDNS_TEST_ROOT=posix_path(self.root),
                   WHITEPRIVATEDNS_INSTALL_DIR=posix_path(self.install),
                   WHITEPRIVATEDNS_BACKUP_DIR=posix_path(self.backups),
                   WHITEPRIVATEDNS_REF="v2.2.0-beta.4",
                   WHITEPRIVATEDNS_RELEASE_BASE="https://fixture.invalid/releases/v2.2.0-beta.4",
                   WHITEPRIVATEDNS_RAW_BASE="https://fixture.invalid/source/v2.2.0-beta.4",
                   WHITEPRIVATEDNS_HEALTH_WAIT_SECONDS="0",
                   FAKE_STUBS=posix_path(self.stubs),
                   FAKE_RELEASE_DIR=posix_path(self.release),
                   FAKE_STATE_DIR=posix_path(self.state),
                   FAKE_INSTALL_DIR=posix_path(self.install),
                   FAKE_SCRIPT=posix_path(SCRIPT))
        return subprocess.run(
            [bash_executable(), "-c", 'PATH="$FAKE_STUBS:$PATH" exec bash "$FAKE_SCRIPT"'],
            cwd=ROOT, env=env, capture_output=True, text=True, timeout=30,
        )

    def assert_user_data_unchanged(self):
        self.assertEqual((self.install / "config.json").read_bytes(), b'{"admin_password":"private"}\n')
        self.assertEqual((self.install / "data.db").read_bytes(), b"original client database")
        self.assertEqual((self.install / "master.key").read_bytes(), b"original encryption key")
        self.assertEqual((self.install / "certs" / "panel.crt").read_bytes(), b"original certificate")

    def test_active_update_retains_data_and_verifiable_backup(self):
        result = self.run_update()
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertEqual((self.install / "whiteprivatedns").read_bytes(), self.new_binary)
        self.assertEqual(json.loads((self.install / "version.json").read_text())["channel"], "beta.4")
        self.assert_user_data_unchanged()
        self.assertTrue((self.state / "active").exists())
        calls = (self.state / "calls").read_text()
        self.assertIn("stop whiteprivatedns-test", calls)
        self.assertIn("start whiteprivatedns-test", calls)
        archives = list(self.backups.glob("whiteprivatedns-update-*.tar.gz"))
        self.assertEqual(len(archives), 1)
        with tarfile.open(archives[0], "r:gz") as archive:
            self.assertEqual(archive.extractfile("install/data.db").read(), b"original client database")
            self.assertEqual(archive.extractfile("install/whiteprivatedns").read(), self.old_binary)

    def test_inactive_service_stays_inactive(self):
        result = self.run_update(active=False)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertFalse((self.state / "active").exists())
        calls = (self.state / "calls").read_text()
        self.assertNotIn("stop whiteprivatedns-test", calls)
        self.assertNotIn("start whiteprivatedns-test", calls)
        self.assert_user_data_unchanged()

    def test_bad_checksum_never_stops_or_replaces_install(self):
        (self.release / "checksums.txt").write_text("0" * 64 + "  whiteprivatedns-linux-amd64\n")
        result = self.run_update()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("SHA-256 mismatch", result.stderr)
        self.assertEqual((self.install / "whiteprivatedns").read_bytes(), self.old_binary)
        self.assertEqual(json.loads((self.install / "version.json").read_text())["channel"], "beta.3")
        self.assert_user_data_unchanged()
        self.assertTrue((self.state / "active").exists())
        self.assertNotIn("stop whiteprivatedns-test", (self.state / "calls").read_text())

    def test_failed_start_restores_binary_version_and_database(self):
        (self.state / "fail-new-start").touch()
        result = self.run_update()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("restoring the pre-update installation", result.stderr)
        self.assertEqual((self.install / "whiteprivatedns").read_bytes(), self.old_binary)
        self.assertEqual(json.loads((self.install / "version.json").read_text())["channel"], "beta.3")
        self.assert_user_data_unchanged()
        self.assertTrue((self.state / "active").exists())
        self.assertEqual((self.state / "calls").read_text().count("start whiteprivatedns-test"), 2)

    def test_service_dies_during_health_check_rolls_back(self):
        (self.state / "health-fail").touch()
        result = self.run_update()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("did not remain active", result.stderr)
        self.assertEqual((self.install / "whiteprivatedns").read_bytes(), self.old_binary)
        self.assertEqual(json.loads((self.install / "version.json").read_text())["channel"], "beta.3")
        self.assert_user_data_unchanged()
        self.assertTrue((self.state / "active").exists())

    def test_wrong_version_metadata_rejected_before_stop(self):
        (self.release / "version.json").write_text(json.dumps({"version": "2.2.0", "channel": "beta.99"}))
        result = self.run_update()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("Version metadata reports", result.stderr)
        self.assertTrue((self.state / "active").exists())
        self.assertEqual((self.install / "whiteprivatedns").read_bytes(), self.old_binary)
        self.assertNotIn("stop whiteprivatedns-test", (self.state / "calls").read_text())

    def test_metadata_hash_mismatch_rejected_before_stop(self):
        wrong = dict(self.version_meta, codename="WrongName")
        (self.release / "version.json").write_text(json.dumps(wrong))
        result = self.run_update()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("metadata hash does not match", result.stderr)
        self.assertEqual((self.install / "whiteprivatedns").read_bytes(), self.old_binary)
        self.assertTrue((self.state / "active").exists())
        self.assertNotIn("stop whiteprivatedns-test", (self.state / "calls").read_text())


if __name__ == "__main__":
    unittest.main()
