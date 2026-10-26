// Troca de perfil pelo programa em foco, para qualquer dispositivo.
// Quando um programa da lista de apps fica em primeiro plano, guarda o perfil atual e
// ativa o do programa. Ao sair dele para um programa fora da lista, volta para o perfil
// guardado. Trocar direto entre dois programas da lista mantém o perfil guardado original.
import { ref, watch } from 'vue'

/**
 * - focusedApp: ref com o programa em foco (nome normalizado, vindo do monitor de foco)
 * - findAppRule(name), appRules (ref): regras do dispositivo (ver useAppRules)
 * - profiles(): perfis do dispositivo ([{ id, name }]); activeProfileId(): o ativo
 * - isEnabled(): se a troca vale agora (ex.: dispositivo conectado e no modo certo)
 * - isBusy(): ativação em andamento; a reavaliação espera ela terminar
 * - activate(profile, reason): ativa um perfil ('app' ou 'app-restore')
 * - onFocusChange(): chamado antes de cada reavaliação (ex.: descartar pedidos guardados)
 * - log(text): opcional
 */
export function useFocusProfileSwitching({
  focusedApp,
  findAppRule,
  appRules,
  profiles,
  activeProfileId,
  isEnabled,
  isBusy,
  activate,
  onFocusChange = () => {},
  log = () => {},
}) {
  const appOverride = ref(null) // { ruleId, previousProfileId } enquanto um programa da lista está em foco
  let pending = false

  function sync() {
    if (!isEnabled()) return
    if (isBusy()) {
      // Termina a ativação atual e reavalia com o foco mais recente.
      pending = true
      return
    }
    pending = false
    onFocusChange()
    const rule = findAppRule(focusedApp.value)
    const target = rule && profiles().find((p) => p.id === rule.profileId)
    if (target) {
      if (!appOverride.value) appOverride.value = { ruleId: rule.id, previousProfileId: activeProfileId() }
      else appOverride.value = { ...appOverride.value, ruleId: rule.id }
      if (target.id !== activeProfileId()) {
        log(`${rule.exe} em foco — ativando "${target.name}"`)
        activate(target, 'app')
      }
    } else if (appOverride.value) {
      const previous = profiles().find((p) => p.id === appOverride.value.previousProfileId)
      appOverride.value = null
      if (previous && previous.id !== activeProfileId()) {
        log(`Programa saiu de foco — voltando para "${previous.name}"`)
        activate(previous, 'app-restore')
      }
    }
  }

  // Programa em foco mudou, ou a lista de programas / perfil de algum deles mudou.
  watch(focusedApp, sync)
  watch(() => appRules.value.map((r) => `${r.exe}|${r.profileId}`).join(','), sync)
  // Passou a valer (ex.: dispositivo conectou com um programa da lista já em foco).
  watch(isEnabled, (enabled) => enabled && sync())
  // A ativação em andamento terminou: reavalia se o foco mudou no meio.
  watch(isBusy, (busy) => !busy && pending && sync())

  return { appOverride, sync }
}
