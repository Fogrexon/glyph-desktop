import '@xterm/xterm/css/xterm.css'
import './assets/app.css'

import { StrictMode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import App from './App'
import { recoverWorkspace } from '@renderer/lib/recoverWorkspace'

const el = document.getElementById('root')
if (!el) throw new Error('#root がありません')

const glyphWindow = window as Window & { __glyphRoot?: Root }
const root = glyphWindow.__glyphRoot ?? createRoot(el)
glyphWindow.__glyphRoot = root

function render(): void {
  root.render(
    <StrictMode>
      <App />
    </StrictMode>
  )
}

render()

if (import.meta.hot) {
  import.meta.hot.accept(() => {
    render()
    recoverWorkspace()
  })
  import.meta.hot.on('vite:afterUpdate', () => recoverWorkspace())
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') recoverWorkspace()
})
