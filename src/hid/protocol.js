// Montagem e interpretação dos pacotes do firmware. Funções puras, sem WebHID,
// para poderem ser testadas isoladamente.
import {
  PACKET_SIZE,
  CHECKSUM_INDEX,
  CHECKSUM_MAGIC,
  DATA_CHECK_MAGIC,
  MAX_DATA_LENGTH,
  CMD_WRITE_FLASH,
  CMD_DEVICE_ONLINE,
  CMD_BATTERY_LEVEL,
  CMD_MOUSE_VERSION,
  CMD_RECEIVER_VERSION,
  CMD_READ_FLASH,
  STATUS_OK,
  ADDR,
  DPI_SLOT,
  BOTTOM_KEY_INDEX,
  KEY_TYPE_DPI_SWITCH,
  DPI_SWITCH_PARAM,
  KEY_TYPE_PROFILE_SWITCH,
  PROFILE_SWITCH_PARAM,
  CMD_GET_CURRENT_CONFIG,
  CMD_SET_CURRENT_CONFIG,
  CMD_STATUS_CHANGED,
  STATUS_FLAG_CURRENT_DPI,
  DPI_EFFECT_STEADY,
  DPI_EFFECT_OFF,
  DPI_EFFECT_MAX_BRIGHTNESS,
  BATTERY_VOLTAGE_TABLE,
  DPI_MIN,
  DPI_MAX,
  DPI_EXTENDED_MIN,
  DPI_EXTENDED_FLAG,
  POLLING_RATES,
  LOD_OPTIONS,
  SLEEP_OPTIONS,
} from './constants.js'
import { hexToRgb } from '../utils/color.js'

const sum = (bytes, end = bytes.length) => {
  let s = 0
  for (let i = 0; i < end; i++) s += bytes[i]
  return s
}

/** Checksum do pacote: (77 - soma dos bytes 0..14) & 0xFF */
export function computeChecksum(bytes) {
  return (CHECKSUM_MAGIC - sum(bytes, CHECKSUM_INDEX)) & 0xff
}

/** Byte de verificação que fecha um bloco de dados: (0x55 - soma) & 0xFF */
export function dataCheck(bytes) {
  return (DATA_CHECK_MAGIC - sum(bytes)) & 0xff
}

function assertInt(name, value, min, max) {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new RangeError(`${name} deve ser um inteiro entre ${min} e ${max} (recebido: ${value})`)
  }
}

function assertOption(name, value, options) {
  if (!options.some((o) => o.value === value)) {
    throw new RangeError(`${name} inválido: ${value}`)
  }
}

/** [7, 0, endereço BE, tamanho, dados..., 0..., checksum] */
export function buildWriteFlashPacket(address, data) {
  assertInt('address', address, 0, 0xffff)
  if (data.length > MAX_DATA_LENGTH) throw new RangeError(`Dados excedem ${MAX_DATA_LENGTH} bytes`)

  const packet = new Uint8Array(PACKET_SIZE)
  packet[0] = CMD_WRITE_FLASH
  packet[2] = (address >> 8) & 0xff
  packet[3] = address & 0xff
  packet[4] = data.length
  packet.set(data, 5)
  packet[CHECKSUM_INDEX] = computeChecksum(packet)
  return packet
}

/** Consulta sem dados (ex.: "mouse ligado?"): [cmd, 0, ..., checksum]. */
export function buildQueryPacket(command) {
  const packet = new Uint8Array(PACKET_SIZE)
  packet[0] = command
  packet[CHECKSUM_INDEX] = computeChecksum(packet)
  return packet
}

export const buildDeviceOnlineQuery = () => buildQueryPacket(CMD_DEVICE_ONLINE)
export const buildBatteryQuery = () => buildQueryPacket(CMD_BATTERY_LEVEL)

export const buildMouseVersionQuery = () => buildQueryPacket(CMD_MOUSE_VERSION)
export const buildReceiverVersionQuery = () => buildQueryPacket(CMD_RECEIVER_VERSION)

/** "v5.06" a partir da resposta de versão (como o hub mostra), ou null se recusada. */
export function readVersion(response) {
  const b = response?.bytes
  if (!b || b[1] === 1) return null
  return `v${b[5]}.${b[6].toString(16).padStart(2, '0')}`
}

/** Resposta à consulta de bateria: { level (%), charging, voltage (mV) }. */
export function readBattery(response) {
  const b = response.bytes
  const rawLevel = Math.min(100, b[5])
  const charging = b[6] === 1
  const voltage = (b[7] << 8) | b[8]
  // Como o hub oficial: com a tensão disponível, o % vem dela (mais preciso que o byte 5).
  const level = voltage > 0 ? voltageToLevel(voltage, charging) : rawLevel
  return { level, rawLevel, charging, voltage }
}

/** Converte a tensão (mV) em %, com a mesma tabela e interpolação do hub oficial. */
export function voltageToLevel(mv, charging = false) {
  const table = BATTERY_VOLTAGE_TABLE
  if (mv > table[table.length - 1]) return charging ? 99 : 100
  const i = table.findIndex((v) => mv < v)
  if (i === 0) return 1 // abaixo do mínimo: o hub soma 1 ao 0
  let level = (mv - table[i - 1]) / ((table[i] - table[i - 1]) / 5) + (i - 1) * 5
  if (level === 0 || level === 15) level++
  return Math.round(level)
}

/** Resposta à consulta "mouse ligado?": true/false, ou null se não for essa resposta. */
export function readDeviceOnline(response) {
  return response.command === CMD_DEVICE_ONLINE ? response.bytes[5] === 1 : null
}

/** Leitura da memória flash: [8, 0, endereço BE, tamanho, 0..., checksum]. A resposta traz os dados a partir do byte 5. */
export function buildReadFlashPacket(address, length) {
  assertInt('address', address, 0, 0xffff)
  assertInt('length', length, 1, MAX_DATA_LENGTH)
  const packet = new Uint8Array(PACKET_SIZE)
  packet[0] = CMD_READ_FLASH
  packet[2] = (address >> 8) & 0xff
  packet[3] = address & 0xff
  packet[4] = length
  packet[CHECKSUM_INDEX] = computeChecksum(packet)
  return packet
}

/** Configuração de 1 byte: o firmware guarda [valor, 0x55 - valor]. */
export function buildByteSettingPacket(address, value) {
  assertInt('value', value, 0, 0xff)
  return buildWriteFlashPacket(address, [value, (DATA_CHECK_MAGIC - value) & 0xff])
}

// Valor gravado para um eixo. Até 42000: dpi - 1. Acima: modo estendido, dpi / 2 - 1
// (o sensor só tem passos de 2 ali: um valor ímpar vira o par mais próximo).
function encodeAxis(name, dpi) {
  assertInt(name, dpi, DPI_MIN, DPI_MAX)
  const extended = dpi >= DPI_EXTENDED_MIN
  return { val: extended ? Math.round(dpi / 2) - 1 : dpi - 1, extended }
}

/**
 * DPI de um slot. Bloco de 6 bytes: [X lo, X hi, Y lo, Y hi, flags, verificação].
 * Flags por eixo (como o firmware lê): bit 0 = X estendido, bits 2-3 = X >> 16,
 * bit 4 = Y estendido, bits 6-7 = Y >> 16. O hub sempre grava X = Y; com `dpiY`
 * diferente, cada eixo recebe o próprio valor.
 * Ex.: 3584 DPI -> 07 00 1b 00 06 ff 0d ff 0d 00 3d 00 00 00 00 d0
 */
export function buildDpiPacket(dpiX, slot = DPI_SLOT, dpiY = dpiX) {
  const x = encodeAxis('dpiX', dpiX)
  const y = encodeAxis('dpiY', dpiY)
  const flags =
    (x.extended ? DPI_EXTENDED_FLAG & 0x0f : 0) |
    (((x.val >> 16) & 0x03) << 2) |
    (y.extended ? DPI_EXTENDED_FLAG & 0xf0 : 0) |
    (((y.val >> 16) & 0x03) << 6)
  const block = [x.val & 0xff, (x.val >> 8) & 0xff, y.val & 0xff, (y.val >> 8) & 0xff, flags]
  return buildWriteFlashPacket(ADDR.SENSOR_3955_DPI + slot * 6, [...block, dataCheck(block)])
}

export function buildPollingRatePacket(hz) {
  const option = POLLING_RATES.find((r) => r.hz === hz)
  if (!option) throw new RangeError(`Polling rate não suportado: ${hz} Hz`)
  return buildByteSettingPacket(ADDR.REPORT_RATE, option.value)
}

export function buildLodPacket(value) {
  assertOption('LOD', value, LOD_OPTIONS)
  return buildByteSettingPacket(ADDR.LOD, value)
}

/**
 * "Modo Competitivo" (no hub: Highest performance): sensor no modo de maior
 * desempenho. Testado: não impede o repouso do link sem fio com o mouse parado.
 */
export function buildPerformanceStatePacket(on) {
  return buildByteSettingPacket(ADDR.PERFORMANCE_STATE, on ? 1 : 0)
}

/** Opção liga/desliga de um byte (Motion Sync, Ripple Control, Angle Snapping…). */
export function buildToggleSettingPacket(address, on) {
  return buildByteSettingPacket(address, on ? 1 : 0)
}

/** "20K" no hub: sensor lendo a superfície a 20.000 FPS. Exige o Modo Competitivo ligado. */
export function buildFps20kPacket(on) {
  return buildByteSettingPacket(ADDR.SCYROX_20K, on ? 1 : 0)
}

/** O hub grava o sleep time em dois endereços; os dois pacotes devem ser enviados. */
export function buildSleepTimePackets(value) {
  assertOption('Sleep time', value, SLEEP_OPTIONS)
  return [buildByteSettingPacket(ADDR.SLEEP_TIME, value), buildByteSettingPacket(ADDR.PERFORMANCE, value)]
}

/** Cor do LED de um slot de DPI. Bloco [R, G, B, verificação]. */
export function buildDpiColorPacket(hexColor, slot = DPI_SLOT) {
  const rgb = hexToRgb(hexColor)
  if (!rgb) throw new RangeError(`Cor inválida: ${hexColor}`)
  const block = [rgb.r, rgb.g, rgb.b]
  return buildWriteFlashPacket(ADDR.DPI_COLOR + slot * 4, [...block, dataCheck(block)])
}

/** Cor que o firmware pisca ao trocar de perfil interno. Bloco [R, G, B, verificação]. */
export function buildProfileLedColorPacket(hexColor) {
  const rgb = hexToRgb(hexColor)
  if (!rgb) throw new RangeError(`Cor inválida: ${hexColor}`)
  const block = [rgb.r, rgb.g, rgb.b]
  return buildWriteFlashPacket(ADDR.PROFILE_LED_COLOR, [...block, dataCheck(block)])
}

/** Brilho da piscada de troca de perfil interno (0 desliga a piscada). */
export function buildProfileLedBrightnessPacket(value) {
  return buildByteSettingPacket(ADDR.PROFILE_LED_BRIGHTNESS, value)
}

/** Configura o LED de DPI com brilho máximo e estado ligado (quem acende/apaga é o modo). */
export function buildDpiLedConfigPackets() {
  return [
    buildByteSettingPacket(ADDR.DPI_EFFECT_BRIGHTNESS, DPI_EFFECT_MAX_BRIGHTNESS),
    buildByteSettingPacket(ADDR.DPI_EFFECT_STATE, 1),
  ]
}

/**
 * Efeito do LED de DPI: fixo (aceso) ou desligado. Diferente do estado, o efeito
 * desligado também impede o firmware de acender o LED sozinho ao trocar de slot.
 */
export function buildDpiLedModePacket(on) {
  return buildByteSettingPacket(ADDR.DPI_EFFECT_MODE, on ? DPI_EFFECT_STEADY : DPI_EFFECT_OFF)
}


/** Quantidade de slots de DPI ativos (sem mudar o slot atual). */
export function buildMaxDpiStagePacket(count) {
  assertInt('count', count, 1, 8)
  return buildByteSettingPacket(ADDR.MAX_DPI_STAGE, count)
}

/** Seleciona o slot de DPI ativo (sem mudar a quantidade de slots). */
export function buildCurrentDpiSlotPacket(slot = DPI_SLOT) {
  return buildByteSettingPacket(ADDR.CURRENT_DPI, slot)
}

/** Define quantos slots de DPI ficam ativos e volta para o slot principal. */
export function buildDpiSlotCountPackets(count = 1, slot = DPI_SLOT) {
  assertInt('count', count, 1, 8)
  return [buildByteSettingPacket(ADDR.MAX_DPI_STAGE, count), buildByteSettingPacket(ADDR.CURRENT_DPI, slot)]
}

/** Função de uma tecla: bloco [tipo, parâmetro BE, verificação]. */
export function buildKeyFunctionPacket(keyIndex, type, param) {
  assertInt('keyIndex', keyIndex, 0, 15)
  const block = [type, (param >> 8) & 0xff, param & 0xff]
  return buildWriteFlashPacket(ADDR.KEY_FUNCTION + keyIndex * 4, [...block, dataCheck(block)])
}

export function buildBottomKeyDpiSwitchPacket() {
  return buildKeyFunctionPacket(BOTTOM_KEY_INDEX, KEY_TYPE_DPI_SWITCH, DPI_SWITCH_PARAM)
}

/** Experimental: botão inferior como "troca de perfil" (tipo 9). */
export function buildBottomKeyProfileSwitchPacket() {
  return buildKeyFunctionPacket(BOTTOM_KEY_INDEX, KEY_TYPE_PROFILE_SWITCH, PROFILE_SWITCH_PARAM)
}

export const buildCurrentConfigQuery = () => buildQueryPacket(CMD_GET_CURRENT_CONFIG)

/** Ativa um dos perfis internos do mouse (0 a 3): [0F, 0, 0, 0, 1, perfil, …, checksum]. */
export function buildSetCurrentConfigPacket(index) {
  assertInt('index', index, 0, 3)
  const packet = new Uint8Array(PACKET_SIZE)
  packet[0] = CMD_SET_CURRENT_CONFIG
  packet[4] = 1
  packet[5] = index
  packet[CHECKSUM_INDEX] = computeChecksum(packet)
  return packet
}

/** Perfil interno ativo (0 a 3) a partir da resposta, ou null se recusada. */
export function readCurrentConfig(response) {
  const b = response?.bytes
  if (!b || b[1] === 1) return null
  return b[5]
}

/** true se o aviso do mouse indica troca de slot de DPI (clique na tecla de DPI). */
export function isDpiKeyEvent(response) {
  return response.command === CMD_STATUS_CHANGED && (response.bytes[5] & STATUS_FLAG_CURRENT_DPI) !== 0
}

/** Converte o evento `inputreport` em algo fácil de consumir. */
export function parseInputReport(reportId, dataView) {
  const bytes = new Uint8Array(dataView.buffer, dataView.byteOffset, dataView.byteLength).slice()
  const hasChecksum = bytes.length === PACKET_SIZE
  return {
    reportId,
    bytes,
    command: bytes[0],
    status: bytes[1],
    address: (bytes[2] << 8) | bytes[3],
    checksumValid: hasChecksum ? bytes[CHECKSUM_INDEX] === computeChecksum(bytes) : null,
    receivedAt: Date.now(),
  }
}

/**
 * Decide se uma resposta da MCU corresponde ao comando enviado.
 *   'ack'  -> mesmo comando e endereço, status 0
 *   'nack' -> mesmo comando e endereço, status diferente de 0 (ou checksum inválido)
 *   null   -> resposta não relacionada (telemetria etc.)
 */
export function classifyResponse(request, response) {
  const address = (request[2] << 8) | request[3]
  if (response.command !== request[0] || response.address !== address) return null
  if (response.status !== STATUS_OK || response.checksumValid === false) return 'nack'
  return 'ack'
}

export const toHex = (bytes) => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join(' ')
