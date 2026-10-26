<script setup>
import { computed } from 'vue'
import { LOD_OPTIONS, SLEEP_OPTIONS } from '@/hid/constants.js'

const props = defineProps({
  profile: { type: Object, required: true },
  isActive: { type: Boolean, default: false },
  isLoading: { type: Boolean, default: false },
  canDelete: { type: Boolean, default: true },
  disabled: { type: Boolean, default: false },
  // Outros números no lugar dos do V8S: [{ label, value, tone? ('blue' | 'purple') }].
  stats: { type: Array, default: null },
})
defineEmits(['activate', 'edit', 'delete'])

const lodLabel = computed(() => LOD_OPTIONS.find((o) => o.value === props.profile.lod)?.label ?? '—')
const sleepLabel = computed(() => SLEEP_OPTIONS.find((o) => o.value === props.profile.sleepTime)?.label ?? '—')
</script>

<template>
  <div
    class="card"
    :class="{ active: isActive, loading: isLoading, disabled }"
    role="button"
    tabindex="0"
    :title="disabled ? 'Conecte o mouse para ativar' : 'Clique para ativar'"
    @click="!disabled && !isLoading && $emit('activate')"
    @keydown.enter="!disabled && !isLoading && $emit('activate')"
  >
    <div v-if="isLoading" class="overlay"><div class="spinner" /></div>

    <div class="head">
      <h3 :title="profile.name">
        <span class="led" :style="{ background: profile.color }" title="Cor do LED" />
        <span class="name">{{ profile.name }}</span>
      </h3>
      <div class="actions">
        <button class="icon edit" title="Editar" aria-label="Editar" @click.stop="$emit('edit')">
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16v4Z" /><path d="m13.5 6.5 4 4" /></svg>
        </button>
        <button v-if="canDelete" class="icon delete" title="Remover" aria-label="Remover" @click.stop="$emit('delete')">
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" /></svg>
        </button>
      </div>
    </div>
    <div v-if="stats" class="stats">
      <div v-for="s in stats" :key="s.label">
        <span class="label">{{ s.label }}</span><span :class="['value', s.tone]">{{ s.value }}</span>
      </div>
    </div>
    <div v-else class="stats">
      <div>
        <span class="label">{{ profile.dpiXY ? 'DPI X / Y' : 'DPI' }}</span>
        <span class="value blue">{{ profile.dpiXY ? `${profile.dpi} / ${profile.dpiY}` : profile.dpi }}</span>
      </div>
      <div><span class="label">Polling Rate</span><span class="value purple">{{ profile.pollingRate }}Hz</span></div>
      <div><span class="label">LOD</span><span class="value">{{ lodLabel }}</span></div>
      <div><span class="label">Sleep</span><span class="value">{{ sleepLabel }}</span></div>
    </div>

    <!-- Conteúdo extra do dispositivo (ex.: estágios de DPI do Kysona). -->
    <slot />

    <!--
      Ícones de estado no canto inferior direito; a explicação aparece ao passar o mouse.
      Linha de altura fixa (mesmo sem ícones), para todos os cards ficarem iguais.
      O perfil ativo já é indicado pela borda do card. title="" evita a dica nativa do card por cima.
    -->
    <div class="flags">
      <span v-if="profile.competitiveMode" class="flag competitive" title="" data-tip="Modo Competitivo ligado" aria-label="Modo Competitivo ligado">
        <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z" fill="currentColor" /></svg>
      </span>
      <span v-if="profile.competitiveMode && profile.fps20k" class="flag fps" title="" data-tip="Sensor a 20.000 FPS (20K)" aria-label="Sensor a 20.000 FPS (20K)">20K</span>
    </div>
  </div>
</template>

<style scoped>
.card {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 18px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface);
  cursor: pointer;
  transition: transform 0.15s, box-shadow 0.15s, border-color 0.15s;
}
.card:hover { transform: translateY(-3px); border-color: #353a42; box-shadow: 0 8px 18px rgb(0 0 0 / 0.3); }
.card.active { border-color: var(--purple); }
.card.loading { opacity: 0.75; pointer-events: none; }
.card.disabled { cursor: default; }
.card.disabled:hover { transform: none; border-color: var(--border); box-shadow: none; }
@media (prefers-reduced-motion: reduce) { .card:hover { transform: none; } }
.overlay {
  position: absolute;
  inset: 0;
  z-index: 10;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  background: rgb(18 20 23 / 0.55);
}
.spinner {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border-bottom: 2px solid var(--blue);
  animation: spin 1s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }
.head { display: flex; justify-content: space-between; align-items: flex-start; gap: 8px; }
h3 { display: flex; align-items: center; gap: 10px; min-width: 0; margin: 0; font-size: 15px; font-weight: 600; color: var(--text); }
/* Uma linha só; o que não couber vira "…" (o nome completo aparece ao passar o mouse). */
.name { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.led { flex: none; width: 9px; height: 9px; border-radius: 50%; }
.actions { display: flex; flex: none; gap: 4px; }
.icon { display: inline-flex; padding: 4px; border: 0; border-radius: 4px; background: none; color: var(--muted); cursor: pointer; }
.icon:hover { color: var(--text); background: var(--bg); }
.icon.delete:hover { color: #d98080; }
.flags { display: flex; justify-content: flex-end; align-items: center; gap: 6px; height: 24px; margin-top: 6px; }
.flag {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 24px;
  height: 24px;
  padding: 0 4px;
  border-radius: 6px;
  background: var(--bg);
  cursor: help;
}
.flag.competitive { color: #cfae6a; }
.flag.fps { color: #cfae6a; font-size: 10px; font-weight: 700; letter-spacing: 0.02em; }
/* Dica ao passar o mouse, acima do ícone e alinhada à direita (não sai do card). */
.flag::after {
  content: attr(data-tip);
  position: absolute;
  right: 0;
  bottom: calc(100% + 6px);
  z-index: 5;
  padding: 4px 8px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: #1f2328;
  color: var(--text);
  font-size: 12px;
  font-weight: 500;
  letter-spacing: normal;
  white-space: nowrap;
  opacity: 0;
  pointer-events: none;
  transform: translateY(2px);
  transition: opacity 0.12s, transform 0.12s;
}
.flag:hover::after { opacity: 1; transform: none; }
.stats { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-top: 6px; }
.stats div { display: flex; flex-direction: column; gap: 2px; }
.label { font-size: 11px; color: var(--muted); }
.value { font-size: 17px; font-weight: 600; color: var(--text); font-variant-numeric: tabular-nums; }
</style>
