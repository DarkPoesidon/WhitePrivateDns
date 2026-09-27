# نصب WhitePrivateDns روی سیستم‌عامل‌های پشتیبانی‌شده

نسخهٔ `v2.2.0-beta.3` برای Linux با معماری‌های amd64/arm64، Windows amd64 و macOS amd64/arm64 باینری آماده دارد. دستورهای نصب از Release به Go یا سورس کلون‌شده نیاز ندارند.

## سرور لینوکس با systemd

با کاربر `root` اجرا کنید. پیش از شروع، رکورد A دامنهٔ پنل را به آی‌پی سرور وصل کنید و پورت ۸۰ را برای صدور گواهی باز بگذارید.

روی Debian 11+ یا Ubuntu 20.04+:

```bash
apt-get update && apt-get install -y ca-certificates curl openssl
```

روی RHEL، AlmaLinux، Rocky Linux یا CentOS 8+ با مخزن بستهٔ فعال:

```bash
dnf install -y ca-certificates curl openssl
```

سپس از **هر پوشه‌ای** این دو دستور را اجرا کنید:

```bash
curl -fsSLo /tmp/whiteprivatedns-install.sh https://raw.githubusercontent.com/DarkPoesidon/WhitePrivateDns/v2.2.0-beta.3/scripts/install.sh
env WHITEPRIVATEDNS_REPOSITORY=DarkPoesidon/WhitePrivateDns WHITEPRIVATEDNS_REF=v2.2.0-beta.3 bash /tmp/whiteprivatedns-install.sh
```

نصاب معماری را تشخیص می‌دهد، باینری مناسب را دانلود و SHA-256 آن را بررسی می‌کند و سرویس، اسکریپت بازیابی و اسکریپت حذف را نصب می‌کند. دامنه و ایمیل ACME را می‌پرسد. رمز مدیر و مسیر خصوصی پنل را که فقط یک بار چاپ می‌شوند نگه دارید. **اجرای دوبارهٔ نصاب، نصب قبلی را جایگزین می‌کند.** ابتدا `FRESH` را می‌پرسد و فقط پس از تأیید، سرویس را متوقف و آرشیو را ایجاد می‌کند؛ لغو کردن نصب قبلی را دست‌نخورده می‌گذارد.

اگر GitHub روی VPS در دسترس نیست، فایل `whiteprivatedns-offline-bundle.tar.gz` را از [صفحهٔ Release](https://github.com/DarkPoesidon/WhitePrivateDns/releases/tag/v2.2.0-beta.3) با دستگاه دیگری بگیرید و به سرور منتقل کنید:

```bash
mkdir -p /root/whiteprivatedns-bundle
tar -xzf whiteprivatedns-offline-bundle.tar.gz -C /root/whiteprivatedns-bundle
cd /root/whiteprivatedns-bundle
bash install.sh
```

بستهٔ آفلاین باینری Linux amd64 دارد. روی Linux arm64 از نصاب آنلاین استفاده کنید یا باینری جداگانهٔ `whiteprivatedns-linux-arm64` را منتقل کنید.

## اجرای پرتابل روی Windows amd64

PowerShell را باز کنید. این مسیر برای **آزمایش محلی** است: DNS روی پورت ۱۵۳۵۳ اجرا می‌شود و پنل فقط روی `127.0.0.1:8080` در دسترس است؛ سرویس Windows نصب نمی‌شود.

```powershell
$folder = Join-Path $HOME 'WhitePrivateDns'
New-Item -ItemType Directory -Force -Path $folder | Out-Null
$base = 'https://github.com/DarkPoesidon/WhitePrivateDns/releases/download/v2.2.0-beta.3'
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

در اجرای اول، رمز مدیر و مسیر خصوصی پنل چاپ می‌شوند. برای ادامهٔ آزمایش پنجرهٔ PowerShell را باز نگه دارید. کنسول کنترل لینوکسی `wpdns` و systemd روی Windows وجود ندارند.

## اجرای پرتابل روی macOS amd64 یا arm64

Terminal را باز کنید. این مسیر هم محلی است و از پورت DNS ۱۵۳۵۳ و پنل `127.0.0.1:8080` استفاده می‌کند.

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
base='https://github.com/DarkPoesidon/WhitePrivateDns/releases/download/v2.2.0-beta.3'
curl -fL --retry 3 "$base/$asset" -o "$asset"
curl -fL --retry 3 "$base/checksums.txt" -o checksums.txt
grep " $asset\$" checksums.txt | shasum -a 256 -c -
chmod 700 "$asset"
printf '%s\n' '{"server":{"bind_host":"127.0.0.1"},"dns":{"port":15353,"dot_port":1853,"doh_port":18443},"sniproxy":{"enabled":false}}' > portable.json
"./$asset" -version
"./$asset" -server -config portable.json
```

حالت پرتابل فایل‌های `data.db` و `master.key` را در پوشهٔ کاری می‌سازد؛ این پوشه را خصوصی نگه دارید. برای سرویس عمومی روی VPS از نصاب لینوکس، دامنه و گواهی معتبر استفاده کنید.

## ساخت از سورس

ابتدا Git و Go نسخهٔ **1.26.4 یا جدیدتر** را نصب کنید. سپس پروژه را کلون کنید:

```bash
git clone https://github.com/DarkPoesidon/WhitePrivateDns.git
cd WhitePrivateDns
mkdir -p bin
go build -trimpath -o bin/whiteprivatedns ./cmd/whiteprivatedns
./bin/whiteprivatedns -version
```
