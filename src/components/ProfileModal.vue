<script setup>
import { ref, computed, watch } from 'vue'
import ColorPicker from './ColorPicker.vue'
import DpiSlider from './DpiSlider.vue'
import { isHexColor } from '@/utils/color.js'
import {
  POLLING_RATES,
  LOD_OPTIONS,
  SLEEP_OPTIONS,
  DPI_MIN,
  DPI_MAX,
  DPI_EXTENDED_MIN,
  DEFAULT_SETTINGS,
} from '@/hid/constants.js'

const props = defineProps({ initialData: { type: Object, default: null } })
const emit = defineEmits(['close', 'save'])

// O formulário trabalha numa cópia; nada muda no perfil até clicar em Guardar.
const form = ref(props.initialData ? { ...DEFAULT_SETTINGS, ...props.initialData } : { name: '', ...DEFAULT_SETTINGS })

// Opções do sensor, com a explicação mostrada no balão de info.
const SENSOR_OPTIONS = [
  {
    key: 'motionSync',
    title: 'Motion Sync',
    summary: 'Movimento mais uniforme',
    what: 'Sincroniza a leitura do sensor com o envio de dados ao computador, para cada envio levar uma leitura recente.',
    pro: 'movimento mais uniforme e consistente, sem pequenas irregularidades entre um envio e outro.',
    con: 'acrescenta um atraso mínimo (fração de milissegundo), menor quanto maior o polling rate.',
  },
  {
    key: 'rippleControl',
    title: 'Ripple Control',
    summary: 'Suaviza a tremedeira em DPI alto',
    what: 'Filtro que suaviza a pequena tremedeira do sensor ("jitter"), mais visível em DPI alto.',
    pro: 'cursor mais estável em DPI muito alto.',
    con: 'adiciona um pequeno atraso e pode tirar precisão de movimentos minúsculos. Em DPI baixo raramente é necessário.',
  },
  {
    key: 'angleSnapping',
    title: 'Angle Snapping',
    summary: 'Endireita linhas quase retas',
    what: 'Corrige movimentos quase retos para linhas perfeitamente retas.',
    pro: 'linhas retas fáceis em desenho, design e planilhas.',
    con: 'em jogos costuma atrapalhar a mira, porque distorce movimentos levemente diagonais.',
  },
]

const oddExtended = (dpi) => dpi >= DPI_EXTENDED_MIN && dpi % 2 === 1

// Ao separar os eixos, o Y começa igual ao X atual.
watch(
  () => form.value.dpiXY,
  (on) => {
    if (on) form.value.dpiY = form.value.dpi
  },
)

// Como no hub: sem o Modo Competitivo, o 20K fica desligado.
watch(
  () => form.value.competitiveMode,
  (on) => {
    if (!on) form.value.fps20k = false
  },
)

const canSave = computed(() => form.value.name.trim() && isHexColor(form.value.color))

function save() {
  if (!canSave.value) return
  emit('save', { ...form.value, name: form.value.name.trim() })
}
</script>

<template>
  <div class="backdrop" @click.self="emit('close')" @keydown.esc="emit('close')">
    <form class="modal" @submit.prevent="save">
      <div class="body">
        <h2>{{ initialData ? 'Editar Perfil' : 'Novo Perfil' }}</h2>

        <p class="mode-note">
          Perfil custom: o app grava estas configurações no mouse ao ativá-lo. Alterações em perfis nativos (os 4
          guardados no mouse) devem ser feitas no hub oficial da Scyrox.
        </p>

        <div class="fields">
          <label class="section">
            <span>Nome do Perfil</span>
            <input v-model="form.name" type="text" maxlength="40" placeholder="Ex: Counter-Strike 2" autofocus />
          </label>

          <div class="section">
          <div class="field">
            <div class="field-head">
              <span>{{ form.dpiXY ? 'DPI X (horizontal)' : 'DPI' }}</span>
              <label class="inline-check">
                <input v-model="form.dpiXY" type="checkbox" />
                DPI separado por eixo (X/Y)
              </label>
            </div>
            <DpiSlider v-model="form.dpi" :min="DPI_MIN" :max="DPI_MAX" />
            <small v-if="oddExtended(form.dpi)" class="hint">
              Acima de {{ DPI_EXTENDED_MIN - 2 }} o sensor usa passos de 2: será aplicado {{ form.dpi + 1 }}.
            </small>
          </div>

          <div v-if="form.dpiXY" class="field">
            <span>DPI Y (vertical)</span>
            <DpiSlider v-model="form.dpiY" :min="DPI_MIN" :max="DPI_MAX" />
            <small v-if="oddExtended(form.dpiY)" class="hint">
              Acima de {{ DPI_EXTENDED_MIN - 2 }} o sensor usa passos de 2: será aplicado {{ form.dpiY + 1 }}.
            </small>
          </div>
          </div>

          <div class="grid section">
            <label>
              <span>Polling Rate</span>
              <select v-model.number="form.pollingRate">
                <option v-for="r in POLLING_RATES" :key="r.hz" :value="r.hz">{{ r.hz }}Hz</option>
              </select>
            </label>

            <label>
              <span>LOD</span>
              <select v-model.number="form.lod">
                <option v-for="o in LOD_OPTIONS" :key="o.value" :value="o.value">{{ o.label }}</option>
              </select>
            </label>

            <label>
              <span>Sleep Time</span>
              <select v-model.number="form.sleepTime">
                <option v-for="o in SLEEP_OPTIONS" :key="o.value" :value="o.value">{{ o.label }}</option>
              </select>
            </label>
          </div>

          <div class="field section">
            <span>Cor do LED</span>
            <ColorPicker v-model="form.color" />
          </div>

          <div class="field section">
            <span>Sensor</span>
            <div class="sensor-options">
              <label v-for="opt in SENSOR_OPTIONS" :key="opt.key" class="sensor-option">
                <input v-model="form[opt.key]" type="checkbox" />
                <span class="switch" />
                <span class="sensor-text">
                  <strong>{{ opt.title }}</strong>
                  <small>{{ opt.summary }}</small>
                </span>
                <!-- Ícone de info: o balão aparece ao passar o mouse ou focar com o teclado. -->
                <span class="info" tabindex="0" :aria-label="`Sobre ${opt.title}`" @click.prevent>
                  <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" aria-hidden="true"><circle cx="8" cy="8" r="6.5" /><path d="M8 7.5V11" /><circle cx="8" cy="5" r="0.4" fill="currentColor" /></svg>
                  <span class="tip" role="tooltip">
                    <span>{{ opt.what }}</span>
                    <span class="pro"><b>Benefício:</b> {{ opt.pro }}</span>
                    <span class="con"><b>Ônus:</b> {{ opt.con }}</span>
                  </span>
                </span>
              </label>
            </div>
          </div>

          <div class="section performance">
          <label class="toggle">
            <input v-model="form.competitiveMode" type="checkbox" />
            <span class="switch" />
            <span>
              <strong>Modo Competitivo</strong>
              <small>
                Deixa o sensor no modo de maior desempenho ("Highest performance" no hub da Scyrox). Consome mais
                bateria. Não impede o mouse de entrar em repouso quando fica parado.
              </small>
            </span>
          </label>

          <label :class="['toggle', 'sub', { disabled: !form.competitiveMode }]">
            <input v-model="form.fps20k" type="checkbox" :disabled="!form.competitiveMode" />
            <span class="switch" />
            <span>
              <strong>20K FPS</strong>
              <small v-if="form.competitiveMode">
                O sensor lê a superfície 20.000 vezes por segundo: menos atraso em movimentos muito rápidos, mais
                consumo de bateria.
              </small>
              <small v-else>Ligue o Modo Competitivo para usar o 20K.</small>
            </span>
          </label>
          </div>
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
  width: 100%;
  max-width: 520px;
  display: flex;
  flex-direction: column;
  /* Em janelas baixas, o conteúdo rola e o rodapé com "Guardar" continua visível. */
  max-height: calc(100vh - 32px);
  overflow: hidden;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--surface);
  box-shadow: 0 12px 32px rgb(0 0 0 / 0.4);
}
.body { padding: 20px 24px; overflow-x: hidden; overflow-y: auto; }
.footer { flex: none; }
h2 { margin: 0 0 16px; font-size: 18px; font-weight: 600; color: var(--text); }
.mode-note { margin: -8px 0 16px; color: var(--muted); font-size: 12px; line-height: 1.5; }
/* Seções separadas por uma linha fina de 1px. */
.fields { display: flex; flex-direction: column; }
.section { padding: 16px 0; }
.section:first-child { padding-top: 0; }
.section:last-child { padding-bottom: 4px; }
.section + .section { border-top: 1px solid var(--border); }
.section > .field + .field { margin-top: 14px; }
.performance { display: flex; flex-direction: column; gap: 10px; }
.grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
label, .field { display: flex; flex-direction: column; gap: 6px; }
label > span, .field > span { font-size: 12px; font-weight: 500; color: var(--muted); letter-spacing: 0.01em; }
input, select {
  width: 100%;
  box-sizing: border-box;
  padding: 7px 12px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg);
  color: var(--text);
  font: inherit;
}
/* Seta própria, afastada da borda: a nativa fica colada no canto direito. */
select {
  appearance: none;
  padding-right: 40px;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12' fill='none' stroke='%239ca3af' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M3 4.5 6 7.5 9 4.5'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 14px center;
  background-size: 12px;
  cursor: pointer;
}
select option { background: var(--surface); color: var(--text); }
input:focus, select:focus { outline: none; border-color: var(--blue); }
.hint { color: var(--muted); font-size: 12px; }
.toggle {
  display: flex;
  flex-direction: row;
  align-items: flex-start;
  gap: 12px;
  cursor: pointer;
}
.toggle input { position: absolute; width: auto; opacity: 0; pointer-events: none; }
.toggle .switch {
  position: relative;
  flex: none;
  width: 40px;
  height: 22px;
  margin-top: 1px;
  border-radius: 999px;
  background: var(--border);
  transition: background-color 0.15s;
}
.toggle .switch::after {
  content: '';
  position: absolute;
  top: 3px;
  left: 3px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #e3e6ea;
  transition: transform 0.15s;
}
.toggle input:checked + .switch { background: var(--purple); }
.toggle input:checked + .switch::after { transform: translateX(18px); }
.toggle input:focus-visible + .switch { outline: 2px solid var(--blue); outline-offset: 2px; }
/* Uma opção por linha: interruptor | nome + resumo | info (alinhado à direita). */
.sensor-options { display: flex; flex-direction: column; gap: 12px; }
.sensor-option {
  position: relative;
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 8px;
  padding: 2px 0;
  cursor: pointer;
}
.sensor-option input { position: absolute; width: auto; opacity: 0; pointer-events: none; }
.sensor-option .switch {
  position: relative;
  flex: none;
  width: 32px;
  height: 18px;
  border-radius: 999px;
  background: var(--border);
  transition: background-color 0.15s;
}
.sensor-option .switch::after {
  content: '';
  position: absolute;
  top: 3px;
  left: 3px;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: #e3e6ea;
  transition: transform 0.15s;
}
.sensor-option input:checked + .switch { background: var(--purple); }
.sensor-option input:checked + .switch::after { transform: translateX(14px); }
.sensor-option input:focus-visible + .switch { outline: 2px solid var(--blue); outline-offset: 2px; }
.sensor-option { gap: 12px; }
.sensor-text { display: flex; flex: 1; flex-direction: column; min-width: 0; }
.sensor-text strong { color: var(--text); font-size: 13px; font-weight: 500; line-height: 1.3; }
.sensor-text small { color: var(--muted); font-size: 12px; line-height: 1.4; }
.info {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  color: var(--muted);
  opacity: 0.7;
  cursor: help;
  transition: opacity 0.12s, color 0.12s;
}
.info:hover,
.info:focus-visible { color: var(--text); opacity: 1; outline: none; }
/* O balão se ancora na linha da opção, alinhado à direita (abaixo do ícone), para
   não sair pelas bordas do modal. */
.tip {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  z-index: 10;
  display: flex;
  flex-direction: column;
  gap: 6px;
  width: 260px;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: #1f2328;
  box-shadow: 0 8px 20px rgb(0 0 0 / 0.4);
  color: var(--text);
  font-family: 'Segoe UI', system-ui, sans-serif;
  font-size: 12px;
  font-style: normal;
  font-weight: 400;
  line-height: 1.45;
  text-align: left;
  opacity: 0;
  visibility: hidden;
  transform: translateY(-2px);
  transition: opacity 0.12s, transform 0.12s, visibility 0.12s;
  pointer-events: none;
}
.info:hover .tip,
.info:focus-visible .tip { opacity: 1; visibility: visible; transform: none; }
.tip .pro b { color: #7cc493; }
.tip .con b { color: #cfae6a; }
.field-head { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
.field-head > span { font-size: 14px; font-weight: 500; color: var(--muted); }
.inline-check { display: inline-flex; flex-direction: row; align-items: center; gap: 6px; color: var(--muted); font-size: 12px; cursor: pointer; }
.inline-check input { width: 16px; height: 16px; padding: 0; accent-color: var(--purple); cursor: pointer; }
.toggle.sub { margin-left: 52px; }
.toggle.disabled { cursor: default; }
.toggle input:disabled + .switch { opacity: 0.5; }
.toggle strong { display: block; font-weight: 500; color: var(--text); }
.toggle small { display: block; margin-top: 2px; color: var(--muted); font-size: 12px; }
.footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  padding: 16px;
  border-top: 1px solid var(--border);
  background: var(--surface);
}
@media (max-width: 520px) { .grid { grid-template-columns: 1fr; } }
</style>
