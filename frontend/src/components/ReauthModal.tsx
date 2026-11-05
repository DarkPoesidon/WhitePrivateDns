import { Alert, Input, Modal, Space } from 'antd'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useConfig } from '../lib/panel'

export interface Reauth {
  current_password: string
  code: string
}

// Password (+ TOTP when two-factor is on) gate shared by every credential-grade
// action. onSubmit throws to keep the modal open and show the server's reason.
export default function ReauthModal({
  open, title, body, okText, danger, noPassword, onCancel, onSubmit,
}: {
  open: boolean
  title: string
  body?: string
  okText: string
  danger?: boolean
  noPassword?: boolean // second factor only (lockout unlock)
  onCancel: () => void
  onSubmit: (r: Reauth) => Promise<void>
}) {
  const { t } = useTranslation()
  const { data } = useConfig()
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const totp = !!data?.auth?.totp_enabled

  useEffect(() => {
    if (open) {
      setPassword('')
      setCode('')
      setErr('')
    }
  }, [open])

  const submit = async () => {
    if ((!noPassword && !password) || busy) return
    setBusy(true)
    setErr('')
    try {
      await onSubmit({ current_password: password, code: code.trim() })
    } catch (e) {
      setErr(e instanceof Error ? e.message : t('shared.failed'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={open}
      title={title}
      okText={okText}
      cancelText={t('common.cancel')}
      okButtonProps={{ danger, disabled: (!noPassword && !password) || (totp && code.trim().length < 6) }}
      confirmLoading={busy}
      onCancel={onCancel}
      onOk={() => void submit()}
      destroyOnHidden
    >
      <Space orientation="vertical" style={{ width: '100%' }}>
        {body && <div>{body}</div>}
        {!noPassword && <Input.Password autoFocus autoComplete="current-password" placeholder={t('shared.currentPassword')} value={password} onChange={(e) => setPassword(e.target.value)} onPressEnter={() => void submit()} />}
        {totp && <Input placeholder={t('shared.totpCode')} inputMode="numeric" autoComplete="one-time-code" maxLength={6} dir="ltr" value={code} onChange={(e) => setCode(e.target.value)} onPressEnter={() => void submit()} />}
        {err && <Alert type="error" showIcon title={err} />}
      </Space>
    </Modal>
  )
}
