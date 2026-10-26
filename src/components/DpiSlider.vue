<script setup>
import { ref, computed, watch } from 'vue'

const props = defineProps({
  min: { type: Number, required: true },
  max: { type: Number, required: true },
})
const model = defineModel({ type: Number, required: true })

// Enquanto o usuário arrasta, a barra acompanha o dedo sem animação;
// quando o valor vem do campo numérico, a barra desliza até ele.
const dragging = ref(false)
const text = ref(String(model.value))

// Escala não linear (curva cúbica): a posição p (0..1) vira DPI = min + (max - min) * p³.
// Assim os valores mais usados ganham espaço: 800 fica em ~25% da barra,
// 3200 em ~40% e 26000 em ~80%, em vez de tudo espremido no começo.
const CURVE = 3
const RANGE_STEPS = 10000

const toPosition = (dpi) => Math.cbrt((clamp(dpi) - props.min) / (props.max - props.min))
const fromPosition = (p) => props.min + (props.max - props.min) * p ** CURVE

// Ao arrastar, arredonda para passos legíveis (o campo numérico aceita qualquer valor).
function snap(dpi) {
  const step = dpi < 1000 ? 10 : dpi < 10000 ? 50 : 100
  return clamp(Math.round(dpi / step) * step)
}

const percent = computed(() => toPosition(model.value) * 100)
const rangeValue = computed(() => Math.round(toPosition(model.value) * RANGE_STEPS))

function clamp(value) {
  return Math.min(props.max, Math.max(props.min, Math.round(value)))
}

// Mantém o campo em sincronia quando o valor muda pela barra.
watch(model, (value) => {
  if (Number(text.value) !== value) text.value = String(value)
})

function onTextInput(event) {
  text.value = event.target.value
  const value = Number(text.value)
  // Só aplica valores completos e dentro da faixa; o resto espera o blur.
  if (text.value !== '' && Number.isInteger(value) && value >= props.min && value <= props.max) {
    model.value = value
  }
}

function onTextCommit() {
  const value = Number(text.value)
  model.value = Number.isFinite(value) && text.value !== '' ? clamp(value) : model.value
  text.value = String(model.value)
}

function onRangeInput(event) {
  model.value = snap(fromPosition(Number(event.target.value) / RANGE_STEPS))
}

// Marcas de referência sob a barra, posicionadas na mesma escala.
const MARKS = [400, 3200, 12000, 26000]
const marks = computed(() =>
  MARKS.filter((m) => m > props.min && m < props.max).map((m) => ({ value: m, left: `${toPosition(m) * 100}%` })),
)
</script>

<template>
  <div class="dpi">
    <div class="slider" :class="{ animated: !dragging }" :style="{ '--p': `${percent}%` }">
      <div class="track"><div class="fill" /></div>
      <div class="thumb" />
      <input
        type="range"
        min="0"
        :max="RANGE_STEPS"
        step="1"
        :value="rangeValue"
        aria-label="DPI"
        :aria-valuetext="`${model} DPI`"
        @input="onRangeInput"
        @pointerdown="dragging = true"
        @pointerup="dragging = false"
        @pointercancel="dragging = false"
        @blur="dragging = false"
      />
    </div>
    <input
      class="value"
      type="number"
      inputmode="numeric"
      :min="min"
      :max="max"
      :value="text"
      aria-label="Valor de DPI"
      @input="onTextInput"
      @change="onTextCommit"
      @blur="onTextCommit"
      @keydown.enter.prevent="onTextCommit"
    />
  </div>
  <div class="limits">
    <span class="edge">{{ min }}</span>
    <span v-for="m in marks" :key="m.value" class="mark" :style="{ left: m.left }">
      {{ m.value >= 1000 ? `${m.value / 1000}k` : m.value }}
    </span>
    <span class="edge end">{{ max / 1000 }}k</span>
  </div>
</template>

<style scoped>
.dpi { display: flex; align-items: center; gap: 16px; }
.slider { position: relative; flex: 1; height: 28px; }
.track {
  position: absolute;
  top: 50%;
  left: 0;
  right: 0;
  height: 4px;
  transform: translateY(-50%);
  border-radius: 999px;
  background: var(--border);
  overflow: hidden;
}
.fill {
  width: var(--p);
  height: 100%;
  background: var(--purple);
}
.thumb {
  position: absolute;
  top: 50%;
  left: var(--p);
  width: 14px;
  height: 14px;
  transform: translate(-50%, -50%);
  border: 2px solid var(--purple);
  border-radius: 50%;
  background: #e3e6ea;
  pointer-events: none;
}
.slider.animated .fill { transition: width 0.35s cubic-bezier(0.22, 1, 0.36, 1); }
.slider.animated .thumb { transition: left 0.35s cubic-bezier(0.22, 1, 0.36, 1); }
/* O range nativo fica invisível por cima: cuida do arraste, clique e teclado. */
.slider input {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  margin: 0;
  opacity: 0;
  cursor: pointer;
}
.slider:has(input:focus-visible) .thumb { outline: 2px solid var(--blue); outline-offset: 2px; }
.value {
  width: 96px;
  padding: 7px 12px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg);
  color: var(--text);
  font: inherit;
  font-variant-numeric: tabular-nums;
  text-align: right;
}
.value:focus { outline: none; border-color: var(--blue); }
.limits {
  position: relative;
  height: 14px;
  margin-right: 112px;
  font-size: 11px;
  color: var(--muted);
}
.limits span { position: absolute; top: 0; white-space: nowrap; }
.limits .edge { left: 0; }
.limits .edge.end { left: auto; right: 0; }
.limits .mark { transform: translateX(-50%); }
@media (prefers-reduced-motion: reduce) {
  .slider.animated .fill, .slider.animated .thumb { transition: none; }
}
</style>
