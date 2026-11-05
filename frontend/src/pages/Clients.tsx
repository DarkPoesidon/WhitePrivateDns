import {
  CopyOutlined,
  DeleteOutlined,
  EditOutlined,
  FieldTimeOutlined,
  LinkOutlined,
  PauseCircleOutlined,
  PlayCircleOutlined,
  PlusOutlined,
  SearchOutlined,
  SendOutlined,
} from '@ant-design/icons'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Alert, App, Button, Card, Dropdown, Empty, Form, Grid, Input, Modal, Progress, Select, Space, Switch, Table, Tag, Tooltip, Typography } from 'antd'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { post, request } from '../api/client'
import type { ClientRow, ClientsResponse, PanelConfig } from '../api/types'
import ClientFormModal from './clients/ClientFormModal'
import { copyText, expiryDate, formatBytes, isProbablyIP, lastSeenDate, linksFor, statusOf, type Links, type Status } from './clients/helpers'

const STATUS_COLOR: Record<Status, string> = { active: 'success', disabled: 'default', expired: 'error', noQuota: 'warning' }

interface Actions {
  edit: (c: ClientRow) => void
  toggle: (c: ClientRow) => void
  renew: (c: ClientRow) => void
  remove: (c: ClientRow) => void
  setIp: (c: ClientRow) => void
  removeIp: (c: ClientRow, ip: string) => void
  copy: (text: string, doneMsg?: string) => void
  links: (c: ClientRow) => Links
}

function StatusTag({ c }: { c: ClientRow }) {
  const { t } = useTranslation()
  const s = statusOf(c)
  return <Tag color={STATUS_COLOR[s]} style={{ marginInlineEnd: 0 }}>{t(`clients.${s}`)}</Tag>
}

function Expiry({ c }: { c: ClientRow }) {
  const { t } = useTranslation()
  const d = expiryDate(c)
  if (!d) return <Typography.Text type="secondary">{t('clients.lifetime')}</Typography.Text>
  const ms = d.getTime() - Date.now()
  return (
    <div>
      <div>{d.toLocaleDateString()}</div>
      <Typography.Text type={ms > 0 ? 'secondary' : 'danger'} style={{ fontSize: 12 }}>
        {ms > 0 ? t('clients.remaining', { d: Math.floor(ms / 86400000), h: Math.floor((ms % 86400000) / 3600000) }) : t('clients.expired')}
      </Typography.Text>
    </div>
  )
}

function Traffic({ c }: { c: ClientRow }) {
  const { t } = useTranslation()
  const used = c.traffic_used_bytes > 0 ? c.traffic_used_bytes : 0
  const limit = c.traffic_limit_gb > 0 ? c.traffic_limit_gb : 0
  const next = c.next_traffic_reset ? new Date(c.next_traffic_reset) : null
  const pct = limit ? Math.min(100, Math.round((used / (limit * 1024 ** 3)) * 100)) : 0
  return (
    <div style={{ minWidth: 140 }}>
      {limit > 0 && <Progress percent={pct} size="small" status={c.quota_exceeded ? 'exception' : pct >= 80 ? 'normal' : 'active'} strokeColor={c.quota_exceeded ? undefined : pct >= 80 ? '#faad14' : undefined} showInfo={false} style={{ marginBottom: 0 }} />}
      <Typography.Text style={{ fontSize: 12 }} type="secondary">
        <bdi dir="ltr">{formatBytes(used)} / {limit ? `${limit} GB` : ''}</bdi>
        {!limit && t('clients.unlimited')}
      </Typography.Text>
      {next && !isNaN(next.getTime()) && (
        <div>
          <Typography.Text type="secondary" style={{ fontSize: 11 }}>
            {t('clients.resets', { date: next.toLocaleDateString() })}
          </Typography.Text>
        </div>
      )}
    </div>
  )
}

function IpCell({ c, a }: { c: ClientRow; a: Actions }) {
  const { t } = useTranslation()
  const ips = c.allowed_ips ?? []
  return (
    <Space size={4} wrap>
      {ips.length === 0 && <Typography.Text type="secondary">{t('clients.noIp')}</Typography.Text>}
      {ips.map((ip) => (
        <Tag key={ip} closable onClose={(e) => { e.preventDefault(); a.removeIp(c, ip) }} style={{ direction: 'ltr', marginInlineEnd: 0 }} closeIcon={<span aria-label={t('clients.removeIp')} title={t('clients.removeIp')}>×</span>}>
          {ip}
        </Tag>
      ))}
      <Button type="link" size="small" onClick={() => a.setIp(c)}>
        {t('clients.setIp')}
      </Button>
    </Space>
  )
}

function RowActions({ c, a }: { c: ClientRow; a: Actions }) {
  const { t } = useTranslation()
  const l = a.links(c)
  const lifetime = t('clients.lifetime')
  return (
    <Space size={0}>
      <Tooltip title={t('clients.edit')}>
        <Button type="text" icon={<EditOutlined />} aria-label={t('clients.edit')} onClick={() => a.edit(c)} />
      </Tooltip>
      <Tooltip title={c.enabled ? t('clients.disable') : t('clients.enable')}>
        <Button type="text" icon={c.enabled ? <PauseCircleOutlined /> : <PlayCircleOutlined />} aria-label={c.enabled ? t('clients.disable') : t('clients.enable')} onClick={() => a.toggle(c)} />
      </Tooltip>
      <Tooltip title={t('clients.renew')}>
        <Button type="text" icon={<FieldTimeOutlined />} aria-label={t('clients.renew')} onClick={() => a.renew(c)} />
      </Tooltip>
      <Dropdown
        trigger={['click']}
        menu={{
          items: [
            { key: 'portal', icon: <LinkOutlined />, label: t('clients.copyPortal'), onClick: () => a.copy(l.portal) },
            { key: 'reg', icon: <LinkOutlined />, label: t('clients.copyReg'), onClick: () => a.copy(l.reg) },
            { key: 'card', icon: <SendOutlined />, label: t('clients.copyCard'), onClick: () => a.copy(l.card(c, lifetime), t('clients.cardCopied')) },
            { key: 'uuid', icon: <CopyOutlined />, label: t('clients.copyUuid'), disabled: !c.uuid, onClick: () => a.copy(c.uuid) },
          ],
        }}
      >
        <Button type="text" icon={<CopyOutlined />} aria-label={t('clients.copy')} />
      </Dropdown>
      <Tooltip title={t('clients.delete')}>
        <Button type="text" danger icon={<DeleteOutlined />} aria-label={t('clients.delete')} onClick={() => a.remove(c)} />
      </Tooltip>
    </Space>
  )
}

function ClientCard({ c, a }: { c: ClientRow; a: Actions }) {
  const { t, i18n } = useTranslation()
  const seen = lastSeenDate(c)
  return (
    <Card size="small" title={<Space wrap>{c.name}<StatusTag c={c} /></Space>} extra={<Typography.Text type="secondary" style={{ fontSize: 12 }}>{c.id}</Typography.Text>}>
      <Space orientation="vertical" size={8} style={{ width: '100%' }}>
        <IpCell c={c} a={a} />
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>{t('clients.colExpiry')}</Typography.Text>
            <Expiry c={c} />
          </div>
          <div style={{ flex: 1, maxWidth: 180 }}>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>{t('clients.colTraffic')}</Typography.Text>
            <Traffic c={c} />
          </div>
        </div>
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          {t('clients.colQueries')}: {c.total_queries.toLocaleString(i18n.language)} · {t('clients.colSeen')}: {seen ? seen.toLocaleString() : t('clients.never')}
        </Typography.Text>
        <RowActions c={c} a={a} />
      </Space>
    </Card>
  )
}

function SetIpModal({ client, onClose }: { client: ClientRow | null; onClose: () => void }) {
  const { t } = useTranslation()
  const { message } = App.useApp()
  const qc = useQueryClient()
  const [form] = Form.useForm<{ ip: string }>()
  const save = useMutation({
    mutationFn: (ip: string) => post('/api/clients/add_ip', { id: client?.id, ip }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['clients'] })
      void message.success(t('clients.ipSet'))
      onClose()
    },
    onError: (e: Error) => void message.error(e.message),
  })
  return (
    <Modal
      open={client !== null}
      title={t('clients.setIpTitle')}
      onCancel={onClose}
      onOk={() => form.submit()}
      okText={t('clients.save')}
      cancelText={t('common.cancel')}
      confirmLoading={save.isPending}
      afterOpenChange={(o) => o && form.setFieldsValue({ ip: client?.allowed_ips?.[0] ?? '' })}
      destroyOnHidden
    >
      <Form form={form} layout="vertical" onFinish={(v) => save.mutate(v.ip.trim())} initialValues={{ ip: client?.allowed_ips?.[0] ?? '' }}>
        <Form.Item name="ip" label={t('clients.ipLabel')} extra={t('clients.setIpHint')} rules={[{ required: true, whitespace: true, message: t('clients.required') }, { validator: (_, v: string) => (!v || isProbablyIP(v.trim()) ? Promise.resolve() : Promise.reject(new Error(t('clients.ipInvalid')))) }]}>
          <Input dir="ltr" placeholder="2.189.86.32" autoFocus />
        </Form.Item>
      </Form>
    </Modal>
  )
}

export default function Clients() {
  const { t } = useTranslation()
  const { message, modal } = App.useApp()
  const qc = useQueryClient()
  const screens = Grid.useBreakpoint()
  const mobile = !screens.md
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<Status | 'all'>('all')
  const [formFor, setFormFor] = useState<ClientRow | null | undefined>(undefined) // undefined = closed, null = create
  const [ipFor, setIpFor] = useState<ClientRow | null>(null)
  const [created, setCreated] = useState<ClientRow | null>(null)

  const list = useQuery({ queryKey: ['clients'], queryFn: () => request<ClientsResponse>('/api/clients'), refetchInterval: 15_000 })
  const config = useQuery({ queryKey: ['config'], queryFn: () => request<PanelConfig>('/api/config'), staleTime: 60_000 })

  const invalidate = () => qc.invalidateQueries({ queryKey: ['clients'] })
  const fail = (e: Error) => void message.error(e.message)
  const act = useMutation({
    mutationFn: ({ path, body }: { path: string; body: unknown; ok: string }) => post(path, body),
    onSuccess: async (_r, v) => {
      await invalidate()
      void message.success(v.ok)
    },
    onError: fail,
  })
  const mode = useMutation({
    mutationFn: (allowAll: boolean) => post('/api/access/mode', { allow_all: allowAll }),
    onSuccess: async (_r, allowAll) => {
      await invalidate()
      void message.info(allowAll ? t('clients.modeOff') : t('clients.modeOn'))
    },
    onError: fail,
  })

  const data = list.data
  const all = useMemo(() => data?.clients ?? [], [data])
  const origin = config.data?.subscription_origin ?? ''
  const dohUrl = config.data?.doh_url ?? ''
  const publicIp = data?.public_ip ?? ''

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim()
    return all.filter(
      (c) =>
        (statusFilter === 'all' || statusOf(c) === statusFilter) &&
        (!q || c.name.toLowerCase().includes(q) || c.id.includes(q) || (c.allowed_ips ?? []).some((ip) => ip.includes(q))),
    )
  }, [all, search, statusFilter])

  const actions: Actions = {
    edit: (c) => setFormFor(c),
    toggle: (c) => act.mutate({ path: '/api/clients/toggle', body: { id: c.id, enabled: !c.enabled }, ok: c.enabled ? t('clients.toggledOff') : t('clients.toggledOn') }),
    renew: (c) => act.mutate({ path: '/api/clients/renew', body: { id: c.id, extend_days: 30 }, ok: t('clients.renewed') }),
    remove: (c) =>
      modal.confirm({
        title: t('clients.deleteTitle'),
        content: t('clients.deleteBody', { name: c.name, id: c.id }),
        okText: t('clients.deleteOk'),
        okButtonProps: { danger: true },
        cancelText: t('common.cancel'),
        onOk: () => act.mutateAsync({ path: '/api/clients/delete', body: { id: c.id }, ok: t('clients.deleted') }),
      }),
    setIp: (c) => setIpFor(c),
    removeIp: (c, ip) =>
      modal.confirm({
        title: t('clients.removeIpTitle'),
        content: t('clients.removeIpBody', { ip }),
        okText: t('clients.removeIp'),
        okButtonProps: { danger: true },
        cancelText: t('common.cancel'),
        onOk: () => act.mutateAsync({ path: '/api/clients/remove_ip', body: { id: c.id, ip }, ok: t('clients.ipRemoved') }),
      }),
    copy: async (text, doneMsg) => void ((await copyText(text)) ? message.success(doneMsg ?? t('clients.copied')) : message.error(text)),
    links: (c) => linksFor(c, origin, dohUrl, publicIp),
  }

  const onMode = (whitelist: boolean) => {
    if (whitelist) return mode.mutate(false)
    modal.confirm({ title: t('clients.modeConfirmTitle'), content: t('clients.modeConfirmBody'), okText: t('clients.modeConfirmOk'), okButtonProps: { danger: true }, cancelText: t('common.cancel'), onOk: () => mode.mutateAsync(true) })
  }

  if (list.error && !data) {
    return <Alert type="error" showIcon title={t('clients.loadFailed')} description={`${list.error.message}. ${t('clients.loadFailedBody')}`} action={<Button size="small" onClick={() => void list.refetch()}>{t('common.retry')}</Button>} />
  }

  const empty =
    all.length === 0 ? (
      <Empty description={<><div><b>{t('clients.emptyTitle')}</b></div>{t('clients.emptyBody')}</>}>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setFormFor(null)}>{t('clients.add')}</Button>
      </Empty>
    ) : (
      <Empty description={<><div><b>{t('clients.noMatch')}</b></div>{t('clients.noMatchBody', { n: all.length })}</>}>
        <Button onClick={() => { setSearch(''); setStatusFilter('all') }}>{t('clients.clearFilters')}</Button>
      </Empty>
    )

  const whitelist = data ? !data.allow_all : true

  return (
    <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
      <div>
        <Typography.Title level={3} style={{ margin: 0 }}>{t('clients.title')}</Typography.Title>
        <Typography.Text type="secondary">{t('clients.subtitle')}</Typography.Text>
      </div>

      <Card size="small" loading={!data}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 320px' }}>
            <Typography.Text strong>{t('clients.modeTitle')}</Typography.Text>{' '}
            <Tag color={whitelist ? 'processing' : 'warning'}>{whitelist ? t('clients.modeWhitelist') : t('clients.modePublic')}</Tag>
            <div><Typography.Text type="secondary" style={{ fontSize: 12 }}>{t('clients.modeHint')}</Typography.Text></div>
          </div>
          <Switch checked={whitelist} loading={mode.isPending} onChange={onMode} checkedChildren={t('clients.modeWhitelist')} unCheckedChildren={t('clients.modePublic')} aria-label={t('clients.modeTitle')} />
        </div>
        {!whitelist && <Alert style={{ marginTop: 12 }} type="warning" showIcon title={t('clients.modeWarnTitle')} description={t('clients.modeWarnBody')} />}
      </Card>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <Input allowClear prefix={<SearchOutlined />} placeholder={t('clients.search')} aria-label={t('clients.search')} value={search} onChange={(e) => setSearch(e.target.value)} style={{ flex: '1 1 220px', maxWidth: 340 }} />
        <Select
          value={statusFilter}
          onChange={setStatusFilter}
          style={{ minWidth: 150 }}
          aria-label={t('clients.colStatus')}
          options={[{ value: 'all', label: t('clients.allStatuses') }, ...(['active', 'disabled', 'expired', 'noQuota'] as const).map((s) => ({ value: s, label: t(`clients.${s}`) }))]}
        />
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setFormFor(null)} style={{ marginInlineStart: 'auto' }}>
          {t('clients.add')}
        </Button>
      </div>

      {mobile ? (
        <Space orientation="vertical" size="small" style={{ width: '100%' }}>
          {!data && <Card loading />}
          {data && filtered.length === 0 && <Card>{empty}</Card>}
          {filtered.map((c) => <ClientCard key={c.id} c={c} a={actions} />)}
        </Space>
      ) : (
        <Card styles={{ body: { padding: 0 } }}>
          <Table<ClientRow>
            rowKey="id"
            size="middle"
            loading={list.isLoading}
            dataSource={filtered}
            pagination={filtered.length > 20 ? { pageSize: 20, showSizeChanger: false } : false}
            locale={{ emptyText: empty }}
            scroll={{ x: 'max-content' }}
            columns={[
              { title: t('clients.colName'), key: 'name', render: (_, c) => <div><b>{c.name}</b><div><Typography.Text type="secondary" style={{ fontSize: 12 }}>{c.id}{c.custom_policies?.length ? ` · ${t('clients.policies', { n: c.custom_policies.length })}` : ''}</Typography.Text></div></div> },
              { title: t('clients.colStatus'), key: 'status', render: (_, c) => <StatusTag c={c} /> },
              { title: t('clients.colIp'), key: 'ip', render: (_, c) => <IpCell c={c} a={actions} /> },
              { title: t('clients.colExpiry'), key: 'exp', render: (_, c) => <Expiry c={c} /> },
              { title: t('clients.colTraffic'), key: 'traffic', render: (_, c) => <Traffic c={c} /> },
              { title: t('clients.colQueries'), dataIndex: 'total_queries', render: (n: number) => n.toLocaleString() },
              { title: t('clients.colSeen'), key: 'seen', render: (_, c) => { const d = lastSeenDate(c); return d ? d.toLocaleString() : <Typography.Text type="secondary">{t('clients.never')}</Typography.Text> } },
              { title: t('clients.colActions'), key: 'actions', fixed: 'end', render: (_, c) => <RowActions c={c} a={actions} /> },
            ]}
          />
        </Card>
      )}

      <ClientFormModal open={formFor !== undefined} client={formFor ?? null} onClose={() => setFormFor(undefined)} onCreated={setCreated} />
      <SetIpModal client={ipFor} onClose={() => setIpFor(null)} />
      <Modal open={created !== null} title={t('clients.created')} onCancel={() => setCreated(null)} footer={<Button onClick={() => setCreated(null)}>OK</Button>} destroyOnHidden>
        {created && (() => {
          const l = actions.links(created)
          return (
            <Space orientation="vertical" style={{ width: '100%' }}>
              <Typography.Text>{t('clients.createdBody')}</Typography.Text>
              <Typography.Text strong>{created.name} · {created.id}</Typography.Text>
              <Typography.Text type="secondary">{t('clients.fSecret')}</Typography.Text>
              <Typography.Text code copyable dir="ltr">{created.register_secret}</Typography.Text>
              <Space wrap>
                <Button icon={<LinkOutlined />} onClick={() => actions.copy(l.portal)}>{t('clients.copyPortal')}</Button>
                <Button icon={<SendOutlined />} onClick={() => actions.copy(l.card(created, t('clients.lifetime')), t('clients.cardCopied'))}>{t('clients.copyCard')}</Button>
              </Space>
            </Space>
          )
        })()}
      </Modal>
    </Space>
  )
}
