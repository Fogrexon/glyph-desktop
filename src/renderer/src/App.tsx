import { useEffect, useState } from 'react'
import { Launcher } from './components/Launcher'
import { Workspace } from './components/Workspace'

export default function App(): React.JSX.Element {
  const [mode, setMode] = useState<'launcher' | 'workspace'>(() =>
    location.hash.includes('workspace') ? 'workspace' : 'launcher'
  )

  useEffect(() => {
    const sync = (): void => {
      setMode(location.hash.includes('workspace') ? 'workspace' : 'launcher')
    }
    window.addEventListener('hashchange', sync)
    void window.glyph.window.mode().then(setMode)
    return () => window.removeEventListener('hashchange', sync)
  }, [])

  return mode === 'workspace' ? <Workspace /> : <Launcher />
}
