// Interpreta a memória de um perfil interno (nativo) do V8S nas mesmas
// configurações que o app usa nos perfis custom. Só leitura: o app não edita
// perfis nativos (isso é feito no hub oficial).
import { ADDR, POLLING_RATES, ONBOARD_DPI_SIZE } from './constants.js'

// Um eixo do DPI: valor de 16 bits + 2 bits altos e a flag de modo estendido.
function decodeAxis(lo, hi, high2, extended) {
  const val = lo | (hi << 8) | (high2 << 16)
  return extended ? (val + 1) * 2 : val + 1
}

const hex = (r, g, b) => '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')

/**
 * `flash`: os 256 bytes de configuração; `dpiArea`: os 48 bytes de DPI (8 slots).
 * Devolve as configurações do slot de DPI ativo do perfil.
 */
export function parseOnboardSettings(flash, dpiArea) {
  const slotCount = Math.max(1, flash[ADDR.MAX_DPI_STAGE] || 1)
  const slot = Math.min(flash[ADDR.CURRENT_DPI] ?? 0, slotCount - 1, ONBOARD_DPI_SIZE / 6 - 1)
  const d = dpiArea.slice(slot * 6, slot * 6 + 6)
  const flags = d[4]
  const dpi = decodeAxis(d[0], d[1], (flags >> 2) & 3, (flags & 0x01) !== 0)
  const dpiY = decodeAxis(d[2], d[3], (flags >> 6) & 3, (flags & 0x10) !== 0)
  const c = ADDR.DPI_COLOR + slot * 4
  return {
    dpi,
    dpiXY: dpiY !== dpi,
    dpiY,
    pollingRate: POLLING_RATES.find((r) => r.value === flash[ADDR.REPORT_RATE])?.hz ?? null,
    lod: flash[ADDR.LOD],
    sleepTime: flash[ADDR.SLEEP_TIME],
    color: hex(flash[c], flash[c + 1], flash[c + 2]),
    competitiveMode: flash[ADDR.PERFORMANCE_STATE] === 1,
    fps20k: flash[ADDR.SCYROX_20K] === 1,
    motionSync: flash[ADDR.MOTION_SYNC] === 1,
    rippleControl: flash[ADDR.RIPPLE_CONTROL] === 1,
    angleSnapping: flash[ADDR.ANGLE_SNAPPING] === 1,
    dpiSlots: slotCount,
  }
}

/** Fim útil da área de configuração: o hub não regrava o trecho final só com 0xFF. */
export function usedLength(bytes) {
  let last = bytes.length - 1
  while (last >= 0 && bytes[last] === 0xff) last--
  return last + 1
}
