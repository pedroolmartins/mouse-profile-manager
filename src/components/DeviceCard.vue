<script setup>
import { computed } from 'vue'
import BatteryIndicator from './BatteryIndicator.vue'

const props = defineProps({
  device: { type: Object, required: true }, // entrada do registro de dispositivos
  driver: { type: Object, required: true }, // estado do driver (isConnected, isOnline, isWired, battery)
  activeProfile: { type: Object, default: null }, // perfil ativo do dispositivo ({ name, color }), se houver
})
defineEmits(['open'])

const status = computed(() => {
  const d = props.driver
  if (!d.isConnected) return { label: 'Desconectado', tone: 'off' }
  if (d.isAsleep) return { label: 'Offline · em sleep', tone: 'off' }
  return { label: d.isWired ? 'Online · com fio' : 'Online · sem fio', tone: 'on' }
})

// O LED da ilustração usa a cor do perfil ativo.
const ledColor = computed(() => props.activeProfile?.color ?? '#a855f7')
</script>

<template>
  <button :class="['device', { disconnected: !driver.isConnected || driver.isAsleep }]" @click="$emit('open', device.id)">
    <div class="art" aria-hidden="true">
      <!-- Ilustração de mouse visto de cima, em traço simples. -->
      <svg viewBox="0 0 120 180" width="72" height="108" fill="none" stroke="#4a4f57" stroke-width="2.5">
        <path d="M60 6c30 0 50 22 50 60v44c0 38-22 64-50 64S10 148 10 110V66C10 28 30 6 60 6Z" />
        <path d="M60 8v56M12 64h96" />
        <rect x="54" y="22" width="12" height="26" rx="6" />
        <circle cx="60" cy="96" r="5" stroke="none" :fill="driver.isConnected ? ledColor : '#33373e'" />
      </svg>
    </div>

    <div class="info">
      <small class="brand">{{ device.brand }}</small>
      <strong class="model">{{ device.model }}</strong>

      <span :class="['status', status.tone]"><i />{{ status.label }}</span>

      <BatteryIndicator v-if="device.features?.battery" class="battery" :battery="driver.battery" :connected="driver.isConnected" />

      <span v-if="activeProfile" class="profile" :title="activeProfile.name">
        <span class="dot" :style="{ background: activeProfile.color }" />
        Perfil ativo: <b>{{ activeProfile.name }}</b>
      </span>
    </div>
  </button>
</template>

<style scoped>
.device {
  position: relative;
  display: flex;
  align-items: center;
  gap: 22px;
  width: 100%;
  padding: 20px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface);
  color: inherit;
  text-align: left;
  transition: transform 0.15s, box-shadow 0.15s, border-color 0.15s;
}
.device:hover { transform: translateY(-3px); border-color: #3a3f47; box-shadow: 0 8px 18px rgb(0 0 0 / 0.3); }
@media (prefers-reduced-motion: reduce) { .device:hover { transform: none; } }
.device.disconnected .art { opacity: 0.5; }
.art {
  display: flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 104px;
  height: 132px;
  border-radius: 6px;
  background: var(--bg);
}
.info { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.brand { color: var(--muted); font-size: 12px; letter-spacing: 0.04em; }
.model { color: var(--text); font-size: 20px; font-weight: 600; }
.status {
  display: inline-flex;
  align-self: flex-start;
  align-items: center;
  gap: 6px;
  margin-top: 4px;
  padding: 4px 10px;
  border: 1px solid var(--border);
  border-radius: 999px;
  color: var(--muted);
  font-size: 12px;
}
.status i { width: 7px; height: 7px; border-radius: 50%; }
.status.on i { background: #5fb37b; }
.status.off i { background: #c26464; }
.battery { margin-top: 8px; }
.profile {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 4px;
  overflow: hidden;
  color: var(--muted);
  font-size: 13px;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.profile b { overflow: hidden; color: var(--text); font-weight: 500; text-overflow: ellipsis; }
.profile .dot { flex: none; width: 8px; height: 8px; border-radius: 50%; }
</style>
