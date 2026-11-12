# Mouse Profile Manager

App de desktop para Windows e Linux (Ubuntu) que gerencia perfis de mouses gamer direto pelo USB, sem depender do hub oficial aberto no navegador. Troca de perfil pelo botão do mouse, pelo programa em foco ou pelo app, com aviso na tela a cada troca.

Mouses suportados:

| Mouse | Conexão |
|---|---|
| **Scyrox V8S** (PAW3955) | cabo e receptor 2.4G |
| **Kysona Mercury Pro** (PAW3395, chip PAN1080) | cabo e receptor 2.4G 8K |

Os perfis são do app (modo custom): o app grava o perfil escolhido no mouse a cada troca. O modo nativo (usar os perfis guardados no próprio mouse) foi desabilitado na 0.2.2: se mostrou muito instável, principalmente no Kysona, e com os perfis do app acaba sendo desnecessário.

> Projeto independente, sem relação com a Scyrox ou a Kysona. Os protocolos foram estudados a partir do tráfego USB e do código público dos hubs oficiais. Use por sua conta e risco.

## Para que serve

Os dois mouses guardam poucos perfis na memória e são configurados por hubs que rodam no navegador (WebHID). Eles servem para configurar o mouse uma vez, mas não para usar perfis no dia a dia. O Mouse Profile Manager fica na bandeja do Windows e:

- mantém **quantos perfis você quiser** e grava o perfil escolhido no mouse na hora;
- **troca de perfil sozinho conforme o programa em foco** (ex.: um perfil para cada jogo) e volta ao anterior quando você sai dele;
- deixa o **botão inferior do mouse trocar de perfil**, em vez de só fazer o DPI Loop;
- mostra **um aviso a cada troca** (popup junto ao ponteiro ou notificação do Windows), com o mouse, o perfil, o DPI e o polling rate;
- mostra **bateria**, conexão (cabo / sem fio / em sleep), versões de firmware e qual mouse está **em uso**;
- inicia com o Windows, minimizado na bandeja.

## Problemas dos hubs oficiais que ele resolve

### Gerais (Scyrox e Kysona)
- **Precisam do navegador aberto**: são páginas web; fechou a aba, acabou a configuração. Este app roda em segundo plano, na bandeja.
- **Sem troca automática por programa**: nenhum dos hubs troca de perfil conforme o jogo/programa em foco.
- **Sem aviso de troca**: trocar de perfil no mouse não mostra nada na tela; aqui aparece o mouse, o nome do perfil, o DPI e o polling rate.
- **Poucos perfis**: limitados aos perfis da memória do mouse (4 no V8S, 8 no Mercury Pro). Os perfis do app não têm limite.
- **Um mouse por vez**: com dois mouses, o app aplica o perfil do programa em foco **só no mouse em uso**, o último mexido, clicado ou rolado (visto pelo Raw Input do Windows) entre os acordados. Nunca grava em mouse desconectado ou dormindo, nem nos dois.

### Scyrox (hub scyrox.net) — V8S
- O hub **não oferece troca de perfil pelo botão inferior** para o V8S (a função existe no firmware, mas não aparece). O app faz isso alternando dois estágios de DPI.
- O percentual de bateria do app é calculado pela tensão, como o hub, em vez do valor arredondado que o mouse informa.

### Kysona (hub GearHub, qmk.top) — Mercury Pro
- O hub **não deixa remapear o botão inferior** do Mercury Pro (só 7 botões aparecem). O app troca de perfil por ele, sem DPI Loop.
- O **polling rate e o sleep time "por perfil" do hub ficam só no navegador**: no mouse eles são únicos, e trocar de perfil fora do hub mantém os valores anteriores. Cada perfil do app tem os seus, gravados no mouse a cada troca.
- O receptor **não informa de forma confiável quando o mouse dorme**. O app deduz pelo tempo sem uso (Raw Input do Windows) e pelo sleep time lido do mouse, e mostra "Offline · em sleep".

## Recursos

**Perfis**
- V8S: DPI (com X/Y separados), polling rate, LOD, sleep, cor do LED, Motion Sync, Ripple Control, Angle Snapping, Modo Competitivo e 20K FPS.
- Kysona: DPI (com X/Y separados), polling rate, sleep time e cor do LED.
- Troca pelo botão inferior, sem cliques perdidos (cliques durante uma gravação entram em fila).

**Apps**
- Lista de programas por dispositivo, cada um com o seu perfil; ícone do programa; volta ao perfil anterior ao sair.

**Dispositivos**
- Página inicial com um card para cada mouse conectado: conexão, bateria, perfil ativo e a tag "Em uso" no mouse que está sendo usado.

**Geral**
- Bandeja do sistema, iniciar com o sistema (Windows ou Linux), iniciar minimizado.
- Faixa de progresso durante comandos longos; log de comunicação (opcional, para diagnóstico).

## Instalação

Baixe a versão mais recente em **[Releases](../../releases)**.

### Windows

Execute `Mouse Profile Manager Setup <versão>.exe`. O instalador não é assinado digitalmente; o Windows pode mostrar o aviso de "editor desconhecido".

### Linux (Ubuntu e derivados)

**Pacote .deb (recomendado)**:

```bash
sudo apt install ./Mouse-Profile-Manager-<versão>-amd64.deb
```

O pacote instala também a regra udev que dá ao usuário logado acesso aos mouses (sem ela, o app não consegue falar com eles) e o `x11-utils` (usado pelo monitor do programa em foco). Para remover: `sudo apt remove mouse-profile-manager`.

**AppImage**: torne o arquivo executável e instale a regra udev uma vez (`70-mouse-profile-manager.rules`, anexada à mesma release):

```bash
chmod +x Mouse-Profile-Manager-<versão>-x86_64.AppImage
sudo cp 70-mouse-profile-manager.rules /etc/udev/rules.d/
sudo udevadm control --reload-rules && sudo udevadm trigger
```

O AppImage precisa do `xprop` (pacote `x11-utils`) para a troca por programa em foco.

**Limitações no Linux**:
- **Troca por programa em foco**: funciona com janelas X11, o que inclui os jogos pelo Steam/Proton/Wine também numa sessão Wayland (eles rodam pelo XWayland). Os nomes dos jogos do Windows são os mesmos (`jogo.exe`), então as regras da aba Apps valem nos dois sistemas. Programas nativos do Wayland em foco não são vistos.
- O popup junto ao ponteiro pode não acompanhar o ponteiro numa sessão Wayland; a notificação do sistema funciona em qualquer sessão.

**Não deixe o hub oficial aberto junto com o app**: os dois falam com o mesmo receptor e um atrapalha as respostas do outro.

## Rodar a partir do código

Requisitos: Windows ou Linux, [Node.js](https://nodejs.org/) 20 ou mais novo.

```bash
npm install
npm run dev
```

Gerar o instalador (sai em `release/<versão>/`):

```bash
npm run dist          # Windows (NSIS)
npm run dist:linux    # Linux (AppImage e .deb), num Linux ou no Docker
```

No Windows, os pacotes Linux saem pelo Docker (imagem `electronuserland/builder`):

```bash
npx vite build
docker run --rm -v "$PWD:/project" -w /project electronuserland/builder:20 node node_modules/electron-builder/cli.js --linux --x64 --config.npmRebuild=false
```

## Estrutura

```
electron/               processo principal: janela, bandeja, notificações, monitor de foco, uso dos mouses (Raw Input; /dev/input no Linux), permissões WebHID
build/linux/            regra udev e scripts do pacote .deb
src/
  hid/                  protocolo e serviço WebHID do Scyrox V8S
  stores/               driver (mouse.js) e perfis (profiles.js) do V8S
  devices/
    registry.js         lista de dispositivos suportados
    kysona/             protocolo, serviço, driver e telas do Kysona Mercury Pro
  composables/          lógica compartilhada: regras de apps, troca por programa em foco, mouse em uso
  components/           telas e componentes compartilhados (cards de perfil e de dispositivo, aba Apps…)
```

Para adicionar outro mouse, veja as instruções no topo de `src/devices/registry.js`.

## Avisos

- Os protocolos não são documentados pelos fabricantes; versões de firmware diferentes podem se comportar de outro jeito.
- Gravações erradas em botões podem exigir um **reset de fábrica pelo hub oficial**. O app confere a tabela de botões inteira a cada gravação e para se algo inesperado mudar.

## Histórico de versões

Veja o [CHANGELOG](CHANGELOG.md).

## Licença

[MIT](LICENSE)
