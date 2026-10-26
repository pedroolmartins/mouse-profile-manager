<script setup>
// Alterna entre os perfis do app (custom) e os 4 perfis internos do mouse (nativo).
// Cada opção tem um ícone de info com a explicação em um balão.
const props = defineProps({
  modelValue: { type: String, required: true }, // 'custom' | 'native'
  disabled: { type: Boolean, default: false },
  busy: { type: Boolean, default: false },
  // Textos dos balões de cada modo (outro dispositivo); sem eles, os do V8S.
  modes: { type: Array, default: null },
})
const emit = defineEmits(['change'])

const V8S_MODES = [
  {
    value: 'custom',
    label: 'Custom',
    what: 'Perfis criados neste app, sem limite de quantidade.',
    can: [
      'DPI (inclusive X/Y separados), polling rate, LOD, sleep, cor do LED e opções do sensor',
      'Troca automática pelo programa em foco',
      'Alternância pelo botão inferior',
    ],
    note: 'O app grava as configurações no mouse a cada troca.',
  },
  {
    value: 'native',
    label: 'Nativo',
    what: 'Os 4 perfis guardados no próprio mouse, configurados no hub oficial da Scyrox.',
    can: ['Troca instantânea (um comando só)', 'Renomear os perfis para as notificações', 'Configurações lidas do mouse'],
    note: 'Para alterar as configurações de um perfil nativo, use o hub oficial.',
  },
]
const MODES = props.modes ?? V8S_MODES
</script>

<template>
  <div :class="['mode-switch', { disabled }]" role="radiogroup" aria-label="Modo de perfil">
    <div v-for="m in MODES" :key="m.value" :class="['mode', { selected: modelValue === m.value }]">
      <button
        type="button"
        role="radio"
        :aria-checked="modelValue === m.value"
        :disabled="disabled || modelValue === m.value"
        @click="emit('change', m.value)"
      >
        {{ m.label }}
      </button>
      <span class="info" tabindex="0" :aria-label="`Sobre o modo ${m.label}`">
        <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" aria-hidden="true"><circle cx="8" cy="8" r="6.5" /><path d="M8 7.5V11" /><circle cx="8" cy="5" r="0.4" fill="currentColor" /></svg>
        <span class="tip" role="tooltip">
          <span>{{ m.what }}</span>
          <span class="can">
            <b>Possibilidades:</b>
            <span v-for="c in m.can" :key="c">· {{ c }}</span>
          </span>
          <span class="note">{{ m.note }}</span>
        </span>
      </span>
    </div>
    <span v-if="busy" class="busy" role="status" aria-label="Trocando o modo de perfil" />

  </div>
</template>

<style scoped>
.mode-switch { display: inline-flex; align-items: center; gap: 2px; padding: 3px; border: 1px solid var(--border); border-radius: 8px; background: var(--surface); }
.mode-switch.disabled { opacity: 0.7; }
.mode { position: relative; display: inline-flex; align-items: center; gap: 6px; padding: 0 8px 0 2px; border-radius: 6px; }
.mode.selected { background: var(--bg); }
.mode button { padding: 5px 4px 5px 8px; border: 0; background: none; color: var(--muted); font-size: 13px; font-weight: 500; }
.mode.selected button { color: var(--text); }
.mode button:disabled { opacity: 1; cursor: default; }
.mode:not(.selected) button:hover:not(:disabled) { color: var(--text); cursor: pointer; }
/* Ícone girando enquanto troca de modo. */
.busy {
  flex: none;
  width: 14px;
  height: 14px;
  margin: 0 8px 0 4px;
  border: 2px solid var(--border);
  border-top-color: var(--purple);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }
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
.tip {
  position: absolute;
  top: calc(100% + 8px);
  /* O seletor fica no canto esquerdo da tela: o balão abre para a direita. */
  left: 0;
  z-index: 20;
  display: flex;
  flex-direction: column;
  gap: 6px;
  width: 280px;
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
  transition: opacity 0.12s, visibility 0.12s;
  pointer-events: none;
}
.info:hover .tip,
.info:focus-visible .tip { opacity: 1; visibility: visible; }
.tip .can { display: flex; flex-direction: column; gap: 2px; color: var(--muted); }
.tip .can b { color: var(--text); font-weight: 600; }
.tip .note { color: #cfae6a; }
</style>
