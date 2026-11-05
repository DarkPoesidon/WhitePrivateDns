import { theme as antTheme, type ThemeConfig } from 'antd'
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

export type Mode = 'light' | 'dark' | 'ultra'
const KEY = 'wpdns_ui_theme'

const brand = {
  colorPrimary: '#12a37f',
  borderRadius: 8,
  fontFamily: "Inter, Vazirmatn, system-ui, -apple-system, 'Segoe UI', sans-serif",
}

// Three themes, the set the reference panel offers: light, dark, and an
// "ultra dark" that drops the surfaces to near black for OLED screens.
export function themeFor(mode: Mode): ThemeConfig {
  if (mode === 'light') return { token: brand, algorithm: antTheme.defaultAlgorithm, components: { Layout: { siderBg: '#ffffff', headerBg: '#ffffff', bodyBg: '#f5f5f5' } } }
  if (mode === 'dark') {
    return {
      token: brand,
      algorithm: antTheme.darkAlgorithm,
      components: { Layout: { siderBg: '#141414', headerBg: '#141414', bodyBg: '#0d0d0d' }, Menu: { darkItemBg: '#141414' } },
    }
  }
  return {
    algorithm: antTheme.darkAlgorithm,
    token: { ...brand, colorBgBase: '#000', colorBgContainer: '#0a0a0a', colorBgElevated: '#101010', colorBgLayout: '#000' },
    components: { Layout: { siderBg: '#050505', headerBg: '#050505', bodyBg: '#000' }, Menu: { darkItemBg: '#050505' } },
  }
}

interface Ctx {
  mode: Mode
  setMode: (m: Mode) => void
}
const ThemeCtx = createContext<Ctx>({ mode: 'dark', setMode: () => {} })
export const useMode = () => useContext(ThemeCtx)

export function ThemeModeProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<Mode>(() => {
    try {
      const v = localStorage.getItem(KEY)
      if (v === 'light' || v === 'dark' || v === 'ultra') return v
    } catch {
      /* storage blocked */
    }
    return window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
  })
  useEffect(() => {
    try {
      localStorage.setItem(KEY, mode)
    } catch {
      /* storage blocked */
    }
    document.documentElement.dataset.theme = mode
    document.body.style.background = mode === 'light' ? '#f5f5f5' : mode === 'ultra' ? '#000' : '#141414'
  }, [mode])
  const value = useMemo(() => ({ mode, setMode }), [mode])
  return <ThemeCtx.Provider value={value}>{children}</ThemeCtx.Provider>
}
