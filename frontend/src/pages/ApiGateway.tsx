import { BookOutlined, EyeInvisibleOutlined, EyeOutlined, ReloadOutlined } from '@ant-design/icons'
import { Alert, App, Button, Card, Input, Space, Switch, Tabs, Tag, Typography } from 'antd'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ADMIN_BASE, post } from '../api/client'
import type { PanelConfig } from '../api/types'
import CopyButton from '../components/CopyButton'
import ReauthModal, { type Reauth } from '../components/ReauthModal'
import { errText, useConfig } from '../lib/panel'

const mask = (k: string) => (k.length > 14 ? `${k.slice(0, 10)}${'•'.repeat(24)}` : '•'.repeat(24))

// Same shapes the classic panel shows, against this server's real API origin.
function snippets(base: string, key: string): Record<'curl' | 'python' | 'node', string> {
  return {
    curl: `# 1. Engine health
curl -X GET "${base}/status" \\
  -H "X-API-Key: ${key}"

# 2. Create a client (30 days)
curl -X POST "${base}/clients" \\
  -H "X-API-Key: ${key}" \\
  -H "Content-Type: application/json" \\
  -d '{"name":"Gamer-VIP","expires_days":30}'`,
    python: `import requests

API_URL = "${base}"
HEADERS = {"X-API-Key": "${key}"}

# Create a subscriber account on plan purchase
def create_smartdns_user(username, days=30):
    res = requests.post(f"{API_URL}/clients", headers=HEADERS, json={
        "name": username,
        "expires_days": days,
    }).json()
    if res.get("success"):
        return res["data"]["register_url"]
    return None`,
    node: `const axios = require('axios');

const client = axios.create({
  baseURL: '${base}',
  headers: { 'X-API-Key': '${key}' },
});

// Example bot handler
async function onBuySubscription(ctx, username) {
  const { data } = await client.post('/clients', { name: username, expires_days: 30 });
  if (data.success) {
    ctx.reply(\`Created. Register IP: \${data.data.register_url}\`);
  }
}`,
  }
}

export default function ApiGateway() {
  const { t } = useTranslation()
  const { message, modal } = App.useApp()
  const qc = useQueryClient()
  const { data: cfg, error, refetch } = useConfig()
  const [shown, setShown] = useState(false)
  const [regen, setRegen] = useState(false)
  const [lang, setLang] = useState('curl')

  const bind = useMutation({
    mutationFn: (apiBind: string) => post('/api/settings', { api_bind: apiBind }),
    onSuccess: (_r, apiBind) => {
      void message.success(t(apiBind === '0.0.0.0' ? 'api.bindPublicOn' : 'api.bindPublicOff'))
      void qc.invalidateQueries({ queryKey: ['config'] })
    },
    onError: (e) => void message.error(errText(e, t('shared.failed'))),
  })
  const rotate = useMutation({
    mutationFn: (r: Reauth) => post<{ api_key: string }>('/api/settings/regenerate-api-key', { regenerate: true, ...r }),
    onSuccess: (res) => {
      qc.setQueryData<PanelConfig>(['config'], (c) => (c ? { ...c, server: { ...c.server, api_key: res.api_key } } : c))
      setRegen(false)
      setShown(true)
      void message.success(t('api.regenerated'))
    },
  })

  if (error && !cfg) return <Alert type="error" showIcon title={errText(error, t('shared.failed'))} action={<a onClick={() => void refetch()}>{t('common.retry')}</a>} />

  const key = cfg?.server?.api_key ?? ''
  const isPublic = cfg?.server?.api_bind === '0.0.0.0'
  const hasDomain = !!cfg?.tls?.domain?.trim()
  const base = `${window.location.origin}${ADMIN_BASE}/api/v1`
  const code = snippets(base, key ? (shown ? key : mask(key)) : 'YOUR_API_KEY')
  const realCode = snippets(base, key || 'YOUR_API_KEY')

  const onToggle = (want: boolean) => {
    if (!want) return bind.mutate('127.0.0.1')
    if (!hasDomain) return void message.error(t('api.bindNeedsDomain'))
    modal.confirm({
      title: t('api.bindConfirmTitle'),
      content: t('api.bindConfirmBody'),
      okText: t('api.bindConfirmOk'),
      okButtonProps: { danger: true },
      cancelText: t('common.cancel'),
      onOk: () => bind.mutateAsync('0.0.0.0'),
    })
  }

  return (
    <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
      <div>
        <Typography.Title level={3} style={{ margin: 0 }}>
          {t('api.title')}
        </Typography.Title>
        <Typography.Text type="secondary">{t('api.subtitle')}</Typography.Text>
      </div>

      <div className="card-columns">
      <Card loading={!cfg} title={t('api.docs')} extra={<Button type="primary" icon={<BookOutlined />} href={`${ADMIN_BASE}/api/v1/docs`} target="_blank" rel="noopener noreferrer">{t('api.openDocs')}</Button>}>
        <Typography.Text type="secondary">{t('api.docsHelp')}</Typography.Text>
        <div style={{ marginTop: 8 }}>
          <code dir="ltr" style={{ wordBreak: 'break-all' }}>{base}</code>
        </div>
      </Card>

      <Card loading={!cfg} title={t('api.exposure')} extra={<Tag color={isPublic ? 'orange' : 'green'}>{isPublic ? t('api.bindPublic') : t('api.bindLocal')}</Tag>}>
        <Space orientation="vertical" style={{ width: '100%' }}>
          <Space align="start">
            <Switch checked={isPublic} loading={bind.isPending} onChange={onToggle} aria-label={t('api.exposeLabel')} />
            <div>
              <Typography.Text strong>{t('api.exposeLabel')}</Typography.Text>
              <div>
                <Typography.Text type="secondary">{t('api.exposeHelp')}</Typography.Text>
              </div>
            </div>
          </Space>
          <Alert type="warning" showIcon title={t('api.exposeWarn')} />
          {!hasDomain && !isPublic && <Alert type="info" showIcon title={t('api.bindNeedsDomain')} />}
        </Space>
      </Card>

      <Card loading={!cfg} title={t('api.masterKey')} extra={<Button danger icon={<ReloadOutlined />} onClick={() => setRegen(true)}>{t('api.regenerate')}</Button>}>
        <Space orientation="vertical" style={{ width: '100%' }}>
          <Typography.Text type="secondary">{t('api.masterKeyHelp')}</Typography.Text>
          <Space.Compact style={{ width: '100%' }}>
            <Input readOnly dir="ltr" value={key ? (shown ? key : mask(key)) : ''} placeholder={t('api.noKey')} style={{ fontFamily: 'monospace' }} aria-label={t('api.masterKey')} />
            <Button icon={shown ? <EyeInvisibleOutlined /> : <EyeOutlined />} aria-label={shown ? t('api.hide') : t('api.show')} onClick={() => setShown((v) => !v)} />
          </Space.Compact>
          <div>
            <CopyButton type="primary" text={key} label={t('api.copyKey')} />
          </div>
        </Space>
      </Card>

      <Card loading={!cfg} title={t('api.snippets')}>
        <Tabs
          activeKey={lang}
          onChange={setLang}
          items={(['curl', 'python', 'node'] as const).map((k) => ({
            key: k,
            label: k === 'curl' ? 'cURL' : k === 'python' ? 'Python' : 'Node.js',
            children: (
              <div>
                <div style={{ textAlign: 'end', marginBottom: 4 }}>
                  <CopyButton text={realCode[k]} label={t('api.copySnippet')} />
                </div>
                <pre dir="ltr" style={{ margin: 0, padding: 12, borderRadius: 8, overflowX: 'auto', background: 'rgba(128,128,128,0.12)', fontSize: 12, textAlign: 'left' }}>
                  {code[k]}
                </pre>
              </div>
            ),
          }))}
        />
        <Typography.Text type="secondary">{t('api.snippetsNote')}</Typography.Text>
      </Card>

      </div>

      <ReauthModal open={regen} danger title={t('api.regenTitle')} body={t('api.regenBody')} okText={t('api.regenerate')} onCancel={() => setRegen(false)} onSubmit={async (r) => void (await rotate.mutateAsync(r))} />
    </Space>
  )
}
