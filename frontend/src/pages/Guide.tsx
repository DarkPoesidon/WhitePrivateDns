import { Alert, Card, Space, Tabs, Typography } from 'antd'
import { useTranslation } from 'react-i18next'
import { ADMIN_BASE } from '../api/client'
import CopyButton from '../components/CopyButton'
import { errText, useConfig } from '../lib/panel'

type Value = 'ip' | 'dot' | 'doh'
interface Platform {
  key: string
  steps: number
  values: Value[]
}

// Step text lives in i18n as guide.<key>.s1…sN so FA and EN stay in lockstep.
const PLATFORMS: Platform[] = [
  { key: 'ps', steps: 5, values: ['ip'] },
  { key: 'xbox', steps: 5, values: ['ip'] },
  { key: 'switch', steps: 5, values: ['ip'] },
  { key: 'android', steps: 4, values: ['dot'] },
  { key: 'ios', steps: 5, values: ['ip', 'doh'] },
  { key: 'win', steps: 6, values: ['ip', 'doh'] },
  { key: 'router', steps: 4, values: ['ip'] },
]

function ValueRow({ label, value, missing }: { label: string; value: string; missing: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', padding: '8px 12px', borderRadius: 8, background: 'rgba(128,128,128,0.12)' }}>
      <Typography.Text type="secondary" style={{ minWidth: 110 }}>
        {label}
      </Typography.Text>
      {value ? (
        <>
          <code dir="ltr" style={{ flex: 1, wordBreak: 'break-all' }}>
            {value}
          </code>
          <CopyButton text={value} />
        </>
      ) : (
        <Typography.Text type="warning">{missing}</Typography.Text>
      )}
    </div>
  )
}

export default function Guide() {
  const { t } = useTranslation()
  const { data: cfg, error, refetch } = useConfig()

  if (error && !cfg) return <Alert type="error" showIcon title={errText(error, t('shared.failed'))} action={<a onClick={() => void refetch()}>{t('common.retry')}</a>} />
  if (!cfg) return <Card loading />

  const ip = cfg.server?.public_ip ?? ''
  // The DoT/DoH name is the only one the 853 certificate is guaranteed to cover.
  const dot = cfg.tls?.dot_domain || cfg.tls?.domain || ''
  const doh = cfg.doh_url ?? ''
  const val: Record<Value, string> = { ip, dot, doh }
  const label: Record<Value, string> = { ip: t('guide.valIp'), dot: t('guide.valDot'), doh: t('guide.valDoh') }

  return (
    <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
      <div>
        <Typography.Title level={3} style={{ margin: 0 }}>
          {t('guide.title')}
        </Typography.Title>
        <Typography.Text type="secondary">{t('guide.subtitle')}</Typography.Text>
      </div>

      <Card title={t('guide.yourValues')} size="small">
        <Space orientation="vertical" style={{ width: '100%' }}>
          {(['ip', 'dot', 'doh'] as const).map((v) => (
            <ValueRow key={v} label={label[v]} value={val[v]} missing={t(v === 'dot' ? 'guide.noDot' : 'guide.noValue')} />
          ))}
          {!dot && <Alert type="info" showIcon title={t('guide.dotHint')} />}
          <Typography.Text type="secondary">{t('guide.whitelist')}</Typography.Text>
        </Space>
      </Card>

      <Tabs
        type="card"
        items={PLATFORMS.map((p) => ({
          key: p.key,
          label: t(`guide.${p.key}.name`),
          children: (
            <Space orientation="vertical" style={{ width: '100%' }}>
              <ol style={{ margin: 0, paddingInlineStart: 22, display: 'grid', gap: 6 }}>
                {Array.from({ length: p.steps }, (_, i) => (
                  <li key={i}>{t(`guide.${p.key}.s${i + 1}`)}</li>
                ))}
              </ol>
              {p.values.map((v) => (
                <ValueRow key={v} label={label[v]} value={val[v]} missing={t(v === 'dot' ? 'guide.noDot' : 'guide.noValue')} />
              ))}
              {t(`guide.${p.key}.note`, { defaultValue: '' }) && <Alert type="info" showIcon title={t(`guide.${p.key}.note`)} />}
            </Space>
          ),
        }))}
      />

      <Typography.Text type="secondary">
        {t('guide.moreHelp')}{' '}
        <a href={`${ADMIN_BASE}/dash/guide`} target="_blank" rel="noopener noreferrer">
          {t('common.openLegacy')}
        </a>
      </Typography.Text>
    </Space>
  )
}

