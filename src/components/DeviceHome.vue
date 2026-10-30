<script setup>
import { computed } from 'vue'
import { DEVICES } from '@/devices/registry.js'
import DeviceCard from './DeviceCard.vue'

defineProps({
  activeId: { type: String, default: null }, // dispositivo em uso agora (ver useActiveMouse)
})
defineEmits(['open'])

// Cada dispositivo do registro com o estado do driver e (se tiver) os perfis dele.
const entries = DEVICES.map((device) => ({
  device,
  driver: device.useDriver(),
  profiles: device.useProfiles?.() ?? null,
}))

// Só aparecem os dispositivos presentes no computador (cabo ou receptor com os IDs
// USB do registro); a lista se atualiza sozinha ao conectar ou remover.
const present = computed(() => entries.filter(({ driver }) => driver.isConnected))
</script>

<template>
  <section class="home">
    <h2>Dispositivos</h2>
    <p class="intro">Escolha um dispositivo para configurar os perfis e os apps dele.</p>
    <div v-if="present.length" class="grid">
      <DeviceCard
        v-for="{ device, driver, profiles } in present"
        :key="device.id"
        :device="device"
        :driver="driver"
        :active-profile="profiles?.activeDisplayProfile ?? null"
        :in-use="device.id === activeId"
        @open="$emit('open', $event)"
      />
    </div>
    <p v-else class="empty">Nenhum dispositivo compatível encontrado. Conecte o cabo ou o receptor do mouse.</p>
  </section>
</template>

<style scoped>
h2 { margin: 0 0 4px; font-size: 16px; font-weight: 600; color: var(--text); }
.intro { margin: 0 0 20px; color: var(--muted); font-size: 14px; }
.empty {
  margin: 0;
  padding: 32px 20px;
  border: 1px dashed var(--border);
  border-radius: 8px;
  color: var(--muted);
  font-size: 14px;
  text-align: center;
}
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(420px, 1fr)); gap: 16px; }
@media (max-width: 520px) { .grid { grid-template-columns: 1fr; } }
</style>
