<script setup>
import { ref, computed } from 'vue'
import { useProfilesStore } from '@/stores/profiles.js'
import { useMouseStore } from '@/stores/mouse.js'

const emit = defineEmits(['close'])

// As opções valem na hora e são salvas automaticamente junto com os perfis.
const profilesStore = useProfilesStore()

// ---- Experimental: troca de perfil interno ---------------------------------------
const mouse = useMouseStore()
const experimentBusy = ref(false)
const experimentMessage = ref('')
const experimentTone = ref('info')
const canTest = computed(() => mouse.isConnected && !profilesStore.profileSwitchKey && !experimentBusy.value)

async function runExperiment(action) {
  experimentBusy.value = true
  experimentTone.value = 'info'
  try {
    if (action === 'profile') {
      await mouse.setBottomKeyProfileSwitch()
      experimentMessage.value =
        'Gravado. Clique no botão de baixo e depois em "Ler perfil interno atual" para ver se o perfil mudou.'
    } else if (action === 'dpi') {
      await mouse.restoreBottomKeyDpiLoop()
      experimentMessage.value = 'Botão inferior de volta ao DPI Loop.'
    } else {
      const profile = await mouse.readOnboardProfile()
      experimentMessage.value =
        profile === null ? 'O mouse não respondeu (ele está em repouso? mexa nele e tente de novo).' : `Perfil interno ativo: ${profile + 1}`
    }
  } catch (err) {
    experimentTone.value = 'error'
    experimentMessage.value = `Falhou: ${err.message}`
  } finally {
    experimentBusy.value = false
  }
}

const NOTIFICATION_TYPES = [
  { value: 'popup', title: 'Popup junto ao ponteiro', description: 'Cartão rápido ao lado do cursor, com a cor do perfil.' },
  { value: 'native', title: 'Notificação do Windows', description: 'Aviso padrão do sistema, na central de notificações.' },
]
</script>

<template>
  <div class="backdrop" @click.self="emit('close')" @keydown.esc="emit('close')">
    <div class="modal" role="dialog" aria-labelledby="settings-title">
      <div class="body">
        <h2 id="settings-title">Configurações</h2>

        <div class="fields">
          <label :class="['option', { disabled: !profilesStore.startupSupported }]">
            <input v-model="profilesStore.startWithWindows" type="checkbox" :disabled="!profilesStore.startupSupported" />
            <span class="switch" />
            <span>
              <strong>Iniciar com o Windows</strong>
              <small v-if="profilesStore.startupSupported">
                Abre o app ao entrar no Windows, para os perfis e o botão inferior funcionarem sem precisar abri-lo.
              </small>
              <small v-else>Disponível só no app instalado.</small>
            </span>
          </label>

          <label
            v-if="profilesStore.startWithWindows"
            :class="['option', 'sub', { disabled: !profilesStore.startupSupported }]"
          >
            <input v-model="profilesStore.startMinimized" type="checkbox" :disabled="!profilesStore.startupSupported" />
            <span class="switch" />
            <span>
              <strong>Iniciar minimizado na bandeja</strong>
              <small>
                Ao iniciar com o Windows, o app abre direto na bandeja, sem mostrar a janela. Para abrir, clique no ícone
                dele perto do relógio.
              </small>
            </span>
          </label>

          <div class="group">
            <label class="option">
              <input v-model="profilesStore.notifications.enabled" type="checkbox" />
              <span class="switch" />
              <span>
                <strong>Notificar ao ativar um perfil</strong>
                <small>Mostra o nome, o DPI e o polling rate do perfil assim que ele termina de ser aplicado.</small>
              </span>
            </label>

            <div v-if="profilesStore.notifications.enabled" class="choices" role="radiogroup" aria-label="Tipo de notificação">
              <label
                v-for="t in NOTIFICATION_TYPES"
                :key="t.value"
                :class="['choice', { selected: profilesStore.notifications.type === t.value }]"
              >
                <input v-model="profilesStore.notifications.type" type="radio" name="notification-type" :value="t.value" />
                <span class="dot" />
                <span>
                  <strong>{{ t.title }}</strong>
                  <small>{{ t.description }}</small>
                </span>
              </label>
            </div>
          </div>

          <label class="option">
            <input v-model="profilesStore.showLog" type="checkbox" />
            <span class="switch" />
            <span>
              <strong>Exibir log de comunicação</strong>
              <small>Mostra, no fim da tela, os pacotes trocados com o mouse e os eventos de conexão. Útil para diagnóstico.</small>
            </span>
          </label>

          <!-- Teste da função "troca de perfil" (tipo 9) no botão inferior. -->
          <!-- <div class="experimental">
            <strong>Experimental · troca de perfil interno pelo botão inferior</strong>
            <small>
              Grava no botão de baixo a função "troca de perfil", que o hub não oferece para este mouse. Se o firmware
              aceitar, cada clique troca entre os 4 perfis guardados no mouse (os do hub). Para desfazer, use
              "Restaurar DPI Loop".
            </small>
            <small v-if="profilesStore.profileSwitchKey" class="warn">
              Desligue "Alternar perfis pelo botão inferior" para testar: com ela ligada, o app regrava o DPI Loop no botão.
            </small>
            <div class="actions">
              <button type="button" class="outline" :disabled="!canTest" @click="runExperiment('profile')">
                Gravar troca de perfil
              </button>
              <button type="button" class="outline" :disabled="!mouse.isConnected || experimentBusy" @click="runExperiment('dpi')">
                Restaurar DPI Loop
              </button>
              <button type="button" class="outline" :disabled="!mouse.isConnected || experimentBusy" @click="runExperiment('read')">
                Ler perfil interno atual
              </button>
            </div>
            <small v-if="experimentMessage" :class="['result', experimentTone]">{{ experimentMessage }}</small>
          </div> -->
        </div>
      </div>

      <div class="footer">
        <button type="button" class="primary" @click="emit('close')">Fechar</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.backdrop {
  position: fixed;
  inset: 0;
  z-index: 50;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  background: rgb(0 0 0 / 0.55);
}
.modal {
  display: flex;
  flex-direction: column;
  width: 100%;
  max-width: 520px;
  /* Em janelas baixas, o conteúdo rola e o rodapé com "Fechar" continua visível. */
  max-height: calc(100vh - 32px);
  overflow: hidden;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--surface);
  box-shadow: 0 12px 32px rgb(0 0 0 / 0.4);
}
.body { padding: 20px 24px; overflow-y: auto; }
.footer { flex: none; }
h2 { margin: 0 0 8px; font-size: 18px; font-weight: 600; color: var(--text); }
/* Opções em linhas, separadas por uma linha fina. */
.fields { display: flex; flex-direction: column; }
.fields > * { padding: 14px 0; }
.fields > * + * { border-top: 1px solid var(--border); }
.group { display: flex; flex-direction: column; gap: 12px; }
.group > .option { padding: 0; }

.option {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  cursor: pointer;
}
.option input,
.choice input { position: absolute; opacity: 0; pointer-events: none; }
.option .switch {
  position: relative;
  flex: none;
  width: 40px;
  height: 22px;
  margin-top: 1px;
  border-radius: 999px;
  background: var(--border);
  transition: background-color 0.15s;
}
.option .switch::after {
  content: '';
  position: absolute;
  top: 3px;
  left: 3px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #e3e6ea;
  transition: transform 0.15s;
}
.option input:checked + .switch { background: var(--purple); }
.option input:checked + .switch::after { transform: translateX(18px); }
.option input:focus-visible + .switch { outline: 2px solid var(--blue); outline-offset: 2px; }
.option input:disabled + .switch { opacity: 0.5; }
.option.disabled { cursor: default; }
.option.sub { padding-left: 52px; border-top: 0 !important; padding-top: 0; }
strong { display: block; font-weight: 500; color: var(--text); }
small { display: block; margin-top: 3px; color: var(--muted); font-size: 12px; line-height: 1.5; }

.choices { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; padding-left: 52px; }
.choice {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: 6px;
  cursor: pointer;
  transition: border-color 0.15s;
}
.choice:hover { border-color: #3a3f47; }
.choice.selected { border-color: var(--purple); }
.choice .dot {
  flex: none;
  width: 14px;
  height: 14px;
  margin-top: 2px;
  border: 1.5px solid #4a4f57;
  border-radius: 50%;
}
.choice.selected .dot { border-color: var(--purple); box-shadow: inset 0 0 0 3px var(--surface); background: var(--purple); }
.choice input:focus-visible + .dot { outline: 2px solid var(--blue); outline-offset: 2px; }

.experimental { display: flex; flex-direction: column; gap: 4px; }
.experimental .warn { color: #cfae6a; }
.experimental .actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px; }
.experimental .result { margin-top: 6px; color: var(--text); }
.experimental .result.error { color: #d98080; }
button.outline {
  padding: 6px 12px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: none;
  color: var(--text);
  font-size: 13px;
}
button.outline:hover:not(:disabled) { border-color: #3a3f47; background: var(--bg); }

.footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 16px;
  border-top: 1px solid var(--border);
}
@media (max-width: 520px) { .choices { grid-template-columns: 1fr; padding-left: 0; } }
</style>
