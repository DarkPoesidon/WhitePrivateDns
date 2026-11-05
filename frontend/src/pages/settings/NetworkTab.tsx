import { Alert, App, Button, Card, Input, Popconfirm, Space, Table, Tag, Typography } from 'antd'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { post, request } from '../../api/client'
import type { DiagReport, Stats } from '../../api/types'
import { errText } from '../../lib/panel'

function Upstreams() {
  const { t } = useTranslation()
  const { message } = App.useApp()
  const qc = useQueryClient()
  const [addr, setAddr] = useState('')
  const stats = useQuery({ queryKey: ['stats'], queryFn: () => request<Stats>('/api/stats'), refetchInterval: 4000 })
  const refresh = () => qc.invalidateQueries({ queryKey: ['stats'] })
  const onErr = (e: unknown) => void message.error(errText(e, t('shared.failed')))

  const add = useMutation({
    mutationFn: () => post('/api/upstreams/add', { address: addr.trim() }),
    onSuccess: () => {
      setAddr('')
      void message.success(t('settings.network.upstreamAdded'))
      void refresh()
    },
    onError: onErr,
  })
  const remove = useMutation({
    mutationFn: (address: string) => post('/api/upstreams/delete', { address }),
    onSuccess: () => {
      void message.info(t('settings.network.upstreamRemoved'))
      void refresh()
    },
    onError: onErr,
  })
  const bench = useMutation({
    mutationFn: () => post('/api/benchmark', {}),
    onSuccess: () => {
      void message.info(t('settings.network.benchStarted'))
      setTimeout(() => void refresh(), 1500)
      setTimeout(() => void refresh(), 4000)
    },
    // 409 = a run is already in flight; that is not a failure worth a red toast.
    onError: (e) => void message.info(errText(e, t('settings.network.benchRunning'))),
  })

  const rows = stats.data?.upstreams ?? []
  return (
    <Card
      title={t('settings.network.upstreams')}
      extra={
        <Button loading={bench.isPending} onClick={() => bench.mutate()}>
          {t('settings.network.benchmark')}
        </Button>
      }
    >
      <Space orientation="vertical" style={{ width: '100%' }}>
        <Space.Compact style={{ width: '100%', maxWidth: 420 }}>
          <Input dir="ltr" value={addr} onChange={(e) => setAddr(e.target.value)} onPressEnter={() => addr.trim() && add.mutate()} placeholder="1.1.1.1:53" />
          <Button type="primary" loading={add.isPending} disabled={!addr.trim()} onClick={() => add.mutate()}>
            {t('shared.add')}
          </Button>
        </Space.Compact>
        {stats.error && !stats.data ? (
          <Alert type="error" showIcon title={errText(stats.error, t('shared.failed'))} action={<a onClick={() => void stats.refetch()}>{t('common.retry')}</a>} />
        ) : (
          <Table
            size="small"
            rowKey="address"
            loading={stats.isLoading}
            dataSource={rows}
            pagination={false}
            scroll={{ x: 'max-content' }}
            locale={{ emptyText: t('overview.noData') }}
            columns={[
              { title: t('overview.address'), dataIndex: 'address', render: (v: string) => <code dir="ltr">{v}</code> },
              { title: t('overview.status'), dataIndex: 'healthy', render: (v: boolean | undefined) => (v === false ? <Tag color="red">{t('overview.degraded')}</Tag> : <Tag color="green">{t('overview.healthy')}</Tag>) },
              { title: 'ms', dataIndex: 'latency_ms', render: (v: number | undefined) => (typeof v === 'number' && v > 0 ? v.toFixed(1) : '—') },
              {
                key: 'rm',
                align: 'end' as const,
                render: (_: unknown, r: { address: string }) => (
                  <Popconfirm
                    title={t('settings.network.removeTitle')}
                    description={t('settings.network.removeBody', { addr: r.address })}
                    okText={t('shared.remove')}
                    okButtonProps={{ danger: true }}
                    cancelText={t('common.cancel')}
                    disabled={rows.length <= 1}
                    onConfirm={() => remove.mutate(r.address)}
                  >
                    <Button size="small" danger disabled={rows.length <= 1} title={rows.length <= 1 ? t('settings.network.lastUpstream') : undefined}>
                      {t('shared.remove')}
                    </Button>
                  </Popconfirm>
                ),
              },
            ]}
          />
        )}
      </Space>
    </Card>
  )
}

function Maintenance() {
  const { t } = useTranslation()
  const { message } = App.useApp()
  const flush = useMutation({
    mutationFn: () => post('/api/cache/flush', {}),
    onSuccess: () => void message.success(t('settings.network.flushed')),
    onError: (e) => void message.error(errText(e, t('shared.failed'))),
  })
  const diag = useMutation({ mutationFn: () => post<DiagReport>('/api/diagnostics/run', {}) })
  const d = diag.data
  return (
    <Card title={t('settings.network.maintenance')}>
      <Space orientation="vertical" style={{ width: '100%' }}>
        <Typography.Text type="secondary">{t('settings.network.flushHelp')}</Typography.Text>
        <div>
          <Popconfirm title={t('settings.network.flushTitle')} description={t('settings.network.flushBody')} okText={t('settings.network.flush')} cancelText={t('common.cancel')} onConfirm={() => flush.mutate()}>
            <Button loading={flush.isPending}>{t('settings.network.flush')}</Button>
          </Popconfirm>
        </div>
        <Typography.Text type="secondary">{t('settings.network.diagHelp')}</Typography.Text>
        <div>
          <Button type="primary" loading={diag.isPending} onClick={() => diag.mutate()}>
            {diag.isPending ? t('settings.network.diagRunning') : t('settings.network.diagRun')}
          </Button>
        </div>
        {diag.error && <Alert type="error" showIcon title={errText(diag.error, t('shared.failed'))} />}
        {d && (
          <>
            <Space wrap>
              <Tag color={d.overall_score >= 70 ? 'green' : d.overall_score >= 50 ? 'orange' : 'red'}>{d.overall_quality}</Tag>
              <Typography.Text>{t('settings.network.diagSummary', { ok: d.reachable, total: d.total, avg: d.avg_latency_ms })}</Typography.Text>
            </Space>
            <Table
              size="small"
              rowKey="target"
              pagination={false}
              dataSource={d.results}
              scroll={{ x: 'max-content' }}
              columns={[
                { title: t('settings.network.target'), dataIndex: 'name' },
                { title: t('overview.status'), dataIndex: 'success', render: (v: boolean) => (v ? <Tag color="green">{t('settings.network.reachable')}</Tag> : <Tag color="red">{t('settings.network.unreachable')}</Tag>) },
                { title: 'ms', dataIndex: 'latency_ms', render: (v: number, r: { success: boolean }) => (r.success ? v.toFixed(0) : '—') },
              ]}
            />
          </>
        )}
      </Space>
    </Card>
  )
}

export default function NetworkTab() {
  return (
    <div className="card-columns">
      <Upstreams />
      <Maintenance />
    </div>
  )
}
