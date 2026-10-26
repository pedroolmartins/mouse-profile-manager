<script setup>
// Faixa de comando em andamento no mouse: texto, "N de M perfis" e barra de progresso.
// A cor de destaque segue --purple (verde-azulado dentro de .native-mode).
defineProps({
  // { label, done, total } — total 0 mostra só o texto.
  task: { type: Object, required: true },
})
</script>

<template>
  <div class="task" role="status" aria-live="polite">
    <div class="spinner" aria-hidden="true" />
    <div class="task-text">
      <strong>{{ task.label }}…</strong>
      <small>
        <template v-if="task.total">{{ task.done }} de {{ task.total }} perfis · </template>
        Não desconecte o mouse.
      </small>
    </div>
    <div v-if="task.total" class="progress" aria-hidden="true">
      <span :style="{ width: `${(task.done / task.total) * 100}%` }" />
    </div>
  </div>
</template>

<style scoped>
.task {
  position: relative;
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
  padding: 12px 14px 14px;
  overflow: hidden;
  border: 1px solid var(--purple);
  border-radius: 8px;
  background: var(--surface);
}
.spinner {
  flex: none;
  width: 20px;
  height: 20px;
  border: 2px solid var(--border);
  border-top-color: var(--purple);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }
.task-text strong { display: block; color: var(--text); font-size: 13px; font-weight: 500; }
.task-text small { color: var(--muted); font-size: 12px; }
.progress { position: absolute; right: 0; bottom: 0; left: 0; height: 3px; background: var(--border); }
.progress span { display: block; height: 100%; background: var(--purple); transition: width 0.3s; }
</style>
