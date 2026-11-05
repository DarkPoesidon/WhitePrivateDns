import { Alert, App, Button, Card, Descriptions, Space, Typography } from 'antd'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { post, request } from '../../api/client'
import type { UpdateStatus } from '../../api/types'
import ReauthModal, { type Reauth } from '../../components/ReauthModal'
import { waitForRestart } from '../../layout/UpdateBanner'
import { errText, useConfig } from '../../lib/panel'

export default function UpdateTab() {
  const { t } = useTranslation()
  const { message } = App.useApp()
  const qc = useQueryClient()
  const { data: cfg } = useConfig()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  const status = useQuery({ queryKey: ['update-status'], queryFn: () => request<UpdateStatus>('/api/update/status'), retry: false })
  const check = useMutation({
    mutationFn: () => post<UpdateStatus>('/api/update/status', {}),
    onSuccess: (s) => {
      qc.setQueryData(['update-status'], s)
      void message.info(t(s.available ? 'settings.update.found' : s.error ? 'settings.update.checkFailed' : 'settings.update.upToDate'))
    },
    onError: (e) => void message.error(errText(e, t('shared.failed'))),
  })
  const apply = useMutation({
    mutationFn: (v: { version: string; r: Reauth }) => post('/api/update/apply', { version: v.version, ...v.r }),
    onSuccess: () => {
      setOpen(false)
      setBusy(true)
      waitForRestart(() => {
        setBusy(false)
        void message.error(t('settings.update.slow'))
      })
    },
  })

  const st = status.data
  // The updater is absent when update checks are disabled: the server answers 404.
  if (status.isError) return <Alert type="info" showIcon title={t('settings.update.disabled')} description={errText(status.error, '')} />

  return (
    <Card loading={!st} title={t('settings.update.title')}>
      {st && (
        <Space orientation="vertical" style={{ width: '100%' }}>
          <Descriptions column={1} size="small" bordered>
            <Descriptions.Item label={t('settings.update.current')}>
              <code dir="ltr">{st.current}</code>
              {cfg?.version?.hash ? <code dir="ltr"> [{cfg.version.hash}]</code> : null}
            </Descriptions.Item>
            <Descriptions.Item label={t('settings.update.latest')}>
              <code dir="ltr">{st.latest || '—'}</code>
            </Descriptions.Item>
            {st.checked_at && st.checked_at.slice(0, 4) !== '0001' && <Descriptions.Item label={t('settings.update.checkedAt')}>{new Date(st.checked_at).toLocaleString()}</Descriptions.Item>}
          </Descriptions>
          {st.error && <Alert type="warning" showIcon title={st.error} />}
          {busy && <Alert type="info" showIcon title={t('update.updating')} />}
          {st.available ? (
            <Alert
              type="success"
              showIcon
              title={t('update.available')}
              description={
                st.url ? (
                  <a href={st.url} target="_blank" rel="noopener noreferrer">
                    {t('update.whatsNew')}
                  </a>
                ) : undefined
              }
            />
          ) : (
            !st.error && <Typography.Text type="secondary">{t('settings.update.upToDate')}</Typography.Text>
          )}
          {st.available && !st.can_apply && st.blocked_reason && <Alert type="warning" showIcon title={st.blocked_reason} />}
          <Space wrap>
            <Button loading={check.isPending} disabled={busy} onClick={() => check.mutate()}>
              {t('settings.update.check')}
            </Button>
            {st.available && (
              <Button type="primary" disabled={busy || st.in_progress || !st.can_apply} onClick={() => setOpen(true)}>
                {t('update.now')}
              </Button>
            )}
          </Space>
        </Space>
      )}
      <ReauthModal
        open={open}
        title={t('update.confirmTitle')}
        body={t('update.confirmBody')}
        okText={t('update.now')}
        danger
        onCancel={() => setOpen(false)}
        onSubmit={async (r) => void (await apply.mutateAsync({ version: st?.latest ?? '', r }))}
      />
    </Card>
  )
}
