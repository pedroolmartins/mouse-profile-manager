// Protocolo dos mouses Kysona com chip PAN1080 (Mercury Pro), extraído do hub
// oficial (GearHub, qmk.top/v4). Tudo passa pelo feature report 0 (64 bytes) da
// interface de fabricante 0xFFFF/0x0002, no cabo ou no receptor 2.4G.
//
// Comando: [cmd, args…], completado até 9 bytes; o byte 7 é 255 - (soma dos bytes 0..6).
// No cabo: envia o comando e lê o feature report com a resposta.
// No receptor: F7 (status) até o mouse poder receber, F6 05 (fala com o mouse),
// envia o comando, F7 até haver resposta, FC (avisa a leitura) e lê o feature report.

export const KYSONA_VENDOR_ID = 0x3151
export const KYSONA_WIRED_PIDS = [0x4026]
export const KYSONA_DONGLE_PIDS = [0x402d]
export const KYSONA_PRODUCT_IDS = [...KYSONA_WIRED_PIDS, ...KYSONA_DONGLE_PIDS]
export const KYSONA_MODEL_ID = 2557 // "KSN Mercury PRO" no hub

export const CONFIG_USAGE_PAGE = 0xffff
export const CONFIG_USAGE = 0x0002
export const EVENT_USAGE = 0x0001 // interface que avisa cliques do botão inferior (report 5)
export const REPORT_SIZE = 64

// Lido no mouse: perfis 0..7 têm dados válidos; a partir do 8 a memória vem vazia (0xFF).
export const PROFILE_COUNT = 8
export const DPI_MIN = 50
export const DPI_MAX = 26000 // PAW3395
export const POLLING_RATE_OPTIONS = [125, 250, 500, 1000, 2000, 4000, 8000]
// Sleep time do 2.4G em segundos (0 = nunca dorme). O mouse aceita 0..65535; estes são
// os oferecidos na tela.
export const SLEEP_OPTIONS = [10, 30, 60, 120, 300, 600, 1800, 0]
export const sleepLabel = (seconds) =>
  seconds == null ? '—' : seconds === 0 ? 'Nunca' : seconds < 60 ? `${seconds} s` : `${+(seconds / 60).toFixed(1)} min`
export const BOTTOM_KEY_INDEX = 5
export const KEY_DPI_LOOP = [20, 0, 0, 0]
export const KEY_PROFILE_LOOP = [8, 0, 3, 0]

export const CMD = {
  GET_INFO: 0x8f, // ID do modelo (uint32 LE nos bytes 1..4)
  GET_OPTION0: 0xd3, // perfil ativo, polling rate, debounce, luz, sleep…
  GET_DPI: 0xd4, // [cmd, perfil]: estágios de DPI e cores do perfil
  GET_KEYS: 0xd0, // [cmd, perfil]: função de cada botão (4 bytes por botão)
  // Troca de perfil como o hub: regrava a configuração geral (resposta de GET_OPTION0)
  // com o perfil novo no byte 8. O comando 0x05 só troca pela metade: o mouse muda
  // de perfil mas deixa de aceitar gravações e, no perfil 1, para de responder pelo 2.4G.
  SET_OPTION0: 0x53,
  SET_KEY: 0x50, // [cmd, perfil, botão, …, ação nos bytes 8..11]
  SET_DPI: 0x54, // como GET_DPI; só vale para o perfil ativo
}

export const DONGLE = { STATUS: 0xf7, SELECT: 0xf6, NOTICE_READ: 0xfc, MOUSE: 5 }

// O polling rate do Mercury Pro é um só para o mouse inteiro (byte 9 da configuração
// geral). Testado no cabo: trocar de perfil não muda o valor em uso, e o comando 0x84
// (que parece "polling rate por perfil") nunca muda. O hub oficial guarda um valor por
// perfil localmente e o reaplica na troca; o app faz o mesmo (ver store).
const POLLING_RATES = { 129: 8000, 130: 4000, 132: 2000, 1: 1000, 2: 500, 4: 250, 8: 125 }
export const RATE_TO_CODE = Object.fromEntries(Object.entries(POLLING_RATES).map(([code, hz]) => [hz, Number(code)]))

export function encodeCommand(bytes) {
  const packet = new Uint8Array(Math.max(9, bytes.length))
  packet.set(bytes)
  const sum = packet.slice(0, 7).reduce((a, b) => a + b, 0)
  packet[7] = 255 - (sum & 255)
  return packet
}

/**
 * `option0`: resposta de GET_OPTION0 (64 bytes); `rateCode`: código do polling rate
 * que o mouse passa a usar (byte 9; único para o mouse inteiro). `sleepSeconds`
 * (opcional): sleep time do 2.4G (bytes 44-45, também único); sem ele, fica o atual.
 */
export function buildSetProfile(option0, index, rateCode, sleepSeconds) {
  const packet = new Uint8Array(option0)
  packet[0] = CMD.SET_OPTION0
  packet[8] = index
  packet[9] = rateCode
  if (sleepSeconds != null) {
    packet[44] = sleepSeconds & 255
    packet[45] = (sleepSeconds >> 8) & 255
  }
  // Valores fixos que o hub sempre grava nesses bytes.
  packet[17] = 255
  packet[18] = 8
  return encodeCommand(packet)
}

const rgbOf = (hexColor) => {
  const n = parseInt(String(hexColor).replace('#', ''), 16)
  return Number.isNaN(n) ? [255, 255, 255] : [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/**
 * Estágios de DPI do perfil `profile` (precisa ser o ativo): [{ x, y, color }], com
 * `current` em uso. Mesmo layout da resposta de GET_DPI.
 */
export function buildSetDpi(profile, stages, current = 0) {
  const packet = new Uint8Array(REPORT_SIZE)
  packet.set([CMD.SET_DPI, profile, current, stages.length])
  stages.forEach((s, i) => {
    packet[8 + i * 2] = s.x & 255
    packet[9 + i * 2] = s.x >> 8
    packet[24 + i * 2] = s.y & 255
    packet[25 + i * 2] = s.y >> 8
    packet.set(rgbOf(s.color), 40 + i * 3)
  })
  return encodeCommand(packet)
}

/** Regrava um bloco de DPI lido por GET_DPI (cópia guardada). */
export function buildRestoreDpi(raw) {
  const packet = new Uint8Array(raw)
  packet[0] = CMD.SET_DPI
  return encodeCommand(packet)
}

export function buildSetKey(profile, key, action) {
  const bytes = new Uint8Array(REPORT_SIZE)
  bytes.set([CMD.SET_KEY, profile, key])
  bytes.set(action, 8)
  return encodeCommand(bytes)
}

export function parseInfo(r) {
  return new DataView(r.buffer, r.byteOffset, r.byteLength).getUint32(1, true)
}

export function parseOption0(r) {
  return { profile: r[8], pollingRate: POLLING_RATES[r[9]] ?? null, sleepSeconds: parseSleepSeconds(r) }
}

// Sleep time do 2.4G em segundos (0 = desligado), nos bytes 44-45 da configuração geral,
// como no hub oficial. Testado: mudar no hub para 10 s levou os bytes de "00 ff" para "0a 00".
export const parseSleepSeconds = (r) => r[44] | (r[45] << 8)

const hex = (r, g, b) => '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')

/** Estágios de DPI do perfil e o estágio em uso. */
export function parseDpi(r) {
  const count = Math.min(r[3], 8)
  const stages = []
  for (let i = 0; i < count; i++) {
    stages.push({
      x: r[8 + i * 2] | (r[9 + i * 2] << 8),
      y: r[24 + i * 2] | (r[25 + i * 2] << 8),
      color: hex(r[40 + i * 3], r[41 + i * 3], r[42 + i * 3]),
    })
  }
  // Estágios com DPI 0 não são usados pelo mouse (o hub grava 6 mesmo com menos ativos).
  const used = stages.filter((s) => s.x > 0)
  const currentStage = stages[r[2]]
  const current = currentStage?.x > 0 ? used.indexOf(currentStage) : 0
  return { current, stages: used }
}

export const bottomKeyAction = (r) => [...r.slice(BOTTOM_KEY_INDEX * 4, BOTTOM_KEY_INDEX * 4 + 4)]

export function parseDongleStatus(r) {
  return { canRead: r[0] === 1, battery: r[2], online: r[4] === 0, canSend: r[5] === 1, hasMouse: (r[6] & 2) !== 0 }
}

/** Aviso do botão inferior: report 5 começando com 0x0C. */
export const isBottomKeyEvent = (reportId, bytes) => reportId === 5 && bytes[0] === 0x0c
