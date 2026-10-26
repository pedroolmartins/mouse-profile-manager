// Persistência dos perfis em <userData>/profiles.json, exposta ao renderer via IPC.
import { app, ipcMain } from 'electron'
import { readFile, writeFile, rename } from 'node:fs/promises'
import path from 'node:path'

const filePath = () => path.join(app.getPath('userData'), 'profiles.json')

async function load() {
  try {
    return JSON.parse(await readFile(filePath(), 'utf8'))
  } catch (err) {
    if (err.code === 'ENOENT') return null
    throw err
  }
}

/** Configurações gerais salvas pelo app, lidas antes de a janela abrir ({} se não houver). */
export async function loadSettings() {
  try {
    return (await load())?.settings ?? {}
  } catch {
    return {}
  }
}

// Grava num arquivo temporário e renomeia, para não corromper o JSON se o app fechar no meio.
async function save(data) {
  const target = filePath()
  const tmp = `${target}.tmp`
  await writeFile(tmp, JSON.stringify(data, null, 2), 'utf8')
  await rename(tmp, target)
}

export function setupProfileStorage() {
  ipcMain.handle('profiles:load', () => load())
  ipcMain.handle('profiles:save', (_event, data) => save(data))
}
