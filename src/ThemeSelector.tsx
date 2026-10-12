import { useEffect, useId, useState } from 'react'

type ThemePreference = 'system' | 'light' | 'dark'
const storageKey = 'home-rent-theme'
function readPreference(): ThemePreference {
  try {
    const saved = localStorage.getItem(storageKey)
    if (saved === 'light' || saved === 'dark') return saved
  } catch { /* Theme selection remains usable when browser storage is blocked. */ }
  return 'system'
}
function applyTheme(preference: ThemePreference) {
  const theme = preference === 'system' ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : preference
  document.documentElement.dataset.theme = theme
  document.documentElement.style.colorScheme = theme
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#121b17' : '#f5f5ef')
}

export default function ThemeSelector() {
  const [preference, setPreference] = useState<ThemePreference>(readPreference)
  const id = useId()
  useEffect(() => {
    const media = matchMedia('(prefers-color-scheme: dark)')
    const update = () => applyTheme(preference)
    const syncStorage = (event: StorageEvent) => {
      if (event.key === storageKey || event.key === null) setPreference(readPreference())
    }
    update()
    media.addEventListener('change', update)
    window.addEventListener('storage', syncStorage)
    return () => { media.removeEventListener('change', update); window.removeEventListener('storage', syncStorage) }
  }, [preference])
  return <label className="theme-control" htmlFor={id}><span>Theme</span>
    <select id={id} aria-label="Color theme" value={preference} onChange={event => {
      const next = event.target.value as ThemePreference
      setPreference(next)
      applyTheme(next)
      try { localStorage.setItem(storageKey, next) } catch { /* Persistence is optional. */ }
    }}><option value="system">System</option><option value="light">Light</option><option value="dark">Dark</option></select>
  </label>
}
