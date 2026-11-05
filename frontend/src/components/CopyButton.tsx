import { CheckOutlined, CopyOutlined } from '@ant-design/icons'
import { App, Button } from 'antd'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { copyText } from '../lib/panel'

export default function CopyButton({ text, label, type = 'text' }: { text: string; label?: string; type?: 'text' | 'default' | 'primary' }) {
  const { t } = useTranslation()
  const { message } = App.useApp()
  const [done, setDone] = useState(false)
  return (
    <Button
      size="small"
      type={type}
      aria-label={label ?? t('shared.copy')}
      icon={done ? <CheckOutlined /> : <CopyOutlined />}
      onClick={async () => {
        if (await copyText(text)) {
          setDone(true)
          setTimeout(() => setDone(false), 1500)
        } else void message.error(t('shared.copyFailed'))
      }}
    >
      {label}
    </Button>
  )
}
