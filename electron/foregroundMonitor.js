// Monitora qual programa está em primeiro plano no Windows e avisa a janela do app
// quando ele muda. Usa um único PowerShell oculto que consulta a API do Windows
// (GetForegroundWindow) a cada POLL_MS e só imprime quando o programa muda: sem
// módulos nativos para compilar e com custo baixo.
import { spawn } from 'node:child_process'
import { app, ipcMain, dialog, BrowserWindow } from 'electron'
import path from 'node:path'

const POLL_MS = 400

const SCRIPT = `
Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class V8sForeground {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
}
"@
$last = $null
while ($true) {
  $procId = 0
  [void][V8sForeground]::GetWindowThreadProcessId([V8sForeground]::GetForegroundWindow(), [ref]$procId)
  $name = ''
  $exePath = ''
  try {
    $proc = Get-Process -Id $procId -ErrorAction Stop
    $name = $proc.ProcessName
    $exePath = $proc.Path
  } catch {}
  if ($name -ne $last) { [Console]::Out.WriteLine("$name|$exePath"); [Console]::Out.Flush(); $last = $name }
  Start-Sleep -Milliseconds ${POLL_MS}
}
`

let child = null
let current = { name: '', path: '' }
// Ícones já extraídos, por caminho do .exe.
const iconCache = new Map()

function start(win) {
  if (process.platform !== 'win32' || child) return
  child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', SCRIPT], {
    windowsHide: true,
  })
  let buffer = ''
  child.stdout.setEncoding('utf8')
  child.stdout.on('data', (chunk) => {
    buffer += chunk
    let newline
    while ((newline = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, newline).trim()
      buffer = buffer.slice(newline + 1)
      // "nome|caminho". ProcessName vem sem ".exe"; o app compara nomes em
      // minúsculas e sem extensão. O caminho pode vir vazio (sem permissão de leitura).
      const separator = line.indexOf('|')
      current = {
        name: (separator >= 0 ? line.slice(0, separator) : line).toLowerCase(),
        path: separator >= 0 ? line.slice(separator + 1) : '',
      }
      if (!win.isDestroyed()) win.webContents.send('foreground:changed', current)
    }
  })
  child.stderr.on('data', (chunk) => console.error('[Foco]', String(chunk).trim()))
  child.on('exit', () => (child = null))
}

export function stopForegroundMonitor() {
  child?.kill()
  child = null
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
