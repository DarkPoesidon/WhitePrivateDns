# Install WhitePrivateDns

The `v2.2.0-beta.1` release includes Linux amd64/arm64, Windows amd64, and macOS amd64/arm64 binaries. None of the release paths below require Go or an existing source checkout. The [Persian guide](INSTALL.fa.md) has the same commands.

## Linux server with systemd

Run as `root`. The installer configures DNS, the dashboard, firewall rules and the `whiteprivatedns` systemd service. Before starting, point the panel domain's A record to this server and allow inbound port 80 for certificate issuance.

On Debian 11+ or Ubuntu 20.04+:

```bash
apt-get update && apt-get install -y ca-certificates curl openssl
```

On RHEL, AlmaLinux, Rocky Linux or CentOS 8+ with working package repositories:

```bash
dnf install -y ca-certificates curl openssl
```

Then run these commands from **any directory**:

```bash
curl -fsSLo /tmp/whiteprivatedns-install.sh https://raw.githubusercontent.com/DarkPoesidon/WhitePrivateDns/v2.2.0-beta.1/scripts/install.sh
env WHITEPRIVATEDNS_REPOSITORY=DarkPoesidon/WhitePrivateDns WHITEPRIVATEDNS_REF=v2.2.0-beta.1 bash /tmp/whiteprivatedns-install.sh
```

The installer detects amd64 or arm64, downloads the matching binary, checks its SHA-256 against the release manifest and installs the companion restore and uninstall scripts. It asks for the panel domain and ACME email. Keep the printed admin password and private panel path. **Rerunning the installer replaces an existing installation** after archiving it; read the confirmation before entering `FRESH`.

If GitHub downloads are inaccessible from the server, download `whiteprivatedns-offline-bundle.tar.gz` from the [release](https://github.com/DarkPoesidon/WhitePrivateDns/releases/tag/v2.2.0-beta.1) on another machine, transfer it to the server, and run:

```bash
mkdir -p /root/whiteprivatedns-bundle
tar -xzf whiteprivatedns-offline-bundle.tar.gz -C /root/whiteprivatedns-bundle
cd /root/whiteprivatedns-bundle
bash install.sh
```

The offline bundle contains the Linux amd64 binary. On Linux arm64, use the online installer or transfer the separate `whiteprivatedns-linux-arm64` release asset and follow the source installer instructions.

## Windows amd64 portable run

Open PowerShell. This is a **local evaluation** using DNS port 15353 and a dashboard bound to `127.0.0.1:8080`; it does not install a Windows service or expose a public resolver.

```powershell
$folder = Join-Path $HOME 'WhitePrivateDns'
New-Item -ItemType Directory -Force -Path $folder | Out-Null
$base = 'https://github.com/DarkPoesidon/WhitePrivateDns/releases/download/v2.2.0-beta.1'
$binary = Join-Path $folder 'whiteprivatedns-windows-amd64.exe'
Invoke-WebRequest -UseBasicParsing "$base/whiteprivatedns-windows-amd64.exe" -OutFile $binary
$manifest = (Invoke-WebRequest -UseBasicParsing "$base/checksums.txt").Content
$line = $manifest -split "`n" | Where-Object { $_ -match '\swhiteprivatedns-windows-amd64\.exe\s*$' } | Select-Object -First 1
if (-not $line) { throw 'Release checksum is missing' }
$expected = ($line.Trim() -split '\s+')[0]
if ((Get-FileHash -Algorithm SHA256 $binary).Hash -ne $expected) { throw 'Binary checksum mismatch' }
Set-Location $folder
'{"server":{"bind_host":"127.0.0.1"},"dns":{"port":15353,"dot_port":1853,"doh_port":18443},"sniproxy":{"enabled":false}}' | Set-Content -Encoding ascii portable.json
& $binary -version
& $binary -server -config .\portable.json
```

The first run prints a generated admin password and private dashboard path. Keep the PowerShell window open while testing. The Linux `wpdns` control socket and systemd management are unavailable on Windows.

## macOS amd64 or arm64 portable run

Open Terminal. This also runs locally on DNS port 15353 and binds the dashboard to `127.0.0.1:8080`.

```bash
set -euo pipefail
case "$(uname -m)" in
  arm64) arch=arm64 ;;
  x86_64) arch=amd64 ;;
  *) echo 'Unsupported macOS architecture' >&2; exit 1 ;;
esac
mkdir -p "$HOME/WhitePrivateDns"
cd "$HOME/WhitePrivateDns"
asset="whiteprivatedns-darwin-$arch"
base='https://github.com/DarkPoesidon/WhitePrivateDns/releases/download/v2.2.0-beta.1'
curl -fL --retry 3 "$base/$asset" -o "$asset"
curl -fL --retry 3 "$base/checksums.txt" -o checksums.txt
grep " $asset\$" checksums.txt | shasum -a 256 -c -
chmod 700 "$asset"
printf '%s\n' '{"server":{"bind_host":"127.0.0.1"},"dns":{"port":15353,"dot_port":1853,"doh_port":18443},"sniproxy":{"enabled":false}}' > portable.json
"./$asset" -version
"./$asset" -server -config portable.json
```

The portable modes create `data.db` and `master.key` in their working folder. Keep that folder private. For a public VPS deployment, use the Linux service installer with a domain and trusted certificate.

## Build from source

Install Git and Go **1.26.4 or newer**, then clone the repository before running `go build`:

```bash
git clone https://github.com/DarkPoesidon/WhitePrivateDns.git
cd WhitePrivateDns
mkdir -p bin
go build -trimpath -o bin/whiteprivatedns ./cmd/whiteprivatedns
./bin/whiteprivatedns -version
```
