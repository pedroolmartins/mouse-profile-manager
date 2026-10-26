import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import { DEFAULT_SETTINGS, profileDpiAxes } from '@/hid/constants.js'
import { useMouseStore } from './mouse.js'
import { useAppRules } from '@/composables/appRules.js'

const STORAGE_VERSION = 1
// Fora do Electron (ex.: Vite aberto no navegador) os perfis ficam só em memória.
const storage = typeof window !== 'undefined' ? window.profileStorage : undefined

const newId = () => crypto.randomUUID()
// Cópia sem proxies do Vue. toRaw só desembrulha o primeiro nível (os perfis
// dentro do array continuam reativos) e structuredClone falha com proxies.
// Os perfis só têm dados simples, então JSON basta.
const plainCopy = (value) => JSON.parse(JSON.stringify(value))
const makeProfile = (name, settings = DEFAULT_SETTINGS) => ({ id: newId(), name, ...settings })

// type: 'popup' (junto ao ponteiro do mouse) ou 'native' (notificação do Windows).
export const DEFAULT_NOTIFICATIONS = { enabled: true, type: 'popup' }

export const useProfilesStore = defineStore('profiles', () => {
  const profiles = ref([])
  const activeProfileId = ref(null)
  const isLoaded = ref(false)
  const lastApplyError = ref(null)
  // Preferências do app (não pertencem a um perfil específico).
  const profileSwitchKey = ref(false)
  // Aviso ao ativar um perfil: desligado, popup junto ao ponteiro ou notificação do Windows.
  const notifications = ref({ ...DEFAULT_NOTIFICATIONS })
  // Exibir o log de comunicação com o mouse (diagnóstico); escondido por padrão.
  const showLog = ref(false)
  // Iniciar junto com o Windows (aplicado pelo processo principal; só no app instalado).
  const startWithWindows = ref(true)
  const startupSupported = ref(false)
  // Ao iniciar com o Windows, abrir direto na bandeja (lido pelo processo principal na abertura).
  const startMinimized = ref(false)
  // Apps monitorados: quando o programa `exe` está em foco, o perfil `profileId` é ativado.
  const appRules = ref([])

  // ---- Modo de perfil: 'custom' (perfis do app) ou 'native' (os 4 do mouse) ----
  const profileMode = ref('custom')
  // Perfis nativos lidos do mouse: [{ index, settings }] (configurações só para exibir).
  const nativeProfiles = ref([])
  // Nomes dados pelo usuário aos perfis nativos (o mouse guarda só o número).
  const nativeNames = ref({})
  const activeNativeIndex = ref(0)
  // Cópia do perfil nativo que estava ativo ao trocar para o modo custom (o modo
  // custom grava por cima dele); é regravada ao voltar para o modo nativo.
  const nativeSnapshot = ref(null)
  // true durante a troca de modo (o app não aplica perfis custom nesse meio-tempo).
  const switchingMode = ref(false)

  const nativeName = (index) => nativeNames.value[index] || `Perfil nativo ${index + 1}`
  const nativeList = computed(() =>
    nativeProfiles.value.map((p) => ({ ...p.settings, index: p.index, id: `native-${p.index}`, name: nativeName(p.index) })),
  )
  const activeNative = computed(() => nativeList.value.find((p) => p.index === activeNativeIndex.value) ?? null)

  const activeProfile = computed(() => profiles.value.find((p) => p.id === activeProfileId.value) ?? null)
  /** Perfil em uso para exibição (página inicial, notificações), no modo atual. */
  const activeDisplayProfile = computed(() => (profileMode.value === 'native' ? activeNative.value : activeProfile.value))

  async function load() {
    const data = await storage?.load()
    if (data?.version === STORAGE_VERSION && data.profiles?.length) {
      // Perfis salvos por versões anteriores ganham os campos novos com o valor padrão.
      profiles.value = data.profiles.map((p) => ({ ...DEFAULT_SETTINGS, ...p }))
      activeProfileId.value = data.activeProfileId ?? data.profiles[0].id
      profileSwitchKey.value = !!data.settings?.profileSwitchKey
      notifications.value = { ...DEFAULT_NOTIFICATIONS, ...data.settings?.notifications }
      showLog.value = !!data.settings?.showLog
      startWithWindows.value = data.settings?.startWithWindows ?? true
      startMinimized.value = !!data.settings?.startMinimized
      appRules.value = data.appRules ?? []
      const native = data.native ?? {}
      profileMode.value = native.mode === 'native' ? 'native' : 'custom'
      nativeProfiles.value = native.profiles ?? []
      nativeNames.value = native.names ?? {}
      activeNativeIndex.value = native.activeIndex ?? 0
      nativeSnapshot.value = native.snapshot ?? null
    } else {
      const first = makeProfile('Padrão')
      profiles.value = [first]
      activeProfileId.value = first.id
    }
    isLoaded.value = true
    await syncStartup()
  }

  // Leva a preferência para o Windows. A primeira execução já registra o início
  // automático (padrão ligado); depois, segue o que o usuário escolher.
  async function syncStartup() {
    const startup = typeof window !== 'undefined' ? window.appStartup : undefined
    if (!startup) return
    startupSupported.value = (await startup.get()).supported
    if (startupSupported.value) await startup.set(startWithWindows.value)
  }
  watch(startWithWindows, () => isLoaded.value && syncStartup())

  // Salva automaticamente a cada alteração, com um pequeno atraso para agrupar digitação.
  let saveTimer = null
  watch(
    [
      profiles,
      activeProfileId,
      profileSwitchKey,
      notifications,
      showLog,
      startWithWindows,
      startMinimized,
      appRules,
      profileMode,
      nativeProfiles,
      nativeNames,
      activeNativeIndex,
      nativeSnapshot,
    ],
    () => {
      if (!isLoaded.value || !storage) return
      clearTimeout(saveTimer)
      saveTimer = setTimeout(() => {
        const data = {
          version: STORAGE_VERSION,
          activeProfileId: activeProfileId.value,
          settings: {
            profileSwitchKey: profileSwitchKey.value,
            notifications: plainCopy(notifications.value),
            showLog: showLog.value,
            startWithWindows: startWithWindows.value,
            startMinimized: startMinimized.value,
          },
          profiles: plainCopy(profiles.value),
          native: {
            mode: profileMode.value,
            profiles: plainCopy(nativeProfiles.value),
            names: plainCopy(nativeNames.value),
            activeIndex: activeNativeIndex.value,
            snapshot: nativeSnapshot.value ? plainCopy(nativeSnapshot.value) : null,
          },
          appRules: plainCopy(appRules.value),
        }
        storage.save(data).catch((err) => console.error('[Perfis] Falha ao salvar', err))
      }, 300)
    },
    { deep: true },
  )

  function createProfile(name = `Perfil ${profiles.value.length + 1}`, settings = DEFAULT_SETTINGS) {
    const profile = makeProfile(name, settings)
    profiles.value.push(profile)
    return profile
  }

  function duplicateProfile(id) {
    const source = profiles.value.find((p) => p.id === id)
    if (!source) return null
    const copy = { ...plainCopy(source), id: newId(), name: `${source.name} (cópia)` }
    profiles.value.push(copy)
    return copy
  }

  function updateProfile(id, changes) {
    const profile = profiles.value.find((p) => p.id === id)
    if (profile) Object.assign(profile, changes)
  }

  // Sempre mantém pelo menos um perfil.
  function removeProfile(id) {
    if (profiles.value.length <= 1) return
    profiles.value = profiles.value.filter((p) => p.id !== id)
    if (activeProfileId.value === id) activeProfileId.value = profiles.value[0].id
    clearProfileFromRules(id)
  }

  // ---- Apps monitorados (lista e operações compartilhadas com outros dispositivos) ----
  const { normalizeExe, addAppRule, updateAppRule, removeAppRule, findAppRule, clearProfileFromRules } = useAppRules(
    appRules,
    () => activeProfileId.value,
  )

  /** Torna o perfil ativo e grava as configurações dele no mouse. */
  // `force` regrava tudo no mouse; sem ele, só o que mudou desde a última aplicação.
  async function applyProfile(id = activeProfileId.value, { force = false, showLed = true } = {}) {
    const profile = profiles.value.find((p) => p.id === id)
    if (!profile) throw new Error('Perfil não encontrado')
    activeProfileId.value = id
    lastApplyError.value = null
    // DPI e cor do próximo perfil vão pré-gravados no slot de reserva, para o botão inferior trocar na hora.
    const upcoming = nextProfile(id) ?? profile
    try {
      await useMouseStore().applySettings(profile, {
        profileSwitchKey: profileSwitchKey.value,
        upcoming: { dpi: profileDpiAxes(upcoming), color: upcoming.color },
        force,
        showLed,
      })
    } catch (err) {
      lastApplyError.value = err
      throw err
    }
  }

  // ---- Troca de modo e perfis nativos ----------------------------------------------

  /**
   * Custom -> nativo: regrava a cópia guardada do perfil nativo (desfaz o que o modo
   * custom gravou por cima), lê os 4 perfis nativos e ativa o primeiro.
   */
  async function switchToNative() {
    const mouse = useMouseStore()
    switchingMode.value = true
    try {
      if (nativeSnapshot.value) await mouse.restoreOnboardSnapshot(nativeSnapshot.value)
      nativeProfiles.value = await mouse.readAllOnboardProfiles()
      await mouse.activateOnboardProfile(0)
      activeNativeIndex.value = 0
      // A cópia restaurada pode trazer outra função no botão: alinha os 4 à opção atual.
      await mouse.setBottomKeyAllOnboard(profileSwitchKey.value)
      await mouse.activateOnboardProfile(0)
      profileMode.value = 'native'
    } finally {
      switchingMode.value = false
    }
  }

  /**
   * Nativo -> custom: guarda uma cópia completa do perfil nativo ativo (o modo
   * custom vai gravar por cima dele). Ativar o primeiro perfil custom fica com o App.
   */
  async function switchToCustom() {
    const mouse = useMouseStore()
    switchingMode.value = true
    try {
      nativeSnapshot.value = await mouse.snapshotForCustomMode()
      profileMode.value = 'custom'
    } finally {
      switchingMode.value = false
    }
  }

  /** Relê os 4 perfis nativos e volta ao que estava ativo. */
  async function refreshNativeProfiles() {
    const mouse = useMouseStore()
    switchingMode.value = true
    try {
      nativeProfiles.value = await mouse.readAllOnboardProfiles()
      await mouse.activateOnboardProfile(activeNativeIndex.value)
    } finally {
      switchingMode.value = false
    }
  }

  /**
   * Grava no botão inferior dos 4 perfis nativos a troca de perfil (opção ligada)
   * ou o DPI Loop (desligada). Ligar só vale no modo nativo; desligar vale sempre.
   */
  async function syncNativeBottomKey() {
    if (profileSwitchKey.value && profileMode.value !== 'native') return false
    switchingMode.value = true
    try {
      await useMouseStore().setBottomKeyAllOnboard(profileSwitchKey.value)
      return true
    } finally {
      switchingMode.value = false
    }
  }

  /**
   * Lê o perfil nativo ativo no mouse e atualiza índice e configurações dele.
   * Devolve true se o perfil ativo mudou.
   */
  async function refreshActiveNative() {
    const { index, settings } = await useMouseStore().readActiveOnboardSettings()
    const changed = index !== activeNativeIndex.value
    activeNativeIndex.value = index
    const list = nativeProfiles.value.filter((p) => p.index !== index)
    nativeProfiles.value = [...list, { index, settings }].sort((a, b) => a.index - b.index)
    return changed
  }


  async function activateNative(index) {
    await useMouseStore().activateOnboardProfile(index)
    activeNativeIndex.value = index
  }

  function renameNative(index, name) {
    nativeNames.value = { ...nativeNames.value, [index]: name.trim() }
  }

  /** Perfil seguinte a `id` (o ativo, por padrão), em ordem circular. */
  function nextProfile(id = activeProfileId.value) {
    const list = profiles.value
    const index = list.findIndex((p) => p.id === id)
    return list[(index + 1) % list.length] ?? null
  }

  return {
    profiles,
    activeProfileId,
    activeProfile,
    isLoaded,
    lastApplyError,
    profileSwitchKey,
    notifications,
    showLog,
    startWithWindows,
    startupSupported,
    startMinimized,
    appRules,
    profileMode,
    nativeProfiles,
    nativeList,
    activeNativeIndex,
    activeNative,
    activeDisplayProfile,
    nativeSnapshot,
    switchingMode,
    switchToNative,
    switchToCustom,
    syncNativeBottomKey,
    refreshActiveNative,
    refreshNativeProfiles,
    activateNative,
    renameNative,
    load,
    normalizeExe,
    addAppRule,
    updateAppRule,
    removeAppRule,
    findAppRule,
    nextProfile,
    createProfile,
    duplicateProfile,
    updateProfile,
    removeProfile,
    applyProfile,
  }
})
