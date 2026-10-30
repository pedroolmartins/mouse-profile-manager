# Histórico de versões

Os instaladores de cada versão ficam em `release/<versão>/` (as versões anteriores são mantidas).

## 0.2.2 — 2026-10-30

### Novo
- **Mouse em uso pelo Windows (Raw Input)**: o app vê qual mouse está sendo mexido, clicado ou rolado. A troca de perfil por programa em foco vai sempre para o mouse que você está usando, e o card dele na página inicial ganha a tag **"Em uso"**.
- **Sleep do Kysona**: o card e o cabeçalho mostram "Offline · em sleep" quando o mouse dorme (pelo tempo sem uso e pelo aviso do receptor). Dormindo, o app para de consultar o mouse.
- **Sleep time nos perfis custom do Kysona** (10 s a 30 min, ou nunca), gravado no mouse ao ativar o perfil. O sleep time em uso é lido do mouse.
- Notificações de troca de perfil mostram o **nome do mouse** (popup junto ao ponteiro e notificação do Windows).
- Ao abrir o app ou reconectar um mouse, o card fica cinza, sem clique, com **"Lendo status..."** até o status do mouse chegar.

### Alterações
- **Modo nativo desabilitado** nos dois mouses: a alternância Custom/Nativo saiu da tela e o app usa só o modo custom. O modo nativo se mostrou muito instável, principalmente no Kysona, e com o modo padrão do app (custom) acaba sendo desnecessário. Quem estava no modo nativo volta sozinho para o custom assim que o mouse responde.
- A página inicial mostra só os mouses conectados ao computador (cabo ou receptor); sem nenhum, mostra um aviso.

### Correções
- O Kysona recebia as trocas por programa em foco enquanto o Scyrox estava em uso: num repouso curto do Scyrox, o app passava a considerar o Kysona o mouse em uso.

## 0.2.1 — 2026-10-29

### Correções
- Monitor do programa em foco sem PowerShell: um console oculto podia piscar e roubar o foco do jogo, e o processo separado podia travar. Agora a API do Windows é chamada direto pelo app.
- Troca de perfil por programa em foco atrasava com o app escondido na bandeja (o Chromium segurava os timers da janela oculta).

## 0.2.0 — 2026-10-26

### Novo
- Suporte ao **Kysona Mercury Pro** (cabo e receptor 2.4G 8K):
  - Modo **nativo**: os 8 perfis do mouse, com DPI em uso e estágios de cada um, nomes para as notificações e troca nativa pelo botão inferior (opcional).
  - Modo **custom**: perfis do app (DPI com X/Y, polling rate e cor) gravados no perfil ativo do mouse; o perfil nativo é guardado e restaurado ao voltar.
  - Botão inferior troca perfis custom sem fazer DPI Loop.
  - Aba **Apps**: troca de perfil pelo programa em foco.
  - Bateria pelo receptor; no cabo, indicação de carregando.
- Troca de perfil por programa em foco aplica só no **mouse em uso** (conectado e acordado; com dois, o usado por último).
- Faixa de carregamento com progresso durante comandos longos (V8S e Kysona).

### Melhorias
- Bateria do V8S calculada pela tensão, como no hub oficial.
- Ícone de carregamento no seletor de modo; ícones de informação mais discretos.
- Aba Apps, regras de apps, troca por programa em foco, switch de opção e cards de perfil viraram componentes compartilhados entre os dispositivos.

### Correções
- Balões de informação do seletor de modo saíam da tela.
- Modo nativo do V8S: troca pelo botão inferior gravada nos 4 perfis; piscada de troca de perfil de fábrica restaurada.

## 0.1.0 — 2026-10-23

Primeira versão, para o **Scyrox V8S**.

### Novo
- Perfis custom: DPI (com X/Y separados), polling rate, LOD, sleep, cor do LED, Motion Sync, Ripple Control, Angle Snapping, Modo Competitivo e 20K FPS.
- Troca de perfil pelo botão inferior (alternando dois estágios de DPI), sem cliques perdidos.
- Modo nativo: os 4 perfis do mouse em cards, nomes para as notificações, link para o hub oficial; o perfil nativo é guardado ao ir para o custom e restaurado ao voltar.
- Aba Apps: troca de perfil pelo programa em foco, com ícone do programa e volta ao perfil anterior.
- Aviso a cada troca: popup junto ao ponteiro ou notificação do Windows.
- Página inicial com cards de dispositivo, bateria, estado de carga, versões de firmware e indicação de repouso.
- Bandeja do Windows, iniciar com o Windows, iniciar minimizado, fechar para a bandeja.
- Instalador para Windows.

### Correções durante o desenvolvimento
- Formato do comando de DPI e endereço da memória (big-endian) corrigidos a partir de capturas USB.
- Cor do LED aparecendo na hora e acesa só por alguns segundos após cada troca.
- Ativações com o mouse em repouso ficam guardadas e são aplicadas quando ele acorda.
- Pasta de dados fixa (`%APPDATA%\v8s`) para não perder perfis ao renomear o app.
