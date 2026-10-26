<script setup>
import { computed } from 'vue'
import { hexToRgb, rgbToHex } from '@/utils/color.js'

const model = defineModel({ type: String, required: true })

const rgb = computed(() => hexToRgb(model.value) ?? { r: 0, g: 0, b: 0 })

function setChannel(channel, value) {
  model.value = rgbToHex({ ...rgb.value, [channel]: value })
}

const CHANNELS = [
  { key: 'r', label: 'R' },
  { key: 'g', label: 'G' },
  { key: 'b', label: 'B' },
]
</script>

<template>
  <div class="picker">
    <!-- O seletor nativo fica por baixo da amostra: clicar na amostra abre a paleta do sistema. -->
    <label class="swatch" :style="{ background: model }" title="Abrir seletor de cor">
      <input v-model="model" type="color" aria-label="Seletor de cor" />
    </label>

    <div class="channels">
      <label v-for="c in CHANNELS" :key="c.key">
        <span>{{ c.label }}</span>
        <input type="number" min="0" max="255" :value="rgb[c.key]" @input="setChannel(c.key, $event.target.value)" />
      </label>
    </div>
  </div>
</template>

<style scoped>
.picker { display: flex; gap: 14px; align-items: center; }
.swatch {
  position: relative;
  flex: none;
  width: 44px;
  height: 32px;
  border: 1px solid var(--border);
  border-radius: 6px;
  cursor: pointer;
}
.swatch input { position: absolute; inset: 0; width: 100%; height: 100%; opacity: 0; cursor: pointer; border: 0; padding: 0; }
.channels { display: flex; align-items: center; gap: 16px; }
.channels label { display: flex; align-items: center; gap: 6px; }
.channels span { width: 10px; color: var(--muted); font-size: 12px; font-weight: 600; text-align: center; }
.channels input {
  width: 56px;
  padding: 6px 8px;
  text-align: center;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg);
  color: var(--text);
  font: inherit;
  font-variant-numeric: tabular-nums;
}
.channels input:focus { outline: none; border-color: var(--blue); }
/* Sem as setinhas do campo numérico: o número fica centralizado no campo estreito. */
.channels input { appearance: textfield; -moz-appearance: textfield; }
.channels input::-webkit-outer-spin-button,
.channels input::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
</style>
