<script setup>
defineProps({
  title: { type: String, required: true },
  message: { type: String, required: true },
  confirmLabel: { type: String, default: 'Confirmar' },
})
const emit = defineEmits(['confirm', 'cancel'])
</script>

<template>
  <div class="backdrop" @click.self="emit('cancel')">
    <div class="dialog" role="alertdialog" :aria-label="title">
      <div class="body">
        <h2>{{ title }}</h2>
        <p>{{ message }}</p>
      </div>
      <div class="footer">
        <button class="ghost" @click="emit('cancel')">Cancelar</button>
        <button class="danger" @click="emit('confirm')">{{ confirmLabel }}</button>
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
.dialog {
  width: 100%;
  max-width: 384px;
  overflow: hidden;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--surface);
  box-shadow: 0 12px 32px rgb(0 0 0 / 0.4);
}
.body { padding: 20px 24px; }
h2 { margin: 0 0 8px; font-size: 16px; font-weight: 600; color: var(--text); }
p { margin: 0; color: var(--muted); font-size: 13px; line-height: 1.5; }
.footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 16px;
  border-top: 1px solid var(--border);
}
</style>
