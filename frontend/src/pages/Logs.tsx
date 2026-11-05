import { CaretRightOutlined, ClearOutlined, PauseOutlined, ReloadOutlined, SearchOutlined } from '@ant-design/icons'
import { Alert, Badge, Button, Card, Empty, Flex, Grid, Input, Select, Space, Table, Tag, Tooltip, Typography } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { BUFFER_MAX, useQueryStream, type QueryItem, type StreamStatus } from '../hooks/useQueryStream'

type Decision = 'PROXY' | 'DIRECT' | 'BLOCK' | 'REFUSED' | 'CUSTOM'
type DecisionFilter = 'ALL' | Decision | 'CACHED'

const COLOR: Record<Decision, string> = { PROXY: 'blue', DIRECT: 'green', BLOCK: 'red', REFUSED: 'orange', CUSTOM: 'purple' }

// Every action string the resolver logs (internal/core/dns/handler.go logQuery call sites)
// folded into the five tags the panel shows. An unknown action returns null and is shown
// verbatim rather than dressed up as DIRECT.
function decisionOf(action: string | undefined): Decision | null {
  const a = action ?? 'DIRECT'
  if (a.startsWith('PROXY')) return 'PROXY'
  if (a === 'BLOCK') return 'BLOCK'
  if (a === 'REFUSED' || a === 'RATELIMIT' || a === 'QUOTA') return 'REFUSED'
  if (a === 'CUSTOM') return 'CUSTOM'
  if (a === 'DIRECT' || a === 'STALE' || a === 'CACHED') return 'DIRECT'
  return null
}

const latencyOf = (q: QueryItem) => (typeof q.latency_ms === 'number' ? q.latency_ms : null)
const timeOf = (q: QueryItem) => {
  const d = q.timestamp ? new Date(q.timestamp) : null
  return d && !Number.isNaN(d.getTime()) ? d.toLocaleTimeString() : '—'
}

function matches(q: QueryItem, f: DecisionFilter, needle: string): boolean {
  if (f === 'CACHED' ? !q.cached : f !== 'ALL' && decisionOf(q.action) !== f) return false
  if (!needle) return true
  return [q.domain, q.client_ip, q.account_name, q.rule_matched].some((v) => (v ?? '').toLowerCase().includes(needle))
}

const STATUS_COLOR: Record<StreamStatus, 'success' | 'processing' | 'warning'> = { live: 'success', connecting: 'processing', reconnecting: 'warning' }

export default function Logs() {
  const { t, i18n } = useTranslation()
  const screens = Grid.useBreakpoint()
  const wide = screens.md === true
  const [paused, setPaused] = useState(false)
  const [filter, setFilter] = useState<DecisionFilter>('ALL')
  const [text, setText] = useState('')
  const { rows, status, retryIn, missed, clear, reconnect } = useQueryStream(paused)

  // The virtual table needs a numeric height. Size it to the viewport, minus the page chrome above it.
  const [h, setH] = useState(() => window.innerHeight)
  useEffect(() => {
    const on = () => setH(window.innerHeight)
    window.addEventListener('resize', on)
    return () => window.removeEventListener('resize', on)
  }, [])
  const tableH = Math.max(240, h - (wide ? 330 : 400))

  const needle = text.trim().toLowerCase()
  const shown = useMemo(() => rows.filter((q) => matches(q, filter, needle)), [rows, filter, needle])

  const columns = useMemo<ColumnsType<QueryItem>>(() => {
    const cols: ColumnsType<QueryItem> = [
      { title: t('logs.col.time'), key: 'time', width: wide ? 100 : 84, render: (_: unknown, q) => <Typography.Text type="secondary" style={{ fontSize: 12 }}>{timeOf(q)}</Typography.Text> },
      { title: t('logs.col.domain'), key: 'domain', width: wide ? 220 : 170, ellipsis: true, render: (_: unknown, q) => <Typography.Text dir="ltr" style={{ fontFamily: 'monospace' }}>{q.domain || '—'}</Typography.Text> },
    ]
    if (wide) {
      cols.push({
        title: t('logs.col.client'),
        key: 'client',
        width: 140,
        ellipsis: true,
        render: (_: unknown, q) =>
          q.account_name && q.account_name !== 'Public' ? (
            <div style={{ lineHeight: 1.2 }}>
              <Typography.Text strong>{q.account_name}</Typography.Text>
              <div><Typography.Text type="secondary" dir="ltr" style={{ fontSize: 12 }}>{q.client_ip}</Typography.Text></div>
            </div>
          ) : (
            <div style={{ lineHeight: 1.2 }}>
              <Typography.Text dir="ltr">{q.client_ip || '—'}</Typography.Text>
              <div><Typography.Text type="secondary" style={{ fontSize: 12 }}>{t('logs.public')}</Typography.Text></div>
            </div>
          ),
      })
      cols.push({ title: t('logs.col.protocol'), key: 'proto', width: 74, render: (_: unknown, q) => <Tag bordered={false}>{q.protocol || 'UDP'}</Tag> })
      cols.push({ title: t('logs.col.rule'), key: 'rule', width: 150, ellipsis: true, render: (_: unknown, q) => <Typography.Text type="secondary">{q.rule_matched || '—'}</Typography.Text> })
    }
    cols.push({
      title: t('logs.col.decision'),
      key: 'decision',
      width: wide ? 150 : 120,
      render: (_: unknown, q) => {
        const d = decisionOf(q.action)
        return (
          <Space size={4} wrap={false}>
            <Tooltip title={d ? `${t(`logs.tip.${d}`)} (${q.action})` : q.action}>
              <Tag color={d ? COLOR[d] : undefined} style={{ marginInlineEnd: 0 }}>{d ? t(`logs.tag.${d}`) : q.action}</Tag>
            </Tooltip>
            {q.cached && (
              <Tooltip title={t('logs.tip.CACHED')}>
                <Tag color="cyan" style={{ marginInlineEnd: 0 }}>{t('logs.tag.CACHED')}</Tag>
              </Tooltip>
            )}
          </Space>
        )
      },
    })
    cols.push({
      title: t('logs.col.latency'),
      key: 'lat',
      width: 90,
      align: 'end',
      render: (_: unknown, q) => {
        const l = latencyOf(q)
        return <Typography.Text type="secondary" dir="ltr" style={{ fontVariantNumeric: 'tabular-nums' }}>{l === null ? '—' : `${l.toFixed(1)} ms`}</Typography.Text>
      },
    })
    return cols
    // i18n.language: t identity may not change on a language switch.
  }, [t, i18n.language, wide])

  const decisionOptions = [
    { value: 'ALL', label: t('logs.all') },
    ...(['PROXY', 'DIRECT', 'BLOCK', 'CACHED', 'REFUSED', 'CUSTOM'] as const).map((v) => ({ value: v, label: t(`logs.tag.${v}`) })),
  ]

  const statusText =
    paused ? t('logs.status.paused') : status === 'reconnecting' ? t('logs.status.reconnecting', { s: Math.max(retryIn, 0) }) : t(`logs.status.${status}`)

  let body
  if (rows.length === 0) {
    body = <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={<><div>{t('logs.waiting')}</div><Typography.Text type="secondary">{t('logs.waitingHint')}</Typography.Text></>} style={{ padding: '48px 0' }} />
  } else if (shown.length === 0) {
    body = (
      <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('logs.noMatch')} style={{ padding: '48px 0' }}>
        <Button onClick={() => { setFilter('ALL'); setText('') }}>{t('logs.clearFilter')}</Button>
      </Empty>
    )
  } else {
    body = (
      <Table<QueryItem>
        virtual
        size="small"
        columns={columns}
        dataSource={shown}
        rowKey={(q) => `${q.id ?? ''}|${q.timestamp ?? ''}|${q.domain ?? ''}|${q.client_ip ?? ''}`}
        pagination={false}
        scroll={{ x: wide ? 930 : 470, y: tableH }}
      />
    )
  }

  return (
    <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
      <Flex justify="space-between" align="flex-end" gap={12} wrap>
        <div>
          <Typography.Title level={3} style={{ margin: 0 }}>{t('logs.title')}</Typography.Title>
          <Typography.Text type="secondary">{t('logs.subtitle', { max: BUFFER_MAX })}</Typography.Text>
        </div>
        <Space wrap>
          <Badge status={paused ? 'default' : STATUS_COLOR[status]} text={statusText} />
          {status === 'reconnecting' && <Button size="small" icon={<ReloadOutlined />} onClick={reconnect}>{t('logs.reconnect')}</Button>}
        </Space>
      </Flex>

      <Card size="small" styles={{ body: { padding: 12 } }}>
        <Flex gap={8} wrap align="center">
          <Input allowClear prefix={<SearchOutlined />} placeholder={t('logs.search')} value={text} onChange={(e) => setText(e.target.value)} style={{ flex: '1 1 220px', minWidth: 0 }} />
          <Select<DecisionFilter> value={filter} onChange={setFilter} options={decisionOptions} style={{ minWidth: 130 }} aria-label={t('logs.decision')} />
          <Button type={paused ? 'primary' : 'default'} icon={paused ? <CaretRightOutlined /> : <PauseOutlined />} onClick={() => setPaused((p) => !p)}>
            {paused ? t('logs.resume') : t('logs.pause')}
          </Button>
          <Button icon={<ClearOutlined />} onClick={clear} disabled={rows.length === 0}>{t('logs.clear')}</Button>
        </Flex>
        <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 8 }}>
          {t('logs.shown', { shown: shown.length, total: rows.length })}
          {paused && missed > 0 && ` · ${t('logs.missed', { n: missed })}`}
        </Typography.Text>
      </Card>

      {status === 'reconnecting' && rows.length > 0 && <Alert type="warning" showIcon title={statusText} />}
      <Card size="small" styles={{ body: { padding: 0 } }}>{body}</Card>
    </Space>
  )
}
