import { useEffect, useState } from 'react'
import { ErrorBoundary } from './components/ErrorBoundary'
import { Launcher } from './components/Launcher'
import { Workspace } from './components/Workspace'

export default function App(): React.JSX.Element {
  return (
    <ErrorBoundary>
      <AppShell />
    </ErrorBoundary>
  )
}

function AppShell(): React.JSX.Element {
  const [mode, setMode] = useState<'launcher' | 'workspace'>(() =>
    location.hash.includes('workspace') ? 'workspace' : 'launcher'
  )

  useEffect(() => {
    document.body.classList.add('app-ready')
  }, [])

  useEffect(() => {
    const syncFromHash = (): void => {
      setMode(location.hash.includes('workspace') ? 'workspace' : 'launcher')
    }
    const syncFromMain = (): void => {
      void window.glyph.window.mode().then(setMode)
    }
    window.addEventListener('hashchange', syncFromHash)
    window.addEventListener('pageshow', syncFromMain)
    syncFromMain()
    return () => {
      window.removeEventListener('hashchange', syncFromHash)
      window.removeEventListener('pageshow', syncFromMain)
    }
  }, [])

  return mode === 'workspace' ? <Workspace /> : <Launcher />
}
