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

export interface TlsConfig {
  domain?: string
  email?: string
  dot_domain?: string
  panel_https?: boolean
}

export interface AuthSnapshot {
  totp_enabled?: boolean
  totp_configured?: boolean
  totp_enrolling?: boolean
  ldap_enabled?: boolean
  ldap_server_url?: string
  ldap_bind_dn?: string
  ldap_base_dn?: string
  ldap_user_attr?: string
  ldap_login_mode?: string
  ldap_reachable?: boolean | null
}

export interface SubscriptionConfig {
  enabled: boolean
  domain: string
  port: number
  uri_path: string
  title: string
  theme_css: string
  cert_path: string
  key_path: string
  use_panel_certificate: boolean
}

export interface ServerConfig {
  public_ip?: string
  web_port?: number
  admin_username?: string
  admin_path?: string
  api_key?: string
  api_bind?: string
  session_idle_minutes?: number
}

export interface PanelConfig {
  version?: Version
  server?: ServerConfig
  tls?: TlsConfig
  auth?: AuthSnapshot
  subscription?: SubscriptionConfig
  subscription_origin?: string
  doh_url?: string
  public_doh_url?: string
}

export interface ClientRow {
  id: string
  uuid: string
  name: string
  token: string
  allowed_ips: string[] | null
  traffic_limit_gb: number
  traffic_used_bytes: number
  expires_at: string
  last_seen: string
  total_queries: number
  enabled: boolean
  note: string
  custom_policies: string[] | null
  register_secret: string
  traffic_reset_cycle: string
  quota_exceeded?: boolean
  next_traffic_reset?: string
}

export interface ClientsResponse {
  clients: ClientRow[] | null
  allow_all: boolean
  public_ip: string
}

export interface PolicyEntry {
  key: string
  label: string
}

export interface UpdateStatus {
  current: string
  latest: string
  available: boolean
  url?: string
  can_apply: boolean
  blocked_reason?: string
  in_progress: boolean
  checked_at?: string
  error?: string
}

export interface AcmeStatus {
  running: boolean
  purpose?: string
  domain?: string
  stage?: string
  progress?: number
  detail?: string
  error?: string
  last_detail?: string
}

export interface DiagResult {
  name: string
  target: string
  success: boolean
  latency_ms: number
}

export interface DiagReport {
  overall_score: number
  overall_quality: string
  avg_latency_ms: number
  reachable: number
  total: number
  results: DiagResult[]
}

export interface AcmeStatus {
  running: boolean
  purpose?: string
  domain?: string
  stage?: string
  progress?: number
  detail?: string
  error?: string
  last_detail?: string
}

export interface DiagResult {
  name: string
  target: string
  success: boolean
  latency_ms: number
}

export interface DiagReport {
  overall_score: number
  overall_quality: string
  avg_latency_ms: number
  reachable: number
  total: number
  results: DiagResult[]
}
