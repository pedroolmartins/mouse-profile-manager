<script setup>
// Criação/edição de um perfil custom do Kysona: nome, DPI (X/Y opcional), polling
// rate, sleep time e cor do LED. Só o que o app consegue gravar no perfil ativo do mouse.
import { ref, computed } from 'vue'
import DpiSlider from '@/components/DpiSlider.vue'
import ColorPicker from '@/components/ColorPicker.vue'
import { isHexColor } from '@/utils/color.js'
import { DPI_MIN, DPI_MAX, POLLING_RATE_OPTIONS, SLEEP_OPTIONS, sleepLabel } from './protocol.js'

const props = defineProps({
  initialData: { type: Object, default: null },
  // Sleep time em uso no mouse: padrão de perfis novos e dos antigos que ainda não têm um.
  defaultSleep: { type: Number, default: 60 },
})
const emit = defineEmits(['close', 'save'])

const base = props.initialData ?? { name: '', dpi: 800, dpiY: 800, dpiXY: false, pollingRate: 1000, color: '#8a7fd4' }
const form = ref({ dpiY: base.dpi, sleepTime: props.defaultSleep, ...JSON.parse(JSON.stringify(base)) })
// Um valor fora da lista (ex.: definido no hub) aparece como opção extra.
const sleepOptions = computed(() =>
  SLEEP_OPTIONS.includes(form.value.sleepTime) ? SLEEP_OPTIONS : [form.value.sleepTime, ...SLEEP_OPTIONS],
)

const canSave = computed(() => form.value.name.trim().length > 0 && isHexColor(form.value.color))

function save() {
  if (!canSave.value) return
  const f = form.value
  emit('save', {
    id: props.initialData?.id,
    name: f.name.trim(),
    dpi: f.dpi,
    dpiY: f.dpiXY ? f.dpiY : f.dpi,
    dpiXY: f.dpiXY,
    pollingRate: f.pollingRate,
    sleepTime: f.sleepTime,
    color: f.color,
  })
}
</script>

<template>
  <div class="backdrop" @click.self="emit('close')" @keydown.esc="emit('close')">
    <form class="modal" @submit.prevent="save">
      <div class="body">
        <h2>{{ initialData ? 'Editar perfil' : 'Novo perfil' }}</h2>

        <label class="section">
          <span>Nome do Perfil</span>
          <input v-model="form.name" type="text" maxlength="40" autofocus />
        </label>

        <div class="section">
          <div class="field-head">
            <span>{{ form.dpiXY ? 'DPI X' : 'DPI' }}</span>
            <label class="inline-check"><input v-model="form.dpiXY" type="checkbox" /> X/Y separados</label>
          </div>
          <DpiSlider v-model="form.dpi" :min="DPI_MIN" :max="DPI_MAX" />
          <template v-if="form.dpiXY">
            <span class="sub">DPI Y</span>
            <DpiSlider v-model="form.dpiY" :min="DPI_MIN" :max="DPI_MAX" />
          </template>
        </div>

        <label class="section">
          <span>Polling Rate</span>
          <select v-model.number="form.pollingRate">
            <option v-for="hz in POLLING_RATE_OPTIONS" :key="hz" :value="hz">{{ hz }} Hz</option>
          </select>
        </label>

        <label class="section">
          <span>Sleep Time</span>
          <select v-model.number="form.sleepTime">
            <option v-for="s in sleepOptions" :key="s" :value="s">{{ sleepLabel(s) }}</option>
          </select>
          <small class="hint">Tempo parado até o mouse dormir no sem fio. "Nunca" gasta mais bateria.</small>
        </label>

        <div class="section">
          <span>Cor do LED</span>
          <ColorPicker v-model="form.color" />
        </div>
      </div>

      <div class="footer">
        <button type="button" class="ghost" @click="emit('close')">Cancelar</button>
        <button type="submit" class="primary" :disabled="!canSave">Guardar</button>
      </div>
    </form>
  </div>
</template>

<style scoped>
.backdrop { position: fixed; inset: 0; z-index: 50; display: flex; align-items: center; justify-content: center; padding: 16px; background: rgb(0 0 0 / 0.55); }
.modal {
  display: flex;
  flex-direction: column;
  width: 100%;
  max-width: 480px;
  max-height: calc(100vh - 32px);
  overflow: hidden;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--surface);
  box-shadow: 0 12px 32px rgb(0 0 0 / 0.4);
}
.body { padding: 20px 24px; overflow-y: auto; }
h2 { margin: 0 0 4px; font-size: 18px; font-weight: 600; color: var(--text); }
.section { display: flex; flex-direction: column; gap: 8px; padding: 16px 0; }
.section + .section { border-top: 1px solid var(--border); }
.section > span,
.field-head > span,
.sub { font-size: 14px; font-weight: 500; color: var(--muted); }
.field-head { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
.hint { color: var(--muted); font-size: 12px; }
.inline-check { display: inline-flex; align-items: center; gap: 6px; color: var(--muted); font-size: 12px; cursor: pointer; }
.inline-check input { width: 16px; height: 16px; accent-color: var(--purple); }
input[type='text'],
select {
  width: 100%;
  padding: 7px 12px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg);
  color: var(--text);
  font: inherit;
}
input[type='text']:focus,
select:focus { outline: none; border-color: var(--blue); }
select {
  appearance: none;
  padding-right: 40px;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12' fill='none' stroke='%239ca3af' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M3 4.5 6 7.5 9 4.5'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 14px center;
  background-size: 12px;
}
select option { background: var(--surface); color: var(--text); }
.footer { display: flex; justify-content: flex-end; gap: 12px; padding: 16px; border-top: 1px solid var(--border); }
</style>
