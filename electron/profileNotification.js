// Notificação nativa do Windows ao ativar um perfil (alternativa ao popup junto ao ponteiro).
import { Notification, ipcMain } from 'electron'

let current = null

function showProfile({ name, dpi, pollingRate, device }) {
  if (!Notification.isSupported()) return
  // Trocas seguidas substituem a notificação anterior em vez de empilhar várias.
  current?.close()
  current = new Notification({
    title: `Perfil "${String(name)}" ativado`,
    // Primeira linha: o mouse em que o perfil foi trocado.
    body: [
      device ? String(device) : null,
      `${Number(dpi).toLocaleString('pt-BR')} DPI · ${Number(pollingRate).toLocaleString('pt-BR')} Hz`,
    ]
      .filter(Boolean)
      .join('\n'),
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
