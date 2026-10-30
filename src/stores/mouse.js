import { defineStore } from 'pinia'
import { ref, shallowRef, computed, markRaw, watch } from 'vue'
import { MouseHidService } from '@/hid/MouseHidService.js'
import {
  DPI_SLOT,
  ADDR,
  SENSOR_TOGGLES,
  ONBOARD_PROFILE_COUNT,
  ONBOARD_CONFIG_SIZE,
  ONBOARD_DPI_SIZE,
  PROFILE_LED_FACTORY_COLOR,
  PROFILE_LED_FACTORY_BRIGHTNESS,
  profileDpiAxes,
} from '@/hid/constants.js'
import { parseOnboardSettings, usedLength } from '@/hid/onboard.js'
import { isDpiKeyEvent } from '@/hid/protocol.js'
import { useProfilesStore } from './profiles.js'

// Tempo que o LED de DPI fica aceso após aplicar um perfil.
const LED_FLASH_MS = 3000
// Intervalos da leitura de bateria: normal e enquanto carrega.
const BATTERY_POLL_MS = 30000
const BATTERY_CHARGING_POLL_MS = 5000

const emptySlots = () => [
  { dpi: null, color: null },
  { dpi: null, color: null },
]
const emptyApplied = () => ({
  dpi: null,
  color: null,
  pollingRate: null,
  lod: null,
  sleepTime: null,
  competitiveMode: null,
  fps20k: null,
  motionSync: null,
  rippleControl: null,
  angleSnapping: null,
})

export const useMouseStore = defineStore('mouse', () => {
  // HIDDevice é um objeto nativo: envolvê-lo em Proxy reativo quebra
  // sendReport/open ("Illegal invocation"). shallowRef + markRaw mantém a
  // referência reativa sem tocar no objeto em si.
  const device = shallowRef(null)
  const isOnline = ref(false)
  // false enquanto o primeiro status do mouse ainda está sendo lido (ao abrir o app ou conectar).
  const isStatusKnown = ref(false)
  const isInitialized = ref(false)
  const pendingCommands = ref(0)
  const lastError = ref(null)

  // Tarefa longa em andamento no mouse (para a tela mostrar): { label, done, total } ou null.
  const task = ref(null)
  const stepTask = () => task.value && (task.value = { ...task.value, done: task.value.done + 1 })
  async function withTask(label, total, fn) {
    const previous = task.value
    task.value = { label, done: 0, total }
    try {
      return await fn()
    } finally {
      task.value = previous
    }
  }
  const lastAck = shallowRef(null)
  const lastTelemetry = shallowRef(null)
  // Últimas configurações confirmadas pela MCU nesta conexão.
  const applied = ref(emptyApplied())
  // Incrementa a cada clique na tecla de DPI (botão inferior). Quem quiser reagir observa este valor.
  const dpiKeyPresses = ref(0)
  // Último aviso de tecla recebido, aceito ou não, para diagnóstico.
  const lastKeyEvent = shallowRef(null)
  // Último uso do mouse visto pelo Windows (Raw Input: movimento, clique, roda).
  const lastActivityAt = ref(null)
  const noteActivity = () => (lastActivityAt.value = Date.now())

  // O que já está gravado no mouse nesta conexão, para não regravar o que não
  // mudou (cada comando pelo sem fio custa tempo). Zerado numa desconexão real.
  let slots = emptySlots()
  let slotCount = null
  let bottomKeySet = false
  let ledConfigured = false
  // Slot de DPI em que está o perfil ativo. No modo de alternância o firmware
  // alterna sozinho entre 0 e 1 a cada clique, e o app passa a usar esse slot.
  let activeSlot = DPI_SLOT
  // true quando o mouse está no modo de alternância (2 slots).
  let switchModeActive = false
  // true durante applySettings (inclusive entre um comando e outro).
  let applying = false

  function resetMouseCache() {
    applied.value = emptyApplied()
    slots = emptySlots()
    slotCount = null
    bottomKeySet = false
    ledConfigured = false
    activeSlot = DPI_SLOT
    switchModeActive = false
  }

  // Nenhum clique é descartado: quem decide o que fazer (inclusive enfileirar
  // cliques que chegam durante uma gravação) é o App.
  function handleKeyEvent() {
    const busy = applying || pendingCommands.value > 0
    if (switchModeActive) {
      if (!busy) {
        // Mouse parado: o slot de reserva tem DPI e cor do próximo perfil, para
        // onde o firmware acabou de ir. Acende já, para a cor aparecer na hora.
        flashLed().catch((err) => (lastError.value = err))
      } else {
        // Clique durante uma gravação: a reserva pode estar desatualizada, então
        // apaga; a cor certa acende quando o perfil de destino for aplicado.
        hideLed()
      }
    }
    lastKeyEvent.value = { at: Date.now(), switchMode: switchModeActive }
    dpiKeyPresses.value++
  }

  // LED de DPI aceso por LED_FLASH_MS e depois apagado. Cada chamada reinicia o tempo.
  // Acender/apagar = ligar/desligar o efeito do LED (não o estado): com o efeito
  // desligado, o firmware também não acende o LED sozinho ao trocar de slot, então
  // um clique que o app ignora não mostra cor nenhuma.
  // Não passa por run(): não conta como gravação nem abre a janela de silêncio,
  // porque ligar/desligar o LED não gera aviso de troca de DPI.
  let ledTimer = null
  let ledLit = false
  function flashLed() {
    clearTimeout(ledTimer)
    ledLit = true
    const on = service.setDpiLed(true)
    ledTimer = setTimeout(() => {
      ledLit = false
      if (isOnline.value) service.setDpiLed(false).catch((err) => (lastError.value = err))
    }, LED_FLASH_MS)
    return on
  }

  function hideLed() {
    clearTimeout(ledTimer)
    if (!ledLit) return
    ledLit = false
    service.setDpiLed(false).catch((err) => (lastError.value = err))
  }

  // Brilho máximo e estado ligado são gravados uma vez por conexão; o efeito
  // começa desligado e só é ligado durante os LED_FLASH_MS de cada troca.
  async function ensureLedConfigured() {
    if (ledConfigured) return
    await run(() => service.configureDpiLed())
    if (!ledLit) await run(() => service.setDpiLed(false))
    ledConfigured = true
  }

  const isBusy = computed(() => pendingCommands.value > 0)
  const deviceName = computed(() => device.value?.productName ?? null)
  const isWired = ref(false)
  // true até o perfil ser aplicado após abrir o app ou após uma desconexão real.
  const needsSync = ref(true)
  // Cabo ou receptor no USB. É o que a interface mostra como "online", como o hub:
  // com o receptor, o mouse inativo (repouso ou desligado) não é exibido; só se
  // descobre que ele não está respondendo quando uma ação falha.
  const isConnected = computed(() => !!device.value)
  // Receptor sem fio conectado, mas o mouse não está respondendo (uso interno).
  const isReceiverOnly = computed(() => !!device.value && !isOnline.value)

  const service = markRaw(
    new MouseHidService({
      onStatusChange(status) {
        device.value = status.device ? markRaw(status.device) : null
        isWired.value = status.wired
        isOnline.value = !!status.device?.opened && status.mouseOnline
        isStatusKnown.value = status.statusKnown
        if (!isOnline.value) {
          clearTimeout(ledTimer)
          ledLit = false
        }
        // As configurações ficam na memória do mouse e sobrevivem ao sleep e ao
        // desligamento pela chave. Só uma desconexão real do USB (nenhum cabo nem
        // receptor) exige sincronizar de novo, pois o mouse pode ter sido configurado
        // em outro computador ou pelo hub enquanto estava fora.
        if (!status.device) {
          resetMouseCache()
          needsSync.value = true
        }
      },
      onTelemetry(report) {
        lastTelemetry.value = report
        if (isDpiKeyEvent(report)) handleKeyEvent()
      },
    }),
  )

  async function init() {
    if (isInitialized.value) return device.value
    try {
      await service.init()
      isInitialized.value = true
    } catch (err) {
      lastError.value = err
      throw err
    }
    return device.value
  }

  async function dispose() {
    clearTimeout(batteryTimer)
    await service.dispose()
    isInitialized.value = false
  }

  // ---- Bateria ---------------------------------------------------------------
  // Consulta periódica, como o hub: com o mouse ativo, a cada BATTERY_POLL_MS; carregando,
  // a cada BATTERY_CHARGING_POLL_MS, para mostrar quando a carga termina. Não passa
  // por run(): é leitura, não deve contar como gravação nem atrapalhar o botão inferior.
  // O último valor lido continua visível com o mouse em repouso.
  const battery = ref(null) // { level, charging, voltage, updatedAt }
  let batteryTimer = null

  async function refreshBattery() {
    clearTimeout(batteryTimer)
    if (!device.value) return
    // Mouse inativo pelo receptor não responde; só tenta de novo mais tarde.
    if (isOnline.value && !applying) {
      try {
        battery.value = { ...(await service.getBattery()), updatedAt: Date.now() }
      } catch {
        // Sem resposta agora: mantém o último valor.
      }
    }
    batteryTimer = setTimeout(refreshBattery, battery.value?.charging ? BATTERY_CHARGING_POLL_MS : BATTERY_POLL_MS)
  }

  // Mouse ligado ou conectado: lê a bateria na hora (e segue lendo periodicamente).
  watch(isOnline, (online) => online && refreshBattery())
  watch(device, (dev) => {
    if (!dev) {
      clearTimeout(batteryTimer)
      battery.value = null
    }
  })

  // ---- Versões de firmware -----------------------------------------------------
  // Lidas uma vez por conexão: a do receptor ao conectá-lo (ele sempre responde) e a
  // do mouse na primeira vez que ele estiver ativo (em repouso ele não responde).
  const firmware = ref({ mouse: null, receiver: null })

  async function refreshFirmware() {
    if (!device.value) return
    try {
      if (!isWired.value && !firmware.value.receiver) firmware.value.receiver = await service.getReceiverVersion()
      if (isOnline.value && !firmware.value.mouse) firmware.value.mouse = await service.getMouseVersion()
    } catch {
      // Sem resposta agora: tenta de novo na próxima conexão ou quando o mouse acordar.
    }
  }

  watch(device, (dev) => {
    firmware.value = { mouse: null, receiver: null }
    if (dev) refreshFirmware()
  })
  watch(isOnline, (online) => online && refreshFirmware())

  // ---- Sleep -------------------------------------------------------------------
  // O app não vê o sleep do mouse; ele deduz. Com o receptor, "mouse ativo" só
  // acontece com o mouse em uso (em repouso ou desligado ele não responde a nada).
  // Se ele fica inativo pelo sleep time do perfil sem nenhum sinal de vida, o app o
  // considera em sleep (offline). Qualquer sinal de vida (mexer, clicar) desfaz isso.
  const inactiveSince = ref(null) // quando o mouse deixou de estar ativo (sem fio)
  const clock = ref(Date.now())
  let clockTimer = null

  // Sleep time em segundos: o gravado no mouse nesta conexão ou, antes da primeira
  // aplicação, o do perfil ativo (valores em unidades de 10 s).
  const sleepSeconds = computed(() => {
    const value = applied.value.sleepTime ?? useProfilesStore().activeProfile?.sleepTime
    return value ? value * 10 : null
  })

  watch(
    [device, isOnline, isWired],
    () => {
      const inactive = !!device.value && !isWired.value && !isOnline.value
      if (!inactive) {
        inactiveSince.value = null
        clearInterval(clockTimer)
        clockTimer = null
        return
      }
      inactiveSince.value ??= Date.now()
      clock.value = Date.now()
      clockTimer ??= setInterval(() => (clock.value = Date.now()), 1000)
    },
    { immediate: true },
  )

  const isAsleep = computed(
    () =>
      inactiveSince.value !== null &&
      sleepSeconds.value !== null &&
      clock.value - inactiveSince.value >= sleepSeconds.value * 1000,
  )

  // Envolve qualquer comando: contador de ocupado + registro de ACK/erro.
  async function run(command) {
    pendingCommands.value++
    lastError.value = null
    try {
      const ack = await command()
      lastAck.value = Array.isArray(ack) ? ack.at(-1) : ack
      return ack
    } catch (err) {
      lastError.value = err
      throw err
    } finally {
      pendingCommands.value--
    }
  }

  // Grava DPI ({ x, y }) ou cor de um slot, pulando se o mouse já tem esse valor.
  async function writeSlot(slot, key, value) {
    const known = key === 'dpi' ? `${value.x}x${value.y}` : value
    if (slots[slot][key] === known) return
    await run(() => (key === 'dpi' ? service.setDpi(value.x, slot, value.y) : service.setDpiColor(value, slot)))
    slots[slot][key] = known
  }

  // Cada setter só atualiza `applied` depois que a MCU confirmou.
  // ---- Experimental: troca de perfil interno pelo botão inferior -----------------
  // A função "troca de perfil" (tipo 9) não aparece no hub para o V8S; estes
  // comandos servem só para testar se o firmware a aceita.

  /** Grava "troca de perfil" no botão inferior. */
  async function setBottomKeyProfileSwitch() {
    await run(() => service.setBottomKeyProfileSwitch())
    // O app não deve regravar o DPI Loop por cima enquanto o teste estiver valendo.
    bottomKeySet = true
  }

  /** Devolve o botão inferior ao DPI Loop (padrão de fábrica). */
  async function restoreBottomKeyDpiLoop() {
    await run(() => service.setBottomKeyDpiSwitch())
    bottomKeySet = true
  }

  /** Perfil interno ativo (0 a 3) ou null se o mouse não responder. */
  function readOnboardProfile() {
    return service.getOnboardProfile()
  }

  // ---- Perfis nativos (internos do mouse) ----------------------------------------
  // A memória que o app lê e grava é a do perfil interno ativo; por isso trocar de
  // perfil interno invalida tudo o que o app sabe sobre o que está gravado.

  const NOT_RESPONDING = 'O mouse não respondeu. Mexa nele para acordá-lo e tente de novo.'

  async function requireOnboardProfile() {
    const index = await service.getOnboardProfile()
    if (index === null) throw new Error(NOT_RESPONDING)
    return index
  }

  /** Ativa um perfil interno (0 a 3). */
  async function activateOnboardProfile(index) {
    await run(() => service.setOnboardProfile(index))
    resetMouseCache()
  }

  /** Lê a configuração completa do perfil interno ativo: { index, flash, dpiArea }. */
  async function readOnboardSnapshot() {
    const index = await requireOnboardProfile()
    const flash = await run(() => service.readFlashRange(0, ONBOARD_CONFIG_SIZE))
    const dpiArea = await run(() => service.readFlashRange(ADDR.SENSOR_3955_DPI, ONBOARD_DPI_SIZE))
    return { index, flash: [...flash], dpiArea: [...dpiArea] }
  }

  /**
   * Lê os 4 perfis internos: ativa um por um, lê a memória e interpreta.
   * Ao terminar, o perfil interno ativo é o último lido; quem chama decide qual ativar.
   */
  function readAllOnboardProfiles() {
    return withTask('Lendo os perfis nativos do mouse', ONBOARD_PROFILE_COUNT, async () => {
      const result = []
      for (let index = 0; index < ONBOARD_PROFILE_COUNT; index++) {
        await activateOnboardProfile(index)
        const snapshot = await readOnboardSnapshot()
        result.push({ index, settings: parseOnboardSettings(snapshot.flash, snapshot.dpiArea) })
        stepTask()
      }
      return result
    })
  }

  /** Perfil interno ativo e suas configurações, sem trocar de perfil: { index, settings }. */
  async function readActiveOnboardSettings() {
    const snapshot = await readOnboardSnapshot()
    return { index: snapshot.index, settings: parseOnboardSettings(snapshot.flash, snapshot.dpiArea) }
  }

  /**
   * Grava a função do botão inferior nos 4 perfis internos: "troca de perfil"
   * (profileSwitch) ou DPI Loop. Também mantém a piscada de troca de perfil de
   * fábrica (magenta, pisca o número do perfil): pela troca via botão o firmware
   * ignora cor e brilho gravados, então o app não a personaliza.
   * No fim reativa o perfil interno que estava ativo.
   */
  function setBottomKeyAllOnboard(profileSwitch) {
    const label = profileSwitch ? 'Gravando a troca de perfil no botão inferior' : 'Restaurando o DPI Loop no botão inferior'
    return withTask(label, ONBOARD_PROFILE_COUNT, async () => {
      const current = await requireOnboardProfile()
      for (let index = 0; index < ONBOARD_PROFILE_COUNT; index++) {
        await activateOnboardProfile(index)
        await run(() => (profileSwitch ? service.setBottomKeyProfileSwitch() : service.setBottomKeyDpiSwitch()))
        await run(() => service.setProfileLedColor(PROFILE_LED_FACTORY_COLOR))
        await run(() => service.setProfileLedBrightness(PROFILE_LED_FACTORY_BRIGHTNESS))
        stepTask()
      }
      await activateOnboardProfile(current)
      return current
    })
  }

  /** Regrava no perfil interno de origem uma cópia feita por readOnboardSnapshot. */
  function restoreOnboardSnapshot({ index, flash, dpiArea }) {
    return withTask('Restaurando o perfil nativo guardado', 0, async () => {
      await requireOnboardProfile()
      await activateOnboardProfile(index)
      const config = Uint8Array.from(flash)
      await run(() => service.writeFlashRange(0, config.slice(0, usedLength(config))))
      await run(() => service.writeFlashRange(ADDR.SENSOR_3955_DPI, Uint8Array.from(dpiArea)))
      // Reativa o perfil para o firmware recarregar a configuração regravada.
      await activateOnboardProfile(index)
    })
  }

  /** Cópia do perfil nativo ativo antes de passar para o modo custom (com faixa na tela). */
  function snapshotForCustomMode() {
    return withTask('Guardando uma cópia do perfil nativo', 0, () => readOnboardSnapshot())
  }

  async function setPollingRate(hz) {
    const ack = await run(() => service.setPollingRate(hz))
    applied.value.pollingRate = hz
    return ack
  }

  async function setLod(value) {
    const ack = await run(() => service.setLod(value))
    applied.value.lod = value
    return ack
  }

  // Depois de gravar, lê de volta os dois endereços para confirmar que o valor ficou no mouse.
  async function setSleepTime(value) {
    const ack = await run(() => service.setSleepTime(value))
    const sleep = await run(() => service.readFlash(ADDR.SLEEP_TIME, 2))
    const performance = await run(() => service.readFlash(ADDR.PERFORMANCE, 2))
    if (sleep[0] !== value || performance[0] !== value) {
      throw new Error(
        `o mouse aceitou a gravação, mas guardou sleep=${sleep[0]} e performance=${performance[0]} (esperado ${value})`,
      )
    }
    applied.value.sleepTime = value
    return ack
  }

  /** Regrava o slot de reserva (próximo perfil) quando a lista de perfis muda. */
  async function setUpcoming(profile) {
    if (!switchModeActive) return
    await writeSlot(1 - activeSlot, 'dpi', profileDpiAxes(profile))
    await writeSlot(1 - activeSlot, 'color', profile.color)
  }

  /**
   * Aplica um conjunto completo de configurações (um perfil).
   *
   * Com `profileSwitchKey`, o mouse fica com 2 slots de DPI e o firmware alterna
   * entre eles sozinho a cada clique no botão inferior. O app nunca troca de slot:
   * grava este perfil no slot em que o mouse está e, no outro (reserva), o DPI e
   * a cor do próximo perfil (`upcoming`). Assim o clique muda DPI e cor na hora;
   * o app só acende o LED e completa o resto.
   * Sem a opção, um único slot (o botão não faz nada).
   *
   * Só grava o que mudou desde a última aplicação nesta conexão, a não ser com
   * `force` (ativação manual pelo card, que regrava tudo). No fim, o LED acende
   * (ou continua aceso por mais LED_FLASH_MS) com a cor do perfil.
   * `force` também regrava a configuração do LED. Com `showLed: false` o LED não acende.
   * Para no primeiro erro; o erro recebe `setting` com o nome do campo que falhou.
   */
  async function applySettings(settings, options) {
    applying = true
    try {
      await doApplySettings(settings, options)
    } finally {
      applying = false
    }
  }

  async function doApplySettings(
    settings,
    { profileSwitchKey = false, upcoming = null, force = false, showLed = true } = {},
  ) {
    const { pollingRate, lod, sleepTime, color, competitiveMode = false, fps20k = false } = settings
    // DPI por eixo ({ x, y }); iguais quando o perfil não separa X e Y.
    const dpi = profileDpiAxes(settings)
    const next = upcoming ?? { dpi, color }
    if (force) {
      applied.value = emptyApplied()
      slots = emptySlots()
      slotCount = null
      bottomKeySet = false
      ledConfigured = false
    }
    const a = applied.value
    const step = async (setting, fn) => {
      try {
        await fn()
      } catch (err) {
        err.setting = setting
        // O mouse ficou com parte das configurações; marca para o app reaplicar
        // assim que possível.
        needsSync.value = true
        throw err
      }
    }

    // Primeiro: efeito do LED desligado, para as trocas de slot não acenderem cor nenhuma.
    await step('color', () => ensureLedConfigured())

    if (profileSwitchKey) {
      if (slotCount !== 2) {
        await step('slot', () => run(() => service.setMaxDpiStage(2)))
        slotCount = 2
      }
      // Usa o slot em que o mouse está agora (o clique já pode ter alternado).
      await step('slot', async () => {
        const current = await run(() => service.readFlash(ADDR.CURRENT_DPI, 2))
        activeSlot = current[0] === 1 ? 1 : 0
      })
    } else if (slotCount !== 1) {
      await step('slot', () => run(() => service.setDpiSlotCount(1)))
      slotCount = 1
      activeSlot = DPI_SLOT
    }

    await step('dpi', () => writeSlot(activeSlot, 'dpi', dpi))
    await step('color', () => writeSlot(activeSlot, 'color', color))
    a.dpi = dpi
    a.color = color

    if (profileSwitchKey) {
      const other = 1 - activeSlot
      await step('dpi', () => writeSlot(other, 'dpi', next.dpi))
      await step('color', () => writeSlot(other, 'color', next.color))
      if (!bottomKeySet) {
        await step('bottomKey', () => run(() => service.setBottomKeyDpiSwitch()))
        bottomKeySet = true
      }
    }

    if (a.pollingRate !== pollingRate) await step('pollingRate', () => setPollingRate(pollingRate))
    if (a.lod !== lod) await step('lod', () => setLod(lod))
    if (a.sleepTime !== sleepTime) await step('sleepTime', () => setSleepTime(sleepTime))
    if (a.competitiveMode !== !!competitiveMode) {
      await step('competitiveMode', () => run(() => service.setPerformanceState(!!competitiveMode)))
      a.competitiveMode = !!competitiveMode
    }
    // 20K só vale com o Modo Competitivo (como no hub); gravado depois dele.
    const want20k = !!competitiveMode && !!fps20k
    if (a.fps20k !== want20k) {
      await step('fps20k', () => run(() => service.setFps20k(want20k)))
      a.fps20k = want20k
    }
    // Opções do sensor (Motion Sync, Ripple Control, Angle Snapping).
    for (const { key, address } of SENSOR_TOGGLES) {
      const want = !!settings[key]
      if (a[key] === want) continue
      await step(key, () => run(() => service.setToggle(address, want)))
      a[key] = want
    }

    if (showLed) await step('color', () => flashLed())

    switchModeActive = profileSwitchKey
    needsSync.value = false
  }

  return {
    device,
    isOnline,
    isStatusKnown,
    isInitialized,
    isBusy,
    isWired,
    isConnected,
    battery,
    refreshBattery,
    firmware,
    isAsleep,
    setBottomKeyProfileSwitch,
    restoreBottomKeyDpiLoop,
    readOnboardProfile,
    activateOnboardProfile,
    setBottomKeyAllOnboard,
    readActiveOnboardSettings,
    readOnboardSnapshot,
    readAllOnboardProfiles,
    restoreOnboardSnapshot,
    snapshotForCustomMode,
    task,
    isReceiverOnly,
    needsSync,
    deviceName,
    lastError,
    lastAck,
    lastTelemetry,
    applied,
    dpiKeyPresses,
    lastKeyEvent,
    lastActivityAt,
    noteActivity,
    init,
    dispose,
    setUpcoming,
    setPollingRate,
    setLod,
    setSleepTime,
    applySettings,
  }
})
