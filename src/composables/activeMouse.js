// Qual dispositivo está em uso agora, para ações automáticas (ex.: perfil por programa
// em foco) irem só para ele: nunca para um mouse desconectado ou dormindo, nem para
// vários ao mesmo tempo.
//
// Cada driver sabe se o mouse está acordado (`isOnline`, `isAsleep`). Entre os
// acordados, vale o que acordou ou deu sinal de uso por último (movimento/clique visto
// pelo Raw Input do Windows, botão inferior).
import { ref, computed, watch } from 'vue'

/**
 * `devices`: [{ id, driver, activity?, isAwake? }] — `driver` com isConnected/isOnline/isAsleep;
 * `activity`: lista opcional de funções, cada uma devolvendo algo que muda a cada sinal
 * de uso (ex.: último clique); `isAwake()` opcional substitui a regra padrão de "acordado".
 */
export function useActiveMouse(devices) {
  const lastActiveAt = ref({})
  const touch = (id) => (lastActiveAt.value = { ...lastActiveAt.value, [id]: Date.now() })

  const awake = (d) => (d.isAwake ? d.isAwake() : d.driver.isConnected && d.driver.isOnline && !d.driver.isAsleep)

  for (const d of devices) {
    // Acordou (ou conectou já acordado): passa a ser o mais recente.
    watch(() => awake(d), (isAwake) => isAwake && touch(d.id), { immediate: true })
    for (const signal of d.activity ?? []) watch(signal, (value) => value && touch(d.id))
  }

  const activeId = computed(() => {
    const candidates = devices.filter(awake)
    if (candidates.length <= 1) return candidates[0]?.id ?? null
    return candidates.reduce((best, d) => ((lastActiveAt.value[d.id] ?? 0) > (lastActiveAt.value[best.id] ?? 0) ? d : best)).id
  })

  return { activeId, isActive: (id) => activeId.value === id }
}
