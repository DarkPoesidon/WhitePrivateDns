import { useQuery } from '@tanstack/react-query'
import { request } from '../api/client'
import type { PanelConfig } from '../api/types'

// One shared read of /api/config; every settings section edits against it and
// invalidates ['config'] after a save.
export const useConfig = () =>
  useQuery({ queryKey: ['config'], queryFn: () => request<PanelConfig>('/api/config'), staleTime: 5_000 })

// Clipboard API needs a secure context; the panel is often served over plain
// http on a raw IP, so fall back to a hidden textarea.
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    try {
      return document.execCommand('copy')
    } finally {
      ta.remove()
    }
  }
}

export const errText = (e: unknown, fallback: string) => (e instanceof Error && e.message ? e.message : fallback)
