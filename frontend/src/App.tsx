import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { App as AntApp, ConfigProvider } from 'antd'
import enUS from 'antd/locale/en_US'
import faIR from 'antd/locale/fa_IR'
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router'
import { ADMIN_BASE } from './api/client'
import { isRtl } from './i18n'
import AppLayout from './layout/AppLayout'
import Migrating from './pages/Migrating'
import Overview from './pages/Overview'
import { themeFor, ThemeModeProvider, useMode } from './theme'

const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 1000, refetchOnWindowFocus: false } } })

function Themed() {
  const { mode } = useMode()
  const { i18n } = useTranslation()
  const rtl = isRtl(i18n.language)
  useEffect(() => {
    document.documentElement.dir = rtl ? 'rtl' : 'ltr'
    document.documentElement.lang = i18n.language
  }, [rtl, i18n.language])

  return (
    <ConfigProvider theme={themeFor(mode)} direction={rtl ? 'rtl' : 'ltr'} locale={rtl ? faIR : enUS}>
      <AntApp>
        <BrowserRouter basename={`${ADMIN_BASE}/ui`}>
          <Routes>
            <Route element={<AppLayout />}>
              <Route index element={<Navigate to="/overview" replace />} />
              <Route path="overview" element={<Overview />} />
              <Route path="clients" element={<Migrating legacyRoute="/clients" />} />
              <Route path="policies" element={<Migrating legacyRoute="/rules" />} />
              <Route path="logs" element={<Migrating legacyRoute="/logs" />} />
              <Route path="api" element={<Migrating legacyRoute="/api" />} />
              <Route path="settings" element={<Migrating legacyRoute="/settings" />} />
              <Route path="guide" element={<Migrating legacyRoute="/guide" />} />
              <Route path="*" element={<Navigate to="/overview" replace />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </AntApp>
    </ConfigProvider>
  )
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeModeProvider>
        <Themed />
      </ThemeModeProvider>
    </QueryClientProvider>
  )
}
