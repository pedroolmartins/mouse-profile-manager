# Histórico de versões

Os instaladores de cada versão ficam em `release/<versão>/` (as versões anteriores são mantidas).

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
