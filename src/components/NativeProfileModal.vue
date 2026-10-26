<script setup>
import { ref, computed } from 'vue'
import { LOD_OPTIONS, SLEEP_OPTIONS } from '@/hid/constants.js'

// Edição de um perfil nativo (guardado no mouse): só o nome é editável aqui; o
// resto é mostrado como lido do mouse e alterado no hub oficial.
const props = defineProps({
  profile: { type: Object, required: true },
  // Linhas [rótulo, valor] das configurações; sem elas, mostra as do V8S.
  settings: { type: Array, default: null },
  // Hub oficial da marca: 'scyrox' ou 'kysona'.
  hub: { type: String, default: 'scyrox' },
})
const emit = defineEmits(['close', 'save'])

const HUB_URLS = { scyrox: 'https://scyrox.net/', kysona: 'https://qmk.top/v4/' }

const name = ref(props.profile.name)
const canSave = computed(() => name.value.trim().length > 0)

const p = props.profile
const onOff = (v) => (v ? 'Ligado' : 'Desligado')
const rows = props.settings ?? [
  ['DPI', p.dpiXY ? `${p.dpi} / ${p.dpiY} (X / Y)` : String(p.dpi)],
  ['Polling Rate', p.pollingRate ? `${p.pollingRate} Hz` : '—'],
  ['LOD', LOD_OPTIONS.find((o) => o.value === p.lod)?.label ?? '—'],
  ['Sleep Time', SLEEP_OPTIONS.find((o) => o.value === p.sleepTime)?.label ?? '—'],
  ['Motion Sync', onOff(p.motionSync)],
  ['Ripple Control', onOff(p.rippleControl)],
  ['Angle Snapping', onOff(p.angleSnapping)],
  ['Modo Competitivo', onOff(p.competitiveMode)],
  ['20K FPS', onOff(p.fps20k)],
]

function openHub() {
  if (window.officialHub) window.officialHub.open(props.hub)
  else window.open(HUB_URLS[props.hub] ?? HUB_URLS.scyrox, '_blank', 'noopener')
}

function save() {
  if (canSave.value) emit('save', name.value.trim())
}
</script>

<template>
  <div class="backdrop" @click.self="emit('close')" @keydown.esc="emit('close')">
    <form class="modal" @submit.prevent="save">
      <div class="body">
        <h2>Editar perfil nativo {{ profile.index + 1 }}</h2>

        <p class="notice">
          Este perfil fica guardado no mouse. Aqui só dá para mudar o nome (usado nas notificações).
          <b>Alterações nas configurações de perfis nativos devem ser feitas no hub oficial.</b>
        </p>

        <label class="section">
          <span>Nome do Perfil</span>
          <input v-model="name" type="text" maxlength="40" autofocus />
        </label>

        <div class="section">
          <span class="label">Configurações (lidas do mouse)</span>
          <dl class="settings">
            <template v-for="[k, v] in rows" :key="k">
              <dt>{{ k }}</dt>
              <dd>{{ v }}</dd>
            </template>
            <dt>Cor do LED</dt>
            <dd><span class="swatch" :style="{ background: profile.color }" />{{ profile.color }}</dd>
          </dl>
        </div>

        <div class="section hub">
          <button type="button" class="outline" @click="openHub">Abrir hub oficial ↗</button>
          <small>Depois de alterar no hub, use "Recarregar" na aba Perfis para o app ler as novas configurações.</small>
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
.backdrop {
  position: fixed;
  inset: 0;
  z-index: 50;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  background: rgb(0 0 0 / 0.55);
}
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
h2 { margin: 0 0 12px; font-size: 18px; font-weight: 600; color: var(--text); }
.notice {
  margin: 0 0 4px;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-left: 3px solid var(--accent-native);
  border-radius: 6px;
  color: var(--muted);
  font-size: 12px;
  line-height: 1.5;
}
.notice b { color: var(--text); font-weight: 500; }
.section { display: flex; flex-direction: column; gap: 6px; padding: 16px 0; }
.section + .section { border-top: 1px solid var(--border); }
.section > span,
.label { font-size: 12px; font-weight: 500; color: var(--muted); }
input {
  width: 100%;
  padding: 7px 12px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg);
  color: var(--text);
  font: inherit;
}
input:focus { outline: none; border-color: var(--accent-native); }
.settings { display: grid; grid-template-columns: auto 1fr; gap: 6px 16px; margin: 0; font-size: 13px; }
.settings dt { color: var(--muted); }
.settings dd { display: flex; align-items: center; gap: 6px; margin: 0; color: var(--text); font-variant-numeric: tabular-nums; }
.swatch { width: 12px; height: 12px; border: 1px solid var(--border); border-radius: 3px; }
.hub { align-items: flex-start; }
.hub small { color: var(--muted); font-size: 12px; }
button.outline {
  padding: 6px 12px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: none;
  color: var(--text);
  font-size: 13px;
}
button.outline:hover { border-color: var(--accent-native); }
.footer { display: flex; flex: none; justify-content: flex-end; gap: 8px; padding: 12px 16px; border-top: 1px solid var(--border); }
</style>
