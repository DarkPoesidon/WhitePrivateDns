import { DeleteOutlined, PlusOutlined, SearchOutlined, ThunderboltOutlined } from '@ant-design/icons'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Alert, App as AntApp, Button, Card, Col, Empty, Flex, Input, List, Row, Space, Switch, Table, Tabs, Tag, Typography } from 'antd'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { post, request } from '../api/client'
import { GROUPS, KNOWN, PROFILES, type GroupId } from './policyMeta'

type Rules = Record<string, boolean | string[] | Record<string, string>>
interface ConfigResponse {
  rules: Rules
}
interface CatalogEntry {
  key: string
  label: string
  blocking?: boolean
}
interface PoliciesResponse {
  catalog?: CatalogEntry[]
}
type ListKey = 'custom_proxied' | 'custom_blocked' | 'custom_direct'

const CONFIG_KEY = ['policies-config']

// ---- validation: mirrors validPolicyDomain / net.ParseIP in internal/web/server.go ----
const LABEL = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/
const IPV4 = /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/
const normalizeDomain = (raw: string) => raw.trim().toLowerCase().replace(/\.$/, '')
function validDomain(raw: string, wildcard: boolean): boolean {
  let d = normalizeDomain(raw)
  if (wildcard && d.startsWith('*.')) d = d.slice(2)
  return d.length > 0 && d.length <= 253 && d.includes('.') && d.split('.').every((l) => LABEL.test(l))
}
// shortcut: IPv6 is checked by shape only (hex, colons, dots); the server does the exact parse.
const validIp = (v: string) => IPV4.test(v) || (/^[0-9a-f:.]+$/i.test(v) && (v.match(/:/g) ?? []).length >= 2)

const asList = (v: Rules[string] | undefined): string[] => (Array.isArray(v) ? v : [])
const asRecords = (v: Rules[string] | undefined): Record<string, string> => (v && !Array.isArray(v) && typeof v === 'object' ? v : {})

function useRulesMutation() {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const { message } = AntApp.useApp()
  return useMutation({
    mutationFn: (patch: Rules) => post<{ success: boolean }>('/api/config/rules', patch),
    onMutate: async (patch) => {
      await qc.cancelQueries({ queryKey: CONFIG_KEY })
      const prev = qc.getQueryData<ConfigResponse>(CONFIG_KEY)
      if (prev) qc.setQueryData<ConfigResponse>(CONFIG_KEY, { ...prev, rules: { ...prev.rules, ...patch } })
      return { prev }
    },
    onError: (e: Error, _patch, ctx) => {
      if (ctx?.prev) qc.setQueryData(CONFIG_KEY, ctx.prev)
      void message.error(`${t('policies.saveFailed')}: ${e.message}`)
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: CONFIG_KEY }),
  })
}

// ---------------------------------------------------------------- custom rule editors

function DomainListEditor({ listKey, wildcard, rules, hint }: { listKey: ListKey; wildcard: boolean; rules: Rules; hint: string }) {
  const { t } = useTranslation()
  const save = useRulesMutation()
  const [text, setText] = useState('')
  const [error, setError] = useState('')
  const items = asList(rules[listKey])

  const add = () => {
    const parts = text.split(/[\s,]+/).filter(Boolean)
    if (!parts.length) return
    for (const p of parts) {
      if (p.includes('*') && !wildcard) return setError(t('policies.custom.invalidWildcard', { v: p }))
      if (!validDomain(p, wildcard)) return setError(t('policies.custom.invalidDomain', { v: p }))
    }
    const next = [...new Set([...items, ...parts.map(normalizeDomain)])]
    if (next.length === items.length) return setError(t('policies.custom.duplicate'))
    save.mutate({ [listKey]: next })
    setText('')
    setError('')
  }

  return (
    <Space orientation="vertical" style={{ width: '100%' }} size="small">
      <Typography.Text type="secondary">{hint}</Typography.Text>
      <Space.Compact style={{ width: '100%' }}>
        <Input
          value={text}
          status={error ? 'error' : undefined}
          placeholder={t('policies.custom.domainPlaceholder')}
          aria-label={t('policies.custom.domain')}
          dir="ltr"
          onChange={(e) => {
            setText(e.target.value)
            setError('')
          }}
          onPressEnter={add}
        />
        <Button type="primary" icon={<PlusOutlined />} onClick={add} loading={save.isPending}>
          {t('policies.custom.add')}
        </Button>
      </Space.Compact>
      {error ? <Typography.Text type="danger">{error}</Typography.Text> : <Typography.Text type="secondary" style={{ fontSize: 12 }}>{t('policies.custom.multiHint')}</Typography.Text>}
      <List
        size="small"
        bordered
        dataSource={items}
        locale={{ emptyText: t('policies.custom.empty') }}
        style={{ maxHeight: 280, overflowY: 'auto' }}
        renderItem={(d) => (
          <List.Item
            actions={[<Button key="rm" type="text" danger size="small" icon={<DeleteOutlined />} aria-label={t('policies.custom.remove')} onClick={() => save.mutate({ [listKey]: items.filter((x) => x !== d) })} />]}
          >
            <Typography.Text code dir="ltr">{d}</Typography.Text>
          </List.Item>
        )}
      />
    </Space>
  )
}

function RecordsEditor({ rules }: { rules: Rules }) {
  const { t } = useTranslation()
  const save = useRulesMutation()
  const [host, setHost] = useState('')
  const [ip, setIp] = useState('')
  const [error, setError] = useState('')
  const records = asRecords(rules.custom_records)

  const add = () => {
    const h = normalizeDomain(host)
    const addr = ip.trim()
    if (!h || !addr) return setError(t('policies.custom.needBoth'))
    if (!validDomain(h, false)) return setError(t('policies.custom.invalidDomain', { v: host.trim() }))
    if (!validIp(addr)) return setError(t('policies.custom.invalidIp'))
    save.mutate({ custom_records: { ...records, [h]: addr } })
    setHost('')
    setIp('')
    setError('')
  }
  const rows = Object.entries(records).map(([domain, address]) => ({ domain, address }))

  return (
    <Space orientation="vertical" style={{ width: '100%' }} size="small">
      <Typography.Text type="secondary">{t('policies.custom.recordsHint')}</Typography.Text>
      <Flex gap={8} wrap>
        <Input style={{ flex: '2 1 200px' }} dir="ltr" value={host} placeholder={t('policies.custom.hostPlaceholder')} aria-label={t('policies.custom.domain')} status={error ? 'error' : undefined} onChange={(e) => { setHost(e.target.value); setError('') }} onPressEnter={add} />
        <Input style={{ flex: '1 1 140px' }} dir="ltr" value={ip} placeholder={t('policies.custom.ipPlaceholder')} aria-label={t('policies.custom.ip')} status={error ? 'error' : undefined} onChange={(e) => { setIp(e.target.value); setError('') }} onPressEnter={add} />
        <Button type="primary" icon={<PlusOutlined />} onClick={add} loading={save.isPending}>
          {t('policies.custom.save')}
        </Button>
      </Flex>
      {error && <Typography.Text type="danger">{error}</Typography.Text>}
      <Table
        size="small"
        rowKey="domain"
        dataSource={rows}
        pagination={false}
        scroll={{ y: 280 }}
        locale={{ emptyText: t('policies.custom.empty') }}
        columns={[
          { title: t('policies.custom.domain'), dataIndex: 'domain', render: (v: string) => <Typography.Text code dir="ltr">{v}</Typography.Text> },
          { title: t('policies.custom.ip'), dataIndex: 'address', render: (v: string) => <Typography.Text code dir="ltr">{v}</Typography.Text> },
          { title: '', key: 'rm', width: 48, render: (_: unknown, r: { domain: string }) => {
              const { [r.domain]: _drop, ...rest } = records
              return <Button type="text" danger size="small" icon={<DeleteOutlined />} aria-label={t('policies.custom.remove')} onClick={() => save.mutate({ custom_records: rest })} />
            } },
        ]}
      />
    </Space>
  )
}

// ---------------------------------------------------------------- preset cards

interface PresetView {
  key: string
  name: string
  desc: string
  tags: string
  blocking: boolean
}

function PresetCard({ p, on, busy, onToggle }: { p: PresetView; on: boolean; busy: boolean; onToggle: (next: boolean) => void }) {
  const { t } = useTranslation()
  return (
    <Card size="small" style={{ height: '100%' }} styles={{ body: { display: 'flex', flexDirection: 'column', gap: 6 } }}>
      <Flex justify="space-between" align="flex-start" gap={12}>
        <div style={{ minWidth: 0 }}>
          <Typography.Text strong>{p.name}</Typography.Text>
          {p.blocking && <Tag color="red" style={{ marginInlineStart: 8 }}>{t('policies.blocking')}</Tag>}
          {p.tags && (
            <div>
              <Typography.Text type="secondary" style={{ fontSize: 12 }} dir="ltr">{p.tags}</Typography.Text>
            </div>
          )}
        </div>
        <Switch checked={on} loading={busy} onChange={onToggle} aria-label={p.name} />
      </Flex>
      <Typography.Text type="secondary" style={{ fontSize: 13 }}>{p.desc}</Typography.Text>
    </Card>
  )
}

export default function Policies() {
  const { t, i18n } = useTranslation()
  const { message, modal } = AntApp.useApp()
  const save = useRulesMutation()
  const [q, setQ] = useState('')
  const [pending, setPending] = useState<Set<string>>(new Set())

  const cfg = useQuery({ queryKey: CONFIG_KEY, queryFn: () => request<ConfigResponse>('/api/config') })
  const cat = useQuery({ queryKey: ['policies-catalog'], queryFn: () => request<PoliciesResponse>('/api/policies'), staleTime: 60_000 })
  const rules = cfg.data?.rules

  const groups = useMemo(() => {
    const catalog = new Map((cat.data?.catalog ?? []).map((c) => [c.key, c]))
    const view = (id: string, tags: string): PresetView => {
      const key = `enable_${id}`
      return { key, name: t(`policies.preset.${id}.name`), desc: t(`policies.preset.${id}.desc`), tags, blocking: catalog.get(key)?.blocking === true }
    }
    const out: { id: GroupId | 'other'; items: PresetView[] }[] = GROUPS.map((g) => ({ id: g.id, items: g.presets.map((p) => view(p.id, p.tags)) }))
    // Keys the server knows that this panel has no copy for: show them rather than hide a live switch.
    const extra = Object.keys(rules ?? {})
      .filter((k) => k.startsWith('enable_') && !KNOWN.has(k))
      .map((k) => ({ key: k, name: catalog.get(k)?.label ?? k, desc: '', tags: '', blocking: catalog.get(k)?.blocking === true }))
    if (extra.length) out.push({ id: 'other', items: extra })
    return out
    // i18n.language re-translates the memoised strings on language switch.
  }, [cat.data, rules, t, i18n.language])

  if (cfg.isError && !rules) {
    return <Alert type="error" showIcon title={t('policies.loadFailed')} description={cfg.error.message} action={<Button size="small" onClick={() => void cfg.refetch()}>{t('common.retry')}</Button>} />
  }
  if (!rules) return <Card loading />

  const needle = q.trim().toLowerCase()
  const match = (p: PresetView) => !needle || `${p.name} ${p.tags} ${p.desc} ${p.key}`.toLowerCase().includes(needle)
  const isOn = (k: string) => rules[k] === true
  const totalOn = groups.flatMap((g) => g.items).filter((p) => isOn(p.key)).length

  const setKeys = (keys: string[], value: boolean, done?: () => void) => {
    setPending((s) => new Set([...s, ...keys]))
    save.mutate(Object.fromEntries(keys.map((k) => [k, value])), {
      onSuccess: done,
      onSettled: () => setPending((s) => new Set([...s].filter((k) => !keys.includes(k)))),
    })
  }
  const toggle = (key: string, next: boolean) => {
    if (key === 'enable_downloads' && next) {
      modal.confirm({
        title: t('policies.downloadsConfirmTitle'),
        content: <ul style={{ paddingInlineStart: 18, margin: 0 }}>{(t('policies.downloadsWarn', { returnObjects: true }) as string[]).map((s) => <li key={s}>{s}</li>)}</ul>,
        okText: t('policies.downloadsConfirmOk'),
        okButtonProps: { danger: true },
        cancelText: t('common.cancel'),
        onOk: () => setKeys([key], true),
      })
      return
    }
    setKeys([key], next)
  }

  const visible = groups.map((g) => ({ ...g, shown: g.items.filter(match) })).filter((g) => g.shown.length > 0)
  const warn = t('policies.downloadsWarn', { returnObjects: true }) as string[]

  return (
    <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
      <Flex justify="space-between" align="flex-end" gap={12} wrap>
        <div>
          <Typography.Title level={3} style={{ margin: 0 }}>{t('policies.title')}</Typography.Title>
          <Typography.Text type="secondary">{t('policies.subtitle')}</Typography.Text>
        </div>
        <Input allowClear prefix={<SearchOutlined />} placeholder={t('policies.search')} value={q} onChange={(e) => setQ(e.target.value)} style={{ maxWidth: 320, width: '100%' }} />
      </Flex>

      <Card size="small" title={<Space><ThunderboltOutlined />{t('policies.profiles')}</Space>} extra={<Tag>{t('policies.enabledOf', { on: totalOn, total: groups.flatMap((g) => g.items).length })}</Tag>}>
        <Typography.Paragraph type="secondary" style={{ marginBottom: 12 }}>{t('policies.profilesHint')}</Typography.Paragraph>
        <Row gutter={[12, 12]}>
          {PROFILES.map((pr) => {
            const name = t(`policies.profile.${pr.id}.name`)
            return (
              <Col key={pr.id} xs={12} md={6}>
                <Button block style={{ height: 'auto', padding: '8px 12px', textAlign: 'start' }} loading={pr.keys.some((k) => pending.has(k))} onClick={() => setKeys(pr.keys, true, () => void message.success(t('policies.profileApplied', { name })))}>
                  <div style={{ fontWeight: 600 }}>{name}</div>
                  <div style={{ fontSize: 12, opacity: 0.65, whiteSpace: 'normal' }}>{t(`policies.profile.${pr.id}.desc`)}</div>
                </Button>
              </Col>
            )
          })}
        </Row>
      </Card>

      {visible.length === 0 && <Empty description={t('policies.noMatch', { q: q.trim() })} />}

      {visible.map((g) => (
        <Card
          key={g.id}
          size="small"
          title={<div><div>{t(`policies.group.${g.id}.title`)}</div><Typography.Text type="secondary" style={{ fontSize: 12, fontWeight: 400, whiteSpace: 'normal' }}>{t(`policies.group.${g.id}.desc`)}</Typography.Text></div>}
          styles={{ header: { paddingBlock: 10 } }}
          extra={<Tag>{t('policies.enabledOf', { on: g.items.filter((p) => isOn(p.key)).length, total: g.items.length })}</Tag>}
        >
          <Row gutter={[12, 12]}>
            {g.shown.map((p) => (
              <Col key={p.key} xs={24} md={12} xl={8}>
                <PresetCard p={p} on={isOn(p.key)} busy={pending.has(p.key)} onToggle={(n) => toggle(p.key, n)} />
                {p.key === 'enable_downloads' && (
                  <Alert style={{ marginTop: 12 }} type="warning" showIcon title={t('policies.downloadsWarnTitle')} description={<ul style={{ paddingInlineStart: 18, margin: 0 }}>{warn.map((s) => <li key={s}>{s}</li>)}</ul>} />
                )}
              </Col>
            ))}
          </Row>
        </Card>
      ))}

      <Card title={t('policies.custom.title')} size="small">
        <Typography.Paragraph type="secondary">{t('policies.custom.subtitle')}</Typography.Paragraph>
        <Tabs
          items={[
            { key: 'proxied', label: `${t('policies.custom.proxied')} (${asList(rules.custom_proxied).length})`, children: <DomainListEditor listKey="custom_proxied" wildcard rules={rules} hint={t('policies.custom.proxiedHint')} /> },
            { key: 'blocked', label: `${t('policies.custom.blocked')} (${asList(rules.custom_blocked).length})`, children: <DomainListEditor listKey="custom_blocked" wildcard rules={rules} hint={t('policies.custom.blockedHint')} /> },
            { key: 'direct', label: `${t('policies.custom.direct')} (${asList(rules.custom_direct).length})`, children: <DomainListEditor listKey="custom_direct" wildcard rules={rules} hint={t('policies.custom.directHint')} /> },
            { key: 'records', label: `${t('policies.custom.records')} (${Object.keys(asRecords(rules.custom_records)).length})`, children: <RecordsEditor rules={rules} /> },
          ]}
        />
      </Card>
    </Space>
  )
}
