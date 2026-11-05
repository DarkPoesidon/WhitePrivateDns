// Strings for the Settings, API gateway and Connect guide pages. Kept in their
// own module so parallel page work does not collide inside index.ts; index.ts
// spreads these groups into the EN/FA resources.

export const enPages = {
  shared: {
    save: 'Save', add: 'Add', remove: 'Remove', enabled: 'Enabled', disabled: 'Disabled', copy: 'Copy', copyFailed: 'Could not copy — select the text and copy it manually',
    failed: 'Something went wrong', currentPassword: 'Current password', totpCode: 'Two-factor code',
  },
  settings: {
    title: 'Settings', subtitle: 'Network addresses, sign-in security, certificates and updates.',
    tabs: { general: 'General', security: 'Security', subscription: 'Subscription portal', certs: 'Certificates', network: 'Resolvers & tools', update: 'Updates' },
    general: {
      network: 'Network paths', relayIp: 'Active relay IPv4', relayIpHelp: 'The public IPv4 of this server that SNI-relayed domains resolve to. Do not enter a CDN, second-server or private address.', apply: 'Apply relay address', ipSaved: 'Relay address applied to new DNS answers',
      dohUrl: 'Public DoH URL', dohUrlHelp: 'Leave empty unless DoH is published behind a tunnel or CDN. Must be https://host/dns-query. Only changes what the Connect guide shows.', dohSaved: 'Public DoH URL saved',
      session: 'Dashboard session', idle: 'Idle timeout (minutes)', idleHelp: 'Between 5 and 1440. A session ends after this much inactivity.', idleSaved: 'Session timeout applied',
      adminPath: 'Hidden admin path', adminPathHelp: 'The panel lives under this secret path. It is a locator, not a credential — keep passwords and two-factor on.',
      regen: 'Regenerate path', regenTitle: 'Regenerate the admin path?', regenBody: 'Every bookmark, integration and session under the old path stops working immediately and you will be signed out.', pathRegenerated: 'Admin path regenerated — sign in at the new address',
    },
    security: {
      signedOut: 'All sessions were ended. Signing you out…',
      credentials: 'Administrator credentials', username: 'Username', newPassword: 'New password', newPasswordHelp: 'Leave empty to keep the current password.', confirmPassword: 'Confirm new password', mismatch: 'Passwords do not match', changeCreds: 'Change credentials',
      credsSaved: 'Username updated', credsSavedPw: 'Password changed — other sessions were signed out',
      tfa: 'Two-factor authentication', tfaHelp: 'Protects sign-in and credential-grade actions with a 6-digit code from an authenticator app.', tfaStart: 'Start enrolment', tfaScan: 'Scan with your authenticator app, or enter the key manually, then type the 6-digit code to confirm.',
      tfaConfirm: 'Confirm and enable', tfaConfirmBody: 'Enter your password to finish enabling two-factor. All sessions will be signed out.', tfaOn: 'Two-factor enabled', tfaOff: 'Two-factor disabled',
      tfaDisable: 'Disable two-factor', tfaDisableBody: 'Enter your password and a current code. All sessions will be signed out.',
      ldap: 'LDAP directory login', ldapDown: 'Server unreachable', ldapEnabled: 'Enable LDAP', ldapUrl: 'Server URL', ldapUrlBad: 'Must start with ldap:// or ldaps://', ldapBindDn: 'Bind DN', ldapBindPw: 'Bind password', ldapBindPwHelp: 'Leave empty to keep the stored password.',
      ldapBaseDn: 'Base DN', ldapAttr: 'User attribute', ldapMode: 'Login mode', modeLocal: 'Local login only', modeBoth: 'LDAP with local fallback', modeLdap: 'LDAP only', ldapOnlyWarn: 'Test LDAP first: with LDAP only, the local admin can no longer sign in.',
      ldapSessions: 'Saving ends all sessions; you will sign in again.',
      lockouts: 'Login lockouts', lockoutsHelp: 'Too many failed sign-ins lock an address for 10 minutes. Clear one address, or leave the field empty to clear all.', lockIp: 'IP address (optional)', unlockAll: 'Unlock all', unlockIp: 'Unlock address', unlockConfirm: 'Clear the login lockout?', unlocked: 'Cleared {{count}} lockout(s)',
    },
    subscription: {
      title: 'Subscription portal', help: 'The page subscribers open to register their IP. Leave the domain empty to use the panel domain.', enabled: 'Portal enabled', domain: 'Subscription domain', domainHelp: 'Only a name that really reaches this server.',
      port: 'Advertised port', portHelp: '0 uses the panel port. A different port opens a separate listener — allow it in your firewall.', portalTitle: 'Portal title', origin: 'Subscriber origin', noOrigin: 'Nothing to advertise yet',
      saved: 'Subscription settings saved', listenerError: 'Saved, but the listener failed',
    },
    certs: {
      domain: 'Domain', email: 'Contact email', emailHelp: 'Optional — Let’s Encrypt sends expiry warnings here.', issue: 'Issue certificate (Let’s Encrypt)', clear: 'Clear custom domain', issued: 'Certificate issued and applied',
      dotTitle: 'DoT / DoH transport', dotHelp: 'The real name for Android Private DNS and DoH, such as dot.example.com. Empty falls back to the panel domain. Port 80 must be reachable for issuance.',
      subTitle: 'Subscription portal', subHelp: 'Certificate for the subscription domain. Empty uses the panel certificate.',
      panelTitle: 'Admin panel', panelHelp: 'The name of the dashboard itself. Changing it affects the panel link and the admin certificate — check DNS first.',
    },
    network: {
      upstreams: 'Upstream resolvers', benchmark: 'Run benchmark', benchStarted: 'Benchmark started — latencies refresh as probes land', benchRunning: 'A benchmark is already running', upstreamAdded: 'Upstream added', upstreamRemoved: 'Upstream removed',
      removeTitle: 'Remove this upstream?', removeBody: '{{addr}} stops being raced immediately.', lastUpstream: 'The last resolver cannot be removed',
      maintenance: 'Maintenance', flushHelp: 'Drops every cached DNS answer; the next queries are resolved fresh.', flush: 'Flush DNS cache', flushTitle: 'Flush the DNS cache?', flushBody: 'Queries are slower until the cache warms up again.', flushed: 'DNS cache flushed',
      diagHelp: 'Checks that this server can reach the main game and media services.', diagRun: 'Run diagnostics', diagRunning: 'Running…', diagSummary: '{{ok}}/{{total}} reachable · avg {{avg}} ms', target: 'Service', reachable: 'Reachable', unreachable: 'Unreachable',
    },
    update: {
      title: 'Software update', current: 'Installed', latest: 'Latest release', checkedAt: 'Last checked', check: 'Check now', upToDate: 'You are on the latest version', found: 'A new version is available', checkFailed: 'The check failed — see the message below',
      disabled: 'Update checks are disabled on this server.', slow: 'The update is taking longer than expected. Check: journalctl -u whiteprivatedns-update',
    },
  },
  api: {
    title: 'API gateway', subtitle: 'Automate clients, whitelist sync and dynamic IP updates over REST.',
    docs: 'REST API v1', docsHelp: 'Interactive Swagger documentation for every endpoint.', openDocs: 'Open Swagger docs',
    exposure: 'Network exposure', bindLocal: '127.0.0.1 (local only)', bindPublic: '0.0.0.0 (public)', exposeLabel: 'Expose the API publicly (0.0.0.0)', exposeHelp: 'Lets external bots and billing systems call the REST API directly.',
    exposeWarn: 'Needs a custom domain with valid HTTPS so the key is never sent in clear text. Keep it local unless you really need remote access.', bindNeedsDomain: 'Public exposure needs an HTTPS domain — set one under Settings → Certificates first.',
    bindConfirmTitle: 'Expose the API to the internet?', bindConfirmBody: 'Anyone who holds the master key can administer this server from anywhere. Make sure HTTPS works and restrict access at the firewall if you can.', bindConfirmOk: 'Expose API', bindPublicOn: 'Public API enabled (0.0.0.0)', bindPublicOff: 'API restricted to localhost',
    masterKey: 'Master API key', masterKeyHelp: 'Full administrative access. Send it in the X-API-Key header. Treat it like a password.', noKey: 'No key', show: 'Show key', hide: 'Hide key', copyKey: 'Copy key',
    regenerate: 'Regenerate key', regenTitle: 'Regenerate the master API key?', regenBody: 'The old key and every integration using it stop working at once. Enter your password to continue.', regenerated: 'New key generated',
    snippets: 'Integration snippets', copySnippet: 'Copy snippet', snippetsNote: 'Built from this panel’s address. When the API is local-only, call it from this server or through an SSH tunnel.',
  },
  guide: {
    title: 'Connect guide', subtitle: 'Point a device at this server — no client software needed.', yourValues: 'Your server values', valIp: 'DNS server IP', valDot: 'DoT hostname', valDoh: 'DoH URL',
    noValue: 'Not available', noDot: 'Not set — issue a DoT/DoH certificate under Settings → Certificates', dotHint: 'Android Private DNS needs a DoT hostname with a valid certificate.',
    whitelist: 'With the whitelist on, the public IP of the user’s own network must be registered on their account first.', moreHelp: 'Need the full walkthrough?',
    ps: { name: 'PlayStation', s1: 'Open Settings → Network → Settings → Set Up Internet Connection.', s2: 'Choose your Wi-Fi or LAN and pick Custom setup.', s3: 'Set IP Address to Automatic and DHCP Host Name to Do Not Specify.', s4: 'Set DNS Settings to Manual, and enter the DNS server IP below as Primary DNS. Leave Secondary empty or repeat it.', s5: 'Set MTU to Automatic, Proxy Server to Do Not Use, then Test Internet Connection.' },
    xbox: { name: 'Xbox', s1: 'Open Settings → General → Network settings → Advanced settings.', s2: 'Select DNS settings → Manual.', s3: 'Enter the DNS server IP below as Primary IPv4 DNS.', s4: 'Enter the same IP as Secondary, or a second WhitePrivateDns address.', s5: 'Press B to save, then Test network connection.' },
    switch: { name: 'Nintendo Switch', s1: 'Open System Settings → Internet → Internet Settings.', s2: 'Select your network and choose Change Settings.', s3: 'Set DNS Settings to Manual.', s4: 'Enter the DNS server IP below as Primary DNS; repeat it as Secondary.', s5: 'Save, then run the connection test.' },
    android: { name: 'Android (Private DNS)', s1: 'Open Settings → Network & internet → Private DNS (on some phones: Connection & sharing).', s2: 'Choose Private DNS provider hostname.', s3: 'Enter the DoT hostname below — only the name, without https://, a port or a path.', s4: 'Save. If it says it cannot connect, check that port 853 is open and the certificate matches that name.', note: 'DoT runs on TCP 853 and needs a valid certificate for the hostname.' },
    ios: { name: 'iPhone / iPad', s1: 'Plain DNS: Settings → Wi-Fi → tap the (i) next to your network.', s2: 'Scroll to Configure DNS → Manual.', s3: 'Remove the existing servers and add the DNS server IP below. Tap Save.', s4: 'For encrypted DNS, install a DNS configuration profile (.mobileconfig) that uses the DoH URL below.', s5: 'Then enable it in Settings → General → VPN & Device Management → DNS.', note: 'iOS has no built-in field for a DoH URL; it must come from a profile or an app.' },
    win: { name: 'Windows 11', s1: 'Open Settings → Network & internet → Wi-Fi (or Ethernet) → Hardware properties.', s2: 'Next to DNS server assignment, choose Edit → Manual and turn on IPv4.', s3: 'Enter the DNS server IP below as Preferred DNS.', s4: 'For DoH, register the server once in an admin PowerShell: netsh dns add encryption server=<DNS server IP> dohtemplate=<DoH URL> autoupgrade=yes udpfallback=no', s5: 'Back in the DNS edit dialog, set DNS over HTTPS to On (automatic template).', s6: 'Save, then check with ipconfig /flushdns and a DNS test.', note: 'Windows only offers DoH for a server it knows; the netsh step is what makes the template available.' },
    router: { name: 'Router', s1: 'Open the router’s admin page and find WAN / Internet or DHCP settings.', s2: 'Set the primary DNS (or DNS relay / DHCP DNS) to the DNS server IP below.', s3: 'Remove other DNS servers — a second unrelated DNS can send some queries elsewhere.', s4: 'Reconnect the devices (or renew DHCP) so they pick up the new DNS.', note: 'Menus differ by model; the essential setting is the DNS server address.' },
  },
}

export const faPages: typeof enPages = {
  shared: {
    save: 'ذخیره', add: 'افزودن', remove: 'حذف', enabled: 'فعال', disabled: 'غیرفعال', copy: 'کپی', copyFailed: 'کپی نشد — متن را انتخاب و دستی کپی کنید',
    failed: 'مشکلی پیش آمد', currentPassword: 'رمز عبور فعلی', totpCode: 'کد دومرحله‌ای',
  },
  settings: {
    title: 'تنظیمات', subtitle: 'آدرس‌های شبکه، امنیت ورود، گواهی‌ها و به‌روزرسانی.',
    tabs: { general: 'عمومی', security: 'امنیت', subscription: 'پرتال اشتراک', certs: 'گواهی‌ها', network: 'ریزالورها و ابزارها', update: 'به‌روزرسانی' },
    general: {
      network: 'مسیرهای شبکه', relayIp: 'IPv4 فعال رله', relayIpHelp: 'IPv4 عمومی همین سرور که دامنه‌های رله‌شدهٔ SNI به آن resolve می‌شوند. آدرس CDN، سرور دوم یا خصوصی وارد نکنید.', apply: 'اعمال آدرس رله', ipSaved: 'آدرس رله روی پاسخ‌های جدید DNS اعمال شد',
      dohUrl: 'URL عمومی DoH', dohUrlHelp: 'اگر DoH پشت تونل یا CDN منتشر نشده خالی بگذارید. باید به شکل https://host/dns-query باشد و فقط آنچه راهنمای اتصال نشان می‌دهد را تغییر می‌دهد.', dohSaved: 'URL عمومی DoH ذخیره شد',
      session: 'نشست داشبورد', idle: 'مهلت بی‌فعالیتی (دقیقه)', idleHelp: 'بین ۵ تا ۱۴۴۰. نشست پس از این مدت بی‌فعالیتی بسته می‌شود.', idleSaved: 'مهلت نشست اعمال شد',
      adminPath: 'مسیر مخفی مدیریت', adminPathHelp: 'پنل زیر این مسیر مخفی قرار دارد. این مسیر فقط نشانی است و جای رمز عبور نمی‌گیرد؛ رمز و دومرحله‌ای را روشن نگه دارید.',
      regen: 'ساخت مسیر جدید', regenTitle: 'مسیر مدیریت دوباره ساخته شود؟', regenBody: 'همهٔ بوکمارک‌ها، یکپارچه‌سازی‌ها و نشست‌های مسیر قبلی فوراً از کار می‌افتند و از حساب خارج می‌شوید.', pathRegenerated: 'مسیر مدیریت تغییر کرد — از نشانی جدید وارد شوید',
    },
    security: {
      signedOut: 'همهٔ نشست‌ها بسته شد. در حال خروج…',
      credentials: 'مشخصات مدیر', username: 'نام کاربری', newPassword: 'رمز عبور جدید', newPasswordHelp: 'برای حفظ رمز فعلی خالی بگذارید.', confirmPassword: 'تکرار رمز جدید', mismatch: 'رمزها یکسان نیستند', changeCreds: 'تغییر مشخصات',
      credsSaved: 'نام کاربری به‌روز شد', credsSavedPw: 'رمز عبور تغییر کرد — نشست‌های دیگر خارج شدند',
      tfa: 'احراز هویت دومرحله‌ای', tfaHelp: 'ورود و کارهای حساس را با کد ۶ رقمی برنامهٔ احراز هویت محافظت می‌کند.', tfaStart: 'شروع فعال‌سازی', tfaScan: 'با برنامهٔ احراز هویت اسکن کنید یا کلید را دستی وارد کنید، سپس کد ۶ رقمی را برای تأیید بنویسید.',
      tfaConfirm: 'تأیید و فعال‌سازی', tfaConfirmBody: 'برای تکمیل فعال‌سازی رمز عبور را وارد کنید. همهٔ نشست‌ها خارج می‌شوند.', tfaOn: 'دومرحله‌ای فعال شد', tfaOff: 'دومرحله‌ای غیرفعال شد',
      tfaDisable: 'غیرفعال‌سازی دومرحله‌ای', tfaDisableBody: 'رمز عبور و یک کد جاری را وارد کنید. همهٔ نشست‌ها خارج می‌شوند.',
      ldap: 'ورود با LDAP', ldapDown: 'سرور در دسترس نیست', ldapEnabled: 'فعال‌سازی LDAP', ldapUrl: 'نشانی سرور', ldapUrlBad: 'باید با ldap:// یا ldaps:// شروع شود', ldapBindDn: 'Bind DN', ldapBindPw: 'رمز Bind', ldapBindPwHelp: 'برای حفظ رمز ذخیره‌شده خالی بگذارید.',
      ldapBaseDn: 'Base DN', ldapAttr: 'صفت کاربر', ldapMode: 'حالت ورود', modeLocal: 'فقط ورود محلی', modeBoth: 'LDAP با جایگزین محلی', modeLdap: 'فقط LDAP', ldapOnlyWarn: 'اول LDAP را آزمایش کنید: در حالت «فقط LDAP» مدیر محلی دیگر نمی‌تواند وارد شود.',
      ldapSessions: 'ذخیره، همهٔ نشست‌ها را می‌بندد و باید دوباره وارد شوید.',
      lockouts: 'قفل‌های ورود', lockoutsHelp: 'ورودهای ناموفق زیاد، آدرس را ۱۰ دقیقه قفل می‌کند. یک آدرس را آزاد کنید یا فیلد را خالی بگذارید تا همه آزاد شوند.', lockIp: 'آدرس IP (اختیاری)', unlockAll: 'آزادسازی همه', unlockIp: 'آزادسازی آدرس', unlockConfirm: 'قفل ورود برداشته شود؟', unlocked: '{{count}} قفل برداشته شد',
    },
    subscription: {
      title: 'پرتال اشتراک', help: 'صفحه‌ای که مشترکین برای ثبت IP باز می‌کنند. دامنه خالی یعنی دامنهٔ پنل.', enabled: 'پرتال فعال', domain: 'دامنهٔ اشتراک', domainHelp: 'فقط نامی که واقعاً به این سرور می‌رسد.',
      port: 'پورت اعلام‌شده', portHelp: '۰ یعنی پورت پنل. پورت متفاوت یک listener جدا باز می‌کند — در فایروال مجاز کنید.', portalTitle: 'عنوان پرتال', origin: 'آدرس مشترکین', noOrigin: 'هنوز چیزی برای نمایش نیست',
      saved: 'تنظیمات اشتراک ذخیره شد', listenerError: 'ذخیره شد، اما listener بالا نیامد',
    },
    certs: {
      domain: 'دامنه', email: 'ایمیل تماس', emailHelp: 'اختیاری — هشدار انقضا از Let’s Encrypt به اینجا می‌آید.', issue: 'صدور گواهی (Let’s Encrypt)', clear: 'پاک‌کردن دامنهٔ سفارشی', issued: 'گواهی صادر و اعمال شد',
      dotTitle: 'انتقال DoT / DoH', dotHelp: 'نام واقعی برای Android Private DNS و DoH مانند dot.example.com. خالی یعنی دامنهٔ پنل. برای صدور، پورت ۸۰ باید در دسترس باشد.',
      subTitle: 'پرتال اشتراک', subHelp: 'گواهی دامنهٔ اشتراک. خالی یعنی گواهی پنل.',
      panelTitle: 'پنل مدیریت', panelHelp: 'نام خود داشبورد. تغییر آن روی لینک پنل و گواهی مدیر اثر می‌گذارد — ابتدا DNS را بررسی کنید.',
    },
    network: {
      upstreams: 'ریزالورهای بالادستی', benchmark: 'اجرای بنچمارک', benchStarted: 'بنچمارک شروع شد — تأخیرها به‌تدریج به‌روز می‌شوند', benchRunning: 'یک بنچمارک در حال اجراست', upstreamAdded: 'ریزالور افزوده شد', upstreamRemoved: 'ریزالور حذف شد',
      removeTitle: 'این ریزالور حذف شود؟', removeBody: '{{addr}} فوراً از رقابت خارج می‌شود.', lastUpstream: 'آخرین ریزالور حذف نمی‌شود',
      maintenance: 'نگهداری', flushHelp: 'همهٔ پاسخ‌های کش‌شدهٔ DNS را پاک می‌کند؛ کوئری‌های بعدی دوباره resolve می‌شوند.', flush: 'پاک‌کردن کش DNS', flushTitle: 'کش DNS پاک شود؟', flushBody: 'تا گرم‌شدن دوبارهٔ کش، کوئری‌ها کندتر هستند.', flushed: 'کش DNS پاک شد',
      diagHelp: 'بررسی می‌کند این سرور به سرویس‌های اصلی بازی و رسانه دسترسی دارد.', diagRun: 'اجرای عیب‌یابی', diagRunning: 'در حال اجرا…', diagSummary: '{{ok}} از {{total}} در دسترس · میانگین {{avg}} میلی‌ثانیه', target: 'سرویس', reachable: 'در دسترس', unreachable: 'در دسترس نیست',
    },
    update: {
      title: 'به‌روزرسانی نرم‌افزار', current: 'نصب‌شده', latest: 'آخرین نسخه', checkedAt: 'آخرین بررسی', check: 'بررسی اکنون', upToDate: 'آخرین نسخه را دارید', found: 'نسخهٔ جدید موجود است', checkFailed: 'بررسی ناموفق بود — پیام زیر را ببینید',
      disabled: 'بررسی به‌روزرسانی روی این سرور غیرفعال است.', slow: 'به‌روزرسانی بیش از انتظار طول کشید. بررسی کنید: journalctl -u whiteprivatedns-update',
    },
  },
  api: {
    title: 'درگاه API', subtitle: 'ساخت مشترک، همگام‌سازی لیست سفید و به‌روزرسانی IP پویا از طریق REST.',
    docs: 'REST API v1', docsHelp: 'مستندات تعاملی Swagger برای همهٔ endpointها.', openDocs: 'باز کردن مستندات Swagger',
    exposure: 'دسترسی شبکه‌ای', bindLocal: '127.0.0.1 (فقط محلی)', bindPublic: '0.0.0.0 (عمومی)', exposeLabel: 'عمومی‌کردن API (0.0.0.0)', exposeHelp: 'به ربات‌ها و سامانه‌های صورت‌حساب بیرونی اجازه می‌دهد مستقیم REST API را صدا بزنند.',
    exposeWarn: 'به دامنهٔ سفارشی با HTTPS معتبر نیاز دارد تا کلید هرگز بدون رمزنگاری ارسال نشود. اگر دسترسی راه دور لازم نیست، محلی بماند.', bindNeedsDomain: 'عمومی‌کردن به دامنهٔ HTTPS نیاز دارد — ابتدا در تنظیمات ← گواهی‌ها یکی تنظیم کنید.',
    bindConfirmTitle: 'API در اینترنت باز شود؟', bindConfirmBody: 'هر کسی که کلید اصلی را داشته باشد از هر جا می‌تواند این سرور را مدیریت کند. از کارکرد HTTPS مطمئن شوید و در صورت امکان دسترسی را در فایروال محدود کنید.', bindConfirmOk: 'باز کردن API', bindPublicOn: 'API عمومی فعال شد (0.0.0.0)', bindPublicOff: 'API فقط محلی شد',
    masterKey: 'کلید اصلی API', masterKeyHelp: 'دسترسی مدیریتی کامل. در هدر X-API-Key ارسال می‌شود. مانند رمز عبور از آن مراقبت کنید.', noKey: 'کلیدی نیست', show: 'نمایش کلید', hide: 'پنهان‌کردن کلید', copyKey: 'کپی کلید',
    regenerate: 'ساخت کلید جدید', regenTitle: 'کلید اصلی API دوباره ساخته شود؟', regenBody: 'کلید قبلی و همهٔ یکپارچه‌سازی‌های وابسته فوراً از کار می‌افتند. برای ادامه رمز عبور را وارد کنید.', regenerated: 'کلید جدید ساخته شد',
    snippets: 'نمونه‌کد یکپارچه‌سازی', copySnippet: 'کپی نمونه‌کد', snippetsNote: 'بر اساس آدرس همین پنل ساخته شده. اگر API فقط محلی است، از خود سرور یا با تونل SSH صدایش بزنید.',
  },
  guide: {
    title: 'راهنمای اتصال', subtitle: 'دستگاه را به این سرور وصل کنید — بدون نصب نرم‌افزار.', yourValues: 'مقادیر سرور شما', valIp: 'IP سرور DNS', valDot: 'نام میزبان DoT', valDoh: 'URL مربوط به DoH',
    noValue: 'در دسترس نیست', noDot: 'تنظیم نشده — در تنظیمات ← گواهی‌ها گواهی DoT/DoH صادر کنید', dotHint: 'Android Private DNS به نام میزبان DoT با گواهی معتبر نیاز دارد.',
    whitelist: 'اگر لیست سفید فعال است، IP عمومی شبکهٔ خود کاربر باید پیش‌تر در حسابش ثبت شده باشد.', moreHelp: 'راهنمای کامل‌تر می‌خواهید؟',
    ps: { name: 'پلی‌استیشن', s1: 'به Settings ← Network ← Settings ← Set Up Internet Connection بروید.', s2: 'Wi-Fi یا LAN خود را انتخاب و Custom را بزنید.', s3: 'IP Address را روی Automatic و DHCP Host Name را روی Do Not Specify بگذارید.', s4: 'DNS Settings را Manual کنید و IP سرور DNS زیر را به‌عنوان Primary DNS وارد کنید. Secondary را خالی بگذارید یا تکرار کنید.', s5: 'MTU را Automatic و Proxy Server را Do Not Use بگذارید و Test Internet Connection را بزنید.' },
    xbox: { name: 'ایکس‌باکس', s1: 'به Settings ← General ← Network settings ← Advanced settings بروید.', s2: 'DNS settings ← Manual را انتخاب کنید.', s3: 'IP سرور DNS زیر را به‌عنوان Primary IPv4 DNS وارد کنید.', s4: 'همان IP یا آدرس دوم WhitePrivateDns را به‌عنوان Secondary بنویسید.', s5: 'با B ذخیره کنید و Test network connection را بزنید.' },
    switch: { name: 'نینتندو سوییچ', s1: 'به System Settings ← Internet ← Internet Settings بروید.', s2: 'شبکهٔ خود را انتخاب و Change Settings را بزنید.', s3: 'DNS Settings را روی Manual بگذارید.', s4: 'IP سرور DNS زیر را در Primary DNS و دوباره در Secondary بنویسید.', s5: 'ذخیره کنید و تست اتصال را اجرا کنید.' },
    android: { name: 'اندروید (Private DNS)', s1: 'به Settings ← Network & internet ← Private DNS بروید (در برخی گوشی‌ها: Connection & sharing).', s2: 'Private DNS provider hostname را انتخاب کنید.', s3: 'نام میزبان DoT زیر را وارد کنید — فقط نام، بدون https://، پورت یا مسیر.', s4: 'ذخیره کنید. اگر اتصال برقرار نشد، باز بودن پورت ۸۵۳ و تطابق گواهی با همان نام را بررسی کنید.', note: 'DoT روی TCP 853 کار می‌کند و به گواهی معتبر برای نام میزبان نیاز دارد.' },
    ios: { name: 'آیفون / آیپد', s1: 'DNS ساده: Settings ← Wi-Fi ← روی (i) کنار شبکه بزنید.', s2: 'به Configure DNS ← Manual بروید.', s3: 'سرورهای قبلی را حذف و IP سرور DNS زیر را اضافه کنید. Save را بزنید.', s4: 'برای DNS رمزنگاری‌شده، یک پروفایل پیکربندی DNS (.mobileconfig) نصب کنید که از URL مربوط به DoH زیر استفاده کند.', s5: 'سپس در Settings ← General ← VPN & Device Management ← DNS فعالش کنید.', note: 'iOS فیلد داخلی برای URL مربوط به DoH ندارد؛ باید از پروفایل یا یک برنامه بیاید.' },
    win: { name: 'ویندوز ۱۱', s1: 'به Settings ← Network & internet ← Wi-Fi (یا Ethernet) ← Hardware properties بروید.', s2: 'کنار DNS server assignment گزینهٔ Edit ← Manual را بزنید و IPv4 را روشن کنید.', s3: 'IP سرور DNS زیر را به‌عنوان Preferred DNS وارد کنید.', s4: 'برای DoH، یک‌بار در PowerShell ادمین سرور را ثبت کنید: netsh dns add encryption server=<IP سرور DNS> dohtemplate=<URL مربوط به DoH> autoupgrade=yes udpfallback=no', s5: 'در همان پنجرهٔ ویرایش DNS، گزینهٔ DNS over HTTPS را روی On (automatic template) بگذارید.', s6: 'ذخیره کنید و با ipconfig /flushdns و یک تست DNS بررسی کنید.', note: 'ویندوز فقط برای سروری که می‌شناسد DoH ارائه می‌کند؛ مرحلهٔ netsh قالب را در دسترس می‌گذارد.' },
    router: { name: 'روتر', s1: 'صفحهٔ مدیریت روتر را باز کنید و بخش WAN / Internet یا DHCP را پیدا کنید.', s2: 'DNS اصلی (یا DNS relay / DNS در DHCP) را روی IP سرور DNS زیر بگذارید.', s3: 'DNSهای دیگر را حذف کنید — یک DNS دوم نامرتبط ممکن است بخشی از کوئری‌ها را جای دیگری ببرد.', s4: 'دستگاه‌ها را دوباره وصل کنید (یا DHCP را تمدید کنید) تا DNS جدید را بگیرند.', note: 'منوها بسته به مدل فرق می‌کنند؛ اصل کار، آدرس DNS است.' },
  },
}
