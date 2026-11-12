// Programa em primeiro plano no Linux (X11, e também apps X11/XWayland numa sessão
// Wayland, como jogos pelo Steam/Proton). Um único `xprop -spy` avisa a cada troca
// da janela ativa (_NET_ACTIVE_WINDOW); para cada troca, o PID da janela vem de
// _NET_WM_PID e o programa, do /proc. Janelas nativas do Wayland não aparecem para
// o X: com uma delas em foco, o programa fica vazio (como uma janela sem programa).
import { spawn, execFile } from 'node:child_process'
import { readFile, readlink } from 'node:fs/promises'
import path from 'node:path'

const RESTART_MS = 5000

let child = null
let restartTimer = null
let stopped = true
let requestId = 0

// "_NET_ACTIVE_WINDOW(WINDOW): window id # 0x3a00007" -> "0x3a00007" (null se 0x0).
function parseActiveWindow(line) {
  const match = /window id # (0x[0-9a-f]+)/i.exec(line)
  return match && parseInt(match[1], 16) ? match[1] : null
}

function windowPid(windowId) {
  return new Promise((resolve) => {
    execFile('xprop', ['-id', windowId, '_NET_WM_PID'], { timeout: 2000 }, (err, stdout) => {
      const match = !err && /=\s*(\d+)/.exec(stdout)
      resolve(match ? Number(match[1]) : null)
    })
  })
}

// Nome e caminho do programa de um PID. Programas do Windows rodando pelo Wine/Proton
// têm o .exe do Windows no argv[0] ("C:\...\jogo.exe"); o executável do processo
// seria o do Wine. Para os demais, vale o executável (/proc/<pid>/exe).
async function programOf(pid) {
  const exePath = await readlink(`/proc/${pid}/exe`).catch(() => '')
  const argv0 = (await readFile(`/proc/${pid}/cmdline`, 'utf8').catch(() => '')).split('\0')[0]
  const windowsExe = /\.exe$/i.test(argv0) ? argv0.split(/[\\/]/).pop() : ''
  const base = windowsExe || path.basename(exePath)
  return {
    // O app compara nomes em minúsculas e sem extensão (ex.: "b1-win64-shipping").
    name: base.replace(/\.exe$/i, '').toLowerCase(),
    path: windowsExe ? '' : exePath,
  }
}

async function handleWindow(windowId, onChange) {
  const id = ++requestId
  const pid = windowId ? await windowPid(windowId) : null
  const program = pid ? await programOf(pid) : { name: '', path: '' }
  // Uma troca mais nova chegou enquanto esta era lida: ela vale, esta não.
  if (id === requestId) onChange(program)
}

/** Começa a acompanhar a janela ativa; onChange({ name, path }) a cada troca. */
export function startLinuxForeground(onChange) {
  if (child || !process.env.DISPLAY) {
    if (!process.env.DISPLAY) console.error('[Foco] Sem DISPLAY do X: troca por programa em foco indisponível')
    return
  }
  stopped = false
  child = spawn('xprop', ['-spy', '-root', '_NET_ACTIVE_WINDOW'], { stdio: ['ignore', 'pipe', 'pipe'] })
  let buffer = ''
  child.stdout.setEncoding('utf8')
  child.stdout.on('data', (chunk) => {
    buffer += chunk
    let newline
    while ((newline = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, newline)
      buffer = buffer.slice(newline + 1)
      if (line.startsWith('_NET_ACTIVE_WINDOW')) handleWindow(parseActiveWindow(line), onChange)
    }
  })
  child.stderr.on('data', (chunk) => console.error('[Foco] xprop:', String(chunk).trim()))
  child.on('error', (err) => {
    // ENOENT: xprop não instalado (pacote x11-utils).
    console.error('[Foco] Não foi possível iniciar o xprop (instale o pacote x11-utils)', err.message)
    child = null
    stopped = true
  })
  child.on('exit', () => {
    child = null
    // Saiu sozinho (ex.: o servidor X reiniciou): tenta de novo em alguns segundos.
    if (!stopped) restartTimer = setTimeout(() => startLinuxForeground(onChange), RESTART_MS)
  })
}

export function stopLinuxForeground() {
  stopped = true
  clearTimeout(restartTimer)
  child?.kill()
  child = null
}
