<script setup>
import { DEVICES } from '@/devices/registry.js'
import DeviceCard from './DeviceCard.vue'

defineEmits(['open'])

// Cada dispositivo do registro com o estado do driver e (se tiver) os perfis dele.
const entries = DEVICES.map((device) => ({
  device,
  driver: device.useDriver(),
  profiles: device.useProfiles?.() ?? null,
}))
</script>

<template>
  <section class="home">
    <h2>Dispositivos</h2>
    <p class="intro">Escolha um dispositivo para configurar os perfis e os apps dele.</p>
    <div class="grid">
      <DeviceCard
        v-for="{ device, driver, profiles } in entries"
        :key="device.id"
        :device="device"
        :driver="driver"
        :active-profile="profiles?.activeDisplayProfile ?? null"
        @open="$emit('open', $event)"
      />
    </div>
  </section>
</template>

<style scoped>
h2 { margin: 0 0 4px; font-size: 16px; font-weight: 600; color: var(--text); }
.intro { margin: 0 0 20px; color: var(--muted); font-size: 14px; }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(420px, 1fr)); gap: 16px; }
@media (max-width: 520px) { .grid { grid-template-columns: 1fr; } }
</style>
