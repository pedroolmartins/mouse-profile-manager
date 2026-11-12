// Iniciar com o sistema no Linux: um .desktop em ~/.config/autostart (padrão XDG,
// lido pelo GNOME/Ubuntu, KDE e outros). O Electron não faz isso sozinho
// (setLoginItemSettings só existe no Windows e no macOS).
import { app } from 'electron'
import { mkdir, rm, writeFile, access } from 'node:fs/promises'
import path from 'node:path'

const autostartFile = () => path.join(app.getPath('appData'), 'autostart', 'mouse-profile-manager.desktop')

// No AppImage, process.execPath aponta para a montagem temporária; o arquivo de
// verdade vem em APPIMAGE. No .deb, é o executável instalado.
const executable = () => process.env.APPIMAGE || process.execPath

export async function getLinuxAutostart() {
  return access(autostartFile()).then(
    () => true,
    () => false,
  )
}

export async function setLinuxAutostart(enabled, args = []) {
  const file = autostartFile()
  if (!enabled) {
    await rm(file, { force: true })
    return false
  }
  // Exec do .desktop: caminho entre aspas (o do .deb tem espaços).
  const exec = [`"${executable().replace(/(["\\$`])/g, '\\$1')}"`, ...args].join(' ')
  await mkdir(path.dirname(file), { recursive: true })
  await writeFile(
    file,
    [
      '[Desktop Entry]',
      'Type=Application',
      'Name=Mouse Profile Manager',
      `Exec=${exec}`,
      'Terminal=false',
      'X-GNOME-Autostart-enabled=true',
      '',
    ].join('\n'),
    'utf8',
  )
  return true
}
