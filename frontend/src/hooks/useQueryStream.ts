import { useCallback, useEffect, useRef, useState } from 'react'
import { api, post } from '../api/client'

// One DNS query as internal/database QueryLogItem serialises it.
export interface QueryItem {
  id?: number
  timestamp?: string
  client_ip?: string
  account_name?: string
  protocol?: string
  domain?: string
  rule_matched?: string
  action?: string
  latency_ms?: number
  cached?: boolean
}

export type StreamStatus = 'connecting' | 'live' | 'reconnecting'

export const BUFFER_MAX = 500
const BACKOFF_MIN = 1000
const BACKOFF_MAX = 15000
const FLUSH_MS = 250

// useQueryStream keeps /events/stream open. EventSource cannot send headers, so each
// connection first buys a single-use 60 s ticket (POST /api/auth/sse-ticket). A ticket is
// burned on use, which also means the browser's built-in auto-reconnect (same URL) always
// fails with 401: on any error we close the source and reconnect ourselves with a fresh
// ticket and exponential backoff.
export function useQueryStream(paused: boolean) {
  const [rows, setRows] = useState<QueryItem[]>([])
  const [status, setStatus] = useState<StreamStatus>('connecting')
  const [retryIn, setRetryIn] = useState(0)
  const [missed, setMissed] = useState(0)

  const buf = useRef<QueryItem[]>([])
  const dirty = useRef(false)
  const pausedRef = useRef(paused)
  const missedRef = useRef(0)
  const connectRef = useRef<() => void>(() => {})

  useEffect(() => {
    pausedRef.current = paused
    if (!paused) {
      missedRef.current = 0
      setMissed(0)
      dirty.current = true
    }
  }, [paused])

  useEffect(() => {
    let es: EventSource | null = null
    let retryTimer: ReturnType<typeof setTimeout> | undefined
    let tick: ReturnType<typeof setInterval> | undefined
    let attempt = 0
    let closed = false

    const scheduleRetry = () => {
      if (closed) return
      const delay = Math.min(BACKOFF_MAX, BACKOFF_MIN * 2 ** attempt)
      attempt++
      setStatus('reconnecting')
      let left = Math.ceil(delay / 1000)
      setRetryIn(left)
      tick = setInterval(() => setRetryIn(--left), 1000)
      retryTimer = setTimeout(() => {
        clearInterval(tick)
        void connect()
      }, delay)
    }

    const connect = async () => {
      if (closed) return
      clearTimeout(retryTimer)
      clearInterval(tick)
      es?.close()
      setStatus((s) => (s === 'live' ? s : 'connecting'))
      try {
        const { ticket } = await post<{ ticket: string }>('/api/auth/sse-ticket', {})
        if (closed) return
        es = new EventSource(`${api('/events/stream')}?ticket=${encodeURIComponent(ticket)}`)
      } catch {
        scheduleRetry()
        return
      }
      const src = es
      src.addEventListener('history', (ev) => {
        try {
          const list: unknown = JSON.parse((ev as MessageEvent<string>).data)
          // A (re)connect replays the server's recent log: replace, never append, or rows duplicate.
          if (Array.isArray(list)) buf.current = (list as QueryItem[]).slice(0, BUFFER_MAX)
          dirty.current = true
          attempt = 0
          setStatus('live')
        } catch {
          /* malformed frame: skip */
        }
      })
      src.addEventListener('query', (ev) => {
        if (pausedRef.current) {
          missedRef.current++
          return
        }
        try {
          buf.current.unshift(JSON.parse((ev as MessageEvent<string>).data) as QueryItem)
          if (buf.current.length > BUFFER_MAX) buf.current.length = BUFFER_MAX
          dirty.current = true
        } catch {
          /* malformed frame: skip */
        }
      })
      src.onopen = () => setStatus('live')
      src.onerror = () => {
        src.close()
        scheduleRetry()
      }
    }
    connectRef.current = () => {
      attempt = 0
      void connect()
    }

    // Coalesce bursts: at wire rate one setState per query would re-render the table hundreds of times a second.
    const flush = setInterval(() => {
      if (missedRef.current) setMissed(missedRef.current)
      if (!dirty.current || pausedRef.current || document.visibilityState === 'hidden') return
      dirty.current = false
      setRows(buf.current.slice())
    }, FLUSH_MS)

    void connect()
    return () => {
      closed = true
      clearInterval(flush)
      clearInterval(tick)
      clearTimeout(retryTimer)
      es?.close()
    }
  }, [])

  const clear = useCallback(() => {
    buf.current = []
    dirty.current = false
    setRows([])
  }, [])
  const reconnect = useCallback(() => connectRef.current(), [])

  return { rows, status, retryIn, missed, clear, reconnect }
}
