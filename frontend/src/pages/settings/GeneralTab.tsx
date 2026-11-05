import { App, Button, Card, Form, Input, InputNumber, Popconfirm, Space, Typography } from 'antd'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ADMIN_BASE, post, signOutTo } from '../../api/client'
import CopyButton from '../../components/CopyButton'
import { errText, useConfig } from '../../lib/panel'

const IPV4 = /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/

export default function GeneralTab() {
  const { t } = useTranslation()
  const { message } = App.useApp()
  const qc = useQueryClient()
  const { data: cfg } = useConfig()
  const [ip, setIp] = useState('')
  const [doh, setDoh] = useState('')
  const [idle, setIdle] = useState<number | null>(15)

  // Seed each field only when its own stored value changes, so saving one card
  // never discards an unsaved edit in another.
  const storedIp = cfg?.server?.public_ip ?? ''
  const storedDoh = cfg?.public_doh_url ?? ''
  const storedIdle = Number(cfg?.server?.session_idle_minutes)
  useEffect(() => setIp(storedIp), [storedIp])
  useEffect(() => setDoh(storedDoh), [storedDoh])
  useEffect(() => setIdle(Number.isFinite(storedIdle) && storedIdle > 0 ? storedIdle : 15), [storedIdle])

  const refresh = () => qc.invalidateQueries({ queryKey: ['config'] })
  const onErr = (e: unknown) => void message.error(errText(e, t('shared.failed')))

  const saveIp = useMutation({
    mutationFn: () => post('/api/settings', { public_ip: ip.trim() }),
    onSuccess: () => { void message.success(t('settings.general.ipSaved')); void refresh() },
    onError: onErr,
  })
  const saveDoh = useMutation({
    mutationFn: () => post('/api/settings/doh-url', { url: doh.trim() }),
    onSuccess: () => { void message.success(t('settings.general.dohSaved')); void refresh() },
    onError: onErr,
  })
  const saveIdle = useMutation({
    mutationFn: () => post('/api/settings', { session_idle_minutes: Math.round(idle ?? 15) }),
    onSuccess: () => { void message.success(t('settings.general.idleSaved')); void refresh() },
    onError: onErr,
  })
  const regen = useMutation({
    mutationFn: () => post<{ admin_path: string }>('/api/settings/regenerate-admin-path', { confirm: true }),
    onSuccess: (r) => {
      // All sessions died server-side; the login now lives under the new path.
      void message.success(t('settings.general.pathRegenerated'))
      signOutTo(r.admin_path ? `/${r.admin_path}/login` : `${ADMIN_BASE}/login`)
    },
    onError: onErr,
  })

  const ipOk = IPV4.test(ip.trim())
  const adminPath = cfg?.server?.admin_path ?? ADMIN_BASE.slice(1)

  return (
    <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
      <Card loading={!cfg} title={t('settings.general.network')}>
        <Form layout="vertical">
          <Form.Item label={t('settings.general.relayIp')} help={t('settings.general.relayIpHelp')} validateStatus={ip && !ipOk ? 'error' : undefined}>
            <Space.Compact style={{ width: '100%' }}>
              <Input dir="ltr" value={ip} onChange={(e) => setIp(e.target.value)} placeholder="203.0.113.10" />
              <Button type="primary" loading={saveIp.isPending} disabled={!ipOk || ip.trim() === storedIp} onClick={() => saveIp.mutate()}>
                {t('settings.general.apply')}
              </Button>
            </Space.Compact>
          </Form.Item>
          <Form.Item label={t('settings.general.dohUrl')} help={t('settings.general.dohUrlHelp')} style={{ marginBottom: 0 }}>
            <Space.Compact style={{ width: '100%' }}>
              <Input dir="ltr" value={doh} onChange={(e) => setDoh(e.target.value)} placeholder="https://doh.example.com/dns-query" />
              <Button type="primary" loading={saveDoh.isPending} disabled={doh.trim() === storedDoh} onClick={() => saveDoh.mutate()}>
                {t('shared.save')}
              </Button>
            </Space.Compact>
          </Form.Item>
        </Form>
      </Card>

      <Card loading={!cfg} title={t('settings.general.session')}>
        <Form layout="vertical">
          <Form.Item label={t('settings.general.idle')} help={t('settings.general.idleHelp')} style={{ marginBottom: 0 }}>
            <Space>
              <InputNumber min={5} max={1440} value={idle} onChange={setIdle} style={{ width: 140 }} />
              <Button type="primary" loading={saveIdle.isPending} disabled={idle === null || idle < 5 || idle > 1440} onClick={() => saveIdle.mutate()}>
                {t('shared.save')}
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Card>

      <Card loading={!cfg} title={t('settings.general.adminPath')}>
        <Space orientation="vertical" style={{ width: '100%' }}>
          <Typography.Text type="secondary">{t('settings.general.adminPathHelp')}</Typography.Text>
          <Space wrap>
            <code dir="ltr" style={{ wordBreak: 'break-all' }}>{`${window.location.origin}/${adminPath}/`}</code>
            <CopyButton text={`${window.location.origin}/${adminPath}/`} />
          </Space>
          <Popconfirm
            title={t('settings.general.regenTitle')}
            description={t('settings.general.regenBody')}
            okText={t('settings.general.regen')}
            okButtonProps={{ danger: true, loading: regen.isPending }}
            cancelText={t('common.cancel')}
            onConfirm={() => regen.mutate()}
          >
            <Button danger>{t('settings.general.regen')}</Button>
          </Popconfirm>
        </Space>
      </Card>
    </Space>
  )
}
