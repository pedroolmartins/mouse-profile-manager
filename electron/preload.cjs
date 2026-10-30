const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('profileStorage', {
  load: () => ipcRenderer.invoke('profiles:load'),
  save: (data) => ipcRenderer.invoke('profiles:save', data),
})

contextBridge.exposeInMainWorld('officialHub', {
  // Abre o hub oficial da marca ('scyrox' ou 'kysona') no navegador padrão.
  open: (brand = 'scyrox') => ipcRenderer.invoke('hub:open', brand),
})

contextBridge.exposeInMainWorld('appStartup', {
  // { supported (só no app instalado), enabled }
  get: () => ipcRenderer.invoke('startup:get'),
  // Liga/desliga o início com o Windows; devolve o estado final.
  set: (enabled) => ipcRenderer.invoke('startup:set', !!enabled),
})

contextBridge.exposeInMainWorld('foregroundApp', {
  // Programa em primeiro plano: { name (minúsculas, sem ".exe"), path ('' se desconhecido) }.
  current: () => ipcRenderer.invoke('foreground:current'),
  onChange: (callback) => {
    const listener = (_event, app) => callback(app)
    ipcRenderer.on('foreground:changed', listener)
    return () => ipcRenderer.removeListener('foreground:changed', listener)
  },
  // { name, path } do .exe escolhido, ou null se cancelado.
  pickExe: () => ipcRenderer.invoke('apps:pick-exe'),
  // Ícone do .exe como data URL, ou null.
  getIcon: (exePath) => ipcRenderer.invoke('apps:icon', exePath),
})

contextBridge.exposeInMainWorld('mouseActivity', {
  // Uso de um mouse (movimento, clique, roda), no máximo 1 aviso por segundo por mouse:
  // { vendorId, productId }. Devolve a função que para de ouvir.
  onActivity: (callback) => {
    const listener = (_event, ids) => callback(ids)
    ipcRenderer.on('mouse:activity', listener)
    return () => ipcRenderer.removeListener('mouse:activity', listener)
  },
})

contextBridge.exposeInMainWorld('profileNotification', {
  show: ({ name, dpi, pollingRate, device }) => ipcRenderer.send('notify:profile', { name, dpi, pollingRate, device }),
})

contextBridge.exposeInMainWorld('profilePopup', {
  show: ({ name, dpi, pollingRate, color, device }) =>
    ipcRenderer.send('popup:profile', { name, dpi, pollingRate, color, device }),
})
