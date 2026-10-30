// Camada WebHID do Kysona Mercury Pro: escolhe cabo ou receptor, serializa os
// comandos e acompanha o status do mouse. Não conhece Vue/Pinia.
import {
  KYSONA_VENDOR_ID,
  KYSONA_WIRED_PIDS,
  KYSONA_PRODUCT_IDS,
  CONFIG_USAGE_PAGE,
  CONFIG_USAGE,
  EVENT_USAGE,
  REPORT_SIZE,
  DONGLE,
  encodeCommand,
  parseDongleStatus,
  isBottomKeyEvent,
} from './protocol.js'

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const STATUS_POLL_MS = 2000
// Intervalo entre consultas de status ao receptor (o hub usa 100 ms; 30 ms responde
// mais rápido) e quantas, para esperar ~5 s o mouse poder receber/responder.
const STATUS_INTERVAL_MS = 30
const STATUS_ATTEMPTS = Math.ceil(5000 / STATUS_INTERVAL_MS)
const READ_ATTEMPTS = 5
const OPEN_RETRY_MS = 2000

export class KysonaError extends Error {
  constructor(message, code) {
    super(message)
    this.code = code // 'OFFLINE' | 'TIMEOUT' | 'DISCONNECTED'
  }
}

const hasCollection = (d, usage) => d.collections.some((c) => c.usagePage === CONFIG_USAGE_PAGE && c.usage === usage)

export class KysonaHidService {
  device = null // interface de configuração aberta
  wired = false
  online = false
  battery = null
  statusKnown = false // false até a primeira leitura do status (no cabo, já ao abrir)

  #eventDevice = null
  #queue = Promise.resolve()
  #listening = false
  #pollTimer = null
  #retryTimer = null
  lastOpenError = null
  #onStatusChange
  #onKeyEvent

  constructor({ onStatusChange, onKeyEvent } = {}) {
    this.#onStatusChange = onStatusChange ?? (() => {})
    this.#onKeyEvent = onKeyEvent ?? (() => {})
  }

  async init() {
    if (typeof navigator === 'undefined' || !('hid' in navigator)) return null
    if (!this.#listening) {
      navigator.hid.addEventListener('connect', this.#handleListChange)
      navigator.hid.addEventListener('disconnect', this.#handleListChange)
      this.#listening = true
    }
    await this.#reselect()
    return this.device
  }

  async dispose() {
    if (this.#listening) {
      navigator.hid.removeEventListener('connect', this.#handleListChange)
      navigator.hid.removeEventListener('disconnect', this.#handleListChange)
      this.#listening = false
    }
    await this.#close()
  }

  #handleListChange = ({ device }) => {
    if (device.vendorId === KYSONA_VENDOR_ID) this.#reselect()
  }

  async #reselect() {
    const all = (await navigator.hid.getDevices()).filter(
      (d) => d.vendorId === KYSONA_VENDOR_ID && KYSONA_PRODUCT_IDS.includes(d.productId),
    )
    // Cabo tem prioridade sobre o receptor.
    const rank = (d) => (KYSONA_WIRED_PIDS.includes(d.productId) ? 0 : 1)
    const target = all.filter((d) => hasCollection(d, CONFIG_USAGE)).sort((a, b) => rank(a) - rank(b))[0] ?? null
    if (target === this.device && (!target || target.opened)) return
    await this.#close()
    if (!target) return this.#emit()
    try {
      if (!target.opened) await target.open()
    } catch (err) {
      // Ex.: o Windows ainda está liberando a interface. Tenta de novo em instantes.
      this.lastOpenError = err
      clearTimeout(this.#retryTimer)
      this.#retryTimer = setTimeout(() => this.#reselect().catch(() => {}), OPEN_RETRY_MS)
      return this.#emit()
    }
    this.device = target
    this.wired = KYSONA_WIRED_PIDS.includes(target.productId)
    this.online = this.wired
    this.statusKnown = this.wired
    // No cabo o mouse não informa nível nem carga (testado: nenhum comando ou aviso traz
    // isso); por escolha do usuário, cabo conectado conta como carregando.
    this.battery = this.wired ? { cable: true, charging: true } : null
    // A interface de eventos (report 5) do mesmo aparelho avisa os cliques do botão inferior.
    const events = all.find((d) => d.productId === target.productId && hasCollection(d, EVENT_USAGE))
    if (events) {
      try {
        if (!events.opened) await events.open()
        events.addEventListener('inputreport', this.#handleInput)
        this.#eventDevice = events
      } catch {
        // Sem a interface de eventos o app ainda acompanha o perfil pela consulta periódica.
      }
    }
    this.#emit()
    this.#startPolling()
  }

  async #close() {
    clearInterval(this.#pollTimer)
    this.#eventDevice?.removeEventListener('inputreport', this.#handleInput)
    if (this.#eventDevice?.opened && this.#eventDevice !== this.device) await this.#eventDevice.close().catch(() => {})
    if (this.device?.opened) await this.device.close().catch(() => {})
    this.#eventDevice = null
    this.device = null
    this.online = false
    this.battery = null
    this.statusKnown = false
  }

  #handleInput = (event) => {
    const bytes = new Uint8Array(event.data.buffer)
    if (isBottomKeyEvent(event.reportId, bytes)) this.#onKeyEvent()
  }

  #emit() {
    this.#onStatusChange({
      device: this.device,
      wired: this.wired,
      online: this.online,
      battery: this.battery,
      statusKnown: this.statusKnown,
    })
  }

  #startPolling() {
    clearInterval(this.#pollTimer)
    if (this.wired) return
    const device = this.device
    // A primeira leitura (com ou sem resposta do mouse) define o status.
    const poll = () =>
      this.#run(() => this.#readDongleStatus())
        .catch(() => {})
        .finally(() => {
          if (this.statusKnown || this.device !== device) return
          this.statusKnown = true
          this.#emit()
        })
    poll()
    this.#pollTimer = setInterval(poll, STATUS_POLL_MS)
  }

  // ---- Baixo nível ---------------------------------------------------------------

  async #send(bytes) {
    if (!this.device?.opened) throw new KysonaError('Mouse desconectado', 'DISCONNECTED')
    const packet = new Uint8Array(REPORT_SIZE)
    packet.set(bytes.slice(0, REPORT_SIZE))
    await this.device.sendFeatureReport(0, packet)
  }

  async #get() {
    return new Uint8Array((await this.device.receiveFeatureReport(0)).buffer)
  }

  async #readDongleStatus() {
    await sleep(10)
    await this.#send([DONGLE.STATUS])
    await sleep(10)
    const status = parseDongleStatus(await this.#get())
    const online = status.hasMouse && status.online
    const battery = status.hasMouse ? { level: status.battery, charging: false, updatedAt: Date.now() } : null
    if (online !== this.online || battery?.level !== this.battery?.level) {
      this.online = online
      this.battery = battery
      this.#emit()
    }
    return status
  }

  async #waitDongle(flag, attempts = STATUS_ATTEMPTS) {
    for (let i = 0; i < attempts; i++) {
      await sleep(STATUS_INTERVAL_MS)
      if ((await this.#readDongleStatus())[flag]) return
    }
    throw new KysonaError('O mouse não respondeu. Mexa nele para acordá-lo e tente de novo.', 'TIMEOUT')
  }

  // Um comando por vez: o receptor tem um único buffer de resposta.
  #run(task) {
    const result = this.#queue.then(task, task)
    this.#queue = result.catch(() => {})
    return result
  }

  async #transmit(packet) {
    if (this.wired) {
      await sleep(10)
      return this.#send(packet)
    }
    await this.#waitDongle('canSend')
    await sleep(10)
    await this.#send([DONGLE.SELECT, DONGLE.MOUSE])
    await sleep(10)
    await this.#send(packet)
  }

  async #receive(attempts) {
    if (this.wired) {
      await sleep(30)
      return this.#get()
    }
    await this.#waitDongle('canRead', attempts)
    await sleep(10)
    await this.#send([DONGLE.NOTICE_READ])
    await sleep(10)
    return this.#get()
  }

  // ---- API -------------------------------------------------------------------------

  /** Envia um comando sem resposta (gravação). */
  write(packet) {
    return this.#run(async () => {
      await this.#transmit(packet)
      await sleep(150) // tempo do mouse gravar
    })
  }

  /**
   * Consulta: `cmd` são os bytes do comando; `isValid(resposta)` diz se a resposta é
   * desta consulta (o mouse/receptor às vezes devolve o eco ou a resposta anterior).
   * `statusAttempts` limita a espera pela resposta no receptor (consultas periódicas).
   */
  query(cmd, isValid = (r) => r[0] === cmd[0], { statusAttempts } = {}) {
    return this.#run(async () => {
      const packet = encodeCommand(cmd)
      await this.#transmit(packet)
      let reply = null
      for (let i = 0; i < READ_ATTEMPTS; i++) {
        reply = await this.#receive(statusAttempts)
        // Eco = o próprio comando (64 bytes, zeros depois dele). Comparar só o começo
        // confundia respostas reais que começam iguais (ex.: perfil 1 ativo, byte 8 = 0).
        const echo = reply.every((b, k) => b === (packet[k] ?? 0))
        if (!echo && isValid(reply)) return reply
      }
      const got = [...reply.slice(0, 12)].map((b) => b.toString(16).padStart(2, '0')).join(' ')
      throw new KysonaError(`Resposta inválida do mouse ao comando ${cmd[0].toString(16)} (${got})`, 'TIMEOUT')
    })
  }
}
