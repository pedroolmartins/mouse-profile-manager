<script setup>
// Opção liga/desliga com título e explicação (ex.: alternar perfis pelo botão inferior).
// A cor ligada segue --purple (verde-azulado dentro de .native-mode).
const model = defineModel({ type: Boolean, default: false })
defineProps({
  title: { type: String, required: true },
  description: { type: String, default: '' },
  disabled: { type: Boolean, default: false },
})
</script>

<template>
  <label class="option">
    <input v-model="model" type="checkbox" :disabled="disabled" />
    <span class="switch" />
    <span>
      <strong>{{ title }}</strong>
      <small v-if="description">{{ description }}</small>
    </span>
  </label>
</template>

<style scoped>
.option { display: flex; align-items: flex-start; gap: 12px; margin: -4px 0 16px; cursor: pointer; }
.option input { position: absolute; opacity: 0; pointer-events: none; }
.option .switch {
  position: relative;
  flex: none;
  width: 40px;
  height: 22px;
  margin-top: 1px;
  border-radius: 999px;
  background: var(--border);
  transition: background-color 0.15s;
}
.option .switch::after {
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
.option input:checked + .switch { background: var(--purple); }
.option input:checked + .switch::after { transform: translateX(18px); }
.option input:focus-visible + .switch { outline: 2px solid var(--blue); outline-offset: 2px; }
.option input:disabled + .switch { opacity: 0.5; }
.option strong { display: block; font-weight: 500; color: var(--text); }
.option small { display: block; margin-top: 3px; color: var(--muted); font-size: 12px; line-height: 1.5; }
</style>
