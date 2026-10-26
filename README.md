# Mouse Profile Manager

App de desktop para Windows que gerencia perfis de mouses gamer direto pelo USB, sem depender do hub oficial aberto no navegador. Troca de perfil pelo botão do mouse, pelo programa em foco ou pelo app, com aviso na tela a cada troca.

Mouses suportados:

| Mouse | Conexão | Modo custom | Modo nativo |
|---|---|---|---|
| **Scyrox V8S** (PAW3955) | cabo e receptor 2.4G | ✓ | ✓ (4 perfis) |
| **Kysona Mercury Pro** (PAW3395, chip PAN1080) | cabo e receptor 2.4G 8K | ✓ | ✓ (8 perfis) |

> Projeto independente, sem relação com a Scyrox ou a Kysona. Os protocolos foram estudados a partir do tráfego USB e do código público dos hubs oficiais. Use por sua conta e risco.

## Para que serve

Os dois mouses guardam poucos perfis na memória e são configurados por hubs que rodam no navegador (WebHID). Eles servem para configurar o mouse uma vez, mas não para usar perfis no dia a dia. O Mouse Profile Manager fica na bandeja do Windows e:

- mantém **quantos perfis você quiser** (modo custom) e grava o perfil escolhido no mouse na hora;
- **troca de perfil sozinho conforme o programa em foco** (ex.: um perfil para cada jogo) e volta ao anterior quando você sai dele;
- deixa o **botão inferior do mouse trocar de perfil**, em vez de só fazer o DPI Loop;
- mostra **um aviso a cada troca** (popup junto ao ponteiro ou notificação do Windows), com nome, DPI e polling rate;
- mostra **bateria**, conexão (cabo / sem fio / em repouso) e versões de firmware;
- inicia com o Windows, minimizado na bandeja.

## Problemas dos hubs oficiais que ele resolve

### Gerais (Scyrox e Kysona)
- **Precisam do navegador aberto**: são páginas web; fechou a aba, acabou a configuração. Este app roda em segundo plano, na bandeja.
- **Sem troca automática por programa**: nenhum dos hubs troca de perfil conforme o jogo/programa em foco.
- **Sem aviso de troca**: trocar de perfil no mouse não mostra nada na tela; aqui aparece o nome do perfil, o DPI e o polling rate.
- **Poucos perfis**: limitados aos perfis da memória do mouse (4 no V8S, 8 no Mercury Pro). O modo custom não tem limite.
- **Um mouse por vez**: com dois mouses, o app aplica o perfil do programa em foco **só no mouse em uso** (conectado e acordado), sem gravar em mouse desconectado nem nos dois.

### Scyrox (hub scyrox.net) — V8S
- O hub **não oferece troca de perfil pelo botão inferior** para o V8S (a função existe no firmware, mas não aparece). O app faz isso: no modo custom alternando dois estágios de DPI, no modo nativo gravando a função nos 4 perfis.
- O percentual de bateria do app é calculado pela tensão, como o hub, em vez do valor arredondado que o mouse informa.

### Kysona (hub GearHub, qmk.top) — Mercury Pro
- O hub **não deixa remapear o botão inferior** do Mercury Pro (só 7 botões aparecem). O app troca de perfil por ele, sem DPI Loop.
- O **polling rate "por perfil" do hub fica salvo só no navegador**: o mouse tem um polling rate único, e trocar de perfil fora do hub mantém o valor anterior. O app guarda o polling rate de cada perfil e o reaplica a cada troca.
- O hub **não mostra o estado dos perfis inativos**. O app lê o DPI em uso de cada um dos 8 perfis.
- Modo custom: perfis do app gravados no perfil ativo do mouse, sem depender dos 8 perfis nativos (o perfil nativo é guardado e restaurado ao voltar).

## Recursos

**Modo custom** (perfis do app)
- V8S: DPI (com X/Y separados), polling rate, LOD, sleep, cor do LED, Motion Sync, Ripple Control, Angle Snapping, Modo Competitivo e 20K FPS.
- Kysona: DPI (com X/Y separados), polling rate e cor do LED.
- Troca pelo botão inferior, sem cliques perdidos (cliques durante uma gravação entram em fila).

**Modo nativo** (perfis guardados no mouse)
- Lista e ativa os perfis do mouse, com as configurações lidas dele.
- Renomeia os perfis para as notificações.
- Opção de troca pelo botão inferior gravada no próprio firmware.

**Apps**
- Lista de programas por dispositivo, cada um com o seu perfil; ícone do programa; volta ao perfil anterior ao sair.

**Geral**
- Bandeja do Windows, iniciar com o Windows, iniciar minimizado.
- Faixa de progresso durante comandos longos; log de comunicação (opcional, para diagnóstico).

## Instalação

Baixe o instalador da versão mais recente em **[Releases](../../releases)** e execute `Mouse Profile Manager Setup <versão>.exe`.

O instalador não é assinado digitalmente; o Windows pode mostrar o aviso de "editor desconhecido".

**Não deixe o hub oficial aberto junto com o app**: os dois falam com o mesmo receptor e um atrapalha as respostas do outro.

## Rodar a partir do código

Requisitos: Windows, [Node.js](https://nodejs.org/) 20 ou mais novo.

```bash
npm install
npm run dev
```

Gerar o instalador (sai em `release/<versão>/`):

```bash
npm run dist
```

## Estrutura

```
electron/               processo principal: janela, bandeja, notificações, monitor de foco, permissões WebHID
src/
  hid/                  protocolo e serviço WebHID do Scyrox V8S
  stores/               driver (mouse.js) e perfis (profiles.js) do V8S
  devices/
    registry.js         lista de dispositivos suportados
    kysona/             protocolo, serviço, driver e telas do Kysona Mercury Pro
  composables/          lógica compartilhada: regras de apps, troca por programa em foco, mouse em uso
  components/           telas e componentes compartilhados (cards de perfil, aba Apps, seletor de modo…)
```

Para adicionar outro mouse, veja as instruções no topo de `src/devices/registry.js`.

## Avisos

- Os protocolos não são documentados pelos fabricantes; versões de firmware diferentes podem se comportar de outro jeito.
- Gravações erradas em botões podem exigir um **reset de fábrica pelo hub oficial**. O app confere a tabela de botões inteira a cada gravação e para se algo inesperado mudar.

## Histórico de versões

Veja o [CHANGELOG](CHANGELOG.md).

## Licença

[MIT](LICENSE)
