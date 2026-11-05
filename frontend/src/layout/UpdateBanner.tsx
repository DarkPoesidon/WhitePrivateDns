import { App, Alert, Button, Input, Modal, Space } from 'antd'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { post, request, ApiError, api, getToken } from '../api/client'
import type { PanelConfig, UpdateStatus } from '../api/types'

const DISMISS = 'wpdns_update_dismissed'

// Waits for the daemon to go away and come back, then reloads to the login page:
// an update restarts the service, and sessions live in memory.
function waitForRestart(onTimeout: () => void) {
  const started = Date.now()
  let sawDown = false
  const tick = async () => {
    let up = false
    try {
      const res = await fetch(api('/api/update/status'), { headers: { Authorization: `Bearer ${getToken()}` } })
      up = res.status > 0
    } catch {
      sawDown = true
    }
    if (up && sawDown) {
      location.reload()
      return
    }
    // Never went down: the updater failed before it touched the service.
    if ((!sawDown && Date.now() - started > 120_000) || Date.now() - started > 600_000) {
      onTimeout()
      return
    }
    setTimeout(tick, 3000)
  }
  setTimeout(tick, 3000)
}

export default function UpdateBanner() {
  const { t } = useTranslation()
  const { message } = App.useApp()
  const [open, setOpen] = useState(false)
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [hidden, setHidden] = useState(() => {
    try {
      return sessionStorage.getItem(DISMISS)
    } catch {
      return null
    }
  })

  // The server re-checks GitHub every 6 hours; this only re-reads its answer.
  const status = useQuery({
    queryKey: ['update-status'],
    queryFn: () => request<UpdateStatus>('/api/update/status'),
    refetchInterval: 10 * 60_000,
    retry: false,
  })
  const config = useQuery({ queryKey: ['config'], queryFn: () => request<PanelConfig>('/api/config'), staleTime: 60_000 })

  const apply = useMutation({
    mutationFn: (version: string) => post('/api/update/apply', { version, current_password: password, code }),
    onSuccess: () => {
      setOpen(false)
      setBusy(true)
      waitForRestart(() => {
        setBusy(false)
        void message.error('The update is taking longer than expected. Check: journalctl -u whiteprivatedns-update')
      })
    },
    onError: (e) => void message.error(e instanceof ApiError ? e.message : t('update.failed')),
  })

  const st = status.data
  if (!st?.available || hidden === st.latest) return null

  return (
    <>
      <Alert
        banner
        type="success"
        showIcon
        title={
          <Space wrap>
            <strong>{busy ? t('update.updating') : t('update.available')}</strong>
            <code dir="ltr">{`${st.current} → ${st.latest}`}</code>
            {st.url && (
              <a href={st.url} target="_blank" rel="noopener noreferrer">
                {t('update.whatsNew')}
              </a>
            )}
          </Space>
        }
        action={
          <Space>
            <Button
              type="primary"
              size="small"
              disabled={busy || st.in_progress}
              title={st.can_apply ? undefined : st.blocked_reason}
              onClick={() => (st.can_apply ? setOpen(true) : void message.error(st.blocked_reason ?? ''))}
            >
              {t('update.now')}
            </Button>
            <Button
              size="small"
              disabled={busy}
              onClick={() => {
                try {
                  sessionStorage.setItem(DISMISS, st.latest)
                } catch {
                  /* storage blocked */
                }
                setHidden(st.latest)
              }}
            >
              {t('update.later')}
            </Button>
          </Space>
        }
      />
      <Modal
        open={open}
        title={t('update.confirmTitle')}
        okText={t('update.now')}
        cancelText={t('common.cancel')}
        confirmLoading={apply.isPending}
        okButtonProps={{ disabled: !password }}
        onCancel={() => setOpen(false)}
        onOk={() => apply.mutate(st.latest)}
      >
        <p>{t('update.confirmBody')}</p>
        <Space orientation="vertical" style={{ width: '100%' }}>
          <Input.Password autoFocus placeholder={t('update.password')} value={password} onChange={(e) => setPassword(e.target.value)} onPressEnter={() => password && apply.mutate(st.latest)} />
          {config.data?.auth?.totp_enabled && <Input placeholder={t('update.code')} inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value)} />}
        </Space>
      </Modal>
    </>
  )
}
