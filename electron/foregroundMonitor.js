// Monitora qual programa está em primeiro plano no Windows e avisa a janela do app
// quando ele muda. Consulta a API do Windows (GetForegroundWindow) direto do processo
// principal, via koffi (FFI com binários prontos), a cada POLL_MS. Não cria nenhum
// processo filho: um console (PowerShell, cmd) poderia piscar na tela e roubar o foco
// do jogo, e um processo separado pode travar e atrasar a troca de perfil.
import { createRequire } from 'node:module'
import { app, ipcMain, dialog, BrowserWindow } from 'electron'
import path from 'node:path'

const POLL_MS = 250
const PROCESS_QUERY_LIMITED_INFORMATION = 0x1000
const MAX_PATH_CHARS = 32768

let win32 = null
let timer = null
let current = { name: '', path: '' }
// Ícones já extraídos, por caminho do .exe.
const iconCache = new Map()

function loadWin32() {
  const koffi = createRequire(import.meta.url)('koffi')
  const user32 = koffi.load('user32.dll')
  const kernel32 = koffi.load('kernel32.dll')
  return {
    GetForegroundWindow: user32.func('void* __stdcall GetForegroundWindow()'),
    GetWindowThreadProcessId: user32.func('uint32 __stdcall GetWindowThreadProcessId(void*, _Out_ uint32*)'),
    OpenProcess: kernel32.func('void* __stdcall OpenProcess(uint32, bool, uint32)'),
    QueryFullProcessImageNameW: kernel32.func(
      'bool __stdcall QueryFullProcessImageNameW(void*, uint32, _Out_ uint16_t*, _Inout_ uint32*)',
    ),
    CloseHandle: kernel32.func('bool __stdcall CloseHandle(void*)'),
    pathBuffer: new Uint16Array(MAX_PATH_CHARS),
  }
}

// Caminho do .exe do programa em primeiro plano, ou '' se não houver janela ou se o
// Windows negar acesso ao processo (alguns processos protegidos do sistema).
function foregroundExePath() {
  const hwnd = win32.GetForegroundWindow()
  if (!hwnd) return ''
  const pid = [0]
  win32.GetWindowThreadProcessId(hwnd, pid)
  if (!pid[0]) return ''
  const handle = win32.OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid[0])
  if (!handle) return ''
  try {
    const length = [MAX_PATH_CHARS]
    if (!win32.QueryFullProcessImageNameW(handle, 0, win32.pathBuffer, length)) return ''
    return Buffer.from(win32.pathBuffer.buffer, 0, length[0] * 2).toString('utf16le')
  } finally {
    win32.CloseHandle(handle)
  }
}

function poll(win) {
  let exePath = ''
  try {
    exePath = foregroundExePath()
  } catch (err) {
    console.error('[Foco]', err)
  }
  // O app compara nomes em minúsculas e sem extensão (ex.: "b1-win64-shipping").
  const name = exePath ? path.basename(exePath).replace(/\.exe$/i, '').toLowerCase() : ''
  if (name === current.name) return
  current = { name, path: exePath }
  if (!win.isDestroyed()) win.webContents.send('foreground:changed', current)
}

function start(win) {
  if (process.platform !== 'win32' || timer) return
  try {
    win32 ??= loadWin32()
  } catch (err) {
    console.error('[Foco] Falha ao carregar a API do Windows', err)
    return
  }
  poll(win)
  timer = setInterval(() => poll(win), POLL_MS)
}

export function stopForegroundMonitor() {
  clearInterval(timer)
  timer = null
}

let handlersRegistered = false

export function setupForegroundMonitor(win) {
  start(win)
  win.on('closed', stopForegroundMonitor)
  if (handlersRegistered) return
  handlersRegistered = true
  ipcMain.handle('foreground:current', () => current)
  // Escolher um .exe pelo explorador de arquivos; devolve o nome e o caminho.
  ipcMain.handle('apps:pick-exe', async () => {
    const result = await dialog.showOpenDialog(BrowserWindow.getFocusedWindow() ?? undefined, {
      title: 'Escolher o programa',
      properties: ['openFile'],
      filters: [{ name: 'Programas', extensions: ['exe'] }],
    })
    if (result.canceled) return null
    const file = result.filePaths[0]
    return { name: path.basename(file), path: file }
  })
  // Ícone do .exe como data URL, ou null se não der para extrair (arquivo movido etc.).
  ipcMain.handle('apps:icon', async (_event, exePath) => {
    if (typeof exePath !== 'string' || !/\.exe$/i.test(exePath)) return null
    if (iconCache.has(exePath)) return iconCache.get(exePath)
    let dataUrl = null
    try {
      const image = await app.getFileIcon(exePath, { size: 'normal' })
      if (!image.isEmpty()) dataUrl = image.toDataURL()
    } catch {
      // Sem ícone: a interface mostra a letra.
    }
    iconCache.set(exePath, dataUrl)
    return dataUrl
  })
}
