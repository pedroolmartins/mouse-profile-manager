// Driver do Kysona Mercury Pro, com dois modos:
// - nativo: os 8 perfis guardados no mouse. O app lê, ativa e dá nomes; com a opção
//   ligada, grava "troca de perfil" no botão inferior dos 8 perfis.
// - custom: perfis do app. Cada ativação grava DPI, cor e polling rate no perfil nativo
//   ativo (como o modo custom do V8S); os outros perfis nativos ficam de lado.
import { defineStore } from 'pinia'
import { ref, shallowRef, computed, markRaw, watch } from 'vue'
import { KysonaHidService } from './KysonaHidService.js'
import { useAppRules } from '@/composables/appRules.js'
import {
  CMD,
  PROFILE_COUNT,
  BOTTOM_KEY_INDEX,
  KEY_DPI_LOOP,
  KEY_PROFILE_LOOP,
  KYSONA_MODEL_ID,
  buildSetProfile,
  buildSetKey,
  buildSetDpi,
  buildRestoreDpi,
  parseInfo,
  parseOption0,
  parseSleepSeconds,
  parseDpi,
  RATE_TO_CODE,
  bottomKeyAction,
} from './protocol.js'

// Gravação do botão inferior. Uma vez, desligar a opção deixou o botão esquerdo sem
// função (provavelmente pela troca de perfil antiga, 0x05); o teste depois, com a troca
// 0x53, não alterou nada além do botão inferior. Por segurança, syncBottomKey confere a
// tabela inteira de botões a cada gravação.
export const BOTTOM_KEY_WRITES = true

// Nomes e opção ficam no navegador do app (localStorage do Electron, por usuário).
const STORAGE_KEY = 'kysona-mercury-pro'
const PROFILE_POLL_MS = 1000

function loadSaved() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) ?? {}
  } catch {
    return {}
  }
}

const sameAction = (a, b) => a.length === b.length && a.every((v, i) => v === b[i])
// A resposta de botões não tem cabeçalho: começa com o botão esquerdo [1, 0, 0xF0, 0].
const isKeyMatrix = (r) => r[0] === 1 && r[2] === 0xf0

export const useKysonaStore = defineStore('kysona', () => {
  const device = shallowRef(null)
  const isWired = ref(false)
  const isOnline = ref(false)
  const isStatusKnown = ref(false)
  const battery = ref(null)
  const firmware = ref({ mouse: null, receiver: null })
  const isConnected = computed(() => !!device.value)

  const saved = loadSaved()
  const names = ref(saved.names ?? {})
  const profileSwitchKey = ref(!!saved.profileSwitchKey)
  // Polling rate de cada perfil (Hz), guardado no app como o hub faz: o mouse tem um
  // polling rate só, e o app o reaplica ao trocar de perfil.
  // `ratesVersion`: valores salvos antes da v2 vieram de testes e são descartados.
  const RATES_VERSION = 2
  const rates = ref(saved.ratesVersion === RATES_VERSION ? (saved.rates ?? {}) : {})
  // Modo custom: perfis do app ([{ id, name, dpi, dpiY, dpiXY, pollingRate, sleepTime, color }],
  // sleepTime em segundos), o ativo, e a cópia do perfil nativo ativo feita ao entrar no
  // custom (regravada ao voltar para o nativo): { index, dpiRaw (64 bytes de GET_DPI),
  // rateCode, sleepSeconds }.
  const mode = ref(saved.mode === 'custom' ? 'custom' : 'native')
  const customProfiles = ref(saved.customProfiles ?? [])
  const activeCustomId = ref(saved.activeCustomId ?? null)
  const nativeSnapshot = ref(saved.nativeSnapshot ?? null)
  // Apps monitorados (perfis custom): mesma lista e operações do V8S.
  const appRules = ref(saved.appRules ?? [])
  // Sleep time do mouse (2.4G, em segundos; 0 = nunca dorme), lido da configuração geral.
  // Guardado para valer mesmo se o app abrir com o mouse já dormindo.
  const sleepSeconds = ref(saved.sleepSeconds ?? null)
  const appRulesApi = useAppRules(appRules, () => activeCustomId.value)
  watch([names, profileSwitchKey, rates, mode, customProfiles, activeCustomId, nativeSnapshot, appRules, sleepSeconds], () => {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          names: names.value,
          profileSwitchKey: profileSwitchKey.value,
          rates: rates.value,
          ratesVersion: RATES_VERSION,
          mode: mode.value,
          customProfiles: customProfiles.value,
          activeCustomId: activeCustomId.value,
          nativeSnapshot: nativeSnapshot.value,
          appRules: appRules.value,
          sleepSeconds: sleepSeconds.value,
        }),
      )
    } catch {
      // Sem armazenamento (ex.: modo privado): os nomes valem só nesta sessão.
    }
  }, { deep: true })

  // Perfis lidos do mouse: [{ index, stages, current, pollingRate }].
  const rawProfiles = ref([])
  const activeIndex = ref(null)
  // Tarefa em andamento no mouse (para a tela mostrar): { label, done, total } ou null.
  const task = ref(null)
  const busy = computed(() => !!task.value)
  const startTask = (label, total = 0) => (task.value = { label, done: 0, total })
  const stepTask = () => task.value && (task.value = { ...task.value, done: task.value.done + 1 })
  const lastError = ref(null)
  // Muda a cada troca de perfil feita no próprio mouse (botão ou hub): { index, at }.
  const lastExternalSwitch = ref(null)
  // Último clique do botão inferior ({ at }), como no driver do V8S: sinal de uso do mouse.
  const lastKeyEvent = ref(null)

  // ---- Sleep ---------------------------------------------------------------------
  // Dois sinais, no sem fio: o receptor, que marca o mouse como dormindo (o mesmo campo
  // que o hub usa) mas pode demorar ou não marcar, e a dedução como a do firmware: sem
  // nenhum uso (movimento, clique, roda, visto pelo Raw Input do Windows, ou botão
  // inferior) pelo sleep time, o mouse está dormindo. Ao conectar, conta como usado agora.
  const lastActivityAt = ref(null)
  const noteActivity = () => (lastActivityAt.value = Date.now())
  const clock = ref(Date.now())
  let clockTimer = null
  watch(
    () => !!device.value && !isWired.value,
    (wireless) => {
      clearInterval(clockTimer)
      clockTimer = wireless ? setInterval(() => (clock.value = Date.now()), 1000) : null
    },
  )
  // Conectou, ou o receptor viu o mouse acordar: conta como uso agora.
  watch(device, (dev) => dev && noteActivity())
  watch(isOnline, (online) => online && noteActivity())
  const isAsleep = computed(() => {
    if (!device.value || isWired.value) return false
    if (isStatusKnown.value && !isOnline.value) return true
    return (
      sleepSeconds.value > 0 &&
      lastActivityAt.value !== null &&
      clock.value - lastActivityAt.value >= sleepSeconds.value * 1000
    )
  })

  const profileName = (index) => names.value[index] || `Perfil ${index + 1}`
  // Polling rate em uso no mouse (um só para todos os perfis).
  const liveRate = ref(null)
  // Cada perfil traz o estágio de DPI em uso lido com ele ativo (ver readAll). O polling
  // rate é o guardado do perfil; sem nenhum guardado, o que ele vai usar: o em uso.
  const profiles = computed(() =>
    rawProfiles.value.map((p) => {
      const stage = p.stages[p.current] ?? p.stages[0] ?? { x: 0, y: 0, color: '#8a7fd4' }
      return {
        id: `kysona-${p.index}`,
        index: p.index,
        name: profileName(p.index),
        dpi: stage.x,
        dpiY: stage.y,
        dpiXY: stage.x !== stage.y,
        color: stage.color,
        stages: p.stages,
        current: p.current,
        pollingRate: rates.value[p.index] ?? liveRate.value,
      }
    }),
  )
  const activeProfile = computed(() => profiles.value.find((p) => p.index === activeIndex.value) ?? null)
  const activeCustom = computed(() => customProfiles.value.find((p) => p.id === activeCustomId.value) ?? null)
  // Lido pela página inicial (mesmo nome que no store de perfis do V8S).
  const activeDisplayProfile = computed(() => (mode.value === 'custom' ? activeCustom.value : activeProfile.value))
  // Ativação de perfil custom concluída (para a tela avisar): { id, reason, at }.
  const lastCustomActivation = ref(null)

  const service = markRaw(
    new KysonaHidService({
      onStatusChange: (s) => {
        device.value = s.device ? markRaw(s.device) : null
        isWired.value = s.wired
        isOnline.value = s.online
        isStatusKnown.value = s.statusKnown
        battery.value = s.battery
        if (!s.device) {
          activeIndex.value = null
          keySynced = false
        }
      },
      onKeyEvent: () => {
        lastKeyEvent.value = { at: Date.now() }
        noteActivity()
        if (mode.value === 'custom') return pressedInCustom()
        setTimeout(() => pollActiveProfile().catch(() => {}), 300)
      },
    }),
  )

  async function init() {
    await service.init()
    startPolling()
    loadFromMouse()
  }

  async function dispose() {
    clearInterval(pollTimer)
    clearInterval(clockTimer)
    await service.dispose()
  }

  // Configuração geral crua (resposta de GET_OPTION0): base para trocar de perfil.
  async function readOption0Raw() {
    const raw = await service.query([CMD.GET_OPTION0])
    sleepSeconds.value = parseSleepSeconds(raw)
    return raw
  }

  async function readOption0() {
    return parseOption0(await readOption0Raw())
  }

  /**
   * Lê os 8 perfis. O mouse só informa o estágio de DPI em uso do perfil ativo, então
   * (como no V8S) ativa cada perfil por um instante, lê e volta ao que estava ativo.
   * O polling rate em uso é mantido durante a leitura (é um só para o mouse).
   */
  async function readAll() {
    startTask('Lendo os perfis do mouse', PROFILE_COUNT)
    try {
      const id = parseInfo(await service.query([CMD.GET_INFO]))
      if (id !== KYSONA_MODEL_ID) lastError.value = new Error(`Modelo inesperado (ID ${id})`)
      const startRaw = await readOption0Raw()
      const start = parseOption0(startRaw)
      const rateCode = startRaw[9]
      const readDpi = (index) =>
        service.query([CMD.GET_DPI, index], (r) => r[0] === CMD.GET_DPI && r[1] === index).then(parseDpi)
      const list = []
      let onProfile = start.profile
      try {
        for (let index = 0; index < PROFILE_COUNT; index++) {
          if (index !== onProfile) {
            await service.write(buildSetProfile(await readOption0Raw(), index, rateCode))
            onProfile = index
          }
          list.push({ index, ...(await readDpi(index)) })
          stepTask()
        }
      } finally {
        // Volta ao perfil que estava ativo (mesmo se a leitura parar no meio).
        if (onProfile !== start.profile) await service.write(buildSetProfile(await readOption0Raw(), start.profile, rateCode))
      }
      rawProfiles.value = list
      activeIndex.value = start.profile
      liveRate.value = start.pollingRate
      lastLiveRate = start.pollingRate
      setRate(start.profile, start.pollingRate)
    } finally {
      task.value = null
    }
  }

  async function activate(index) {
    startTask(`Ativando ${profileName(index)}`)
    try {
      const current = await readOption0Raw()
      // O perfil que sai fica com o polling rate em uso agora (pode ter mudado pelo hub).
      setRate(current[8], parseOption0(current).pollingRate)
      // O perfil novo usa o polling rate guardado dele; se o app ainda não conhece, o
      // mouse continua no atual (sem registrar esse valor como sendo do perfil).
      const rateCode = RATE_TO_CODE[rates.value[index]] ?? current[9]
      await service.write(buildSetProfile(current, index, rateCode))
      const option0 = await readOption0()
      activeIndex.value = option0.profile
      if (option0.profile !== index) throw new Error('o mouse não confirmou a troca de perfil')
      lastLiveRate = option0.pollingRate
      liveRate.value = option0.pollingRate
      // O estágio de DPI em uso muda com o perfil: relê o DPI dele.
      const dpi = parseDpi(await service.query([CMD.GET_DPI, index], (r) => r[0] === CMD.GET_DPI && r[1] === index))
      rawProfiles.value = rawProfiles.value.map((p) => (p.index === index ? { ...p, ...dpi } : p))
    } finally {
      task.value = null
    }
  }

  // Último polling rate em uso visto no mouse (para notar mudanças feitas pelo hub).
  let lastLiveRate = null
  function setRate(index, hz) {
    if (hz && rates.value[index] !== hz) rates.value = { ...rates.value, [index]: hz }
  }

  function rename(index, name) {
    names.value = { ...names.value, [index]: name.trim() }
  }

  /**
   * Grava no botão inferior dos 8 perfis a troca de perfil (opção ligada) ou o
   * DPI Loop (desligada). Proteção: lê a tabela completa de botões antes e depois
   * de cada gravação; se qualquer outro botão mudar, para na hora (sem seguir para
   * os outros perfis) e avisa. Devolve true se algo mudou.
   */
  let keySynced = false
  let keyWritesBlocked = false
  async function syncBottomKey() {
    if (keyWritesBlocked) {
      keySynced = true
      throw new Error('gravação de botões bloqueada após alterar outros botões; reinicie o app depois do reset de fábrica no hub.')
    }
    // No custom o botão fica sempre em DPI Loop: a alternância é feita pelo app (ver applyCustom),
    // e só o perfil nativo ativo é usado, então só ele é conferido.
    const custom = mode.value === 'custom'
    const action = !custom && profileSwitchKey.value ? KEY_PROFILE_LOOP : KEY_DPI_LOOP
    const indexes = custom ? [(await readOption0Raw())[8]] : [...Array(PROFILE_COUNT).keys()]
    const bottom = [BOTTOM_KEY_INDEX * 4, BOTTOM_KEY_INDEX * 4 + 4]
    const othersOf = (matrix) => [...matrix.slice(0, bottom[0]), ...matrix.slice(bottom[1])]
    startTask(
      action === KEY_PROFILE_LOOP ? 'Gravando a troca de perfil no botão inferior' : 'Conferindo o DPI Loop no botão inferior',
      indexes.length > 1 ? indexes.length : 0,
    )
    let changed = false
    try {
      for (const index of indexes) {
        const before = await service.query([CMD.GET_KEYS, index], isKeyMatrix)
        if (sameAction(bottomKeyAction(before), action)) {
          stepTask()
          continue
        }
        await service.write(buildSetKey(index, BOTTOM_KEY_INDEX, action))
        const after = await service.query([CMD.GET_KEYS, index], isKeyMatrix)
        if (!sameAction(othersOf(after), othersOf(before))) {
          // Nenhuma outra gravação de botão nesta sessão (as novas tentativas automáticas
          // pulariam este perfil, já gravado, e seguiriam para os outros).
          keyWritesBlocked = true
          throw new Error(
            `a gravação do botão inferior alterou outros botões do perfil ${index + 1}. Parei sem mexer nos outros perfis; use o reset de fábrica no hub oficial para restaurar.`,
          )
        }
        if (!sameAction(bottomKeyAction(after), action)) throw new Error(`o perfil ${index + 1} não aceitou a função do botão inferior`)
        changed = true
        stepTask()
      }
      keySynced = true
      return changed
    } finally {
      task.value = null
    }
  }

  // Confere o perfil ativo (troca pelo botão ou pelo hub oficial).
  let polling = false
  async function pollActiveProfile() {
    // No custom o app é quem define o perfil; não há troca nativa para acompanhar.
    if (mode.value === 'custom') return
    if (polling || busy.value || !isOnline.value || isAsleep.value || !rawProfiles.value.length) return
    polling = true
    try {
      const raw = await readOption0Raw()
      const option0 = parseOption0(raw)
      // DPI em uso do perfil ativo (muda pelo botão de DPI ou ao trocar de perfil).
      const index = option0.profile
      const dpi = parseDpi(await service.query([CMD.GET_DPI, index], (r) => r[0] === CMD.GET_DPI && r[1] === index))
      rawProfiles.value = rawProfiles.value.map((p) => (p.index === index ? { ...p, ...dpi } : p))
      if (index === activeIndex.value) {
        // Mesmo perfil: polling rate mudado (pelo hub) passa a valer para este perfil.
        if (option0.pollingRate !== lastLiveRate) setRate(index, option0.pollingRate)
        lastLiveRate = option0.pollingRate
        liveRate.value = option0.pollingRate
        return
      }
      // Troca feita no mouse (botão inferior): o firmware mantém o polling rate anterior;
      // reaplica o guardado do perfil novo, como o hub.
      const wanted = rates.value[index]
      if (wanted && wanted !== option0.pollingRate && RATE_TO_CODE[wanted] !== undefined) {
        await service.write(buildSetProfile(raw, index, RATE_TO_CODE[wanted]))
        lastLiveRate = wanted
      } else {
        lastLiveRate = option0.pollingRate
      }
      liveRate.value = lastLiveRate
      activeIndex.value = index
      lastExternalSwitch.value = { index, at: Date.now() }
    } finally {
      polling = false
    }
  }

  // Ao conectar (e quando o mouse acorda sem nada lido): lê os perfis e alinha o
  // botão inferior com a opção. Erros ficam em lastError para a tela mostrar.
  let loading = false
  async function loadFromMouse() {
    if (loading || !isOnline.value || isAsleep.value || keySynced) return
    loading = true
    try {
      if (mode.value === 'custom') {
        // Custom: botão em DPI Loop e o perfil custom ativo regravado no mouse.
        if (BOTTOM_KEY_WRITES) await syncBottomKey()
        else keySynced = true
        if (activeCustom.value) await applyCustom(activeCustom.value, 'connect')
      } else {
        await readAll()
        if (BOTTOM_KEY_WRITES) await syncBottomKey()
        else keySynced = true
      }
    } catch (err) {
      // Mouse dormiu no meio da leitura: tenta de novo sozinho (ver startPolling), sem aviso.
      if (err.code !== 'TIMEOUT') lastError.value = err
    } finally {
      loading = false
    }
  }
  watch(isOnline, (online) => online && loadFromMouse())
  watch(profileSwitchKey, async () => {
    if (!BOTTOM_KEY_WRITES || !isConnected.value) return
    try {
      await syncBottomKey()
      // Custom: liga/desliga o segundo estágio (o do próximo perfil).
      if (mode.value === 'custom' && activeCustom.value) await applyCustom(activeCustom.value, 'toggle')
    } catch (err) {
      lastError.value = err
    }
  })

  // ---- Modo custom ------------------------------------------------------------------

  const newId = () => crypto.randomUUID()
  const nextCustom = (id) => {
    const list = customProfiles.value
    const i = list.findIndex((p) => p.id === id)
    return list.length > 1 && i >= 0 ? list[(i + 1) % list.length] : null
  }
  const stageOf = (p) => ({ x: p.dpi, y: p.dpiXY ? p.dpiY : p.dpi, color: p.color })

  /**
   * Grava o perfil custom `profile` no perfil nativo ativo: DPI e cor no estágio 1 e,
   * com a alternância ligada, o próximo perfil no estágio 2 (o DPI Loop do botão leva
   * a ele e o app então aplica o próximo). Depois, o polling rate e o sleep time.
   */
  async function applyCustom(profile, reason = 'manual') {
    startTask(`Aplicando ${profile.name}`)
    try {
      const raw = await readOption0Raw()
      const nativeIndex = raw[8]
      const next = profileSwitchKey.value ? nextCustom(profile.id) : null
      const stages = next ? [stageOf(profile), stageOf(next)] : [stageOf(profile)]
      await service.write(buildSetDpi(nativeIndex, stages, 0))
      // Polling rate e sleep time são um só para o mouse: gravados juntos na configuração geral.
      const code = RATE_TO_CODE[profile.pollingRate] ?? raw[9]
      const sleep = profile.sleepTime ?? parseSleepSeconds(raw)
      if (raw[9] !== code || parseSleepSeconds(raw) !== sleep) {
        await service.write(buildSetProfile(raw, nativeIndex, code, sleep))
        sleepSeconds.value = sleep
      }
      activeCustomId.value = profile.id
      lastCustomActivation.value = { id: profile.id, reason, at: Date.now() }
    } finally {
      task.value = null
    }
  }

  // Cliques do botão inferior no custom: cada um avança um perfil. Cliques durante uma
  // gravação ficam na fila e são aplicados de uma vez ao final.
  let queuedPresses = 0
  function pressedInCustom() {
    if (!profileSwitchKey.value || customProfiles.value.length < 2) return
    queuedPresses++
    processPresses()
  }
  async function processPresses() {
    if (!queuedPresses || busy.value || !activeCustom.value) return
    let target = activeCustom.value
    for (; queuedPresses > 0; queuedPresses--) target = nextCustom(target.id) ?? target
    try {
      await applyCustom(target, 'button')
    } catch (err) {
      lastError.value = err
    }
    if (queuedPresses) processPresses()
  }
  watch(busy, (b) => !b && processPresses())

  async function activateCustom(id, reason = 'manual') {
    const profile = customProfiles.value.find((p) => p.id === id)
    if (profile) await applyCustom(profile, reason)
  }

  function addCustom(data) {
    const profile = { id: newId(), ...data }
    customProfiles.value = [...customProfiles.value, profile]
    return profile
  }

  async function updateCustom(id, data) {
    customProfiles.value = customProfiles.value.map((p) => (p.id === id ? { ...p, ...data } : p))
    // Editou o ativo, ou o próximo dele (que fica no estágio 2): regrava.
    const active = activeCustom.value
    if (mode.value === 'custom' && active && isOnline.value && (active.id === id || nextCustom(active.id)?.id === id)) {
      await applyCustom(active, 'edit')
    }
  }

  async function removeCustom(id) {
    if (customProfiles.value.length <= 1) return
    const wasActive = activeCustomId.value === id
    customProfiles.value = customProfiles.value.filter((p) => p.id !== id)
    appRulesApi.clearProfileFromRules(id)
    if (mode.value === 'custom' && isOnline.value) {
      await applyCustom(wasActive ? customProfiles.value[0] : activeCustom.value, 'edit')
    } else if (wasActive) {
      activeCustomId.value = customProfiles.value[0].id
    }
  }

  /** Nativo -> custom: guarda o perfil nativo ativo e aplica o perfil custom. */
  async function switchToCustom() {
    const raw = await readOption0Raw()
    const index = raw[8]
    const dpiRaw = await service.query([CMD.GET_DPI, index], (r) => r[0] === CMD.GET_DPI && r[1] === index)
    nativeSnapshot.value = { index, dpiRaw: [...dpiRaw], rateCode: raw[9], sleepSeconds: parseSleepSeconds(raw) }
    if (!customProfiles.value.length) {
      // Primeiro perfil custom: o que o mouse está usando agora.
      const { stages, current } = parseDpi(dpiRaw)
      const s = stages[current] ?? stages[0] ?? { x: 800, y: 800, color: '#8a7fd4' }
      addCustom({
        name: 'Padrão',
        dpi: s.x,
        dpiY: s.y,
        dpiXY: s.x !== s.y,
        pollingRate: parseOption0(raw).pollingRate ?? 1000,
        sleepTime: parseSleepSeconds(raw),
        color: s.color,
      })
    }
    mode.value = 'custom'
    if (BOTTOM_KEY_WRITES) await syncBottomKey()
    await applyCustom(activeCustom.value ?? customProfiles.value[0], 'manual')
  }

  /** Custom -> nativo: regrava a cópia do perfil nativo e relê os perfis. */
  async function switchToNative() {
    const snap = nativeSnapshot.value
    if (snap) {
      const raw = await readOption0Raw()
      // A cópia volta para o perfil de onde saiu (gravação de DPI só vale no ativo).
      await service.write(buildSetProfile(raw, snap.index, snap.rateCode, snap.sleepSeconds))
      await service.write(buildRestoreDpi(Uint8Array.from(snap.dpiRaw)))
      nativeSnapshot.value = null
    }
    mode.value = 'native'
    if (BOTTOM_KEY_WRITES) await syncBottomKey()
    await readAll()
  }

  // A cada 1 s confere o perfil ativo; enquanto os perfis não foram lidos (ex.: o mouse
  // dormiu no meio da leitura), tenta lê-los de novo a cada LOAD_RETRY_TICKS.
  const LOAD_RETRY_TICKS = 5
  let pollTimer = null
  let tick = 0
  function startPolling() {
    clearInterval(pollTimer)
    pollTimer = setInterval(() => {
      tick = (tick + 1) % LOAD_RETRY_TICKS
      if (!keySynced) {
        if (tick === 0) loadFromMouse()
        return
      }
      pollActiveProfile().catch((err) => err.code !== 'TIMEOUT' && (lastError.value = err))
    }, PROFILE_POLL_MS)
  }

  return {
    device,
    isConnected,
    isWired,
    isOnline,
    isStatusKnown,
    isAsleep,
    lastActivityAt,
    noteActivity,
    sleepSeconds,
    battery,
    firmware,
    names,
    rates,
    profileSwitchKey,
    profiles,
    activeIndex,
    activeProfile,
    activeDisplayProfile,
    busy,
    task,
    lastError,
    lastExternalSwitch,
    lastKeyEvent,
    init,
    dispose,
    readAll,
    activate,
    rename,
    syncBottomKey,
    mode,
    customProfiles,
    activeCustomId,
    activeCustom,
    lastCustomActivation,
    activateCustom,
    addCustom,
    updateCustom,
    removeCustom,
    switchToCustom,
    switchToNative,
    ...appRulesApi,
  }
})
