import { App, Alert, Button, Card, Form, Input, QRCode, Select, Space, Switch, Typography } from 'antd'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { post, setToken, signOut } from '../../api/client'
import CopyButton from '../../components/CopyButton'
import ReauthModal, { type Reauth } from '../../components/ReauthModal'
import { useConfig } from '../../lib/panel'

// The server wipes every session on 2FA / LDAP changes: say so, then go to login.
function useSessionEnded() {
  const { t } = useTranslation()
  const { message } = App.useApp()
  return () => {
    void message.info(t('settings.security.signedOut'))
    setTimeout(signOut, 1200)
  }
}

function Credentials() {
  const { t } = useTranslation()
  const { message } = App.useApp()
  const qc = useQueryClient()
  const { data: cfg } = useConfig()
  const [username, setUsername] = useState('')
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [open, setOpen] = useState(false)

  useEffect(() => setUsername(cfg?.server?.admin_username ?? ''), [cfg])

  const nameChanged = username !== '' && username !== cfg?.server?.admin_username
  const mismatch = pw !== pw2
  const dirty = nameChanged || pw !== ''

  const save = useMutation({
    mutationFn: (r: Reauth) =>
      post<{ changed: boolean; token?: string }>('/api/config/server', {
        admin_username: nameChanged ? username : '',
        admin_password: pw,
        ...r,
      }),
    onSuccess: (res) => {
      setOpen(false)
      // A password change revokes every session but hands this one a fresh token.
      if (res.token) setToken(res.token)
      setPw('')
      setPw2('')
      void message.success(t(res.token ? 'settings.security.credsSavedPw' : 'settings.security.credsSaved'))
      void qc.invalidateQueries({ queryKey: ['config'] })
    },
  })

  return (
    <Card loading={!cfg} title={t('settings.security.credentials')}>
      <Form layout="vertical" autoComplete="off">
        <Form.Item label={t('settings.security.username')}>
          <Input autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} maxLength={64} />
        </Form.Item>
        <Form.Item label={t('settings.security.newPassword')} help={t('settings.security.newPasswordHelp')}>
          <Input.Password autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} />
        </Form.Item>
        <Form.Item label={t('settings.security.confirmPassword')} validateStatus={pw2 && mismatch ? 'error' : undefined} help={pw2 && mismatch ? t('settings.security.mismatch') : undefined}>
          <Input.Password autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} />
        </Form.Item>
        <Button type="primary" disabled={!dirty || mismatch} onClick={() => setOpen(true)}>
          {t('settings.security.changeCreds')}
        </Button>
      </Form>
      <ReauthModal
        open={open}
        title={t('settings.security.changeCreds')}
        okText={t('shared.save')}
        onCancel={() => setOpen(false)}
        onSubmit={async (r) => void (await save.mutateAsync(r))}
      />
    </Card>
  )
}

function TwoFactor() {
  const { t } = useTranslation()
  const { message } = App.useApp()
  const ended = useSessionEnded()
  const { data: cfg } = useConfig()
  const enabled = !!cfg?.auth?.totp_enabled
  const username = cfg?.server?.admin_username ?? 'admin'
  const [enrol, setEnrol] = useState<{ secret: string; uri: string } | null>(null)
  const [step, setStep] = useState<'start' | 'confirm' | 'disable' | null>(null)
  const [code, setCode] = useState('')

  const setup = useMutation({
    mutationFn: (r: Reauth) => post<{ secret: string; otpauth_uri: string }>('/api/auth/2fa/setup', { username, current_password: r.current_password }),
    onSuccess: (r) => {
      setEnrol({ secret: r.secret, uri: r.otpauth_uri })
      setStep(null)
    },
  })
  const enable = useMutation({
    mutationFn: (r: Reauth) => post('/api/auth/2fa/enable', { username, current_password: r.current_password, code: code.trim() }),
    onSuccess: () => {
      setStep(null)
      void message.success(t('settings.security.tfaOn'))
      ended()
    },
  })
  const disable = useMutation({
    mutationFn: (r: Reauth) => post('/api/auth/2fa/disable', { username, current_password: r.current_password, code: r.code }),
    onSuccess: () => {
      setStep(null)
      void message.success(t('settings.security.tfaOff'))
      ended()
    },
  })

  return (
    <Card loading={!cfg} title={t('settings.security.tfa')} extra={<Typography.Text type={enabled ? 'success' : 'secondary'}>{enabled ? t('shared.enabled') : t('shared.disabled')}</Typography.Text>}>
      <Space orientation="vertical" style={{ width: '100%' }}>
        <Typography.Text type="secondary">{t('settings.security.tfaHelp')}</Typography.Text>
        {enabled ? (
          <div>
            <Button danger onClick={() => setStep('disable')}>
              {t('settings.security.tfaDisable')}
            </Button>
          </div>
        ) : enrol ? (
          <Space orientation="vertical" align="center" style={{ width: '100%' }}>
            <QRCode value={enrol.uri} size={176} bordered={false} type="svg" />
            <Typography.Text type="secondary">{t('settings.security.tfaScan')}</Typography.Text>
            <Space wrap>
              <code dir="ltr" style={{ wordBreak: 'break-all' }}>
                {enrol.secret}
              </code>
              <CopyButton text={enrol.secret} />
            </Space>
            <Input dir="ltr" style={{ width: 200 }} placeholder={t('shared.totpCode')} inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value)} />
            <Space>
              <Button type="primary" disabled={code.trim().length < 6} onClick={() => setStep('confirm')}>
                {t('settings.security.tfaConfirm')}
              </Button>
              <Button
                onClick={() => {
                  setEnrol(null)
                  setCode('')
                }}
              >
                {t('common.cancel')}
              </Button>
            </Space>
          </Space>
        ) : (
          <div>
            <Button type="primary" onClick={() => setStep('start')}>
              {t('settings.security.tfaStart')}
            </Button>
          </div>
        )}
      </Space>
      {/* The enrolment secret is shown only once; its password gate (not a code) opens it. */}
      <ReauthModal open={step === 'start'} title={t('settings.security.tfaStart')} okText={t('settings.security.tfaStart')} onCancel={() => setStep(null)} onSubmit={async (r) => void (await setup.mutateAsync(r))} />
      <ReauthModal open={step === 'confirm'} title={t('settings.security.tfaConfirm')} body={t('settings.security.tfaConfirmBody')} okText={t('settings.security.tfaConfirm')} onCancel={() => setStep(null)} onSubmit={async (r) => void (await enable.mutateAsync(r))} />
      <ReauthModal open={step === 'disable'} danger title={t('settings.security.tfaDisable')} body={t('settings.security.tfaDisableBody')} okText={t('settings.security.tfaDisable')} onCancel={() => setStep(null)} onSubmit={async (r) => void (await disable.mutateAsync(r))} />
    </Card>
  )
}

function Ldap() {
  const { t } = useTranslation()
  const ended = useSessionEnded()
  const { data: cfg } = useConfig()
  const a = cfg?.auth
  const [f, setF] = useState({ enabled: false, url: '', bindDn: '', bindPw: '', baseDn: '', attr: 'uid', mode: 'local' })
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!a) return
    setF({ enabled: !!a.ldap_enabled, url: a.ldap_server_url ?? '', bindDn: a.ldap_bind_dn ?? '', bindPw: '', baseDn: a.ldap_base_dn ?? '', attr: a.ldap_user_attr || 'uid', mode: a.ldap_login_mode || 'local' })
  }, [a])
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((p) => ({ ...p, [k]: v }))
  const urlBad = f.url !== '' && !/^ldaps?:\/\//.test(f.url)

  const save = useMutation({
    // The server reads "enabled" as the string "true"; an empty bind password keeps the stored one.
    mutationFn: (r: Reauth) =>
      post('/api/auth/ldap', { enabled: f.enabled ? 'true' : 'false', ldap_server_url: f.url, ldap_bind_dn: f.bindDn, ldap_bind_password: f.bindPw, ldap_base_dn: f.baseDn, ldap_user_attr: f.attr, ldap_login_mode: f.mode, ...r }),
    onSuccess: () => {
      setOpen(false)
      ended()
    },
  })

  return (
    <Card loading={!cfg} title={t('settings.security.ldap')} extra={a?.ldap_enabled && a.ldap_reachable === false ? <Typography.Text type="danger">{t('settings.security.ldapDown')}</Typography.Text> : undefined}>
      <Form layout="vertical" autoComplete="off">
        <Form.Item label={t('settings.security.ldapEnabled')}>
          <Switch checked={f.enabled} onChange={(v) => set('enabled', v)} />
        </Form.Item>
        <Form.Item label={t('settings.security.ldapUrl')} validateStatus={urlBad ? 'error' : undefined} help={urlBad ? t('settings.security.ldapUrlBad') : undefined}>
          <Input dir="ltr" placeholder="ldaps://ldap.example.com:636" value={f.url} onChange={(e) => set('url', e.target.value)} />
        </Form.Item>
        <Form.Item label={t('settings.security.ldapBindDn')}>
          <Input dir="ltr" value={f.bindDn} onChange={(e) => set('bindDn', e.target.value)} />
        </Form.Item>
        <Form.Item label={t('settings.security.ldapBindPw')} help={t('settings.security.ldapBindPwHelp')}>
          <Input.Password autoComplete="new-password" value={f.bindPw} onChange={(e) => set('bindPw', e.target.value)} />
        </Form.Item>
        <Form.Item label={t('settings.security.ldapBaseDn')}>
          <Input dir="ltr" value={f.baseDn} onChange={(e) => set('baseDn', e.target.value)} />
        </Form.Item>
        <Form.Item label={t('settings.security.ldapAttr')}>
          <Input dir="ltr" value={f.attr} onChange={(e) => set('attr', e.target.value)} />
        </Form.Item>
        <Form.Item label={t('settings.security.ldapMode')} help={f.mode === 'ldap' ? t('settings.security.ldapOnlyWarn') : undefined}>
          <Select
            value={f.mode}
            onChange={(v) => set('mode', v)}
            options={[
              { value: 'local', label: t('settings.security.modeLocal') },
              { value: 'both', label: t('settings.security.modeBoth') },
              { value: 'ldap', label: t('settings.security.modeLdap') },
            ]}
          />
        </Form.Item>
        <Alert type="warning" showIcon title={t('settings.security.ldapSessions')} style={{ marginBottom: 16 }} />
        <Button type="primary" disabled={urlBad} onClick={() => setOpen(true)}>
          {t('shared.save')}
        </Button>
      </Form>
      <ReauthModal open={open} title={t('settings.security.ldap')} okText={t('shared.save')} onCancel={() => setOpen(false)} onSubmit={async (r) => void (await save.mutateAsync(r))} />
    </Card>
  )
}

function Lockouts() {
  const { t } = useTranslation()
  const { message } = App.useApp()
  const { data: cfg } = useConfig()
  const [ip, setIp] = useState('')
  const [open, setOpen] = useState(false)
  const unlock = useMutation({
    mutationFn: (r: Reauth) => post<{ cleared: number }>('/api/auth/unlock', { ip: ip.trim(), code: r.code }),
    onSuccess: (res) => {
      setOpen(false)
      void message.success(t('settings.security.unlocked', { count: res.cleared }))
    },
  })
  return (
    <Card title={t('settings.security.lockouts')}>
      <Space orientation="vertical" style={{ width: '100%' }}>
        <Typography.Text type="secondary">{t('settings.security.lockoutsHelp')}</Typography.Text>
        <Space.Compact style={{ width: '100%', maxWidth: 420 }}>
          <Input dir="ltr" placeholder={t('settings.security.lockIp')} value={ip} onChange={(e) => setIp(e.target.value)} />
          <Button type="primary" onClick={() => setOpen(true)}>
            {ip.trim() ? t('settings.security.unlockIp') : t('settings.security.unlockAll')}
          </Button>
        </Space.Compact>
      </Space>
      {/* The unlock route takes only the second factor; with 2FA off a confirm click is enough. */}
      <ReauthModal
        open={open}
        noPassword
        title={t('settings.security.lockouts')}
        body={cfg?.auth?.totp_enabled ? undefined : t('settings.security.unlockConfirm')}
        okText={ip.trim() ? t('settings.security.unlockIp') : t('settings.security.unlockAll')}
        onCancel={() => setOpen(false)}
        onSubmit={async (r) => void (await unlock.mutateAsync(r))}
      />
    </Card>
  )
}

export default function SecurityTab() {
  return (
    <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
      <Credentials />
      <TwoFactor />
      <Ldap />
      <Lockouts />
    </Space>
  )
}
