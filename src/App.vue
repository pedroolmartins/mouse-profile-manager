<script setup>
import { ref, computed, watch, toRef, onMounted, onBeforeUnmount } from 'vue'
import { useFocusProfileSwitching } from '@/composables/focusProfileSwitching.js'
import { useActiveMouse } from '@/composables/activeMouse.js'
import { ACTIVATION_MESSAGES } from '@/utils/activationMessages.js'
import { useMouseStore } from '@/stores/mouse.js'
import { useProfilesStore } from '@/stores/profiles.js'
import { toHex } from '@/hid/protocol.js'
import ProfileCard from '@/components/ProfileCard.vue'
import ProfileModal from '@/components/ProfileModal.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import SettingsModal from '@/components/SettingsModal.vue'
import AppsTab from '@/components/AppsTab.vue'
import DeviceHome from '@/components/DeviceHome.vue'
import BatteryIndicator from '@/components/BatteryIndicator.vue'
import ProfileModeSwitch from '@/components/ProfileModeSwitch.vue'
import NativeProfileModal from '@/components/NativeProfileModal.vue'
import TaskBanner from '@/components/TaskBanner.vue'
import OptionSwitch from '@/components/OptionSwitch.vue'
import { findDevice } from '@/devices/registry.js'
import KysonaView from '@/devices/kysona/KysonaView.vue'
import { useKysonaStore } from '@/devices/kysona/store.js'

const mouse = useMouseStore()
const kysona = useKysonaStore()
const profilesStore = useProfilesStore()

const SETTING_LABELS = {
  slot: 'Slots de DPI',
  dpi: 'DPI',
  color: 'Cor do LED',
  bottomKey: 'Botão inferior',
  pollingRate: 'Polling rate',
  lod: 'LOD',
  sleepTime: 'Sleep time',
  competitiveMode: 'Modo Competitivo',
  fps20k: '20K FPS',
  motionSync: 'Motion Sync',
  rippleControl: 'Ripple Control',
  angleSnapping: 'Angle Snapping',
}

const showModal = ref(false)
const showSettings = ref(false)
const TABS = [
  { id: 'profiles', label: 'Perfis' },
  { id: 'apps', label: 'Apps' },
]
const tab = ref('profiles')

// Tela atual: a página inicial (Dispositivos) sempre abre primeiro; ao escolher
// um dispositivo, mostra as abas dele. A troca de tela não afeta nada do mouse:
// botão inferior, apps em foco e sincronização seguem rodando em qualquer tela.
const view = ref('home')
const openDeviceId = ref(null)
const openDevice = computed(() => findDevice(openDeviceId.value))
// Estado (conexão, bateria, firmware) do dispositivo aberto, para o cabeçalho.
const headerDriver = computed(() => openDevice.value?.useDriver() ?? mouse)

function openDeviceView(id) {
  openDeviceId.value = id
  tab.value = 'profiles'
  view.value = 'device'
}
const editProfile = ref(null)
const applyingId = ref(null)
const confirmDelete = ref(null)
// Balões de sucesso/erro no canto inferior direito.
const toasts = ref([])
const log = ref([])

const MAX_TOASTS = 4
const TOAST_MS = { success: 4000, error: 10000 }
let toastId = 0

// Sucesso some em 4 s; erro fica 10 s (ou até ser fechado). Um sucesso novo
// remove os erros anteriores, que já não valem mais.
function setStatus(text, type) {
  if (type === 'success') toasts.value = toasts.value.filter((t) => t.type !== 'error')
  const toast = { id: ++toastId, text, type }
  toasts.value = [...toasts.value, toast].slice(-MAX_TOASTS)
  setTimeout(() => dismissToast(toast.id), TOAST_MS[type] ?? 5000)
}

function dismissToast(id) {
  toasts.value = toasts.value.filter((t) => t.id !== id)
}

function addLog(kind, text) {
  log.value.unshift({ time: new Date().toLocaleTimeString(), kind, text })
  if (log.value.length > 200) log.value.pop()
}


// Aviso escolhido nas configurações (só no Electron), exibido depois que todas as
// configurações foram gravadas; útil com o app minimizado ou em segundo plano.
function notifyActivated({ name, dpi, pollingRate, color }) {
  const { enabled, type } = profilesStore.notifications
  if (!enabled) return
  if (type === 'native') window.profileNotification?.show({ name, dpi, pollingRate })
  else window.profilePopup?.show({ name, dpi, pollingRate, color })
}

// Ativações automáticas que chegam com o mouse em repouso (receptor sem fio diz que
// ele não responde) ficam guardadas: o receptor não acorda o mouse, então tentar
// agora só daria erro. A última pedida é aplicada assim que o mouse acordar.
// Clique no card e botão do mouse não entram aqui: neles o usuário está usando o mouse.
const DEFERRABLE_REASONS = ['app', 'app-restore', 'connect', 'toggle']
let deferredActivation = null // { profileId, reason }

watch(
  () => mouse.isOnline,
  (online) => {
    if (!online || !deferredActivation) return
    const { profileId, reason } = deferredActivation
    deferredActivation = null
    const profile = profilesStore.profiles.find((p) => p.id === profileId)
    if (profile && !applyingId.value) {
      addLog('info', `Mouse acordou — aplicando "${profile.name}"`)
      activate(profile, { reason })
    }
  },
)

async function activate(profile, { reason = 'manual' } = {}) {
  if (applyingId.value) return false
  // Perfis custom não são aplicados no modo nativo (nem durante a troca de modo):
  // gravariam por cima do perfil nativo ativo.
  if (isNative.value || profilesStore.switchingMode) return false
  if (mouse.isConnected && !mouse.isOnline && DEFERRABLE_REASONS.includes(reason)) {
    deferredActivation = { profileId: profile.id, reason }
    addLog('info', `Mouse em repouso — "${profile.name}" será aplicado quando ele acordar`)
    return false
  }
  // Qualquer ativação que de fato acontece substitui uma guardada.
  deferredActivation = null
  applyingId.value = profile.id
  try {
    // Clique no card regrava tudo (garante o mouse em ordem mesmo que algo o
    // tenha mudado por fora); botão do mouse e reconexão gravam só o que mudou.
    await profilesStore.applyProfile(profile.id, { force: reason === 'manual' || reason === 'toggle' })
    // Ligar/desligar a alternância reaplica o mesmo perfil só para ajustar os slots: sem banner.
    if (ACTIVATION_MESSAGES[reason]) {
      setStatus(`Perfil "${profile.name}" ${ACTIVATION_MESSAGES[reason]}!`, 'success')
      notifyActivated(profile)
    }
    addLog('ack', `Perfil "${profile.name}" aplicado`)
    return true
  } catch (err) {
    const where = err.setting ? `${SETTING_LABELS[err.setting]}: ` : ''
    addLog('err', `${where}${err.code ?? 'ERRO'} — ${err.message}${err.request ? ` | TX ${toHex(err.request)}` : ''}`)
    // Sem resposta (mesmo após as novas tentativas): pelo receptor, o mouse pode
    // estar desligado ou fora de alcance. É aqui que o usuário fica sabendo, como no hub.
    if (err.code === 'TIMEOUT') {
      setStatus(`Erro ao ativar "${profile.name}": o mouse não respondeu. Verifique se ele está ligado e por perto.`, 'error')
      return false
    }
    // Falha automática (botão do mouse / conexão) com nova tentativa a caminho: só registra no log.
    const willRetry = reason !== 'manual' && mouse.isOnline && autoSyncAttempts < MAX_AUTO_SYNC
    if (willRetry) addLog('info', `Tentando aplicar "${profile.name}" novamente…`)
    else setStatus(`Erro ao ativar "${profile.name}" — ${where}${err.message}`, 'error')
    return false
  } finally {
    applyingId.value = null
  }
}

// ---- Modo de perfil (custom / nativo) ---------------------------------------------
const isNative = computed(() => profilesStore.profileMode === 'native')
const modeBusy = ref(false)
const editNative = ref(null)

async function changeProfileMode(target) {
  if (modeBusy.value || target === profilesStore.profileMode) return
  if (!mouse.isConnected) return setStatus('Conecte o mouse para trocar o modo de perfil.', 'error')
  modeBusy.value = true
  try {
    if (target === 'native') {
      addLog('info', 'Trocando para o modo nativo: restaurando o perfil nativo e lendo os 4 perfis…')
      await profilesStore.switchToNative()
      const first = profilesStore.activeNative
      setStatus(`Modo nativo: "${first?.name}" ativado!`, 'success')
      if (first) notifyActivated(first)
    } else {
      addLog('info', 'Trocando para o modo custom: guardando uma cópia do perfil nativo atual…')
      await profilesStore.switchToCustom()
      const first = profilesStore.profiles[0]
      if (first) await activate(first, { reason: 'manual' })
    }
  } catch (err) {
    addLog('err', `Troca de modo: ${err.message}`)
    setStatus(`Não foi possível trocar o modo de perfil: ${err.message}`, 'error')
  } finally {
    modeBusy.value = false
  }
}

async function reloadNative() {
  modeBusy.value = true
  try {
    await profilesStore.refreshNativeProfiles()
    setStatus('Perfis nativos recarregados do mouse.', 'success')
  } catch (err) {
    setStatus(`Não foi possível ler os perfis nativos: ${err.message}`, 'error')
  } finally {
    modeBusy.value = false
  }
}

async function activateNativeProfile(profile) {
  if (applyingId.value || modeBusy.value) return
  applyingId.value = profile.id
  try {
    await profilesStore.activateNative(profile.index)
    setStatus(`Perfil "${profile.name}" ativado com sucesso!`, 'success')
    addLog('ack', `Perfil nativo ${profile.index + 1} ("${profile.name}") ativado`)
    notifyActivated(profile)
  } catch (err) {
    const msg = err.code === 'TIMEOUT' ? 'o mouse não respondeu. Verifique se ele está ligado e por perto.' : err.message
    setStatus(`Erro ao ativar "${profile.name}": ${msg}`, 'error')
  } finally {
    applyingId.value = null
  }
}

function saveNativeName(index, name) {
  profilesStore.renameNative(index, name)
  editNative.value = null
}

function openModal(profile = null) {
  editProfile.value = profile
  showModal.value = true
}

function closeModal() {
  showModal.value = false
  editProfile.value = null
}

async function handleSave(data) {
  const { id, name, ...settings } = data
  closeModal()
  if (!id) {
    profilesStore.createProfile(name, settings)
    return
  }
  profilesStore.updateProfile(id, { name, ...settings })
  // Editou o perfil que está no mouse: reaplica para refletir a mudança.
  if (id === profilesStore.activeProfileId && mouse.isConnected) await activate(profilesStore.activeProfile)
}

function handleDelete() {
  profilesStore.removeProfile(confirmDelete.value.id)
  confirmDelete.value = null
}

// Como o hub: com cabo ou receptor no USB, mostra online. O mouse inativo pelo
// receptor (repouso ou desligado, indistinguíveis) não aparece aqui; se ele não
// responder a uma ação, o erro da ação avisa.
const connectionLabel = computed(() => {
  const d = headerDriver.value
  if (!d.isConnected) return 'Offline'
  // Inativo há mais que o sleep time, sem nenhum sinal de vida: deduz que está em sleep.
  if (d.isAsleep) return 'Offline · em sleep'
  return d.isWired ? 'Online · com fio' : 'Online · sem fio'
})

// Mudanças de conexão vão para o log: cabo/receptor conectados ou removidos.
watch(connectionLabel, (label) => addLog('info', `Conexão: ${label}`))

// Aplica o perfil ativo na primeira conexão após abrir o app e após uma
// desconexão real. Acordar do sleep ou religar o mouse não reaplica: as
// configurações continuam gravadas nele.
// Também cobre uma aplicação que falhou no meio: o perfil ativo é reaplicado
// sozinho, até MAX_AUTO_SYNC vezes seguidas, para o mouse não ficar com metade
// das configurações (o que deixaria o botão inferior trocando para cores erradas).
const MAX_AUTO_SYNC = 2
let autoSyncAttempts = 0
watch(
  () => mouse.isOnline && mouse.needsSync,
  async (shouldSync) => {
    if (!shouldSync || !profilesStore.activeProfile || autoSyncAttempts >= MAX_AUTO_SYNC) return
    autoSyncAttempts++
    // Pequena espera: dá tempo do link sem fio estabilizar e da ativação em andamento terminar.
    await new Promise((resolve) => setTimeout(resolve, 800))
    if (mouse.isOnline && mouse.needsSync && !applyingId.value) {
      activate(profilesStore.activeProfile, { reason: 'connect' })
    }
  },
)
watch(
  () => mouse.needsSync,
  (needs) => {
    if (!needs) autoSyncAttempts = 0
  },
)

// Clique no botão inferior: cada clique avança um perfil. Nenhum é descartado:
// cliques que chegam enquanto um perfil está sendo aplicado entram na fila e,
// quando a aplicação termina, o app pula direto para o perfil de destino
// (avançando um perfil por clique). Como a aplicação lê em qual slot o mouse está
// antes de gravar, o resultado fica certo mesmo com cliques no meio da gravação.
let queuedPresses = 0

function processQueuedPresses() {
  if (!queuedPresses || applyingId.value || !mouse.isConnected) return
  const presses = queuedPresses
  queuedPresses = 0
  let target = profilesStore.activeProfile
  for (let i = 0; i < presses && target; i++) target = profilesStore.nextProfile(target.id)
  if (!target) return
  const extra = presses > 1 ? ` (${presses} cliques)` : ''
  addLog('info', `Botão inferior — ativando "${target.name}"${extra}`)
  activate(target, { reason: 'button' })
}

// ---- Perfil por programa em foco -------------------------------------------
// Um monitor de foco para o app inteiro; cada dispositivo troca os próprios perfis
// conforme a lista de apps dele (ver useFocusProfileSwitching).
const focusedApp = ref('')

// Só o mouse em uso recebe o perfil do programa em foco (nunca um desconectado ou
// dormindo, nem dois ao mesmo tempo).
const activeMouse = useActiveMouse([
  { id: 'scyrox-v8s', driver: mouse, activity: () => mouse.lastKeyEvent },
  { id: 'kysona-mercury-pro', driver: kysona, activity: () => kysona.lastKeyEvent },
])

// V8S: só perfis custom (no modo nativo fica parado).
const v8sFocus = useFocusProfileSwitching({
  focusedApp,
  findAppRule: profilesStore.findAppRule,
  appRules: toRef(profilesStore, 'appRules'),
  profiles: () => profilesStore.profiles,
  activeProfileId: () => profilesStore.activeProfileId,
  isEnabled: () => activeMouse.isActive('scyrox-v8s') && !isNative.value,
  isBusy: () => !!applyingId.value,
  activate: (profile, reason) => activate(profile, { reason }),
  // O foco mudou: um pedido guardado (mouse em repouso) deixa de valer; se ainda
  // for preciso trocar de perfil, a reavaliação guarda o pedido novo.
  onFocusChange: () => (deferredActivation = null),
  log: (text) => addLog('info', text),
})

// Kysona: só no modo custom.
const kysonaFocus = useFocusProfileSwitching({
  focusedApp,
  findAppRule: kysona.findAppRule,
  appRules: toRef(kysona, 'appRules'),
  profiles: () => kysona.customProfiles,
  activeProfileId: () => kysona.activeCustomId,
  isEnabled: () => activeMouse.isActive('kysona-mercury-pro') && kysona.mode === 'custom',
  isBusy: () => kysona.busy,
  activate: (profile, reason) =>
    kysona.activateCustom(profile.id, reason).catch((err) => addLog('err', `Kysona: ${err.message}`)),
  log: (text) => addLog('info', `Kysona: ${text}`),
})

function handleFocusChange({ name, path }) {
  // Guarda o caminho do programa da lista (usado para mostrar o ícone na aba Apps).
  for (const rules of [profilesStore, kysona]) {
    const rule = rules.findAppRule(name)
    if (rule && path && rule.path !== path) rules.updateAppRule(rule.id, { path })
  }
  focusedApp.value = name
}

watch(applyingId, (id) => {
  if (!id) processQueuedPresses()
})

// ---- Avisos do Kysona (em qualquer tela, mesmo com o app minimizado) -------------
watch(
  () => kysona.lastCustomActivation,
  (event) => {
    const profile = event && kysona.customProfiles.find((p) => p.id === event.id)
    if (!profile) return
    addLog('ack', `Kysona: perfil custom "${profile.name}" aplicado (${event.reason})`)
    const message = ACTIVATION_MESSAGES[event.reason]
    if (!message) return // edição ou liga/desliga da alternância: sem aviso
    setStatus(`Perfil "${profile.name}" ${message}!`, 'success')
    notifyActivated(profile)
  },
)
// Troca feita no próprio mouse no modo nativo (botão inferior ou hub).
watch(
  () => kysona.lastExternalSwitch,
  (change) => {
    const profile = change && kysona.profiles.find((p) => p.index === change.index)
    if (!profile) return
    setStatus(`Perfil "${profile.name}" ${ACTIVATION_MESSAGES.button}!`, 'success')
    addLog('ack', `Kysona: perfil ${profile.index + 1} ativado no mouse`)
    notifyActivated(profile)
  },
)
watch(
  () => kysona.lastError,
  (err) => {
    if (!err) return
    setStatus(`Kysona: ${err.message}`, 'error')
    addLog('err', `Kysona: ${err.message}`)
  },
)

// Aba Apps do dispositivo aberto: regras, perfis e se a troca está pausada.
const PAUSED_IN_NATIVE =
  'Modo nativo ativo: a troca automática por programa usa perfis custom e fica pausada até você voltar ao modo custom na aba Perfis.'
const appsTab = computed(() =>
  openDevice.value?.view === 'kysona'
    ? {
        rules: kysona,
        profiles: kysona.customProfiles,
        defaultProfileId: kysona.activeCustomId,
        pausedReason: kysona.mode === 'native' ? PAUSED_IN_NATIVE : null,
        activeRuleId: kysonaFocus.appOverride.value?.ruleId ?? null,
      }
    : {
        rules: profilesStore,
        profiles: profilesStore.profiles,
        defaultProfileId: profilesStore.activeProfileId,
        pausedReason: isNative.value ? PAUSED_IN_NATIVE : null,
        activeRuleId: v8sFocus.appOverride.value?.ruleId ?? null,
      },
)

watch(
  () => mouse.lastKeyEvent,
  (event) => {
    if (!event) return
    if (isNative.value) {
      // No modo nativo o botão segue a função gravada no próprio mouse.
      if (!profilesStore.profileSwitchKey || modeBusy.value) {
        return addLog('info', 'Botão inferior pressionado — modo nativo, função gravada no mouse')
      }
      return syncNativeFromMouse().catch((err) => addLog('err', `Perfil nativo ativo: ${err.message}`))
    }
    if (!profilesStore.profileSwitchKey) {
      return addLog('info', 'Botão inferior pressionado — a opção de alternar perfis está desligada')
    }
    if (profilesStore.profiles.length < 2) return addLog('info', 'Botão inferior pressionado — só existe um perfil')
    queuedPresses++
    if (applyingId.value) addLog('info', `Botão inferior pressionado — na fila (${queuedPresses})`)
    processQueuedPresses()
  },
)

// O slot 1 do mouse guarda o próximo perfil; se ele mudar (edição, novo perfil,
// exclusão), regrava o slot para o botão inferior continuar trocando certo.
watch(
  () => {
    const next = profilesStore.nextProfile()
    return next ? `${next.id}|${next.dpi}|${next.dpiXY}|${next.dpiY}|${next.color}` : null
  },
  () => {
    const next = profilesStore.nextProfile()
    if (!next || !mouse.isOnline || !profilesStore.profileSwitchKey || applyingId.value) return
    mouse.setUpcoming(next).catch((err) => addLog('err', `Próximo perfil no slot 1: ${err.message}`))
  },
)

// Grava a função do botão inferior nos 4 perfis nativos (troca de perfil ou DPI Loop).
let nativeKeySynced = false
async function syncNativeKey() {
  modeBusy.value = true
  try {
    if (!(await profilesStore.syncNativeBottomKey())) return
    nativeKeySynced = true
    addLog(
      'ack',
      profilesStore.profileSwitchKey
        ? 'Botão inferior: troca de perfil gravada nos 4 perfis nativos'
        : 'Botão inferior: DPI Loop restaurado nos 4 perfis nativos',
    )
  } catch (err) {
    addLog('err', `Botão inferior nos perfis nativos: ${err.message}`)
    setStatus(`Não foi possível gravar o botão inferior nos perfis nativos: ${err.message}`, 'error')
  } finally {
    modeBusy.value = false
  }
}

// Ligar/desligar a opção: no modo nativo grava/restaura o botão nos 4 perfis; no
// custom, desligar também devolve o DPI Loop aos nativos e o perfil ativo é reaplicado
// (1 ou 2 slots).
watch(
  () => profilesStore.profileSwitchKey,
  async (enabled) => {
    if (!mouse.isConnected) return
    if (isNative.value || !enabled) await syncNativeKey()
    if (!isNative.value && profilesStore.activeProfile) activate(profilesStore.activeProfile, { reason: 'toggle' })
  },
)

// App iniciado no modo nativo: regrava botão e piscada nos 4 perfis assim que o mouse responder.
watch(
  () => mouse.isOnline,
  (online) => {
    if (!mouse.isConnected) nativeKeySynced = false
    if (!online || nativeKeySynced || !isNative.value || modeBusy.value) return
    syncNativeKey()
  },
  { immediate: true },
)
watch(() => mouse.isConnected, (connected) => !connected && (nativeKeySynced = false))

// No modo nativo o firmware troca o perfil sozinho: lê qual ficou ativo para
// atualizar os cards e mostrar a notificação.
let nativeSyncRunning = false
async function syncNativeFromMouse(delay = 250) {
  if (nativeSyncRunning) return
  nativeSyncRunning = true
  try {
    if (delay) await new Promise((resolve) => setTimeout(resolve, delay))
    if (!isNative.value || modeBusy.value || applyingId.value) return
    if (!(await profilesStore.refreshActiveNative())) return
    const profile = profilesStore.activeNative
    addLog('ack', `Perfil nativo ${profile.index + 1} ("${profile.name}") ativado no mouse`)
    setStatus(`Perfil "${profile.name}" ativado com sucesso!`, 'success')
    notifyActivated(profile)
  } finally {
    nativeSyncRunning = false
  }
}

// Modo nativo: a cada 1 s confere qual perfil está ativo (1 pacote) e, se mudou ou
// a cada 5 s, lê as configurações dele (pega trocas pelo botão ou pelo hub oficial).
const NATIVE_INDEX_POLL_MS = 1000
const NATIVE_SETTINGS_EVERY = 5
let nativePollTick = 0
setInterval(async () => {
  if (!isNative.value || !mouse.isConnected || !mouse.isOnline || nativeSyncRunning) return
  try {
    nativePollTick = (nativePollTick + 1) % NATIVE_SETTINGS_EVERY
    if (nativePollTick) {
      const index = await mouse.readOnboardProfile()
      if (index === null || index === profilesStore.activeNativeIndex) return
    }
    await syncNativeFromMouse(0)
  } catch (err) {
    addLog('err', `Leitura do perfil nativo: ${err.message}`)
  }
}, NATIVE_INDEX_POLL_MS)
// Respostas de "mouse ligado?" (3) e bateria (4) chegam a cada poucos segundos:
// só entram no log quando o conteúdo muda, para mostrar a diferença entre repouso
// e mouse desligado sem inundar o log.
const lastStatusReply = {}
watch(
  () => mouse.lastTelemetry,
  (r) => {
    if (!r) return
    const hex = toHex(r.bytes)
    if (r.command === 3 || r.command === 4) {
      if (lastStatusReply[r.command] === hex) return
      lastStatusReply[r.command] = hex
    }
    addLog('rx', `[report ${r.reportId}] ${hex}`)
  },
)

let stopFocusListener = null

onMounted(async () => {
  await profilesStore.load()
  if (window.foregroundApp) {
    stopFocusListener = window.foregroundApp.onChange(handleFocusChange)
    focusedApp.value = (await window.foregroundApp.current()).name
  }
  // Cada driver inicia por conta própria: um dispositivo travado não segura o outro.
  kysona.init().catch((err) => addLog('err', `Kysona: ${err.message}`))
  try {
    await mouse.init()
    if (!mouse.device) addLog('info', 'Mouse não encontrado. Confira o cabo ou o receptor.')
  } catch (err) {
    setStatus(err.message, 'error')
    addLog('err', err.message)
  }
})
onBeforeUnmount(() => {
  stopFocusListener?.()
  mouse.dispose()
  kysona.dispose()
})
</script>

<template>
  <div class="app">
    <header>
      <div class="title">
        <button v-if="view === 'device'" class="back" title="Voltar para Dispositivos" aria-label="Voltar" @click="view = 'home'">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 18 9 12l6-6" /></svg>
        </button>
        <h1>{{ view === 'device' && openDevice ? `${openDevice.brand} ${openDevice.model}` : 'Mouse Profile Manager' }}</h1>
        <span v-if="view === 'device'" :class="['status', headerDriver.isConnected && !headerDriver.isAsleep ? 'on' : 'off']">
          <i />{{ connectionLabel }}
        </span>
        <BatteryIndicator
          v-if="view === 'device' && openDevice?.features?.battery && headerDriver.isConnected"
          class="header-battery"
          compact
          :battery="headerDriver.battery"
          :connected="headerDriver.isConnected"
        />
        <span
          v-if="view === 'device' && (headerDriver.firmware.mouse || headerDriver.firmware.receiver)"
          class="firmware"
          title="Versões de firmware"
        >
          <template v-if="headerDriver.firmware.mouse">Mouse {{ headerDriver.firmware.mouse }}</template>
          <template v-if="headerDriver.firmware.mouse && headerDriver.firmware.receiver"> · </template>
          <template v-if="headerDriver.firmware.receiver">Receptor {{ headerDriver.firmware.receiver }}</template>
        </span>
      </div>
      <button class="icon-button" title="Configurações" aria-label="Configurações" @click="showSettings = true">
          <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1.08-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1.08 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9c.26.6.85 1 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
          </svg>
      </button>
    </header>

    <DeviceHome v-if="view === 'home'" @open="openDeviceView" />

    <template v-else>
    <nav class="tabs" role="tablist">
      <button
        v-for="t in TABS"
        :key="t.id"
        role="tab"
        :aria-selected="tab === t.id"
        :class="['tab', { selected: tab === t.id }]"
        @click="tab = t.id"
      >
        {{ t.label }}
      </button>
    </nav>

    <main>
      <div v-if="!headerDriver.isConnected" class="banner info">
        Conecte o mouse (cabo ou receptor) para ativar um perfil. Você pode criar e editar perfis normalmente.
      </div>

      <!-- Dispositivos com tela de perfis própria (ex.: Kysona). -->
      <KysonaView
        v-if="openDevice?.view === 'kysona'"
        v-show="tab === 'profiles'"
        role="tabpanel"
        @status="setStatus"
        @log="addLog"
        @activated="notifyActivated"
      />

      <section v-else v-show="tab === 'profiles'" role="tabpanel" :class="{ 'native-mode': isNative }">
      <div class="section-head">
        <div class="head-left">
          <h2>Perfis</h2>
          <ProfileModeSwitch
            :model-value="profilesStore.profileMode"
            :disabled="!mouse.isConnected || modeBusy || !!applyingId"
            :busy="modeBusy"
            @change="changeProfileMode"
          />
        </div>
        <button v-if="!isNative" class="primary" @click="openModal()">+ Adicionar</button>
        <button v-else class="outline" :disabled="!mouse.isConnected || modeBusy || !!applyingId" @click="reloadNative">
          {{ modeBusy ? 'Lendo…' : 'Recarregar' }}
        </button>
      </div>

      <TaskBanner v-if="mouse.task" :task="mouse.task" />

      <OptionSwitch
        v-model="profilesStore.profileSwitchKey"
        title="Alternar perfis pelo botão inferior do mouse"
        description="Cada clique no botão de baixo ativa o próximo perfil da lista."
        :disabled="!!applyingId"
      />

      <div v-if="!isNative" :class="['cards', { waiting: !!mouse.task }]">
        <ProfileCard
          v-for="p in profilesStore.profiles"
          :key="p.id"
          :profile="p"
          :is-active="p.id === profilesStore.activeProfileId"
          :is-loading="p.id === applyingId"
          :can-delete="profilesStore.profiles.length > 1"
          :disabled="!mouse.isConnected || (!!applyingId && p.id !== applyingId)"
          @activate="activate(p)"
          @edit="openModal(p)"
          @delete="confirmDelete = p"
        />
      </div>

      <template v-else>
        <p class="mode-hint">
          Perfis guardados no mouse. Clique para ativar; as configurações são alteradas no hub oficial.
        </p>
        <div :class="['cards', { waiting: !!mouse.task }]">
          <ProfileCard
            v-for="p in profilesStore.nativeList"
            :key="p.id"
            :profile="p"
            :is-active="p.index === profilesStore.activeNativeIndex"
            :is-loading="p.id === applyingId"
            :can-delete="false"
            :disabled="!mouse.isConnected || modeBusy || (!!applyingId && p.id !== applyingId)"
            @activate="activateNativeProfile(p)"
            @edit="editNative = p"
          />
        </div>
        <p v-if="!profilesStore.nativeList.length" class="mode-hint">
          Nenhum perfil nativo lido ainda. Conecte o mouse e clique em "Recarregar".
        </p>
      </template>
      </section>

      <AppsTab v-show="tab === 'apps'" role="tabpanel" v-bind="appsTab" :focused-app="focusedApp" />

      <details v-if="profilesStore.showLog" class="log">
        <summary>Log de comunicação</summary>
        <div v-for="(l, i) in log" :key="i" :class="l.kind">
          <time>{{ l.time }}</time> {{ l.text }}
        </div>
        <p v-if="!log.length" class="empty">Nada por aqui ainda.</p>
      </details>
    </main>
    </template>

    <ProfileModal v-if="showModal" :initial-data="editProfile" @close="closeModal" @save="handleSave" />

    <NativeProfileModal
      v-if="editNative"
      :profile="editNative"
      @close="editNative = null"
      @save="(name) => saveNativeName(editNative.index, name)"
    />

    <TransitionGroup tag="div" name="toast" class="toasts" aria-live="polite">
      <div v-for="t in toasts" :key="t.id" :class="['toast', t.type]" :role="t.type === 'error' ? 'alert' : 'status'">
        <span class="toast-icon" aria-hidden="true">{{ t.type === 'success' ? '✓' : '!' }}</span>
        <p>{{ t.text }}</p>
        <button class="toast-close" aria-label="Fechar" @click="dismissToast(t.id)">×</button>
      </div>
    </TransitionGroup>

    <SettingsModal v-if="showSettings" @close="showSettings = false" />

    <ConfirmDialog
      v-if="confirmDelete"
      title="Excluir Perfil"
      :message="`Tem certeza que deseja excluir o perfil &quot;${confirmDelete.name}&quot;?`"
      confirm-label="Excluir"
      @confirm="handleDelete"
      @cancel="confirmDelete = null"
    />
  </div>
</template>

<style>
/*
  Paleta neutra e pouco saturada (conforto em uso prolongado): fundos próximos,
  bordas discretas, texto em cinza claro em vez de branco puro e um único tom de
  destaque suave. Sem gradientes nem brilhos.
*/
:root {
  --bg: #121417;
  --surface: #181b1f;
  --border: #272b31;
  --muted: #8b9099;
  --text: #d9dce0;
  --blue: #5b84d6;
  --blue-text: #8eaae6;
  --purple: #8a7fd4;
  --purple-text: #b1a9e6;
  /* Destaque do modo nativo (perfis do mouse): verde-azulado discreto. */
  --accent-native: #4f9e96;
  --accent-native-text: #8cc6bf;
  color-scheme: dark;
}
* { box-sizing: border-box; }
body {
  margin: 0;
  background: var(--bg);
  color: var(--text);
  font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
  font-size: 14px;
  line-height: 1.45;
  -webkit-font-smoothing: antialiased;
}
button { font: inherit; cursor: pointer; transition: background-color 0.15s, color 0.15s, border-color 0.15s; }
button:disabled { opacity: 0.5; cursor: default; }
button.primary { padding: 7px 14px; border: 0; border-radius: 6px; background: #4a6fbd; color: #f2f4f7; font-weight: 500; }
button.primary:hover:not(:disabled) { background: var(--blue); }
button.ghost { padding: 7px 14px; border: 0; background: none; color: var(--muted); }
button.ghost:hover { color: var(--text); }
button.danger { padding: 7px 18px; border: 0; border-radius: 6px; background: #b54848; color: #f2f4f7; font-weight: 500; }
button.danger:hover { background: #c55555; }
</style>

<style scoped>
.app { min-height: 100vh; display: flex; flex-direction: column; gap: 24px; padding: 32px; }
header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--border);
}
.title { display: flex; align-items: center; gap: 16px; flex-wrap: wrap; }
h1 { margin: 0; color: var(--text); font-size: 22px; font-weight: 600; letter-spacing: -0.01em; }
.status {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border-radius: 999px;
  border: 1px solid var(--border);
  font-size: 12px;
  color: var(--muted);
}
.status i { width: 7px; height: 7px; border-radius: 50%; }
.status.on i { background: #5fb37b; }
.status.off i { background: #c26464; }
main { flex: 1; }
h2 { margin: 0 0 16px; font-size: 16px; font-weight: 600; color: var(--text); }
.banner { display: flex; align-items: center; gap: 12px; margin-bottom: 16px; padding: 16px; border-radius: 8px; border: 1px solid; }
.toasts {
  position: fixed;
  right: 24px;
  bottom: 24px;
  z-index: 60;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 10px;
  width: min(380px, calc(100vw - 32px));
  pointer-events: none;
}
.toast {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  width: 100%;
  padding: 12px 12px 12px 14px;
  border: 1px solid var(--border);
  border-left: 3px solid;
  border-radius: 8px;
  background: #1c1f24;
  box-shadow: 0 6px 16px rgb(0 0 0 / 0.35);
  pointer-events: auto;
}
.toast.success { border-left-color: #5fb37b; }
.toast.error { border-left-color: #c26464; }
.toast p { flex: 1; margin: 2px 0 0; font-size: 13px; line-height: 1.45; color: var(--text); }
.toast-icon {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  font-size: 13px;
  font-weight: 700;
}
.toast.success .toast-icon { color: #7cc493; }
.toast.error .toast-icon { color: #d98080; }
.toast-close {
  flex: none;
  padding: 0 4px;
  border: 0;
  background: none;
  color: var(--muted);
  font-size: 20px;
  line-height: 1;
}
.toast-close:hover { color: var(--text); }
.toast-enter-active,
.toast-leave-active { transition: opacity 0.2s ease, transform 0.2s ease; }
.toast-enter-from,
.toast-leave-to { opacity: 0; transform: translateX(24px); }
.toast-move { transition: transform 0.2s ease; }
@media (prefers-reduced-motion: reduce) {
  .toast-enter-active,
  .toast-leave-active,
  .toast-move { transition: none; }
}
.banner.info { padding: 12px 14px; background: var(--surface); border-color: var(--border); color: var(--muted); font-size: 13px; }
.tabs { display: flex; gap: 4px; margin-top: -8px; border-bottom: 1px solid var(--border); }
.tab {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  margin-bottom: -1px;
  padding: 10px 16px;
  border: 0;
  border-bottom: 2px solid transparent;
  background: none;
  color: var(--muted);
  font-weight: 500;
}
.tab:hover { color: var(--text); }
.tab.selected { color: var(--text); border-bottom-color: var(--purple); }
.section-head { display: flex; justify-content: space-between; align-items: center; gap: 16px; margin-bottom: 16px; }
.section-head h2 { margin: 0; }
.head-left { display: flex; align-items: center; gap: 16px; flex-wrap: wrap; }
/* Modo nativo: troca o tom de destaque (borda do perfil ativo etc.) por um verde-azulado. */
.native-mode { --purple: var(--accent-native); --purple-text: var(--accent-native-text); }
.mode-hint { margin: -6px 0 14px; color: var(--muted); font-size: 12px; }
.cards.waiting { opacity: 0.55; pointer-events: none; transition: opacity 0.15s; }
button.outline {
  padding: 6px 12px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: none;
  color: var(--text);
  font-size: 13px;
}
button.outline:hover:not(:disabled) { border-color: var(--accent-native); }
.firmware { color: var(--muted); font-size: 12px; font-variant-numeric: tabular-nums; }
.header-battery {
  padding: 4px 10px;
  border: 1px solid var(--border);
  border-radius: 999px;
}
.back {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: none;
  color: var(--muted);
  font-size: 16px;
}
.back:hover { color: var(--text); border-color: #3a3f47; }
.icon-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: none;
  color: var(--muted);
}
.icon-button:hover { color: var(--text); border-color: #3a3f47; }
.cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 16px; }
.log { margin-top: 32px; font-family: ui-monospace, monospace; font-size: 12px; color: var(--muted); }
.log summary { cursor: pointer; font-family: inherit; margin-bottom: 8px; }
.log div { padding: 2px 0; border-bottom: 1px solid var(--surface); }
.log time { color: #6b7280; }
.log .ack { color: #4ade80; }
.log .err { color: #f87171; }
.log .rx { color: var(--blue-text); }
.log .empty { margin: 0; }
@media (max-width: 640px) {
  .app { padding: 16px; }
  h1 { font-size: 24px; }
}
</style>
