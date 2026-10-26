// Processo principal: autoriza o WebHID do renderer apenas para os mouses
// suportados, sem diálogo de seleção. Com isso navigator.hid.getDevices() já
// devolve os dispositivos e os drivers conseguem abri-los direto na inicialização.
import { VENDOR_ID, PRODUCT_IDS } from '../src/hid/constants.js'
import { KYSONA_VENDOR_ID, KYSONA_PRODUCT_IDS } from '../src/devices/kysona/protocol.js'

const SUPPORTED = [
  { vendorId: VENDOR_ID, productIds: PRODUCT_IDS },
  { vendorId: KYSONA_VENDOR_ID, productIds: KYSONA_PRODUCT_IDS },
]
const isSupported = (d) => SUPPORTED.some((s) => d.vendorId === s.vendorId && s.productIds.includes(d.productId))

/** Chamar com `mainWindow.webContents.session` após criar a janela. */
export function setupHidPermissions(session) {
  session.setPermissionCheckHandler((_wc, permission) => permission === 'hid')

  session.setDevicePermissionHandler((details) => details.deviceType === 'hid' && isSupported(details.device))

  // Só dispara se o renderer chamar navigator.hid.requestDevice(); escolhe um
  // mouse suportado automaticamente em vez de mostrar um seletor.
  session.on('select-hid-device', (event, details, callback) => {
    event.preventDefault()
    callback(details.deviceList.find(isSupported)?.deviceId ?? '')
  })
}
