// Camada WebHID: descoberta, conexão, envio de comandos e correlação de ACKs.
// Não conhece Vue/Pinia — comunica mudanças por callbacks.
import {
  VENDOR_ID,
  PRODUCT_IDS,
  CONFIG_REPORT_ID,
  ACK_TIMEOUT_MS,
  ONLINE_POLL_OFFLINE_MS,
  ONLINE_POLL_ONLINE_MS,
  ONLINE_TIMEOUT_MS,
  CMD_STATUS_CHANGED,
  CMD_DEVICE_ONLINE,
  ACTIVITY_GRACE_MS,
  COMMAND_ATTEMPTS,
} from './constants.js'
import {
  buildDpiPacket,
  buildPollingRatePacket,
  buildLodPacket,
  buildSleepTimePackets,
  buildPerformanceStatePacket,
  buildFps20kPacket,
  buildToggleSettingPacket,
  buildDpiSlotCountPackets,
  buildCurrentDpiSlotPacket,
  buildMaxDpiStagePacket,
  buildBottomKeyDpiSwitchPacket,
  buildBottomKeyProfileSwitchPacket,
  buildCurrentConfigQuery,
  buildSetCurrentConfigPacket,
  buildWriteFlashPacket,
  readCurrentConfig,
  buildDpiColorPacket,
  buildDpiLedConfigPackets,
  buildProfileLedColorPacket,
  buildProfileLedBrightnessPacket,
  buildDpiLedModePacket,
  buildDeviceOnlineQuery,
  buildBatteryQuery,
  readBattery,
  buildMouseVersionQuery,
  buildReceiverVersionQuery,
  readVersion,
  buildReadFlashPacket,
  readDeviceOnline,
  parseInputReport,
  classifyResponse,
  toHex,
} from './protocol.js'

export class HidCommandError extends Error {
  constructor(message, { code, request, response } = {}) {
    super(message)
    this.name = 'HidCommandError'
    this.code = code // 'OFFLINE' | 'SEND_FAILED' | 'NACK' | 'TIMEOUT' | 'DISCONNECTED'
    this.request = request
    this.response = response
  }
}

/**
 * Estado da conexão, entregue a `onStatusChange` a cada mudança:
 *   device      -> interface HID aberta (cabo ou receptor), ou null
 *   wired       -> true se a interface aberta é a do cabo
 *   mouseOnline -> o mouse está ligado e respondendo. No cabo é sempre true;
 *                  no receptor depende da consulta periódica "mouse ligado?".
 */
export class MouseHidService {
  device = null
  wired = false
  mouseOnline = false

  #vendorId
  #productIds
  #onStatusChange
  #onTelemetry
  #pending = null // { request, resolve, reject, timer }
  #queue = Promise.resolve()
  #listening = false
  #reselecting = Promise.resolve()
  #pollTimer = null
  #lastOnlineReplyAt = 0
  #lastActivityAt = 0 // último sinal de vida do próprio mouse (aviso ou ACK)

  constructor({ vendorId = VENDOR_ID, productIds = PRODUCT_IDS, onStatusChange, onTelemetry } = {}) {
    this.#vendorId = vendorId
    this.#productIds = productIds
    this.#onStatusChange = onStatusChange ?? (() => {})
    this.#onTelemetry = onTelemetry ?? (() => {})
  }

  static get isSupported() {
    return typeof navigator !== 'undefined' && 'hid' in navigator
  }

  get isOnline() {
    return !!this.device?.opened && this.mouseOnline
  }

  /** Registra os listeners globais e abre o dispositivo já autorizado (se plugado). */
  async init() {
    if (!MouseHidService.isSupported) throw new Error('WebHID não está disponível neste ambiente')

    if (!this.#listening) {
      navigator.hid.addEventListener('connect', this.#handleDeviceListChange)
      navigator.hid.addEventListener('disconnect', this.#handleDeviceListChange)
      this.#listening = true
    }
    await this.#reselect()
    return this.device
  }

  async dispose() {
    if (this.#listening) {
      navigator.hid.removeEventListener('connect', this.#handleDeviceListChange)
      navigator.hid.removeEventListener('disconnect', this.#handleDeviceListChange)
      this.#listening = false
    }
    await this.#switchTo(null)
  }

  /**
   * Envia um pacote e aguarda o ACK correspondente. Comandos são serializados:
   * só existe um comando em voo por vez, o que permite associar cada resposta
   * ao pedido certo.
   */
  sendCommand(packet, { timeoutMs = ACK_TIMEOUT_MS, reportId = CONFIG_REPORT_ID, attempts = COMMAND_ATTEMPTS } = {}) {
    // Sem resposta, reenvia (o hub faz o mesmo): ao acordar do repouso, o link
    // sem fio pode perder os primeiros pacotes. Gravar o mesmo valor de novo é inofensivo.
    const run = async () => {
      for (let attempt = 1; ; attempt++) {
        try {
          return await this.#sendAndAwaitAck(packet, reportId, timeoutMs)
        } catch (err) {
          if (err.code !== 'TIMEOUT' || attempt >= attempts) throw err
        }
      }
    }
    const result = this.#queue.then(run, run)
    this.#queue = result.catch(() => {})
    return result
  }

  setDpi(dpiX, slot, dpiY = dpiX) {
    return this.sendCommand(buildDpiPacket(dpiX, slot, dpiY))
  }

  setPollingRate(hz) {
    return this.sendCommand(buildPollingRatePacket(hz))
  }

  setLod(value) {
    return this.sendCommand(buildLodPacket(value))
  }

  async setSleepTime(value) {
    const acks = []
    for (const packet of buildSleepTimePackets(value)) acks.push(await this.sendCommand(packet))
    return acks
  }

  setPerformanceState(on) {
    return this.sendCommand(buildPerformanceStatePacket(on))
  }

  setToggle(address, on) {
    return this.sendCommand(buildToggleSettingPacket(address, on))
  }

  setFps20k(on) {
    return this.sendCommand(buildFps20kPacket(on))
  }

  async setDpiSlotCount(count) {
    const acks = []
    for (const packet of buildDpiSlotCountPackets(count)) acks.push(await this.sendCommand(packet))
    return acks
  }

  setMaxDpiStage(count) {
    return this.sendCommand(buildMaxDpiStagePacket(count))
  }

  setCurrentDpiSlot(slot) {
    return this.sendCommand(buildCurrentDpiSlotPacket(slot))
  }

  setDpiColor(hexColor, slot) {
    return this.sendCommand(buildDpiColorPacket(hexColor, slot))
  }

  setProfileLedColor(hexColor) {
    return this.sendCommand(buildProfileLedColorPacket(hexColor))
  }

  setProfileLedBrightness(value) {
    return this.sendCommand(buildProfileLedBrightnessPacket(value))
  }

  async configureDpiLed() {
    const acks = []
    for (const packet of buildDpiLedConfigPackets()) acks.push(await this.sendCommand(packet))
    return acks
  }

  /** Acende (efeito fixo) ou apaga (efeito desligado) o LED de DPI. */
  setDpiLed(on) {
    return this.sendCommand(buildDpiLedModePacket(on))
  }

  setBottomKeyDpiSwitch() {
    return this.sendCommand(buildBottomKeyDpiSwitchPacket())
  }

  /** Experimental: botão inferior como "troca de perfil". */
  setBottomKeyProfileSwitch() {
    return this.sendCommand(buildBottomKeyProfileSwitchPacket())
  }

  /** Ativa um perfil interno (0 a 3). */
  setOnboardProfile(index) {
    return this.sendCommand(buildSetCurrentConfigPacket(index))
  }

  /** Lê `length` bytes da memória a partir de `address`, em blocos de 10 (como o hub). */
  async readFlashRange(address, length) {
    const out = new Uint8Array(length)
    for (let offset = 0; offset < length; offset += 10) {
      const size = Math.min(10, length - offset)
      out.set(await this.readFlash(address + offset, size), offset)
    }
    return out
  }

  /** Grava `bytes` na memória a partir de `address`, em blocos de 10 (como o hub). */
  async writeFlashRange(address, bytes) {
    for (let offset = 0; offset < bytes.length; offset += 10) {
      await this.sendCommand(buildWriteFlashPacket(address + offset, [...bytes.slice(offset, offset + 10)]))
    }
  }

  /** Perfil interno ativo (0 a 3), ou null se não houver resposta. */
  async getOnboardProfile() {
    return readCurrentConfig(await this.probe(buildCurrentConfigQuery()))
  }

  /**
   * Nível de bateria. Uma tentativa só e tempo curto: é uma consulta periódica, e
   * um mouse que não responde não deve segurar a fila de comandos.
   */
  async getBattery() {
    return readBattery(await this.sendCommand(buildBatteryQuery(), { attempts: 1, timeoutMs: 600 }))
  }

  /** Versões de firmware ("v5.06"), ou null se não houver resposta. */
  async getMouseVersion() {
    return readVersion(await this.probe(buildMouseVersionQuery()))
  }

  async getReceiverVersion() {
    return readVersion(await this.probe(buildReceiverVersionQuery()))
  }

  /**
   * Envia um pacote de leitura e devolve a resposta crua, inclusive quando o
   * mouse recusa (status 1). null se não houver resposta.
   */
  async probe(packet, { timeoutMs = 800 } = {}) {
    try {
      return await this.sendCommand(packet, { attempts: 1, timeoutMs })
    } catch (err) {
      if (err.code === 'NACK') return err.response
      if (err.code === 'TIMEOUT') return null
      throw err
    }
  }

  /** Lê `length` bytes da memória flash a partir de `address`. */
  async readFlash(address, length) {
    const response = await this.sendCommand(buildReadFlashPacket(address, length))
    return response.bytes.slice(5, 5 + length)
  }

  // ---------------------------------------------------------------------------
  // Escolha da interface

  #matches(device) {
    return device.vendorId === this.#vendorId && this.#productIds.includes(device.productId)
  }

  // Mouses costumam expor várias interfaces HID com o mesmo VID/PID (uma para
  // movimento, outra para teclado/macros, outra vendor-defined). A interface de
  // configuração é a que declara o output report CONFIG_REPORT_ID.
  #isConfigInterface(device) {
    if (!device.collections?.length) return true
    return device.collections.some((c) => c.outputReports?.some((r) => r.reportId === CONFIG_REPORT_ID))
  }

  // Com cabo e receptor conectados ao mesmo tempo, prefere o PID que vem primeiro (com fio).
  #pickConfigInterface(devices) {
    const rank = (d) => this.#productIds.indexOf(d.productId)
    return devices.filter((d) => this.#isConfigInterface(d)).sort((a, b) => rank(a) - rank(b))[0] ?? null
  }

  // Qualquer conexão/desconexão USB do nosso VID/PID: reavalia qual interface usar.
  // Cobre cabo plugado com o receptor em uso, cabo removido com o receptor
  // plugado e receptor removido/recolocado.
  #handleDeviceListChange = ({ device }) => {
    if (this.#matches(device)) this.#reselect()
  }

  /** Abre a melhor interface disponível agora. Chamadas são serializadas. */
  #reselect() {
    const run = async () => {
      try {
        const devices = (await navigator.hid.getDevices()).filter((d) => this.#matches(d))
        await this.#switchTo(this.#pickConfigInterface(devices))
      } catch (err) {
        console.error('[HID] Falha ao selecionar dispositivo', err)
      }
    }
    this.#reselecting = this.#reselecting.then(run, run)
    return this.#reselecting
  }

  async #switchTo(target) {
    const current = this.device
    if (target === current && (!target || target.opened)) return

    if (current) {
      current.removeEventListener('inputreport', this.#handleInputReport)
      this.#stopPolling()
      this.#rejectPending(new HidCommandError('Dispositivo desconectado', { code: 'DISCONNECTED' }))
      this.device = null
      // A interface antiga pode já ter sumido do USB; fechar é só limpeza.
      if (current.opened) await current.close().catch(() => {})
    }

    if (target) {
      if (!target.opened) await target.open()
      // Listener registrado imediatamente após abrir para não perder respostas.
      target.addEventListener('inputreport', this.#handleInputReport)
      this.device = target
      this.wired = target.productId === this.#productIds[0]
      if (this.wired) {
        this.mouseOnline = true
      } else {
        // No receptor, o mouse só conta como ligado depois que ele confirmar.
        this.mouseOnline = false
        this.#startPolling()
      }
    } else {
      this.wired = false
      this.mouseOnline = false
    }
    this.#emitStatus()
  }

  #emitStatus() {
    this.#onStatusChange({ device: this.device, wired: this.wired, mouseOnline: this.mouseOnline })
  }

  // ---------------------------------------------------------------------------
  // "Mouse ligado?" no receptor sem fio

  #startPolling() {
    this.#stopPolling()
    this.#lastOnlineReplyAt = Date.now()
    const tick = () => {
      // Receptor mudo por muito tempo: trata o mouse como desligado.
      if (this.mouseOnline && Date.now() - this.#lastOnlineReplyAt > ONLINE_TIMEOUT_MS) this.#setMouseOnline(false)
      // Envio direto, fora da fila: a resposta chega como relatório próprio
      // (comando 3) e não disputa o ACK com os comandos de configuração.
      this.device?.sendReport(CONFIG_REPORT_ID, buildDeviceOnlineQuery()).catch(() => {})
      this.#pollTimer = setTimeout(tick, this.mouseOnline ? ONLINE_POLL_ONLINE_MS : ONLINE_POLL_OFFLINE_MS)
    }
    tick()
  }

  #stopPolling() {
    clearTimeout(this.#pollTimer)
    this.#pollTimer = null
  }

  #setMouseOnline(online) {
    if (this.mouseOnline === online) return
    this.mouseOnline = online
    this.#emitStatus()
  }

  // ---------------------------------------------------------------------------
  // Envio e respostas

  #handleInputReport = (event) => {
    const response = parseInputReport(event.reportId, event.data)

    const online = readDeviceOnline(response)
    if (online !== null) {
      this.#lastOnlineReplyAt = Date.now()
      if (online) this.#lastActivityAt = Date.now()
      // Um "em repouso" logo após um sinal de vida do mouse é resposta atrasada
      // (consulta enviada antes de ele acordar) ou o link ainda reconectando: ignora.
      const recentlyActive = Date.now() - this.#lastActivityAt < ACTIVITY_GRACE_MS
      if (!this.wired && (online || !recentlyActive)) this.#setMouseOnline(online)
      this.#onTelemetry(response) // para diagnóstico (o App registra quando muda)
      // Consulta "03" enviada pela fila (diagnóstico): entrega a resposta a ela também.
      const pending = this.#pending
      if (pending?.request[0] === CMD_DEVICE_ONLINE) {
        this.#clearPending()
        pending.resolve(response)
      }
      return
    }

    // Qualquer outro aviso espontâneo (ex.: clique no botão inferior) vem do
    // próprio mouse: ele acordou. Marca como ativo já, sem esperar a próxima
    // consulta, para que o comando disparado pelo aviso não seja recusado.
    if (response.command === CMD_STATUS_CHANGED) {
      this.#lastActivityAt = Date.now()
      this.#lastOnlineReplyAt = Date.now()
      if (!this.wired) this.#setMouseOnline(true)
    }

    const pending = this.#pending
    const verdict = pending ? classifyResponse(pending.request, response) : null

    if (!verdict) {
      this.#onTelemetry(response)
      return
    }

    this.#clearPending()
    this.#lastActivityAt = Date.now()
    if (verdict === 'ack') {
      pending.resolve(response)
    } else {
      pending.reject(
        new HidCommandError(`MCU recusou o comando: ${toHex(response.bytes)}`, {
          code: 'NACK',
          request: pending.request,
          response,
        }),
      )
    }
  }

  async #sendAndAwaitAck(packet, reportId, timeoutMs) {
    // Só recusa sem interface aberta. "Em repouso" não bloqueia: o receptor repassa
    // o comando e o mouse acorda; se ele estiver mesmo desligado, o comando
    // termina em TIMEOUT. Bloquear aqui recusava o primeiro clique após o repouso.
    const device = this.device
    if (!device?.opened) {
      throw new HidCommandError('Mouse offline', { code: 'OFFLINE', request: packet })
    }

    const ack = new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#clearPending()
        reject(new HidCommandError('Sem resposta da MCU (timeout)', { code: 'TIMEOUT', request: packet }))
      }, timeoutMs)
      this.#pending = { request: packet, resolve, reject, timer }
    })

    try {
      await device.sendReport(reportId, packet)
    } catch (cause) {
      this.#rejectPending(new HidCommandError(`Falha no sendReport: ${cause.message}`, { code: 'SEND_FAILED', request: packet }))
    }
    return ack
  }

  #clearPending() {
    if (this.#pending) clearTimeout(this.#pending.timer)
    this.#pending = null
  }

  #rejectPending(error) {
    const pending = this.#pending
    if (!pending) return
    this.#clearPending()
    pending.reject(error)
  }
}
