import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import { logsEn, logsFa } from './logs'
import { policiesEn, policiesFa } from './policies'
import { enPages, faPages } from './panelPages'

const en = {
  nav: { overview: 'Overview', clients: 'Clients', policies: 'Policies', logs: 'Live queries', api: 'API gateway', settings: 'Settings', guide: 'Connect guide', classic: 'Classic panel' },
  common: { signOut: 'Sign out', theme: 'Theme', light: 'Light', dark: 'Dark', ultra: 'Ultra dark', language: 'Language', loading: 'Loading…', retry: 'Retry', cancel: 'Cancel', openLegacy: 'Open in classic panel', migrating: 'This page is being migrated to the new panel.', migratingHint: 'Everything still works in the classic panel in the meantime.' },
  overview: {
    title: 'Overview', subtitle: 'DNS traffic, resolver health and system load in one place.',
    queryRate: 'Query rate', totalQueries: 'Total queries', cache: 'Cache', hitRatio: 'hit ratio', items: 'items',
    relay: 'SNI relay', activeRelays: 'active', totalRelays: 'total', refused: 'refused', unreadable: 'unreadable',
    traffic: 'Traffic', down: 'Down', up: 'Up', system: 'System', cpu: 'CPU', memory: 'Memory', uptime: 'Uptime', goroutines: 'Goroutines', cores: 'cores',
    latency: 'Resolver latency', latencyHint: 'Service time for queries the cache did not answer', p50: 'p50', p95: 'p95', p99: 'p99', max: 'max',
    upstreams: 'Upstream resolvers', address: 'Address', status: 'Status', healthy: 'Healthy', degraded: 'Slow / down', noData: 'No data yet',
    limits: 'Protection', rateLimited: 'Rate limited', accessDenied: 'Access denied', limit: 'Limit',
  },
  clients: {
    title: 'Clients', subtitle: 'Subscribers, their registered IPs, plans and traffic.',
    save: 'Save', add: 'Add client', edit: 'Edit client', search: 'Search name, ID, IP…', allStatuses: 'All statuses',
    colName: 'Client', colStatus: 'Status', colIp: 'Registered IP', colExpiry: 'Plan expiry', colTraffic: 'Traffic', colQueries: 'Queries', colSeen: 'Last seen', colActions: 'Actions',
    active: 'Active', disabled: 'Disabled', expired: 'Expired', noQuota: 'No quota',
    lifetime: 'Lifetime', remaining: '{{d}}d {{h}}h left', unlimited: 'Unlimited', never: 'Never', noIp: 'No IP yet', policies: '{{n}} policies', resets: 'Resets {{date}}',
    setIp: 'Set IP', setIpTitle: 'Set the registered address', setIpHint: 'A subscriber has one address at a time; this replaces the one on file.', ipLabel: 'IPv4 or IPv6 address', ipInvalid: 'Not a valid IP address.',
    removeIp: 'Remove IP', removeIpTitle: 'Remove this address?', removeIpBody: '{{ip}} is removed. Queries from it are refused until an address is set again.',
    renew: 'Renew +30 days', enable: 'Enable', disable: 'Disable', delete: 'Delete', deleteTitle: 'Delete this client?', deleteBody: '{{name}} ({{id}}): the subscription link stops working and the IP stops resolving. There is no undo.', deleteOk: 'Delete',
    copy: 'Copy', copyPortal: 'Copy portal link', copyReg: 'Copy registration link', copyCard: 'Copy Persian bot card', copyUuid: 'Copy UUID', copied: 'Copied', cardCopied: 'Persian client card copied',
    fName: 'Name', fExpiry: 'Plan expiry', fExpiryHint: 'Leave empty for a lifetime plan.', fIp: 'Initial IP', fTraffic: 'Traffic limit (GB)', fTrafficHint: '0 = unlimited', fCycle: 'Reset cycle', cycleNone: 'Never', cycleDaily: 'Daily', cycleWeekly: 'Weekly', cycleMonthly: 'Monthly',
    fPolicies: 'Custom policies', fPoliciesHint: 'Empty = inherit global policies', fNote: 'Note', fEnabled: 'Enabled', fUuid: 'UUID', fSecret: 'Registration secret', required: 'Required',
    regenUuid: 'Regenerate UUID', regenSecret: 'Regenerate secret', regenSecretConfirm: 'Regenerate the registration secret? The old one stops working immediately; re-deliver the new one to the subscriber.', show: 'Show', hide: 'Hide', resetTraffic: 'Reset traffic counter',
    created: 'Client created', createdBody: 'Send these credentials to the subscriber.', saved: 'Client saved', deleted: 'Client deleted', renewed: 'Plan extended by 30 days', toggledOn: 'Client enabled', toggledOff: 'Client disabled', ipSet: 'IP saved', ipRemoved: 'IP removed', secretRegen: 'New secret generated', uuidRegen: 'New UUID generated', trafficReset: 'Traffic counter reset',
    loadFailed: 'Could not load clients', loadFailedBody: 'Nothing has been changed; this is a failed read, not an empty list.', emptyTitle: 'No clients yet', emptyBody: 'Create a client account and its registration link.', noMatch: 'No match', noMatchBody: 'None of your {{n}} clients match the filter.', clearFilters: 'Clear filters',
    modeTitle: 'DNS access mode', modeWhitelist: 'Whitelist', modePublic: 'Public', modeHint: 'Private: only registered IPs can use DNS and the relay. Public: any IP can use DNS; anonymous relay traffic is limited to active proxied domains and has no per-client quota.',
    modeWarnTitle: 'Public DNS is on', modeWarnBody: 'Anyone can query this resolver, not only registered clients. Switch the whitelist on to restrict it.',
    modeConfirmTitle: 'Open DNS to everyone?', modeConfirmBody: 'Turning the whitelist off lets any IP use this resolver. Relay traffic stays limited to active proxy rules.', modeConfirmOk: 'Allow everyone',
    modeOn: 'Whitelist enforced', modeOff: 'Public DNS enabled',
  },
  policies: policiesEn,
  logs: logsEn,
  update: { available: 'Update available', whatsNew: "What's new", now: 'Update now', later: 'Later', updating: 'Updating — the panel will reload when it is back', confirmTitle: 'Update WhitePrivateDns', confirmBody: 'The service restarts and the panel is unavailable for about a minute. A backup is taken first and restored automatically if the update fails. Enter your current password to continue.', password: 'Current password', code: 'Two-factor code', failed: 'Update could not be started' },
  ...enPages,
}

const fa: typeof en = {
  nav: { overview: 'نمای کلی', clients: 'مشترکین', policies: 'سیاست‌ها', logs: 'کوئری‌های زنده', api: 'درگاه API', settings: 'تنظیمات', guide: 'راهنمای اتصال', classic: 'پنل کلاسیک' },
  common: { signOut: 'خروج', theme: 'پوسته', light: 'روشن', dark: 'تیره', ultra: 'تیرهٔ مطلق', language: 'زبان', loading: 'در حال بارگذاری…', retry: 'تلاش مجدد', cancel: 'انصراف', openLegacy: 'باز کردن در پنل کلاسیک', migrating: 'این صفحه در حال انتقال به پنل جدید است.', migratingHint: 'تا آن زمان همه‌چیز در پنل کلاسیک کار می‌کند.' },
  overview: {
    title: 'نمای کلی', subtitle: 'ترافیک DNS، سلامت ریزالور و بار سیستم در یک نگاه.',
    queryRate: 'نرخ کوئری', totalQueries: 'مجموع کوئری‌ها', cache: 'کش', hitRatio: 'نسبت برخورد', items: 'مورد',
    relay: 'رلهٔ SNI', activeRelays: 'فعال', totalRelays: 'مجموع', refused: 'ردشده', unreadable: 'ناخوانا',
    traffic: 'ترافیک', down: 'دریافت', up: 'ارسال', system: 'سیستم', cpu: 'پردازنده', memory: 'حافظه', uptime: 'مدت فعالیت', goroutines: 'گوروتین‌ها', cores: 'هسته',
    latency: 'تأخیر ریزالور', latencyHint: 'زمان پاسخ برای کوئری‌هایی که کش جواب نداد', p50: 'میانه', p95: 'p95', p99: 'p99', max: 'بیشینه',
    upstreams: 'ریزالورهای بالادستی', address: 'آدرس', status: 'وضعیت', healthy: 'سالم', degraded: 'کند / قطع', noData: 'هنوز داده‌ای نیست',
    limits: 'محافظت', rateLimited: 'محدودشده با نرخ', accessDenied: 'دسترسی ردشده', limit: 'سقف',
  },
  clients: {
    title: 'مشترکین', subtitle: 'مشترکین، آی‌پی‌های ثبت‌شده، پلن‌ها و ترافیک.',
    save: 'ذخیره', add: 'افزودن مشترک', edit: 'ویرایش مشترک', search: 'جست‌وجوی نام، شناسه، آی‌پی…', allStatuses: 'همهٔ وضعیت‌ها',
    colName: 'مشترک', colStatus: 'وضعیت', colIp: 'آی‌پی ثبت‌شده', colExpiry: 'انقضای پلن', colTraffic: 'ترافیک', colQueries: 'کوئری‌ها', colSeen: 'آخرین بازدید', colActions: 'عملیات',
    active: 'فعال', disabled: 'غیرفعال', expired: 'منقضی', noQuota: 'بدون حجم',
    lifetime: 'مادام‌العمر', remaining: '{{d}} روز و {{h}} ساعت مانده', unlimited: 'نامحدود', never: 'هرگز', noIp: 'هنوز آی‌پی ثبت نشده', policies: '{{n}} سیاست', resets: 'بازنشانی {{date}}',
    setIp: 'ثبت آی‌پی', setIpTitle: 'ثبت آدرس مجاز', setIpHint: 'هر مشترک در هر زمان یک آدرس دارد؛ این کار آدرس فعلی را جایگزین می‌کند.', ipLabel: 'آدرس IPv4 یا IPv6', ipInvalid: 'آدرس IP معتبر نیست.',
    removeIp: 'حذف آی‌پی', removeIpTitle: 'این آدرس حذف شود؟', removeIpBody: '{{ip}} حذف می‌شود. تا ثبت دوبارهٔ آدرس، کوئری‌های آن رد می‌شوند.',
    renew: 'تمدید ۳۰ روزه', enable: 'فعال‌سازی', disable: 'غیرفعال‌سازی', delete: 'حذف', deleteTitle: 'این مشترک حذف شود؟', deleteBody: '{{name}} ({{id}}): لینک اشتراک از کار می‌افتد و آی‌پی دیگر پاسخ نمی‌گیرد. بازگشتی ندارد.', deleteOk: 'حذف',
    copy: 'کپی', copyPortal: 'کپی لینک پنل اشتراک', copyReg: 'کپی لینک ثبت آی‌پی', copyCard: 'کپی کارت فارسی ربات', copyUuid: 'کپی UUID', copied: 'کپی شد', cardCopied: 'کارت فارسی مشترک کپی شد',
    fName: 'نام', fExpiry: 'انقضای پلن', fExpiryHint: 'برای پلن مادام‌العمر خالی بگذارید.', fIp: 'آی‌پی اولیه', fTraffic: 'سقف ترافیک (گیگابایت)', fTrafficHint: '۰ = نامحدود', fCycle: 'چرخهٔ بازنشانی', cycleNone: 'هرگز', cycleDaily: 'روزانه', cycleWeekly: 'هفتگی', cycleMonthly: 'ماهانه',
    fPolicies: 'سیاست‌های اختصاصی', fPoliciesHint: 'خالی = ارث‌بری از سیاست‌های سراسری', fNote: 'یادداشت', fEnabled: 'فعال', fUuid: 'UUID', fSecret: 'رمز ثبت آی‌پی', required: 'الزامی',
    regenUuid: 'ساخت UUID جدید', regenSecret: 'ساخت رمز جدید', regenSecretConfirm: 'رمز ثبت آی‌پی دوباره ساخته شود؟ رمز قبلی بلافاصله از کار می‌افتد؛ رمز جدید را به مشترک بدهید.', show: 'نمایش', hide: 'پنهان', resetTraffic: 'صفر کردن شمارندهٔ ترافیک',
    created: 'مشترک ساخته شد', createdBody: 'این اطلاعات را برای مشترک بفرستید.', saved: 'مشترک ذخیره شد', deleted: 'مشترک حذف شد', renewed: 'پلن ۳۰ روز تمدید شد', toggledOn: 'مشترک فعال شد', toggledOff: 'مشترک غیرفعال شد', ipSet: 'آی‌پی ذخیره شد', ipRemoved: 'آی‌پی حذف شد', secretRegen: 'رمز جدید ساخته شد', uuidRegen: 'UUID جدید ساخته شد', trafficReset: 'شمارندهٔ ترافیک صفر شد',
    loadFailed: 'بارگذاری مشترکین ممکن نشد', loadFailedBody: 'چیزی تغییر نکرده است؛ این یک خطای خواندن است، نه فهرست خالی.', emptyTitle: 'هنوز مشترکی نیست', emptyBody: 'یک حساب مشترک و لینک ثبت آن بسازید.', noMatch: 'نتیجه‌ای نیست', noMatchBody: 'هیچ‌کدام از {{n}} مشترک با فیلتر جور نیستند.', clearFilters: 'پاک کردن فیلترها',
    modeTitle: 'حالت دسترسی DNS', modeWhitelist: 'فهرست مجاز', modePublic: 'عمومی', modeHint: 'خصوصی: فقط آی‌پی‌های ثبت‌شده از DNS و رله استفاده می‌کنند. عمومی: هر آی‌پی از DNS استفاده می‌کند؛ ترافیک ناشناس رله به دامنه‌های پروکسی فعال محدود است و سهمیهٔ جداگانه ندارد.',
    modeWarnTitle: 'DNS عمومی روشن است', modeWarnBody: 'هر کسی می‌تواند از این ریزالور استفاده کند، نه فقط مشترکین ثبت‌شده. برای محدود کردن، فهرست مجاز را روشن کنید.',
    modeConfirmTitle: 'DNS برای همه باز شود؟', modeConfirmBody: 'با خاموش کردن فهرست مجاز، هر آی‌پی می‌تواند از این ریزالور استفاده کند. ترافیک رله همچنان به قوانین پروکسی فعال محدود می‌ماند.', modeConfirmOk: 'اجازه به همه',
    modeOn: 'فهرست مجاز فعال شد', modeOff: 'DNS عمومی فعال شد',
  },
  policies: policiesFa,
  logs: logsFa,
  update: { available: 'به‌روزرسانی جدید موجود است', whatsNew: 'تغییرات جدید', now: 'به‌روزرسانی', later: 'بعداً', updating: 'در حال به‌روزرسانی — پنل پس از بازگشت سرویس بارگذاری می‌شود', confirmTitle: 'به‌روزرسانی WhitePrivateDns', confirmBody: 'سرویس راه‌اندازی مجدد می‌شود و پنل حدود یک دقیقه در دسترس نیست. ابتدا پشتیبان گرفته می‌شود و در صورت شکست خودکار بازگردانده می‌شود. برای ادامه رمز عبور فعلی را وارد کنید.', password: 'رمز عبور فعلی', code: 'کد دومرحله‌ای', failed: 'شروع به‌روزرسانی ممکن نشد' },
  ...faPages,
}

const saved = (() => {
  try {
    return localStorage.getItem('wpdns_ui_lang')
  } catch {
    return null
  }
})()

void i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, fa: { translation: fa } },
  lng: saved === 'fa' ? 'fa' : 'en',
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
})

export const isRtl = (lng: string) => lng === 'fa'
export default i18n
