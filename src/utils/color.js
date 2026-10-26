// Conversões entre '#rrggbb' (formato salvo nos perfis) e { r, g, b }.

const clampByte = (n) => Math.min(255, Math.max(0, Math.round(Number(n) || 0)))

export function hexToRgb(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex).trim())
  if (!m) return null
  const n = parseInt(m[1], 16)
  return { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff }
}

export function rgbToHex({ r, g, b }) {
  return '#' + [r, g, b].map((v) => clampByte(v).toString(16).padStart(2, '0')).join('')
}

export const isHexColor = (value) => hexToRgb(value) !== null
