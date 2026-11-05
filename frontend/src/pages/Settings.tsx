import { Alert, Tabs, Typography } from 'antd'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router'
import { errText, useConfig } from '../lib/panel'
import CertificatesTab from './settings/CertificatesTab'
import GeneralTab from './settings/GeneralTab'
import NetworkTab from './settings/NetworkTab'
import SecurityTab from './settings/SecurityTab'
import SubscriptionTab from './settings/SubscriptionTab'
import UpdateTab from './settings/UpdateTab'

const TABS = ['general', 'security', 'subscription', 'certs', 'network', 'update'] as const

export default function Settings() {
  const { t } = useTranslation()
  const [params, setParams] = useSearchParams()
  const { error, data, refetch } = useConfig()
  const current = params.get('tab') ?? 'general'
  const active = (TABS as readonly string[]).includes(current) ? current : 'general'

  const panes: Record<(typeof TABS)[number], React.ReactNode> = {
    general: <GeneralTab />,
    security: <SecurityTab />,
    subscription: <SubscriptionTab />,
    certs: <CertificatesTab />,
    network: <NetworkTab />,
    update: <UpdateTab />,
  }

  return (
    <div>
      <Typography.Title level={3} style={{ margin: 0 }}>
        {t('settings.title')}
      </Typography.Title>
      <Typography.Paragraph type="secondary">{t('settings.subtitle')}</Typography.Paragraph>
      {error && !data && <Alert type="error" showIcon style={{ marginBottom: 16 }} title={errText(error, t('shared.failed'))} action={<a onClick={() => void refetch()}>{t('common.retry')}</a>} />}
      <Tabs
        activeKey={active}
        onChange={(k) => setParams({ tab: k }, { replace: true })}
        destroyOnHidden
        items={TABS.map((k) => ({ key: k, label: t(`settings.tabs.${k}`), children: panes[k] }))}
      />
    </div>
  )
}
