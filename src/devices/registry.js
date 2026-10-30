// Dispositivos suportados pelo app. A página inicial mostra um card para cada um.
//
// Para adicionar um dispositivo (de qualquer marca):
//   1. Crie o driver dele: um store Pinia que fale o protocolo do aparelho e exponha
//      pelo menos este estado (é o que a página inicial lê):
//        isConnected  -> cabo/receptor no USB
//        isOnline     -> o aparelho está respondendo
//        isWired      -> conectado por cabo
//        battery      -> { level (%), charging, updatedAt } ou null (sem bateria / ainda não lido)
//        isStatusKnown -> (opcional) false enquanto o primeiro status é lido após conectar
//        noteActivity -> (opcional) chamado a cada uso do mouse visto pelo Raw Input do Windows
//        isAsleep     -> (opcional) o aparelho está dormindo/offline mesmo com o receptor conectado
//        firmware     -> (opcional) { mouse, receiver } com as versões ("v5.06") ou null
//   2. Libere os IDs USB dele em electron/hidPermissions.js.
//   3. Acrescente a entrada abaixo, com `useDriver` devolvendo o store do driver e,
//      se o dispositivo tiver perfis, `useProfiles` devolvendo o store de perfis dele
//      (a página inicial mostra o `activeProfile` desse store).
//
// As telas de Perfis e Apps hoje são as do V8S (perfis com DPI, polling rate, LOD,
// sleep e cor do LED). Um dispositivo com outros recursos pode reaproveitá-las
// marcando os `features` que suporta ou ganhar telas próprias.
import { VENDOR_ID, PRODUCT_IDS } from '@/hid/constants.js'
import { useMouseStore } from '@/stores/mouse.js'
import { useProfilesStore } from '@/stores/profiles.js'
import { KYSONA_VENDOR_ID, KYSONA_PRODUCT_IDS } from '@/devices/kysona/protocol.js'
import { useKysonaStore } from '@/devices/kysona/store.js'

export const DEVICES = [
  {
    id: 'scyrox-v8s',
    brand: 'Scyrox',
    model: 'V8S',
    kind: 'mouse',
    vendorId: VENDOR_ID,
    productIds: PRODUCT_IDS,
    features: { profiles: true, apps: true, battery: true, profileSwitchKey: true, led: true },
    useDriver: () => useMouseStore(),
    useProfiles: () => useProfilesStore(),
  },
  {
    id: 'kysona-mercury-pro',
    brand: 'Kysona',
    model: 'Mercury Pro',
    kind: 'mouse',
    vendorId: KYSONA_VENDOR_ID,
    productIds: KYSONA_PRODUCT_IDS,
    // Tela de perfis própria (`view`); a aba Apps é a mesma do V8S.
    view: 'kysona',
    features: { profiles: true, apps: true, battery: true, profileSwitchKey: true },
    useDriver: () => useKysonaStore(),
    useProfiles: () => useKysonaStore(),
  },
]

export const findDevice = (id) => DEVICES.find((d) => d.id === id) ?? null
