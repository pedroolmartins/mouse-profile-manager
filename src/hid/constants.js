// Identificação USB do mouse (Nordic 54L15, sensor PAW3955).
export const VENDOR_ID = 0x3554
// Em ordem de preferência: com fio primeiro, depois o receptor sem fio.
export const PRODUCT_IDS = [0xf515, 0xf517]

// Report ID usado em device.sendReport(...) para comandos de configuração.
export const CONFIG_REPORT_ID = 8

// Todo pacote tem exatamente 16 bytes; o último é o checksum.
//   [0]=comando [1]=status (0 no envio) [2,3]=endereço BE [4]=tamanho [5..14]=dados [15]=checksum
export const PACKET_SIZE = 16
export const CHECKSUM_INDEX = PACKET_SIZE - 1
export const MAX_DATA_LENGTH = CHECKSUM_INDEX - 5
// Soma dos 16 bytes + Report ID (8) deve dar 0x55 => checksum = (0x55 - 8 - soma) & 0xFF.
export const CHECKSUM_MAGIC = 0x55 - CONFIG_REPORT_ID
// Blocos de dados terminam com um byte de verificação: (0x55 - soma do bloco) & 0xFF.
export const DATA_CHECK_MAGIC = 0x55

// Comandos (byte 0). 4 = bateria chega como telemetria.
// 3 = consulta "mouse ligado?": no receptor sem fio, a resposta traz 1/0 no byte 5.
// A resposta é idêntica com o mouse em repouso e desligado: pelo receptor não
// dá para distinguir os dois (confirmado comparando as respostas byte a byte).
export const CMD_DEVICE_ONLINE = 3
// Nível de bateria. Resposta: byte 5 = %, byte 6 = 1 se carregando, bytes 7-8 = tensão em mV.
export const CMD_BATTERY_LEVEL = 4
// Versões de firmware. Resposta: byte 5 = maior, byte 6 = menor (mostrado em hex: v5.06).
// A do mouse só responde com ele ativo; a do receptor responde sempre.
export const CMD_MOUSE_VERSION = 0x12
export const CMD_RECEIVER_VERSION = 0x1d
export const CMD_WRITE_FLASH = 7
export const CMD_READ_FLASH = 8
// Enviado pelo mouse quando algo muda nele; byte 5 traz flags do que mudou.
export const CMD_STATUS_CHANGED = 10
export const STATUS_FLAG_CURRENT_DPI = 0x01

// Status (byte 1 da resposta).
export const STATUS_OK = 0

// Mapa da memória flash (extraído do hub oficial).
export const ADDR = {
  REPORT_RATE: 0,
  SCYROX_20K: 8, // sensor a 20.000 FPS (0/1); só funciona com o Modo Competitivo ligado
  MAX_DPI_STAGE: 2, // quantidade de slots de DPI ativos
  CURRENT_DPI: 4, // slot de DPI em uso
  LOD: 10,
  DPI_COLOR: 44, // 4 bytes por slot: [R, G, B, verificação]
  DPI_EFFECT_MODE: 76,
  DPI_EFFECT_BRIGHTNESS: 78,
  DPI_EFFECT_STATE: 82,
  // Cor do efeito que o firmware pisca ao trocar de perfil interno ([R, G, B, verificação]).
  PROFILE_LED_COLOR: 84,
  PROFILE_LED_BRIGHTNESS: 90,
  KEY_FUNCTION: 96, // 4 bytes por tecla
  MOTION_SYNC: 171, // 0/1
  SLEEP_TIME: 173,
  ANGLE_SNAPPING: 175, // 0/1
  RIPPLE_CONTROL: 177, // 0/1
  PERFORMANCE_STATE: 181, // "Modo Competitivo": sensor no modo de maior desempenho (0/1)
  PERFORMANCE: 183, // o hub grava o sleep time aqui também
  SENSOR_3955_DPI: 0x1b00, // 6 bytes por slot
}

// O app trabalha com um único slot de DPI.
export const DPI_SLOT = 0

// Botão inferior do mouse (tecla 5), configurado de fábrica como "trocar DPI".
// Para alternar perfis ele continua como trocar DPI, mas com 2 slots de DPI
// iguais: o clique não muda a sensibilidade, só gera o aviso STATUS_CHANGED.
export const BOTTOM_KEY_INDEX = 5
export const KEY_TYPE_DPI_SWITCH = 2
export const DPI_SWITCH_PARAM = 0x0100
// Experimental: "troca de perfil" existe na lista interna de funções do hub, mas o
// hub não a oferece para o V8S. O parâmetro é suposto (o mesmo do DPI Loop: ciclar).
export const KEY_TYPE_PROFILE_SWITCH = 9
export const PROFILE_SWITCH_PARAM = 0x0100

// Perfis internos do mouse (4, como no seletor do hub): ler e definir o atual.
export const CMD_GET_CURRENT_CONFIG = 0x0e
export const CMD_SET_CURRENT_CONFIG = 0x0f
export const ONBOARD_PROFILE_COUNT = 4
// Áreas da memória que guardam a configuração de um perfil (as mesmas que o hub
// lê ao conectar e regrava ao importar): configurações gerais e DPI do sensor 3955.
export const ONBOARD_CONFIG_SIZE = 256
export const ONBOARD_DPI_SIZE = 48 // 8 slots x 6 bytes, a partir de ADDR.SENSOR_3955_DPI

// DPI do PAW3955: 1..42000 em passos de 1; 42002..50000 em passos de 2 (modo estendido).
export const DPI_MIN = 1
export const DPI_MAX = 50000
export const DPI_EXTENDED_MIN = 42002
export const DPI_EXTENDED_FLAG = 0x11

export const POLLING_RATES = [
  { hz: 125, value: 8 },
  { hz: 250, value: 4 },
  { hz: 500, value: 2 },
  { hz: 1000, value: 1 },
  { hz: 2000, value: 16 },
  { hz: 4000, value: 32 },
  { hz: 8000, value: 64 },
]

export const LOD_OPTIONS = [
  { label: '0.7 mm', value: 1 },
  { label: '0.9 mm', value: 2 },
  { label: '1.2 mm', value: 3 },
  { label: '1.4 mm', value: 4 },
  { label: '1.6 mm', value: 5 },
]

// Sleep time em unidades de 10 s.
export const SLEEP_OPTIONS = [
  { label: '10 s', value: 1 },
  { label: '30 s', value: 3 },
  { label: '1 min', value: 6 },
  { label: '5 min', value: 30 },
  { label: '10 min', value: 60 },
  { label: '30 min', value: 180 },
]

// LED de DPI: modo fixo (0 = desligado, 1 = fixo, 2 = respiração), brilho 0..255.
export const DPI_EFFECT_OFF = 0
export const DPI_EFFECT_STEADY = 1
export const DPI_EFFECT_MAX_BRIGHTNESS = 255

// Tensão da bateria (mV) a cada 5%, de 0% a 100%: a mesma tabela do hub oficial.
export const BATTERY_VOLTAGE_TABLE = [
  3050, 3420, 3480, 3540, 3600, 3660, 3720, 3760, 3800, 3840, 3880, 3920, 3940, 3960, 3980, 4000, 4020, 4040, 4060,
  4080, 4110,
]

// Piscada de troca de perfil interno, como vem de fábrica (lida do mouse).
export const PROFILE_LED_FACTORY_COLOR = '#ff00ff'
export const PROFILE_LED_FACTORY_BRIGHTNESS = 0x80


export const DEFAULT_SETTINGS = {
  dpi: 800,
  pollingRate: 1000,
  lod: 1,
  sleepTime: 6,
  color: '#a855f7',
  competitiveMode: false,
  fps20k: false,
  // DPI separado por eixo: com `dpiXY`, `dpi` vale para o eixo X e `dpiY` para o Y.
  dpiXY: false,
  dpiY: 800,
  // Opções do sensor, com os padrões de fábrica do V8S (configuração do hub).
  motionSync: true,
  rippleControl: false,
  angleSnapping: false,
}

// Opções liga/desliga do sensor: campo do perfil -> endereço na memória do mouse.
export const SENSOR_TOGGLES = [
  { key: 'motionSync', address: ADDR.MOTION_SYNC },
  { key: 'rippleControl', address: ADDR.RIPPLE_CONTROL },
  { key: 'angleSnapping', address: ADDR.ANGLE_SNAPPING },
]

/** DPI efetivo de cada eixo de um perfil. */
export const profileDpiAxes = (profile) => ({
  x: profile.dpi,
  y: profile.dpiXY ? (profile.dpiY ?? profile.dpi) : profile.dpi,
})

// Tempo máximo esperando o ACK da MCU antes de considerar o envio como falho.
export const ACK_TIMEOUT_MS = 1000

// Intervalo da consulta "mouse ligado?" ao receptor sem fio, igual ao hub:
// 1,5 s enquanto espera o mouse ligar; 5 s com ele ligado, para não
// sobrecarregar o link sem fio nem atrapalhar o sleep do mouse.
export const ONLINE_POLL_OFFLINE_MS = 1500
export const ONLINE_POLL_ONLINE_MS = 5000
// Sem nenhuma resposta do receptor nesse tempo, considera o mouse desligado.
export const ONLINE_TIMEOUT_MS = 12000
// "Em repouso" que chega até esse tempo após um sinal de vida do mouse é ignorado.
export const ACTIVITY_GRACE_MS = 4000
// Tentativas por comando quando a MCU não responde (o link sem fio pode estar acordando).
export const COMMAND_ATTEMPTS = 3
