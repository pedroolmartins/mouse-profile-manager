<script setup>
import { computed } from 'vue'

// Medidor de bateria: nível, cor pela carga e "Carregando". Usado no card da página
// inicial e no cabeçalho da tela do dispositivo.
const props = defineProps({
  // { level, charging } ou null (ainda não lido). No cabo sem leitura de nível:
  // { cable: true, charging } (charging: true mostra "Carregando"; senão, "Via cabo").
  battery: { type: Object, default: null },
  connected: { type: Boolean, default: false },
  compact: { type: Boolean, default: false },
})

const tone = computed(() => {
  if (props.battery?.charging) return 'charging'
  const level = props.battery?.level ?? 0
  return level <= 15 ? 'low' : level <= 35 ? 'mid' : 'ok'
})
</script>

<template>
  <span :class="['battery', { compact }]">
    <span v-if="connected && battery?.cable && battery.charging" class="charging with-icon">
      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M13 3 6 13h5l-1 8 7-10h-5l1-8Z" /></svg>
      Carregando
    </span>
    <span v-else-if="connected && battery?.cable" class="muted with-icon">
      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 3v5M15 3v5M7 8h10v3a5 5 0 0 1-10 0V8ZM12 16v5" /></svg>
      Via cabo
    </span>
    <template v-else-if="connected && battery">
      <span :class="['meter', tone]" aria-hidden="true">
        <span class="fill" :style="{ width: `${battery.level}%` }" />
      </span>
      <span class="level">{{ battery.level }}%</span>
      <span v-if="battery.charging" class="charging">Carregando</span>
    </template>
    <span v-else-if="connected" class="muted">Bateria: lendo…</span>
    <span v-else class="muted">Bateria: —</span>
  </span>
</template>

<style scoped>
.battery { display: inline-flex; align-items: center; gap: 8px; font-size: 13px; }
.battery.compact { gap: 6px; font-size: 12px; }
.meter {
  position: relative;
  width: 30px;
  height: 14px;
  padding: 2px;
  border: 1.5px solid #5d636c;
  border-radius: 3px;
}
.compact .meter { width: 24px; height: 12px; padding: 1px; }
.meter::after {
  content: '';
  position: absolute;
  top: 50%;
  right: -4px;
  width: 2px;
  height: 5px;
  transform: translateY(-50%);
  border-radius: 0 1px 1px 0;
  background: #5d636c;
}
.meter .fill { display: block; height: 100%; border-radius: 1px; transition: width 0.4s; }
.meter.ok .fill { background: #6aa77d; }
.meter.mid .fill { background: #c9a75a; }
.meter.low .fill { background: #c26464; }
.meter.charging .fill { background: var(--blue); }
.level { color: var(--text); font-weight: 500; font-variant-numeric: tabular-nums; }
.charging { color: var(--blue-text); }
.muted { color: var(--muted); }
.with-icon { display: inline-flex; align-items: center; gap: 6px; }
</style>
