// Lista de apps monitorados de um dispositivo: quando o programa `exe` está em foco,
// o perfil `profileId` é ativado. Cada dispositivo guarda a própria lista (`rules`,
// um ref de [{ id, exe, profileId, path }]) e usa estas operações sobre ela.

/** Nome do programa como o monitor de foco informa: minúsculas, sem caminho e sem ".exe". */
export const normalizeExe = (exe) =>
  String(exe)
    .trim()
    .split(/[\\/]/)
    .pop()
    .replace(/\.exe$/i, '')
    .toLowerCase()

const newId = () => crypto.randomUUID()

/**
 * `rules`: ref com a lista; `defaultProfileId`: função que devolve o perfil usado por
 * padrão ao adicionar um app (normalmente o ativo).
 */
export function useAppRules(rules, defaultProfileId = () => null) {
  /**
   * Adiciona um app; devolve null se o nome for vazio ou o app já estiver na lista.
   * `path` (caminho completo do .exe) é opcional e serve só para mostrar o ícone; sem
   * ele, o caminho é preenchido na primeira vez que o programa entrar em foco.
   */
  function addAppRule(exe, profileId = defaultProfileId(), path = null) {
    const key = normalizeExe(exe)
    if (!key || rules.value.some((r) => normalizeExe(r.exe) === key)) return null
    const name = String(exe).trim().split(/[\\/]/).pop()
    const rule = { id: newId(), exe: /\.exe$/i.test(name) ? name : `${name}.exe`, profileId, path }
    rules.value = [...rules.value, rule]
    return rule
  }

  function updateAppRule(id, changes) {
    rules.value = rules.value.map((r) => (r.id === id ? { ...r, ...changes } : r))
  }

  function removeAppRule(id) {
    rules.value = rules.value.filter((r) => r.id !== id)
  }

  /** Regra do programa em foco (nome vindo do monitor), ou null. */
  function findAppRule(foregroundName) {
    if (!foregroundName) return null
    return rules.value.find((r) => normalizeExe(r.exe) === foregroundName) ?? null
  }

  /** Perfil excluído: os apps que o usavam ficam sem perfil até o usuário escolher outro. */
  function clearProfileFromRules(profileId) {
    if (rules.value.some((r) => r.profileId === profileId)) {
      rules.value = rules.value.map((r) => (r.profileId === profileId ? { ...r, profileId: null } : r))
    }
  }

  return { appRules: rules, normalizeExe, addAppRule, updateAppRule, removeAppRule, findAppRule, clearProfileFromRules }
}
