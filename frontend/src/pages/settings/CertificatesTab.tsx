import { Alert, App, Button, Card, Form, Input, Progress, Space, Typography } from 'antd'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { post, request } from '../../api/client'
import type { AcmeStatus } from '../../api/types'
import { errText, useConfig } from '../../lib/panel'

type Purpose = 'panel' | 'dot' | 'subscription'

// One Let's Encrypt issuance card. The daemon single-flights ACME runs, so all
// three cards share one status endpoint and only the one that started it polls.
function CertCard({ purpose, title, help, initialDomain, initialEmail, showEmail }: { purpose: Purpose; title: string; help: string; initialDomain: string; initialEmail: string; showEmail: boolean }) {
  const { t } = useTranslation()
  const { message } = App.useApp()
  const qc = useQueryClient()
  const [domain, setDomain] = useState(initialDomain)
  const [email, setEmail] = useState(initialEmail)
  const [polling, setPolling] = useState(false)
  const [outcome, setOutcome] = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => setDomain(initialDomain), [initialDomain])
  useEffect(() => setEmail(initialEmail), [initialEmail])

  const status = useQuery({
    queryKey: ['acme-status', purpose],
    queryFn: () => request<AcmeStatus>('/api/tls/acme/status'),
    enabled: polling,
    refetchInterval: 700,
    retry: true,
  })

  const s = status.data
  useEffect(() => {
    if (!polling || !s || s.running) return
    setPolling(false)
    if (s.error) setOutcome({ ok: false, text: s.error })
    else setOutcome({ ok: true, text: s.last_detail || t('settings.certs.issued') })
    void qc.invalidateQueries({ queryKey: ['config'] })
  }, [polling, s, qc, t])

  const issue = useMutation({
    mutationFn: () => post<{ issuing: boolean; detail: string }>('/api/tls/issue', { domain: domain.trim(), email: email.trim(), purpose }),
    onSuccess: (r) => {
      if (r.issuing) {
        setOutcome(null)
        setPolling(true)
      } else {
        setOutcome({ ok: true, text: r.detail })
        void qc.invalidateQueries({ queryKey: ['config'] })
      }
    },
    onError: (e) => void message.error(errText(e, t('shared.failed'))),
  })

  const running = polling && (s?.running ?? true)
  // Panel and subscription need a name; DoT/DoH and subscription may be cleared to fall back to the panel's.
  const canClear = purpose !== 'panel'
  const disabled = running || issue.isPending || (!canClear && !domain.trim())

  return (
    <Card title={title}>
      <Form layout="vertical">
        <Typography.Paragraph type="secondary">{help}</Typography.Paragraph>
        <Form.Item label={t('settings.certs.domain')}>
          <Input dir="ltr" value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="dot.example.com" />
        </Form.Item>
        {showEmail && (
          <Form.Item label={t('settings.certs.email')} help={t('settings.certs.emailHelp')}>
            <Input dir="ltr" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="admin@example.com" />
          </Form.Item>
        )}
        <Space orientation="vertical" style={{ width: '100%' }}>
          <Button type="primary" loading={running || issue.isPending} disabled={disabled} onClick={() => issue.mutate()}>
            {domain.trim() || !canClear ? t('settings.certs.issue') : t('settings.certs.clear')}
          </Button>
          {running && <Progress percent={s?.progress ?? 0} status="active" format={(p) => `${p ?? 0}%`} />}
          {running && s?.detail && <Typography.Text type="secondary">{s.detail}</Typography.Text>}
          {outcome && <Alert type={outcome.ok ? 'success' : 'error'} showIcon title={outcome.text} closable onClose={() => setOutcome(null)} />}
        </Space>
      </Form>
    </Card>
  )
}

export default function CertificatesTab() {
  const { t } = useTranslation()
  const { data: cfg } = useConfig()
  if (!cfg) return <Card loading />
  return (
    <div className="card-columns">
      <CertCard purpose="dot" title={t('settings.certs.dotTitle')} help={t('settings.certs.dotHelp')} initialDomain={cfg.tls?.dot_domain ?? ''} initialEmail={cfg.tls?.email ?? ''} showEmail={false} />
      <CertCard purpose="subscription" title={t('settings.certs.subTitle')} help={t('settings.certs.subHelp')} initialDomain={cfg.subscription?.domain ?? ''} initialEmail={cfg.tls?.email ?? ''} showEmail={false} />
      <CertCard purpose="panel" title={t('settings.certs.panelTitle')} help={t('settings.certs.panelHelp')} initialDomain={cfg.tls?.domain ?? ''} initialEmail={cfg.tls?.email ?? ''} showEmail />
    </div>
  )
}
