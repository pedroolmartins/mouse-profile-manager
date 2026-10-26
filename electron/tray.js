// Ícone na bandeja do Windows. Fechar a janela (X) só a esconde: o app continua
// rodando para os perfis, o botão inferior e os apps monitorados funcionarem.
// Para sair de fato, use "Sair" no menu da bandeja.
import { app, Tray, Menu, nativeImage } from 'electron'

let tray = null
let quitting = false

export const isQuitting = () => quitting

function showWindow(win) {
  if (win.isDestroyed()) return
  if (win.isMinimized()) win.restore()
  win.show()
  win.focus()
}

export async function setupTray(win, iconPath) {
  app.on('before-quit', () => (quitting = true))

  // X esconde em vez de fechar (a não ser quando o app está saindo).
  win.on('close', (event) => {
    if (quitting) return
    event.preventDefault()
    win.hide()
  })

  // Ícone do app reduzido para a bandeja; sem o arquivo, cai para o do executável.
  const image = nativeImage.createFromPath(iconPath)
  const icon = image.isEmpty()
    ? await app.getFileIcon(process.execPath, { size: 'small' })
    : image.resize({ width: 16, height: 16, quality: 'best' })
  tray = new Tray(icon)
  tray.setToolTip('Mouse Profile Manager')
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Abrir Mouse Profile Manager', click: () => showWindow(win) },
      { type: 'separator' },
      { label: 'Sair', click: () => app.quit() },
    ]),
  )
  tray.on('click', () => showWindow(win))
  tray.on('double-click', () => showWindow(win))
}

export function destroyTray() {
  tray?.destroy()
  tray = null
}
