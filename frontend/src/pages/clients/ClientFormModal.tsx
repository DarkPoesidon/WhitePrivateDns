import { CopyOutlined, EyeInvisibleOutlined, EyeOutlined, ReloadOutlined } from '@ant-design/icons'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { App, Button, Form, Input, InputNumber, Modal, Select, Space, Switch } from 'antd'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { post, request } from '../../api/client'
import type { ClientRow, PolicyEntry } from '../../api/types'
import { copyText, fromLocalInput, isProbablyIP, toLocalInput } from './helpers'

interface FormValues {
  name: string
  expiry: string
  ip: string
  traffic: number | null
  cycle: string
  policies: string[]
  note: string
  enabled: boolean
  uuid: string
}

// client === null creates; otherwise edits that client. onCreated receives the server's record
// so the page can show the one-time credentials.
export default function ClientFormModal({ open, client, onClose, onCreated }: { open: boolean; client: ClientRow | null; onClose: () => void; onCreated: (c: ClientRow) => void }) {
  const { t } = useTranslation()
  const { message, modal } = App.useApp()
  const qc = useQueryClient()
  const [form] = Form.useForm<FormValues>()
  const [secret, setSecret] = useState('')
  const [showSecret, setShowSecret] = useState(false)
  const editing = client !== null

  const catalog = useQuery({
    queryKey: ['policy-catalog'],
    queryFn: () => request<{ catalog: PolicyEntry[] | null }>('/api/policies'),
    enabled: open,
    staleTime: 5 * 60_000,
  })

  // Re-seed on every open so an abandoned attempt never leaks into the next one.
  useEffect(() => {
    if (!open) return
    setShowSecret(false)
    setSecret(client?.register_secret ?? '')
    form.resetFields()
    form.setFieldsValue({
      name: client?.name ?? '',
      expiry: toLocalInput(client?.expires_at),
      ip: client?.allowed_ips?.[0] ?? '',
      traffic: client?.traffic_limit_gb || null,
      cycle: ['daily', 'weekly', 'monthly'].includes(client?.traffic_reset_cycle ?? '') ? client?.traffic_reset_cycle : '',
      policies: client?.custom_policies ?? [],
      note: client?.note ?? '',
      enabled: client?.enabled ?? true,
      uuid: client?.uuid ?? '',
    })
  }, [open, client, form])

  const refresh = () => qc.invalidateQueries({ queryKey: ['clients'] })
  const fail = (e: Error) => void message.error(e.message)

  const save = useMutation({
    mutationFn: async (v: FormValues) => {
      const base = {
        traffic_limit_gb: v.traffic ?? 0,
        traffic_reset_cycle: v.cycle ?? '',
        custom_policies: v.policies ?? [],
      }
      const exp = fromLocalInput(v.expiry)
      if (!client) {
        return post<ClientRow>('/api/clients/add', { ...base, name: v.name.trim(), initial_ip: (v.ip ?? '').trim(), expires_at: exp || undefined })
      }
      return request<ClientRow>(`/api/clients/${client.id}`, {
        method: 'PUT',
        body: JSON.stringify({ ...base, name: v.name.trim(), uuid: v.uuid.trim(), allowed_ip: (v.ip ?? '').trim(), expires_at: exp || '0001-01-01T00:00:00Z', enabled: v.enabled, note: (v.note ?? '').trim() }),
      })
    },
    onSuccess: async (res) => {
      await refresh()
      onClose()
      if (client) void message.success(t('clients.saved'))
      else onCreated(res)
    },
    onError: fail,
  })

  const regenSecret = useMutation({
    mutationFn: () => post<{ register_secret: string }>(`/api/clients/${client?.id}/regenerate-register-secret`, {}),
    onSuccess: (r) => {
      setSecret(r.register_secret)
      setShowSecret(true)
      void refresh()
      void message.success(t('clients.secretRegen'))
    },
    onError: fail,
  })
  const regenUuid = useMutation({
    mutationFn: () => post<{ uuid: string }>(`/api/clients/${client?.id}/regenerate-uuid`, {}),
    onSuccess: (r) => {
      form.setFieldValue('uuid', r.uuid)
      void refresh()
      void message.success(t('clients.uuidRegen'))
    },
    onError: fail,
  })
  const resetTraffic = useMutation({
    mutationFn: () => post(`/api/clients/${client?.id}/reset-traffic`, {}),
    onSuccess: () => {
      void refresh()
      void message.success(t('clients.trafficReset'))
    },
    onError: fail,
  })

  return (
    <Modal
      open={open}
      title={editing ? t('clients.edit') : t('clients.add')}
      onCancel={onClose}
      onOk={() => form.submit()}
      okText={editing ? t('clients.save') : t('clients.add')}
      cancelText={t('common.cancel')}
      confirmLoading={save.isPending}
      destroyOnHidden
      width={560}
    >
      <Form form={form} layout="vertical" onFinish={(v) => save.mutate(v)} style={{ marginTop: 16 }}>
        <Form.Item name="name" label={t('clients.fName')} rules={[{ required: true, whitespace: true, message: t('clients.required') }]}>
          <Input maxLength={80} autoFocus />
        </Form.Item>
        <Form.Item name="ip" label={editing ? t('clients.colIp') : t('clients.fIp')} rules={[{ validator: (_, v: string) => (!v || isProbablyIP(v.trim()) ? Promise.resolve() : Promise.reject(new Error(t('clients.ipInvalid')))) }]}>
          <Input dir="ltr" placeholder="2.189.86.32" />
        </Form.Item>
        <Form.Item name="expiry" label={t('clients.fExpiry')} extra={t('clients.fExpiryHint')}>
          <Input type="datetime-local" dir="ltr" />
        </Form.Item>
        <Space align="start" style={{ display: 'flex' }} styles={{ item: { flex: 1 } }}>
          <Form.Item name="traffic" label={t('clients.fTraffic')} extra={t('clients.fTrafficHint')}>
            <InputNumber min={0} step={1} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="cycle" label={t('clients.fCycle')}>
            <Select
              options={[
                { value: '', label: t('clients.cycleNone') },
                { value: 'daily', label: t('clients.cycleDaily') },
                { value: 'weekly', label: t('clients.cycleWeekly') },
                { value: 'monthly', label: t('clients.cycleMonthly') },
              ]}
            />
          </Form.Item>
        </Space>
        <Form.Item name="policies" label={t('clients.fPolicies')} extra={t('clients.fPoliciesHint')}>
          <Select
            mode="multiple"
            allowClear
            loading={catalog.isLoading}
            optionFilterProp="label"
            options={(catalog.data?.catalog ?? []).map((p) => ({ value: p.key, label: p.label || p.key }))}
          />
        </Form.Item>
        {editing && (
          <>
            <Form.Item name="note" label={t('clients.fNote')}>
              <Input.TextArea rows={2} maxLength={500} />
            </Form.Item>
            <Form.Item name="enabled" label={t('clients.fEnabled')} valuePropName="checked">
              <Switch />
            </Form.Item>
            <Form.Item label={t('clients.fUuid')}>
              <Space.Compact style={{ width: '100%' }}>
                <Form.Item name="uuid" noStyle>
                  <Input dir="ltr" />
                </Form.Item>
                <Button icon={<ReloadOutlined />} title={t('clients.regenUuid')} aria-label={t('clients.regenUuid')} loading={regenUuid.isPending} onClick={() => regenUuid.mutate()} />
              </Space.Compact>
            </Form.Item>
            <Form.Item label={t('clients.fSecret')}>
              <Space.Compact style={{ width: '100%' }}>
                <Input dir="ltr" readOnly value={showSecret ? secret : '•'.repeat(Math.min(secret.length, 24))} />
                <Button icon={showSecret ? <EyeInvisibleOutlined /> : <EyeOutlined />} title={showSecret ? t('clients.hide') : t('clients.show')} aria-label={showSecret ? t('clients.hide') : t('clients.show')} onClick={() => setShowSecret((s) => !s)} />
                <Button icon={<CopyOutlined />} aria-label={t('clients.copy')} disabled={!secret} onClick={async () => void ((await copyText(secret)) && message.success(t('clients.copied')))} />
                <Button
                  icon={<ReloadOutlined />}
                  title={t('clients.regenSecret')}
                  aria-label={t('clients.regenSecret')}
                  loading={regenSecret.isPending}
                  onClick={() => modal.confirm({ title: t('clients.regenSecret'), content: t('clients.regenSecretConfirm'), okText: t('clients.regenSecret'), cancelText: t('common.cancel'), onOk: () => regenSecret.mutateAsync() })}
                />
              </Space.Compact>
            </Form.Item>
            <Button danger loading={resetTraffic.isPending} onClick={() => resetTraffic.mutate()}>
              {t('clients.resetTraffic')}
            </Button>
          </>
        )}
      </Form>
    </Modal>
  )
}
