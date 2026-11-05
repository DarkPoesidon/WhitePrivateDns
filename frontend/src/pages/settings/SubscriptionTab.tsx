import { App, Button, Card, Form, Input, InputNumber, Switch, Typography } from 'antd'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { post } from '../../api/client'
import type { SubscriptionConfig } from '../../api/types'
import { errText, useConfig } from '../../lib/panel'

export default function SubscriptionTab() {
  const { t } = useTranslation()
  const { message } = App.useApp()
  const qc = useQueryClient()
  const { data: cfg } = useConfig()
  const sub = cfg?.subscription
  const [enabled, setEnabled] = useState(true)
  const [domain, setDomain] = useState('')
  const [port, setPort] = useState<number | null>(0)
  const [title, setTitle] = useState('')

  useEffect(() => {
    if (!sub) return
    setEnabled(sub.enabled)
    setDomain(sub.domain)
    setPort(sub.port)
    setTitle(sub.title)
  }, [sub])

  const save = useMutation({
    // Fields this form does not edit are sent back as read so a save never wipes them.
    mutationFn: (s: SubscriptionConfig) =>
      post<{ listener_error?: string }>('/api/settings/subscription', {
        ...s,
        enabled,
        domain: domain.trim(),
        port: port ?? 0,
        title: title.trim(),
        uri_path: s.uri_path || '/sub',
      }),
    onSuccess: (r) => {
      if (r.listener_error) void message.warning(`${t('settings.subscription.listenerError')}: ${r.listener_error}`)
      else void message.success(t('settings.subscription.saved'))
      void qc.invalidateQueries({ queryKey: ['config'] })
    },
    onError: (e) => void message.error(errText(e, t('shared.failed'))),
  })

  return (
    <Card loading={!cfg} title={t('settings.subscription.title')}>
      <Form layout="vertical">
        <Typography.Paragraph type="secondary">{t('settings.subscription.help')}</Typography.Paragraph>
        <Form.Item label={t('settings.subscription.enabled')}>
          <Switch checked={enabled} onChange={setEnabled} />
        </Form.Item>
        <Form.Item label={t('settings.subscription.domain')} help={t('settings.subscription.domainHelp')}>
          <Input dir="ltr" value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="sub.example.com" />
        </Form.Item>
        <Form.Item label={t('settings.subscription.port')} help={t('settings.subscription.portHelp')}>
          <InputNumber min={0} max={65535} value={port} onChange={setPort} style={{ width: 140 }} />
        </Form.Item>
        <Form.Item label={t('settings.subscription.portalTitle')}>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} />
        </Form.Item>
        <Form.Item label={t('settings.subscription.origin')}>
          <code dir="ltr" style={{ wordBreak: 'break-all' }}>{cfg?.subscription_origin || t('settings.subscription.noOrigin')}</code>
        </Form.Item>
        <Button type="primary" loading={save.isPending} disabled={!sub} onClick={() => sub && save.mutate(sub)}>
          {t('shared.save')}
        </Button>
      </Form>
    </Card>
  )
}
