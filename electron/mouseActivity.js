// Detecta qual mouse está sendo usado (movimento, clique, roda) pelo Raw Input do
// Windows, que identifica o aparelho de cada evento (o caminho traz VID e PID). O
// WebHID não vê os movimentos (vão direto para o Windows), e o receptor do Kysona
// não informa quando o mouse dorme; com isto o app sabe quem está em uso de verdade.
// Recebe os eventos na própria janela do app (WM_INPUT, mesmo oculta na bandeja) e
// avisa o renderer no máximo uma vez por NOTIFY_MS por mouse: { vendorId, productId }.
import { createRequire } from 'node:module'

const WM_INPUT = 0x00ff
const RIDEV_INPUTSINK = 0x100 // recebe os eventos mesmo sem a janela em foco
const RID_HEADER = 0x10000005
const RIDI_DEVICENAME = 0x20000007
const HEADER_SIZE = 24 // RAWINPUTHEADER no Windows 64 bits
const RAWINPUTDEVICE_SIZE = 16
const NOTIFY_MS = 1000

let win32 = null

function loadWin32() {
  const koffi = createRequire(import.meta.url)('koffi')
  const user32 = koffi.load('user32.dll')
  return {
    RegisterRawInputDevices: user32.func('bool __stdcall RegisterRawInputDevices(void*, uint32, uint32)'),
    GetRawInputData: user32.func('uint32 __stdcall GetRawInputData(uintptr_t, uint32, void*, _Inout_ uint32*, uint32)'),
    GetRawInputDeviceInfoW: user32.func('uint32 __stdcall GetRawInputDeviceInfoW(uintptr_t, uint32, void*, _Inout_ uint32*)'),
    header: Buffer.alloc(HEADER_SIZE),
  }
}

// VID/PID do aparelho a partir do caminho ("\\?\HID#VID_3151&PID_402D&MI_00#…").
function deviceIds(handle) {
  const length = [0]
  win32.GetRawInputDeviceInfoW(handle, RIDI_DEVICENAME, null, length)
  if (!length[0]) return null
  const name = Buffer.alloc(length[0] * 2)
  if (win32.GetRawInputDeviceInfoW(handle, RIDI_DEVICENAME, name, length) === 0xffffffff) return null
  const match = /VID_([0-9A-F]{4})&PID_([0-9A-F]{4})/i.exec(name.toString('utf16le'))
  return match ? { vendorId: parseInt(match[1], 16), productId: parseInt(match[2], 16) } : null
}

export function setupMouseActivity(win) {
  if (process.platform !== 'win32') return
  try {
    win32 ??= loadWin32()
    const device = Buffer.alloc(RAWINPUTDEVICE_SIZE)
    device.writeUInt16LE(0x01, 0) // Generic Desktop
    device.writeUInt16LE(0x02, 2) // Mouse
    device.writeUInt32LE(RIDEV_INPUTSINK, 4)
    device.writeBigUInt64LE(win.getNativeWindowHandle().readBigUInt64LE(0), 8)
    if (!win32.RegisterRawInputDevices(device, 1, RAWINPUTDEVICE_SIZE)) throw new Error('RegisterRawInputDevices falhou')
  } catch (err) {
    console.error('[Raw Input] Monitor de uso dos mouses indisponível', err)
    return
  }

  // Por handle do aparelho: { ids, lastSent }. O handle muda ao reconectar; os novos
  // são lidos na primeira mensagem deles.
  const devices = new Map()
  win.hookWindowMessage(WM_INPUT, (_wParam, lParam) => {
    try {
      const size = [HEADER_SIZE]
      if (win32.GetRawInputData(lParam.readBigUInt64LE(0), RID_HEADER, win32.header, size, HEADER_SIZE) === 0xffffffff) return
      const handle = win32.header.readBigUInt64LE(8)
      // Eventos sintéticos (SendInput, área de trabalho remota) vêm sem aparelho.
      if (!handle) return
      let entry = devices.get(handle)
      if (!entry) devices.set(handle, (entry = { ids: deviceIds(handle), lastSent: 0 }))
      if (!entry.ids) return
      const now = Date.now()
      if (now - entry.lastSent < NOTIFY_MS) return
      entry.lastSent = now
      if (!win.isDestroyed()) win.webContents.send('mouse:activity', entry.ids)
    } catch (err) {
      console.error('[Raw Input]', err)
    }
  })
}
