// Qual dispositivo está em uso agora, para ações automáticas (ex.: perfil por programa
// em foco) irem só para ele: nunca para um mouse desconectado ou dormindo, nem para
// vários ao mesmo tempo.
//
// O app não vê os movimentos do mouse (vão para o Windows), mas cada driver sabe se o
// mouse está acordado (`isOnline`, `isAsleep`). Entre os acordados, vale o que acordou
// ou deu sinal de uso (ex.: botão inferior) por último.
import { ref, computed, watch } from 'vue'

/**
 * `devices`: [{ id, driver, activity? }] — `driver` com isConnected/isOnline/isAsleep;
 * `activity()` opcional devolve algo que muda a cada sinal de uso (ex.: último clique).
 */
export function useActiveMouse(devices) {
  const lastActiveAt = ref({})
  const touch = (id) => (lastActiveAt.value = { ...lastActiveAt.value, [id]: Date.now() })

  const awake = (d) => d.driver.isConnected && d.driver.isOnline && !d.driver.isAsleep

  for (const d of devices) {
    // Acordou (ou conectou já acordado): passa a ser o mais recente.
    watch(() => awake(d), (isAwake) => isAwake && touch(d.id), { immediate: true })
    if (d.activity) watch(d.activity, (value) => value && touch(d.id))
  }

  const activeId = computed(() => {
    const candidates = devices.filter(awake)
    if (candidates.length <= 1) return candidates[0]?.id ?? null
    return candidates.reduce((best, d) => ((lastActiveAt.value[d.id] ?? 0) > (lastActiveAt.value[best.id] ?? 0) ? d : best)).id
  })

  return { activeId, isActive: (id) => activeId.value === id }
}
