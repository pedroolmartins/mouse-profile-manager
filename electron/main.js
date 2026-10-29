import { app, BrowserWindow, Menu, ipcMain, shell } from 'electron'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { setupHidPermissions } from './hidPermissions.js'
import { setupProfileStorage, loadSettings } from './profileStorage.js'
import { setupTray } from './tray.js'
import { setupProfilePopup, destroyProfilePopup } from './profilePopup.js'
import { setupProfileNotification } from './profileNotification.js'
import { setupForegroundMonitor } from './foregroundMonitor.js'

// No Windows, notificações nativas precisam de um App User Model ID para aparecer
// com o nome do app. Precisa ser igual ao "appId" do electron-builder (package.json),
// que é o ID usado nos atalhos criados pelo instalador.
const APP_ID = 'com.v8s.settings'
if (process.platform === 'win32') app.setAppUserModelId(APP_ID)

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Pasta de dados fixa (%APPDATA%\v8s), a mesma em desenvolvimento e no app
// instalado. Sem isto ela seguiria o "productName" ("Mouse Profile Manager") e o app
// instalado abriria sem os perfis já salvos.
app.setPath('userData', path.join(app.getPath('appData'), 'v8s'))

// Ícone do app (janela e bandeja). O do executável/instalador vem do mesmo arquivo,
// via "build.win.icon" no package.json.
const APP_ICON = path.join(__dirname, 'assets', 'icon.png')

let mainWindow = null

// Uma instância só: o app abre sozinho com o Windows, e abrir de novo pelo atalho
// criaria uma segunda cópia disputando o mouse. A segunda tentativa só traz a
// janela existente para a frente.
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.show()
    mainWindow.focus()
  })
  app.whenReady().then(start)
}

function createWindow({ show = true } = {}) {
  const win = new BrowserWindow({
    width: 1000,
    height: 720,
    title: 'Mouse Profile Manager',
    icon: APP_ICON,
    show,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.cjs'),
      // A janela passa a maior parte do tempo escondida na bandeja, e é ela que troca
      // os perfis. Com o padrão, o Chromium atrasa os timers de janelas ocultas (até
      // 1 por minuto depois de alguns minutos) e as pausas entre os comandos ao mouse
      // fariam a troca de perfil por app em foco demorar.
      backgroundThrottling: false,
    },
  })
  mainWindow = win

  setupHidPermissions(win.webContents.session)
  // O popup fica oculto entre usos; sem isto ele manteria o app aberto ao fechar a janela.
  win.on('closed', () => {
    destroyProfilePopup()
    mainWindow = null
  })
  setupForegroundMonitor(win)
  setupTray(win, APP_ICON).catch((err) => console.error('[Bandeja] Falha ao criar', err))

  const devUrl = process.env.VITE_DEV_SERVER_URL
  if (devUrl) {
    win.loadURL(devUrl)
    win.webContents.openDevTools({ mode: 'detach' })
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'))
  }
}

// Iniciar junto com o Windows, controlado pela opção nas Configurações. Só funciona
// no app instalado: em desenvolvimento isso registraria o electron.exe genérico.
// O Windows abre o app com este argumento no login; é assim que o app sabe que
// foi iniciado pelo sistema (e não pelo usuário) para poder começar na bandeja.
const LOGIN_ARG = '--started-with-windows'
const loginItem = { args: [LOGIN_ARG] }

// Abre o hub oficial no navegador padrão (edição de perfis nativos).
// Só abre os hubs conhecidos (o renderer escolhe pelo nome, não pela URL).
const OFFICIAL_HUB_URLS = { scyrox: 'https://scyrox.net/', kysona: 'https://qmk.top/v4/' }
function setupOfficialHubLink() {
  ipcMain.handle('hub:open', (_event, brand) => shell.openExternal(OFFICIAL_HUB_URLS[brand] ?? OFFICIAL_HUB_URLS.scyrox))
}

function setupStartupSetting() {
  ipcMain.handle('startup:get', () => ({
    supported: app.isPackaged,
    enabled: app.isPackaged && app.getLoginItemSettings(loginItem).openAtLogin,
  }))
  ipcMain.handle('startup:set', (_event, enabled) => {
    if (!app.isPackaged) return false
    app.setLoginItemSettings({ ...loginItem, openAtLogin: !!enabled })
    return app.getLoginItemSettings(loginItem).openAtLogin
  })
}

async function start() {
  // Sem a barra de menus (File, Edit, View…).
  Menu.setApplicationMenu(null)

  setupStartupSetting()
  setupOfficialHubLink()
  setupProfileStorage()
  setupProfilePopup()
  setupProfileNotification()

  // "Iniciar minimizado": só quando o Windows abre o app no login. Aberto pelo
  // usuário, a janela sempre aparece (senão pareceria que o app não abriu).
  const settings = await loadSettings()
  const startHidden = process.argv.includes(LOGIN_ARG) && !!settings.startMinimized
  createWindow({ show: !startHidden })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
}

// Com a bandeja, fechar a janela só a esconde; o app sai pelo menu "Sair".
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
