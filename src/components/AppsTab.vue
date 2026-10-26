<script setup>
import { ref, computed, nextTick, watch } from 'vue'
import ConfirmDialog from './ConfirmDialog.vue'

// Aba Apps de qualquer dispositivo: a lista de programas e o perfil de cada um.
const props = defineProps({
  // Regras do dispositivo: { appRules, normalizeExe, addAppRule, updateAppRule, removeAppRule }
  // (ver useAppRules).
  rules: { type: Object, required: true },
  // Perfis que podem ser escolhidos ([{ id, name }]) e o usado por padrão ao adicionar.
  profiles: { type: Array, required: true },
  defaultProfileId: { type: String, default: null },
  // Aviso quando a troca automática está pausada (ex.: modo nativo); null = ativa.
  pausedReason: { type: String, default: null },
  // Programa em primeiro plano agora (minúsculas, sem ".exe"), vindo do monitor de foco.
  focusedApp: { type: String, default: '' },
  // Regra que está com o perfil aplicado no momento (app em foco).
  activeRuleId: { type: String, default: null },
})
// Fora do Electron (navegador) não há monitor de foco nem seletor de arquivo.
const canPick = typeof window !== 'undefined' && !!window.foregroundApp
const monitorAvailable = canPick

const adding = ref(false)
const newExe = ref('')
const newProfileId = ref(null)
const error = ref('')
const exeInput = ref(null)

const profileName = (id) => props.profiles.find((p) => p.id === id)?.name
const isFocused = (rule) => props.rules.normalizeExe(rule.exe) === props.focusedApp
const sortedRules = computed(() => [...props.rules.appRules].sort((a, b) => a.exe.localeCompare(b.exe)))

async function startAdding() {
  adding.value = true
  newExe.value = ''
  newPath.value = null
  newProfileId.value = props.defaultProfileId ?? props.profiles[0]?.id ?? null
  error.value = ''
  await nextTick()
  exeInput.value?.focus()
}

// Caminho do .exe escolhido pelo "Procurar…" (para o ícone); some se o nome for editado.
const newPath = ref(null)

async function pickExe() {
  const picked = await window.foregroundApp.pickExe()
  if (!picked) return
  newExe.value = picked.name
  newPath.value = picked.path
}

// Ícones extraídos dos .exe, por caminho. Sem caminho ou sem ícone, mostra a letra.
const icons = ref({})
watch(
  () => props.rules.appRules.map((r) => r.path).filter(Boolean),
  async (paths) => {
    if (!canPick) return
    for (const path of paths) {
      if (path in icons.value) continue
      icons.value[path] = null // evita buscar o mesmo ícone duas vezes
      icons.value[path] = await window.foregroundApp.getIcon(path)
    }
  },
  { immediate: true },
)
const iconFor = (rule) => (rule.path && icons.value[rule.path]) || null

// App aguardando confirmação de exclusão.
const confirmRemove = ref(null)
function removeConfirmed() {
  props.rules.removeAppRule(confirmRemove.value.id)
  confirmRemove.value = null
}

function confirmAdd() {
  if (!props.rules.normalizeExe(newExe.value)) {
    error.value = 'Informe o nome do programa (ex.: cs2.exe).'
    return
  }
  const pickedStillMatches = newPath.value && newPath.value.toLowerCase().endsWith(newExe.value.trim().toLowerCase())
  const rule = props.rules.addAppRule(newExe.value, newProfileId.value, pickedStillMatches ? newPath.value : null)
  if (!rule) {
    error.value = 'Esse programa já está na lista.'
    return
  }
  adding.value = false
}
</script>

<template>
  <section>
    <div class="section-head">
      <h2>Apps</h2>
      <button v-if="!adding" class="primary" @click="startAdding">+ Adicionar app</button>
    </div>

    <p class="intro">
      Quando um programa da lista estiver em foco, o perfil escolhido para ele é ativado. Ao sair do programa, o app volta
      para o perfil que estava antes.
    </p>

    <p v-if="!monitorAvailable" class="warning">O monitoramento de programas só funciona no aplicativo (Electron).</p>
    <p v-if="pausedReason" class="warning">{{ pausedReason }}</p>

    <form v-if="adding" class="add" @submit.prevent="confirmAdd">
      <label class="exe">
        <span>Programa</span>
        <div class="exe-input">
          <input ref="exeInput" v-model="newExe" type="text" placeholder="Ex.: cs2.exe" @input="error = ''" />
          <button v-if="canPick" type="button" class="secondary" @click="pickExe">Procurar…</button>
        </div>
      </label>
      <label>
        <span>Perfil</span>
        <select v-model="newProfileId">
          <option v-for="p in profiles" :key="p.id" :value="p.id">{{ p.name }}</option>
        </select>
      </label>
      <div class="add-actions">
        <button type="button" class="ghost" @click="adding = false">Cancelar</button>
        <button type="submit" class="primary">Adicionar</button>
      </div>
      <small v-if="error" class="error">{{ error }}</small>
    </form>

    <div v-if="sortedRules.length" class="rules">
      <div v-for="rule in sortedRules" :key="rule.id" :class="['rule', { active: rule.id === activeRuleId }]">
        <div class="rule-name">
          <span class="app-icon" aria-hidden="true">
            <img v-if="iconFor(rule)" :src="iconFor(rule)" alt="" />
            <template v-else>{{ rule.exe.charAt(0).toUpperCase() }}</template>
          </span>
          <div>
            <strong>{{ rule.exe }}</strong>
            <small v-if="rule.id === activeRuleId" class="badge">Em foco · perfil aplicado</small>
            <small v-else-if="isFocused(rule)" class="badge muted">Em foco</small>
          </div>
        </div>
        <select
          :value="rule.profileId ?? ''"
          :class="{ missing: !profileName(rule.profileId) }"
          aria-label="Perfil do programa"
          @change="rules.updateAppRule(rule.id, { profileId: $event.target.value || null })"
        >
          <option v-if="!profileName(rule.profileId)" value="">Selecione um perfil</option>
          <option v-for="p in profiles" :key="p.id" :value="p.id">{{ p.name }}</option>
        </select>
        <button class="icon delete" title="Remover" aria-label="Remover programa" @click="confirmRemove = rule">
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" /></svg>
        </button>
      </div>
    </div>
    <p v-else-if="!adding" class="empty">Nenhum programa adicionado ainda.</p>

    <ConfirmDialog
      v-if="confirmRemove"
      title="Excluir App"
      :message="`Tem certeza que deseja excluir &quot;${confirmRemove.exe}&quot; da lista? O perfil dele não será mais ativado automaticamente.`"
      confirm-label="Excluir"
      @confirm="removeConfirmed"
      @cancel="confirmRemove = null"
    />
  </section>
</template>

<style scoped>
.section-head { display: flex; justify-content: space-between; align-items: center; gap: 16px; margin-bottom: 8px; }
h2 { margin: 0; font-size: 16px; font-weight: 600; color: var(--text); }
.intro { margin: 0 0 16px; color: var(--muted); font-size: 13px; }
.warning { margin: 0 0 16px; color: #cfae6a; font-size: 13px; }
.empty { color: var(--muted); font-size: 13px; }

.add {
  display: grid;
  grid-template-columns: 2fr 1fr auto;
  align-items: end;
  gap: 12px;
  margin-bottom: 16px;
  padding: 14px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface);
}
.add label { display: flex; flex-direction: column; gap: 6px; }
.add label > span { font-size: 12px; font-weight: 500; color: var(--muted); }
.exe-input { display: flex; gap: 8px; }
.add-actions { display: flex; gap: 8px; }
.error { grid-column: 1 / -1; color: #d98080; font-size: 12px; }

input,
select {
  width: 100%;
  padding: 7px 12px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg);
  color: var(--text);
  font: inherit;
}
input:focus,
select:focus { outline: none; border-color: var(--blue); }
select {
  appearance: none;
  padding-right: 40px;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12' fill='none' stroke='%239ca3af' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M3 4.5 6 7.5 9 4.5'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 14px center;
  background-size: 12px;
  cursor: pointer;
}
select option { background: var(--surface); color: var(--text); }
select.missing { border-color: #8a7240; color: #cfae6a; }
button.secondary {
  flex: none;
  padding: 7px 12px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: none;
  color: var(--muted);
}
button.secondary:hover { color: var(--text); border-color: #3a3f47; }

/* Lista em linhas separadas por uma linha fina, sem caixas. */
.rules { display: flex; flex-direction: column; border: 1px solid var(--border); border-radius: 8px; background: var(--surface); }
.rule {
  display: grid;
  grid-template-columns: 1fr 220px auto;
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
  border-left: 2px solid transparent;
  transition: border-color 0.15s;
}
.rule + .rule { border-top: 1px solid var(--border); }
.rule.active { border-left-color: var(--purple); }
.rule-name { display: flex; align-items: center; gap: 12px; min-width: 0; }
.rule-name strong { display: block; color: var(--text); font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.app-icon {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 6px;
  background: var(--bg);
  color: var(--muted);
  font-size: 13px;
  font-weight: 600;
}
.app-icon img { width: 22px; height: 22px; object-fit: contain; }
.badge { display: block; margin-top: 1px; font-size: 12px; color: var(--purple-text); }
.badge.muted { color: var(--muted); }
.icon { display: inline-flex; padding: 4px; border: 0; border-radius: 4px; background: none; color: var(--muted); }
.icon:hover { color: #d98080; background: var(--bg); }

@media (max-width: 720px) {
  .add { grid-template-columns: 1fr; }
  .rule { grid-template-columns: 1fr auto; }
  .rule select { grid-column: 1 / -1; grid-row: 2; }
}
</style>
