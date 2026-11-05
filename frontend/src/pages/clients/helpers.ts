import type { ClientRow } from '../../api/types'

export type Status = 'active' | 'disabled' | 'expired' | 'noQuota'

const isZeroTime = (s: string | undefined) => !s || s.startsWith('0001-')

export const expiryDate = (c: ClientRow): Date | null => (isZeroTime(c.expires_at) ? null : new Date(c.expires_at))

export function statusOf(c: ClientRow): Status {
  const exp = expiryDate(c)
  if (!c.enabled) return 'disabled'
  if (exp && exp.getTime() < Date.now()) return 'expired'
  if (c.quota_exceeded === true) return 'noQuota'
  return 'active'
}

export function formatBytes(n: number): string {
  const u = ['B', 'KB', 'MB', 'GB', 'TB']
  let i = 0
  while (n >= 1024 && i < u.length - 1) {
    n /= 1024
    i++
  }
  return `${n.toFixed(i ? 1 : 0)} ${u[i]}`
}

export const lastSeenDate = (c: ClientRow): Date | null => {
  if (isZeroTime(c.last_seen)) return null
  const d = new Date(c.last_seen)
  return isNaN(d.getTime()) ? null : d
}

// <input type="datetime-local"> wants local "YYYY-MM-DDTHH:mm".
export function toLocalInput(iso: string | undefined): string {
  if (isZeroTime(iso)) return ''
  const d = new Date(iso as string)
  if (isNaN(d.getTime())) return ''
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

export const fromLocalInput = (v: string | undefined): string => {
  if (!v) return ''
  const d = new Date(v)
  return isNaN(d.getTime()) ? '' : d.toISOString()
}

// Loose check, as the classic panel: the server is the real validator.
export const isProbablyIP = (v: string) =>
  /^(\d{1,3}\.){3}\d{1,3}$/.test(v) || (v.includes(':') && /^[0-9a-fA-F:.]+$/.test(v))

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    // clipboard API needs a secure context; plain-HTTP panels fall back to execCommand
    const ta = document.createElement('textarea')
    ta.value = text
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    try {
      return document.execCommand('copy')
    } finally {
      ta.remove()
    }
  }
}

export const expiryText = (c: ClientRow, lifetime: string): string => {
  const d = expiryDate(c)
  return d ? `${d.toLocaleDateString()} ${d.toLocaleTimeString()}` : lifetime
}

// Same text as generateClientTelegramMessage in web/src/app/10-clients.js; Persian on purpose,
// it is pasted into the subscriber's chat.
export function telegramMessage(clientId: string, expStr: string, subUrl: string, regApiUrl: string, secret: string, dnsIP: string, dohLink: string): string {
  const dohBlock = dohLink
    ? `

📱 اگر آیپی شما مدام عوض می‌شود (گوشی یا کامپیوتر):
این آدرس DoH اختصاصی را در تنظیمات «DNS امن» مرورگر یا سیستم‌عامل وارد کنید تا ثبت آیپی خودکار انجام شود و دیگر لازم نباشد دوباره ثبت کنید. این لینک محرمانه است؛ آن را برای کسی نفرستید:
${dohLink}`
    : ''
  const serverLine = dnsIP || '(server address not configured)'
  const secretLine = secret ? secret : '(no secret on file — regenerate it in the panel)'
  return `🎮 اکانت SmartDNS شما آماده است

🔹 کد کاربری : ${clientId}
🔹 تاریخ انقضای پلن : ${expStr}

📄 لینک پنل اشتراک شما (وضعیت، حجم و تمدید):
${subUrl}

📶 دی ان اس اختصاصی شما :
🔹 Primary : ${serverLine}
🔹 Secondary : 1.1.1.1

مراحل ثبت آیپی :
1️⃣ گوشی موبایل و کنسول بازی را به یک اینترنت مشترک وصل کنید .
2️⃣ بدون فیلترشکن، لینک پنل اشتراک بالا را باز کنید .
3️⃣ رمز ثبت زیر را وارد کرده و دکمهٔ «ثبت آیپی من» را بزنید .
❌ در صورت عدم ثبت آیپی، DNS برای شما متصل نخواهد شد ❌

🔑 رمز ثبت آیپی (Registration Secret) :
${secretLine}

🔗 آدرس API ثبت آیپی (برای اتوماسیون):
${regApiUrl}${dohBlock}`
}

export interface Links {
  portal: string
  reg: string
  card: (c: ClientRow, lifetime: string) => string
}

// origin = subscription_origin from /api/config (falls back to where the panel is open);
// dohUrl = doh_url from /api/config; publicIp = public_ip from /api/clients.
export function linksFor(c: ClientRow, origin: string, dohUrl: string, publicIp: string): Links {
  const base = origin || window.location.origin
  const portal = `${base}/sub/${c.token}`
  const reg = `${base}/ip/${c.token}`
  let dns = publicIp
  if (!dns || ['127.0.0.1', '0.0.0.0', 'localhost'].includes(dns)) {
    const h = window.location.hostname
    dns = h && h !== '127.0.0.1' && h !== 'localhost' ? h : publicIp || '127.0.0.1'
  }
  const dohBase = dohUrl.replace(/\/+$/, '')
  const doh = dohBase && c.token && c.register_secret ? `${dohBase}/${c.token}/${c.register_secret}` : ''
  return { portal, reg, card: (cl, lifetime) => telegramMessage(cl.id, expiryText(cl, lifetime), portal, reg, cl.register_secret, dns, doh) }
}
