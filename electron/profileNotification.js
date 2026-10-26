// Notificação nativa do Windows ao ativar um perfil (alternativa ao popup junto ao ponteiro).
import { Notification, ipcMain } from 'electron'

let current = null

function showProfile({ name, dpi, pollingRate }) {
  if (!Notification.isSupported()) return
  // Trocas seguidas substituem a notificação anterior em vez de empilhar várias.
  current?.close()
  current = new Notification({
    title: `Perfil "${String(name)}" ativado`,
    body: `${Number(dpi).toLocaleString('pt-BR')} DPI · ${Number(pollingRate).toLocaleString('pt-BR')} Hz`,
    silent: true,
  })
  current.show()
}

export function setupProfileNotification() {
  ipcMain.on('notify:profile', (_event, data) => {
    try {
      showProfile(data)
    } catch (err) {
      console.error('[Notificação] Falha ao exibir', err)
    }
  })
}
