import { Menu, Tray, app, nativeImage } from 'electron'
import { join } from 'path'
import { markAppQuitting } from './lifetime'
import { hideToTray, showLauncher } from './windows'

let tray: Tray | null = null

export function requestFullQuit(): void {
  markAppQuitting()
  app.quit()
}

function resolveTrayImage(): Electron.NativeImage {
  const candidates = [
    join(process.resourcesPath, 'tray-icon.png'),
    join(app.getAppPath(), 'resources', 'tray-icon.png'),
    join(__dirname, '../../resources/tray-icon.png')
  ]
  for (const path of candidates) {
    const image = nativeImage.createFromPath(path)
    if (!image.isEmpty()) {
      return process.platform === 'win32' ? image.resize({ width: 16, height: 16 }) : image
    }
  }
  // Fallback amber pixel so Tray always mounts.
  return nativeImage.createFromDataURL(
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAPElEQVQ4T2NkYGD4z0A6YCSnAf+J0QBSw4hSw8ggMg0gNYxYDWQkRpAGBgYGRhI1jCQaRqoGBgcA9C8DBW8bF2QAAAAASUVORK5CYII='
  )
}

export function createAppTray(): Tray {
  if (tray) return tray

  tray = new Tray(resolveTrayImage())
  tray.setToolTip('Glyph')
  tray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: 'ランチャーを開く',
        click: () => showLauncher()
      },
      { type: 'separator' },
      {
        label: '完全に終了',
        click: () => requestFullQuit()
      }
    ])
  )
  tray.on('click', () => showLauncher())
  tray.on('double-click', () => showLauncher())
  return tray
}

export function destroyAppTray(): void {
  tray?.destroy()
  tray = null
}

/** Close / 「終了」: hide windows, keep PTYs alive. */
export function retreatToTray(): void {
  hideToTray()
}
