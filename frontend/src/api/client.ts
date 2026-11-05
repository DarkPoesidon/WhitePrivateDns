// The panel lives under /<16-hex admin path>/ui/. Every API call goes through
// api() so it carries that prefix; the legacy dashboard does the same.
export const ADMIN_BASE = (() => {
  const m = window.location.pathname.match(/^\/([0-9a-f]{16})(?=\/|$)/)
  return m ? `/${m[1]}` : ''
})()

const TOKEN_KEY = 'whiteprivatedns_token' // shared with the login page and the legacy dashboard

export const api = (path: string) => ADMIN_BASE + path
export const getToken = () => localStorage.getItem(TOKEN_KEY) ?? ''
export const setToken = (v: string) => localStorage.setItem(TOKEN_KEY, v)
export const loginUrl = () => `${ADMIN_BASE}/login`

export function signOut() {
  localStorage.removeItem(TOKEN_KEY)
  window.location.assign(loginUrl())
}

// Admin-path rotation moves the login to another namespace, so the target is overridable.
export function signOutTo(loginPath: string) {
  localStorage.removeItem(TOKEN_KEY)
  window.location.assign(loginPath)
}

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

// request returns parsed JSON, turns a 401 into a sign-out (sessions live in
// memory and die with a daemon restart), and surfaces the server's own error text.
export async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(api(path), {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${getToken()}`,
      ...init.headers,
    },
  })
  if (res.status === 401) {
    signOut()
    throw new ApiError(401, 'Session expired')
  }
  if (!res.ok) {
    let msg = res.statusText
    try {
      const body = await res.json()
      if (body?.error) msg = String(body.error)
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(res.status, msg)
  }
  return (await res.json()) as T
}

export const post = <T,>(path: string, body: unknown) =>
  request<T>(path, { method: 'POST', body: JSON.stringify(body) })
