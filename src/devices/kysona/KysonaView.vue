<script setup>
// Tela do Kysona Mercury Pro: modo custom (perfis do app gravados no perfil ativo do
// mouse) e modo nativo (os 8 perfis guardados no mouse).
import { ref, computed, watch } from 'vue'
import { useKysonaStore, BOTTOM_KEY_WRITES } from './store.js'
import NativeProfileModal from '@/components/NativeProfileModal.vue'
import TaskBanner from '@/components/TaskBanner.vue'
import OptionSwitch from '@/components/OptionSwitch.vue'
import ProfileCard from '@/components/ProfileCard.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import KysonaProfileModal from './KysonaProfileModal.vue'
import { SLEEP_OPTIONS, sleepLabel } from './protocol.js'

const emit = defineEmits(['status', 'log', 'activated'])
const kysona = useKysonaStore()
const isNative = computed(() => kysona.mode === 'native')

// ---- Nativo -------------------------------------------------------------------------

const editingNative = ref(null)
const activatingId = ref(null)

async function activateNative(profile) {
  if (kysona.busy || activatingId.value) return
  activatingId.value = profile.id
  try {
    await kysona.activate(profile.index)
    emit('status', `Perfil "${profile.name}" ativado com sucesso!`, 'success')
    emit('log', 'ack', `Kysona: perfil ${profile.index + 1} ("${profile.name}") ativado`)
    emit('activated', kysona.activeProfile ?? profile)
  } catch (err) {
    emit('status', `Erro ao ativar "${profile.name}": ${err.message}`, 'error')
  } finally {
    activatingId.value = null
  }
}

async function reload() {
  try {
    await kysona.readAll()
    emit('status', 'Perfis recarregados do mouse.', 'success')
  } catch (err) {
    emit('status', `Não foi possível ler os perfis: ${err.message}`, 'error')
  }
}

function saveNativeName(name) {
  kysona.rename(editingNative.value.index, name)
  editingNative.value = null
}


// ---- Custom -------------------------------------------------------------------------

const showModal = ref(false)
const editingCustom = ref(null)
const confirmDelete = ref(null)

function openModal(profile = null) {
  editingCustom.value = profile
  showModal.value = true
}

async function saveCustom({ id, ...data }) {
  showModal.value = false
  try {
    if (id) await kysona.updateCustom(id, data)
    else kysona.addCustom(data)
  } catch (err) {
    emit('status', `Não foi possível gravar "${data.name}": ${err.message}`, 'error')
  }
}

async function activateCustom(profile) {
  if (kysona.busy || activatingId.value) return
  activatingId.value = profile.id
  try {
    await kysona.activateCustom(profile.id)
  } catch (err) {
    emit('status', `Erro ao ativar "${profile.name}": ${err.message}`, 'error')
  } finally {
    activatingId.value = null
  }
}

async function deleteCustom() {
  const profile = confirmDelete.value
  confirmDelete.value = null
  try {
    await kysona.removeCustom(profile.id)
  } catch (err) {
    emit('status', `Erro ao excluir "${profile.name}": ${err.message}`, 'error')
  }
}

// Avisos de ativação pelo botão, por app em foco e de erro ficam no App (valem em
// qualquer tela); aqui só os das ações feitas nesta tela.

// ---- Cards --------------------------------------------------------------------------

const dpiText = (p) => (p.dpi == null ? '—' : p.dpiXY ? `${p.dpi} / ${p.dpiY}` : String(p.dpi))
const cardStats = (p) => [
  { label: p.dpiXY ? 'DPI X / Y' : 'DPI', value: dpiText(p) },
  { label: 'Polling Rate', value: p.pollingRate ? `${p.pollingRate}Hz` : '—' },
  // Nativos: o sleep time é um só para o mouse (o em uso); custom: o do perfil.
  { label: 'Sleep', value: sleepLabel(isNative.value ? kysona.sleepSeconds : (p.sleepTime ?? kysona.sleepSeconds)) },
]

const settingsRows = (p) => [
  ['DPI em uso', dpiText(p)],
  ['Estágios de DPI', p.stages.map((s) => s.x).join(' · ')],
  ['Polling Rate', p.pollingRate ? `${p.pollingRate} Hz` : '—'],
  ['Sleep time (do mouse)', sleepLabel(kysona.sleepSeconds)],
]

const cardDisabled = (p) => !kysona.isOnline || (!!activatingId.value && activatingId.value !== p.id)
</script>

<template>
  <section :class="{ 'native-mode': isNative }">
    <div class="section-head">
      <div class="head-left">
        <h2>Perfis</h2>
      </div>
      <button v-if="!isNative" class="primary" @click="openModal()">+ Adicionar</button>
      <button v-else class="outline" :disabled="!kysona.isOnline || kysona.busy" @click="reload">Recarregar</button>
    </div>

    <TaskBanner v-if="kysona.task" :task="kysona.task" />

    <OptionSwitch
      v-if="BOTTOM_KEY_WRITES"
      v-model="kysona.profileSwitchKey"
      title="Alternar perfis pelo botão inferior do mouse"
      :description="
        isNative
          ? 'Grava a troca de perfil no botão inferior dos 8 perfis. Desligada, o botão volta ao DPI Loop.'
          : 'Cada clique no botão de baixo ativa o próximo perfil da lista. Desligada, o botão não muda nada.'
      "
      :disabled="!kysona.isOnline || kysona.busy"
    />

    <!-- Custom: perfis do app. -->
    <div v-if="!isNative" :class="['cards', { waiting: kysona.busy && !activatingId }]">
      <ProfileCard
        v-for="p in kysona.customProfiles"
        :key="p.id"
        :profile="p"
        :stats="cardStats(p)"
        :is-active="p.id === kysona.activeCustomId"
        :is-loading="activatingId === p.id"
        :can-delete="kysona.customProfiles.length > 1"
        :disabled="cardDisabled(p)"
        @activate="activateCustom(p)"
        @edit="openModal(p)"
        @delete="confirmDelete = p"
      />
    </div>

    <!-- Nativo: os 8 perfis do mouse. -->
    <template v-else>
      <p class="hint">Perfis guardados no mouse. Clique para ativar; as configurações são alteradas no hub oficial.</p>
      <div v-if="kysona.profiles.length" :class="['cards', { waiting: kysona.busy && !activatingId }]">
        <ProfileCard
          v-for="p in kysona.profiles"
          :key="p.id"
          :profile="p"
          :stats="cardStats(p)"
          :is-active="p.index === kysona.activeIndex"
          :is-loading="activatingId === p.id"
          :can-delete="false"
          :disabled="cardDisabled(p)"
          @activate="activateNative(p)"
          @edit="editingNative = p"
        >
          <div class="stages" title="Estágios de DPI (o destacado está em uso)">
            <span v-for="(s, i) in p.stages" :key="i" :class="{ current: i === p.current }">
              <i :style="{ background: s.color }" />{{ s.x }}
            </span>
          </div>
        </ProfileCard>
      </div>
      <p v-else class="hint">
        {{ kysona.isOnline ? 'Lendo os perfis do mouse…' : 'Conecte o mouse (cabo ou receptor) e mexa nele para ler os perfis.' }}
      </p>
    </template>

    <KysonaProfileModal
      v-if="showModal"
      :initial-data="editingCustom"
      :default-sleep="SLEEP_OPTIONS.includes(kysona.sleepSeconds) ? kysona.sleepSeconds : 60"
      @close="showModal = false"
      @save="saveCustom"
    />

    <NativeProfileModal
      v-if="editingNative"
      :profile="editingNative"
      :settings="settingsRows(editingNative)"
      hub="kysona"
      @close="editingNative = null"
      @save="saveNativeName"
    />

    <ConfirmDialog
      v-if="confirmDelete"
      title="Excluir Perfil"
      :message="`Tem certeza que deseja excluir o perfil &quot;${confirmDelete.name}&quot;?`"
      confirm-label="Excluir"
      @confirm="deleteCustom"
      @cancel="confirmDelete = null"
    />
  </section>
</template>

<style scoped>
.native-mode { --purple: var(--accent-native); --purple-text: var(--accent-native-text); }
.section-head { display: flex; justify-content: space-between; align-items: center; gap: 16px; margin-bottom: 16px; }
.head-left { display: flex; align-items: center; gap: 16px; flex-wrap: wrap; }
h2 { margin: 0; font-size: 16px; font-weight: 600; color: var(--text); }
.hint { margin: -6px 0 14px; color: var(--muted); font-size: 12px; }
button.outline { padding: 6px 12px; border: 1px solid var(--border); border-radius: 6px; background: none; color: var(--text); font-size: 13px; }
button.outline:hover:not(:disabled) { border-color: var(--accent-native); }
.cards.waiting { opacity: 0.55; pointer-events: none; transition: opacity 0.15s; }
.cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 16px; }
.stages { display: flex; flex-wrap: wrap; gap: 6px; }
.stages span { display: inline-flex; align-items: center; gap: 4px; padding: 2px 6px; border: 1px solid var(--border); border-radius: 4px; color: var(--muted); font-size: 11px; font-variant-numeric: tabular-nums; }
.stages span.current { border-color: var(--purple); color: var(--text); }
.stages i { width: 6px; height: 6px; border-radius: 50%; }
</style>
