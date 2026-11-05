import { useQuery } from '@tanstack/react-query'
import { Alert, Card, Col, Progress, Row, Space, Statistic, Table, Tag, Typography } from 'antd'
import { useTranslation } from 'react-i18next'
import { request } from '../api/client'
import type { Stats } from '../api/types'

const pct = (v: number | undefined) => (v === undefined || v < 0 ? null : Math.min(100, Math.round(v)))
const bytes = (n: number) => {
  const u = ['B', 'KB', 'MB', 'GB', 'TB']
  let i = 0
  while (n >= 1024 && i < u.length - 1) {
    n /= 1024
    i++
  }
  return `${n.toFixed(i ? 1 : 0)} ${u[i]}`
}
const duration = (s: number) => {
  const d = Math.floor(s / 86400)
  const h = Math.floor((s % 86400) / 3600)
  const m = Math.floor((s % 3600) / 60)
  return d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : `${m}m`
}
const ms = (v: number | undefined) => (v === undefined ? '—' : `${v.toFixed(v < 10 ? 2 : 1)} ms`)

// value is null when the platform cannot report the metric (the daemon sends -1).
function Gauge({ label, value, sub }: { label: string; value: number | null; sub?: string }) {
  const v = value ?? 0
  return (
    <div style={{ textAlign: 'center' }}>
      <Progress type="dashboard" percent={v} size={120} format={(p) => (value === null ? '—' : `${p}%`)} strokeColor={v > 85 ? '#ff4d4f' : v > 65 ? '#faad14' : '#12a37f'} />
      <div>
        <Typography.Text strong>{label}</Typography.Text>
      </div>
      {sub && <Typography.Text type="secondary">{sub}</Typography.Text>}
    </div>
  )
}

export default function Overview() {
  const { t } = useTranslation()
  const { data: s, error, refetch } = useQuery({
    queryKey: ['stats'],
    queryFn: () => request<Stats>('/api/stats'),
    refetchInterval: 2000,
  })

  if (error && !s) {
    return <Alert type="error" showIcon title={String(error.message)} action={<a onClick={() => void refetch()}>{t('common.retry')}</a>} />
  }
  if (!s) return <Card loading />

  const lat = s.latency_uncached ?? s.latency
  return (
    <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
      <div>
        <Typography.Title level={3} style={{ margin: 0 }}>
          {t('overview.title')}
        </Typography.Title>
        <Typography.Text type="secondary">{t('overview.subtitle')}</Typography.Text>
      </div>

      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} xl={6}>
          <Card>
            <Statistic title={t('overview.queryRate')} value={s.qps} precision={1} suffix="QPS" />
            <Typography.Text type="secondary">
              {t('overview.totalQueries')}: {s.total_queries.toLocaleString()}
            </Typography.Text>
          </Card>
        </Col>
        <Col xs={24} sm={12} xl={6}>
          <Card>
            <Statistic title={`${t('overview.cache')} ${t('overview.hitRatio')}`} value={s.cache_hit_ratio * (s.cache_hit_ratio <= 1 ? 100 : 1)} precision={1} suffix="%" />
            <Typography.Text type="secondary">
              {s.cache_entries.toLocaleString()} {t('overview.items')}
            </Typography.Text>
          </Card>
        </Col>
        <Col xs={24} sm={12} xl={6}>
          <Card>
            <Statistic title={t('overview.relay')} value={s.active_relays} suffix={t('overview.activeRelays')} />
            <Space size={4} wrap>
              <Tag>{`${t('overview.totalRelays')}: ${s.total_relays}`}</Tag>
              <Tag color={s.relays_refused ? 'orange' : undefined}>{`${t('overview.refused')}: ${s.relays_refused}`}</Tag>
              <Tag color={s.relays_unreadable ? 'orange' : undefined}>{`${t('overview.unreadable')}: ${s.relays_unreadable}`}</Tag>
            </Space>
          </Card>
        </Col>
        <Col xs={24} sm={12} xl={6}>
          <Card>
            <Statistic title={t('overview.traffic')} value={`↓ ${s.speed_in_kbps.toFixed(1)}  ↑ ${s.speed_out_kbps.toFixed(1)}`} suffix="KB/s" />
            <Typography.Text type="secondary">
              {bytes(s.bytes_recv)} ↓ · {bytes(s.bytes_sent)} ↑
            </Typography.Text>
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={14}>
          <Card title={t('overview.system')}>
            <Row gutter={16} justify="space-around">
              <Col>
                <Gauge label={t('overview.cpu')} value={pct(s.system_cpu_percent)} sub={`${s.num_cpu} ${t('overview.cores')}`} />
              </Col>
              <Col>
                <Gauge
                  label={t('overview.memory')}
                  value={pct(s.system_mem_percent)}
                  sub={s.system_mem_total_mb > 0 ? `${Math.round(s.system_mem_used_mb)} / ${Math.round(s.system_mem_total_mb)} MB` : undefined}
                />
              </Col>
              <Col>
                <Space orientation="vertical" size={4} style={{ paddingTop: 24 }}>
                  <Statistic title={t('overview.uptime')} value={duration(s.uptime_sec)} />
                  <Typography.Text type="secondary">
                    {t('overview.goroutines')}: {s.num_goroutines}
                  </Typography.Text>
                </Space>
              </Col>
            </Row>
          </Card>
        </Col>
        <Col xs={24} lg={10}>
          <Card title={t('overview.latency')} extra={<Typography.Text type="secondary">{t('overview.latencyHint')}</Typography.Text>}>
            <Row gutter={[8, 8]}>
              {(
                [
                  ['p50', lat?.p50_ms],
                  ['p95', lat?.p95_ms],
                  ['p99', lat?.p99_ms],
                  ['max', lat?.max_ms],
                ] as const
              ).map(([k, v]) => (
                <Col span={12} key={k}>
                  <Statistic title={t(`overview.${k}`)} value={ms(v)} />
                </Col>
              ))}
            </Row>
          </Card>
          <Card title={t('overview.limits')} style={{ marginTop: 16 }}>
            <Space size="large" wrap>
              <Statistic title={t('overview.rateLimited')} value={s.rate_limited} />
              <Statistic title={t('overview.accessDenied')} value={s.access_denied} />
              <Statistic title={t('overview.limit')} value={s.rate_limit_qps || '—'} suffix={s.rate_limit_qps ? '/s' : undefined} />
            </Space>
          </Card>
        </Col>
      </Row>

      <Card title={t('overview.upstreams')}>
        <Table
          size="small"
          rowKey="address"
          pagination={false}
          dataSource={s.upstreams}
          locale={{ emptyText: t('overview.noData') }}
          scroll={{ x: true }}
          columns={[
            { title: t('overview.address'), dataIndex: 'address', render: (v: string) => <code dir="ltr">{v}</code> },
            { title: 'Latency', dataIndex: 'latency_ms', render: (v?: number) => ms(v) },
            {
              title: t('overview.status'),
              dataIndex: 'healthy',
              render: (v?: boolean) => <Tag color={v === false ? 'error' : 'success'}>{v === false ? t('overview.degraded') : t('overview.healthy')}</Tag>,
            },
          ]}
        />
      </Card>
    </Space>
  )
}
