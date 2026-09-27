# به‌روزرسانی نصب موجود در لینوکس

برای سروری که WhitePrivateDns از قبل روی آن نصب است، از `scripts/update.sh` استفاده کنید. `scripts/install.sh` نصاب **نصب تازه** است و پس از تأیید `FRESH` داده‌های نصب قبلی را جایگزین می‌کند.

دستورهای زیر را با کاربر `root` روی سرور اجرا کنید؛ به Go یا نسخهٔ کلون‌شدهٔ پروژه نیاز ندارند و از هر پوشه‌ای کار می‌کنند:

```bash
TAG='v2.2.0-beta.4'
curl -fsSLo /tmp/whiteprivatedns-update.sh \
  "https://raw.githubusercontent.com/DarkPoesidon/WhitePrivateDns/${TAG}/scripts/update.sh"
env WHITEPRIVATEDNS_REF="$TAG" \
  WHITEPRIVATEDNS_REPOSITORY='DarkPoesidon/WhitePrivateDns' \
  bash /tmp/whiteprivatedns-update.sh
```

اسکریپت باینری Linux متناسب با معماری سرور و فایل نسخه را از همان تگ می‌گیرد، SHA-256 باینری را با فهرست Release بررسی می‌کند و پیش از جایگزینی، از پوشهٔ نصب آرشیو قابل خواندن می‌سازد. `config.json`، `data.db`، `master.key` و گواهی‌ها حفظ می‌شوند. اگر سرویس تازه روشن نشود، آرشیو قبلی و وضعیت روشن یا خاموش بودن سرویس بازیابی می‌شود. هنگام به‌روزرسانیِ سرویس روشن، وقفهٔ کوتاهی در DNS رخ می‌دهد.

پس از اجرا، مسیر و SHA-256 آرشیو در خروجی چاپ می‌شود. آن را تا زمانی که پنل و پاسخ DNS را بررسی کرده‌اید، در جای امن نگه دارید؛ آرشیو شامل تنظیمات و کلید خصوصی است.

```bash
systemctl status whiteprivatedns --no-pager
/opt/whiteprivatedns/whiteprivatedns -version
```

راهنمای کامل‌تر و روش بازگردانی دستی در [UPDATE.md](UPDATE.md) آمده است. این اسکریپت مخصوص نصب‌های Linux با `systemd` روی `amd64` یا `arm64` است.
