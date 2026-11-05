import { Button, Result } from 'antd'
import { useTranslation } from 'react-i18next'
import { ADMIN_BASE } from '../api/client'

// Pages not yet rebuilt in the new panel keep working in the classic one; this
// screen links straight to the matching classic route so nothing is unreachable.
export default function Migrating({ legacyRoute }: { legacyRoute: string }) {
  const { t } = useTranslation()
  return (
    <Result
      status="info"
      title={t('common.migrating')}
      subTitle={t('common.migratingHint')}
      extra={
        <Button type="primary" href={`${ADMIN_BASE}/dash${legacyRoute}`}>
          {t('common.openLegacy')}
        </Button>
      }
    />
  )
}
