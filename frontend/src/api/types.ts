export interface Latency {
  p50_ms?: number
  p95_ms?: number
  p99_ms?: number
  max_ms?: number
  count?: number
}

export interface UpstreamStat {
  address: string
  latency_ms?: number
  healthy?: boolean
  [k: string]: unknown
}

// Subset of GET /api/stats that the Overview uses.
export interface Stats {
  qps: number
  total_queries: number
  cache_entries: number
  cache_hit_ratio: number
  active_relays: number
  total_relays: number
  bytes_sent: number
  bytes_recv: number
  speed_in_kbps: number
  speed_out_kbps: number
  uptime_sec: number
  num_cpu: number
  num_goroutines: number
  rate_limited: number
  rate_limit_qps: number
  access_denied: number
  system_cpu_percent: number
  system_mem_used_mb: number
  system_mem_total_mb: number
  system_mem_percent: number
  ram_usage_mb: number
  relays_refused: number
  relays_unreadable: number
  latency?: Latency
  latency_uncached?: Latency
  upstreams: UpstreamStat[]
}

export interface Version {
  display: string
  hash: string
}

export interface PanelConfig {
  version?: Version
  server?: { public_ip?: string; admin_username?: string }
  auth?: { totp_enabled?: boolean }
  doh_url?: string
}

export interface UpdateStatus {
  current: string
  latest: string
  available: boolean
  url?: string
  can_apply: boolean
  blocked_reason?: string
  in_progress: boolean
}
