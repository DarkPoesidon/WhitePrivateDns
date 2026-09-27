# مسیرهای پایدار برای کاربران ایران

هدف این راهنما جدا کردن خرابی DNS، دسترسی به DoH/DoT و دسترسی به رلهٔ SNI است.
تایم‌اوت از یک اپراتور به‌تنهایی اثبات فیلترینگ نیست؛ نتیجه را از چند شبکه و
در چند زمان مقایسه کنید.

## آنچه اکنون در برنامه قابل تنظیم است

- **Active relay IPv4** در Settings آدرس پاسخ‌های `PROXY` را بدون ری‌استارت
  تغییر می‌دهد. این آدرس باید به **همان سرور** تعلق داشته باشد؛ سرور دوم هنوز
  پایگاه‌داده، احراز هویت، سهمیه و وضعیت رله را با سرور اول همگام نمی‌کند.
- **Public DoH URL** آدرس HTTPS قابل ارائه به کاربر را مستقل از پورت محلی
  DoH تنظیم می‌کند. خالی کردن فیلد، آدرس مستقیم را بازمی‌گرداند.
- `scripts/network_probe.py` از سمت شبکهٔ کاربر، UDP/TCP DNS، DoT، DoH و
  دسترسی TCP به رله را جداگانه آزمایش می‌کند. آزمون `--relay-sni` هندشیک TLS
  کامل را نیز از رله می‌گذراند.

برای مقایسهٔ مسیرهای جایگزین از همان شبکهٔ مشترک، `--doh-url` و `--relay-ip`
را می‌توان چند بار تکرار کرد:

```bash
python3 scripts/network_probe.py \
  --doh-url https://doh-direct.example.com/dns-query \
  --doh-url https://doh-edge.example.com/dns-query \
  --relay-ip 203.0.113.10 --relay-ip 203.0.113.11 \
  --relay-sni example-proxied-domain.com
```

ابزار هر مقصد را جدا آزمایش می‌کند و مقصدهای پاسخگو را نشان می‌دهد. با وجود
چند نامزد، موفقیت یکی از آنها برای همان مسیر کافی است؛ انتخاب و ثبت IP فعال
رله در Settings همچنان دستی است. باز بودن پورت TCP به‌تنهایی کارکرد رله را
اثبات نمی‌کند؛ برای آزمون TLS گزینهٔ `--relay-sni` لازم است. قالب `--json`
همچنان فهرست نتیجه‌هاست؛ هنگام تکرار یک گزینه، چند نتیجه با مقدار `path`
یکسان تولید می‌شود.

## چینش پیشنهادی

| نام/آدرس | مسیر | نکته |
| --- | --- | --- |
| `panel.example.com` | HTTPS پشت CDN یا Tunnel | فقط پنل و مسیرهای عمومی مجاز؛ نشانی ورود ادمین را عمومی نکنید. |
| `doh.example.com` | HTTPS عمومی روی 443 → DoH محلی روی 8443 | در Settings به‌عنوان Public DoH URL ثبت شود. |
| `dot.example.com` | DNS-only و DoT مستقیم روی 853 | گواهی معتبر این نام روی لیسنر DoT/DoH محلی نصب شود. |
| IPv4 رله | اتصال مستقیم کاربر به رلهٔ SNI | باید برای کاربر قابل دسترس و به همان سرور اختصاص یافته باشد. |

برای DoH، یک Cloudflare Tunnel نام‌دار می‌تواند `doh.example.com` را به
`https://127.0.0.1:8443` برساند. اگر گواهی محلی برای `dot.example.com`
صادر شده است، در تنظیمات مبدأ Tunnel مقدار **Origin Server Name** را
`dot.example.com` بگذارید و بررسی گواهی TLS را روشن نگه دارید. مسیر
`/dns-query` باید از کش اشتراکی CDN و چالش مرورگری مستثنا باشد. برنامه
پاسخ‌های DoH را با `Cache-Control: private` می‌فرستد، ولی یک Cache Rule
بالاتر می‌تواند این رفتار را تغییر دهد. پیش از انتشار، DoH را از اتصال
واقعی مشترک با ابزار سنجش آزمایش کنید.

اگر مبدأ DoH پشت پراکسی قرار گرفت، `trusted_proxy_cidrs` را فقط برای
**همتای مستقیم و مورد اعتماد** تنظیم کنید و دسترسی مستقیم به مبدأ را ببندید.
در غیر این صورت، تشخیص IP مشترک و محدودیت نرخ ممکن است اشتباه شود. از
اعتماد کلی به هدرهای ارسالی هر کلاینت خودداری کنید.

## نمونهٔ سنجش

```bash
python3 scripts/network_probe.py \
  --dns-ip 203.0.113.10 \
  --dot-host dot.example.com \
  --doh-url https://doh.example.com/dns-query \
  --relay-ip 203.0.113.10 \
  --relay-sni example-proxied-domain.com \
  --json
```

اگر DoH به توکن نیاز دارد، آن را در متغیر محیطی
`WHITEPRIVATEDNS_DOH_TOKEN` قرار دهید. ابزار توکن را در خروجی چاپ نمی‌کند.
وضعیت `tcp_reachable` فقط باز بودن پورت را تأیید می‌کند؛ برای آزمون خود
رله، `--relay-sni` را با دامنه‌ای که واقعاً در سیاست‌های شما پراکسی می‌شود
اضافه کنید. وضعیت `unreachable` علت شکست را ثابت نمی‌کند.

Cloudflare معمولی روی رکورد نارنجی، DNS پورت ۵۳، DoT پورت ۸۵۳ یا TCP خام
رله را به‌شکل HTTP منتقل نمی‌کند. در این نسخه، چند سرور مستقل هم هنوز
تکثیر خودکار حساب‌ها و انتخاب سالم‌ترین IP ندارند؛ این‌ها گام‌های بعدی‌اند.

منابع: [پورت‌های پروکسی Cloudflare](https://developers.cloudflare.com/fundamentals/reference/network-ports/)،
[مسیریابی Tunnel](https://developers.cloudflare.com/tunnel/concepts/routing/)،
[Origin Server Name و اعتبارسنجی TLS](https://developers.cloudflare.com/tunnel/reference/origin-parameters/)،
[کش مسیرهای پویا](https://developers.cloudflare.com/cache/troubleshooting/dynamic-content-and-login-issues/).
