import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import { logsEn, logsFa } from './logs'
import { policiesEn, policiesFa } from './policies'

const en = {
  nav: { overview: 'Overview', clients: 'Clients', policies: 'Policies', logs: 'Live queries', api: 'API gateway', settings: 'Settings', guide: 'Connect guide' },
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
  policies: policiesEn,
  logs: logsEn,
  update: { available: 'Update available', whatsNew: "What's new", now: 'Update now', later: 'Later', updating: 'Updating — the panel will reload when it is back', confirmTitle: 'Update WhitePrivateDns', confirmBody: 'The service restarts and the panel is unavailable for about a minute. A backup is taken first and restored automatically if the update fails. Enter your current password to continue.', password: 'Current password', code: 'Two-factor code', failed: 'Update could not be started' },
}

const fa: typeof en = {
  nav: { overview: 'نمای کلی', clients: 'مشترکین', policies: 'سیاست‌ها', logs: 'کوئری‌های زنده', api: 'درگاه API', settings: 'تنظیمات', guide: 'راهنمای اتصال' },
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
  policies: policiesFa,
  logs: logsFa,
  update: { available: 'به‌روزرسانی جدید موجود است', whatsNew: 'تغییرات جدید', now: 'به‌روزرسانی', later: 'بعداً', updating: 'در حال به‌روزرسانی — پنل پس از بازگشت سرویس بارگذاری می‌شود', confirmTitle: 'به‌روزرسانی WhitePrivateDns', confirmBody: 'سرویس راه‌اندازی مجدد می‌شود و پنل حدود یک دقیقه در دسترس نیست. ابتدا پشتیبان گرفته می‌شود و در صورت شکست خودکار بازگردانده می‌شود. برای ادامه رمز عبور فعلی را وارد کنید.', password: 'رمز عبور فعلی', code: 'کد دومرحله‌ای', failed: 'شروع به‌روزرسانی ممکن نشد' },
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
