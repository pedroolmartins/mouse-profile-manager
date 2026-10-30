// Popup junto ao ponteiro do mouse ao ativar um perfil: janela pequena, sem borda,
// transparente, sempre por cima, que não rouba o foco nem captura cliques.
import { BrowserWindow, ipcMain, screen } from 'electron'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const WIDTH = 240
const HEIGHT = 92
const CURSOR_OFFSET = 18 // distância do ponteiro, para não ficar embaixo dele
const VISIBLE_MS = 1600

let popup = null
let ready = null
let hideTimer = null

function createPopup() {
  popup = new BrowserWindow({
    width: WIDTH,
    height: HEIGHT,
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    focusable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    hasShadow: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  })
  popup.setAlwaysOnTop(true, 'screen-saver')
  popup.setIgnoreMouseEvents(true)
  popup.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  popup.on('closed', () => {
    popup = null
    ready = null
  })
  ready = popup.loadFile(path.join(__dirname, 'profilePopup.html'))
}

// Posição ao lado do ponteiro, mantida dentro da área útil do monitor em que ele está.
function positionNearCursor() {
  const cursor = screen.getCursorScreenPoint()
  const { workArea } = screen.getDisplayNearestPoint(cursor)
  let x = cursor.x + CURSOR_OFFSET
  let y = cursor.y + CURSOR_OFFSET
  if (x + WIDTH > workArea.x + workArea.width) x = cursor.x - CURSOR_OFFSET - WIDTH
  if (y + HEIGHT > workArea.y + workArea.height) y = cursor.y - CURSOR_OFFSET - HEIGHT
  popup.setBounds({ x: Math.round(x), y: Math.round(y), width: WIDTH, height: HEIGHT })
}

async function showProfile({ name, dpi, pollingRate, color, device }) {
  if (!popup) createPopup()
  await ready
  positionNearCursor()
  // JSON.stringify protege contra aspas e afins no nome do perfil.
  const data = JSON.stringify({
    name: String(name),
    dpi: Number(dpi),
    pollingRate: Number(pollingRate),
    color: String(color),
    device: device ? String(device) : '',
  })
  await popup.webContents.executeJavaScript(`window.render(${data})`)
  popup.showInactive()
  clearTimeout(hideTimer)
  hideTimer = setTimeout(async () => {
    if (!popup) return
    await popup.webContents.executeJavaScript('window.fadeOut()').catch(() => {})
    setTimeout(() => popup?.hide(), 200)
  }, VISIBLE_MS)
}

export function destroyProfilePopup() {
  clearTimeout(hideTimer)
  popup?.destroy()
}

export function setupProfilePopup() {
  ipcMain.on('popup:profile', (_event, data) => {
    showProfile(data).catch((err) => console.error('[Popup] Falha ao exibir', err))
  })
}
