// Uso dos mouses no Linux (o equivalente ao Raw Input do Windows): lê os eventos de
// entrada (/dev/input/eventN) das interfaces de mouse dos aparelhos suportados, só
// para saber que estão em uso. Não captura os eventos (sem EVIOCGRAB): o sistema
// continua recebendo tudo. A permissão de leitura vem da regra udev do app, que libera
// só as interfaces de mouse (ID_INPUT_MOUSE) desses aparelhos ao usuário logado.
import { createReadStream } from 'node:fs'
import { readdir, readFile } from 'node:fs/promises'

const SCAN_MS = 5000
const NOTIFY_MS = 1000

let scanTimer = null
const streams = new Map() // "eventN" -> stream
const warned = new Set() // interfaces com erro já registrado (a varredura tenta de novo)

async function readHex(file) {
  return parseInt((await readFile(file, 'utf8').catch(() => '')).trim(), 16)
}

async function scan(isSupported, onActivity) {
  const nodes = await readdir('/sys/class/input').catch(() => [])
  for (const node of nodes.filter((n) => n.startsWith('event') && !streams.has(n))) {
    const ids = {
      vendorId: await readHex(`/sys/class/input/${node}/device/id/vendor`),
      productId: await readHex(`/sys/class/input/${node}/device/id/product`),
    }
    if (!isSupported(ids)) continue
    const stream = createReadStream(`/dev/input/${node}`)
    streams.set(node, stream)
    let lastSent = 0
    stream.on('data', () => {
      const now = Date.now()
      if (now - lastSent < NOTIFY_MS) return
      lastSent = now
      onActivity(ids)
    })
    // EACCES (regra udev não instalada) ou ENODEV (aparelho desconectado): a interface
    // sai da lista; a próxima varredura a reabre se ela voltar.
    stream.on('error', (err) => {
      if (err.code !== 'ENODEV' && !warned.has(node)) console.error(`[Uso dos mouses] /dev/input/${node}:`, err.message)
      warned.add(node)
      streams.delete(node)
    })
    stream.on('close', () => streams.delete(node))
  }
}

/** isSupported({ vendorId, productId }); onActivity({ vendorId, productId }). */
export function startLinuxMouseActivity(isSupported, onActivity) {
  if (scanTimer) return
  const run = () => scan(isSupported, onActivity).catch((err) => console.error('[Uso dos mouses]', err))
  run()
  // Varredura periódica: pega mouses e receptores conectados depois de o app abrir.
  scanTimer = setInterval(run, SCAN_MS)
}

export function stopLinuxMouseActivity() {
  clearInterval(scanTimer)
  scanTimer = null
  for (const stream of streams.values()) stream.destroy()
  streams.clear()
}
