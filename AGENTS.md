# Contexto do projeto — Mapa da B3

Leia isto antes de editar qualquer coisa. O projeto tem decisões deliberadas que
parecem erro à primeira vista, e o modo de falha mais comum é um agente "melhorar"
algo que era intencional.

## O que é

Página única que mostra as companhias da B3 num treemap interativo, mais uma aba com
os BDRs de empresas negociados no Brasil e uma aba com os ETFs listados. Cotações
atualizadas automaticamente durante o pregão.

- **369 empresas brasileiras** — dados curados à mão (categoria temática, tags de
  cruzamento, descrição de onde a empresa ganha dinheiro)
- **825 BDRs** — lista completa da B3, com país, setor, indústria traduzida e fonte da classificação
- **222 ETFs** — lista completa da B3 nas seis categorias oficiais de fundo listado tipo
  ETF, com ticker e categoria; base deliberadamente mais enxuta que a de BDR (ver seção
  "Fonte dos dados")

## Regra número um: não reescreva o que já funciona

O `index.html` é **HTML + CSS + JS puro, escrito à mão, sem framework e sem build step**.
Isso é escolha, não limitação. Não converta para React/Vue/Svelte, não adicione bundler,
não extraia componentes, não instale dependência.

Em particular, **não toque nestas partes sem um motivo forte e específico**:

- **`squarify()`** — implementação própria do algoritmo de treemap "squarified". Funciona,
  é testada, e reescrever significa reintroduzir bugs de layout já resolvidos.
- **`peso()`** — `Math.pow(Math.max(e.vm, 1.5e9), .42)`. A raiz comprime a escala e o piso
  de R$ 1,5 bi impede que empresas pequenas virem blocos de 1 pixel. Trocar por linear
  faz a Petrobras engolir o mapa. É deliberado.
- **Gestão de foco do painel lateral** — `lastFocus` guarda quem abriu a ficha e devolve o
  foco no fechamento; `travaFundo()` trava o fundo. Foi trabalho de acessibilidade feito de
  propósito, não sobra de código. **Travar só `wrap.inert` não basta:** a `#cmpbar` é irmã
  de `.wrap`, não filha, e ficava alcançável por Tab a partir de um diálogo `aria-modal`
  (o `#dim` tem z-index maior e barrava o mouse, então o vazamento só aparecia no teclado).
  Por isso `travaFundo()`/`destravaFundo()` são o **único** lugar que escreve `wrap.inert`,
  e toda abertura de ficha passa por eles — `valida-pagina.js` reprova as quatro formas de
  quebrar isso, inclusive uma abertura nova que esqueça a chamada.
- **`txOn()`** — calcula luminância relativa e escolhe texto claro ou escuro conforme a cor
  de fundo do bloco. Sem isso o contraste quebra em várias categorias.
- **Setas ▲▼ junto da variação** — a direção não pode depender só de verde/vermelho, por
  causa de quem não distingue as duas cores. Não remova em nome do "visual mais limpo".
- **Tooltip do mosaico no foco, não só no `mousemove`** — numa tela de 1280 px, **182 dos
  369 blocos** são pequenos demais para caber rótulo (a condição é `t.w > 32 && t.h > 14`,
  e diminuir isso só produz texto cortado). Sem o `focusin`, quem navega por teclado
  recebia o anel de foco num retângulo colorido e mudo. Pelo mesmo motivo o `aria-label`
  do bloco carrega nome, códigos, categoria e preço — `rotuloTile()` —, e não só nome e
  categoria como antes: o teclado não pode receber menos do que o ponteiro. A direção da
  variação vai **escrita** ("alta de 1,25%"), porque leitor de tela lê a seta ▲ como
  "triângulo apontando para cima". O `focusout` só apaga quando o foco deixa o mosaico,
  senão piscaria a cada Tab, e Esc dispensa o tooltip sem tirar o foco do bloco.

## Arquitetura e fluxo de dados

```
index.html          const D = {...}  ← 369 empresas, embutido no arquivo (fonte da verdade)
   │  no boot        fetch('precos.json')   ← cotações, carregado em runtime
   │                 fetch('bdrs.json')     ← lista de BDRs, carregado em runtime
   │                 fetch('etfs.json')     ← lista de ETFs, carregado em runtime
   │                 fetch('etfs-detalhes.json') ← curadoria progressiva de índice e carteira
   │                 fetch('metricas.json') ← indicadores históricos, carregado em runtime
   │                 fetch('saude.json')    ← datas, coberturas e alertas das bases
   │  sob demanda    fetch('metricas-empresas.json') ← indicadores das empresas brasileiras
   │   (garante)     fetch('analise.json')  ← ativo-lastro, paridade, câmbio e percentis
   │                 fetch('eventos.json')  ← documentos recentes da CVM
   │                 localStorage           ← carteira e acompanhamento locais
   │
scripts/atualiza-precos.js   lê os tickers DO index.html + do bdrs.json + do etfs.json → grava precos.json
scripts/gera-bdrs.js         API da B3 + perfis do Yahoo + complementos → grava bdrs.json
scripts/gera-etfs.js         API da B3 (fundos listados) + verificação de ticker no Yahoo → grava etfs.json
scripts/lib/serie.js          núcleo compartilhado dos dois geradores de métricas
scripts/atualiza-metricas.js Yahoo diário ajustado → grava metricas.json
scripts/atualiza-metricas-empresas.js Yahoo diário ajustado → grava metricas-empresas.json
scripts/gera-bdrs-referencia.py PDFs oficiais do Banco B3 → grava bdrs-referencia.json
scripts/atualiza-analise.js ativo-lastro + PTAX + histórico → grava analise.json
scripts/atualiza-eventos.py conjunto IPE oficial da CVM → grava eventos.json
scripts/gera-saude.js cobertura e atualização das 8 bases → grava saude.json
scripts/gera-social.js mosaico real + PNG de mão → grava social.png (prévia de link)
```

**A lista de empresas mora dentro do `index.html`**, como um bloco `const D = {...}` em JSON
indentado. Os scripts localizam esse bloco pelo prefixo `const D = ` e delimitam o fim
casando chaves (com consciência de string). Consequências:

- O bloco tem que continuar sendo **JSON válido** (chaves com aspas duplas). Convertê-lo
  para objeto JS com chaves sem aspas ou aspas simples quebra os dois scripts em silêncio.
- Fica indentado de propósito, para dar diff legível. Não minifique.

**Os arquivos JSON de runtime são separados, e precisam continuar sendo.** O
GitHub Actions commita o `precos.json` sozinho a cada 30 min; embutir os preços no HTML
mataria a atualização automática.

**Três bases entram sob demanda, não no boot.** `analise.json`, `metricas-empresas.json`
e `eventos.json` somam 3 MB e nenhuma delas desenha a Visão geral: a primeira só aparece
na ficha de BDR, na comparação e no CSV; a segunda na ordenação "mais perto da mínima",
na ficha de empresa e no CSV; a terceira no Radar e na ficha de empresa. Quem pede é
`garante(nome)`, que guarda a promessa e nunca repete a requisição. Os pontos de entrada
são três, e mexer em um sem os outros deixa buraco:

- `navega()` usa o mapa `DEPENDE` para adiantar a base da seção enquanto o usuário lê a tela;
- `abre()`, `abreBDR()` e `abreETF()` pedem a sua, porque Carteira e Favoritos abrem ficha
  de qualquer universo sem passar pela seção correspondente;
- `tentaAtivo()` pede a do universo do ativo, senão um link direto para uma ficha numa
  seção que não depende daquela base esperaria para sempre.

Os dois exportadores de CSV **conferem a base antes de gerar o arquivo** e pedem de volta
em vez de exportar coluna vazia: metade das colunas do CSV de BDR vem da análise, e vazio
ali seria indistinguível de dado ausente na fonte. Não remova essa guarda ao mexer no CSV.

**Não volte a carregar tudo no boot** "para simplificar": o ganho medido foi de 5,4 MB
para 2,3 MB decodificados na primeira tela.

`agendaRender()` agrupa numa janela de 32 ms os renders disparados por bases que chegam
juntas — no boot eram oito reconstruções da mesma tela. Todo `carrega*` chama
`agendaRender()`, nunca `render()` direto; a interação continua chamando `render()`
síncrono, porque ali o usuário está esperando o resultado do próprio clique. O agendador
é um timer, e **não** `requestAnimationFrame`: em aba de fundo o quadro não vem, o
agendamento ficaria preso e engoliria os renders seguintes.

Os `fetch()` usam **caminho relativo sem barra inicial** (`fetch('precos.json')`). Não troque
para `/precos.json` — o deploy do Lovable serve a página dentro de um iframe em subcaminho,
e a barra inicial quebraria lá.

## Arquitetura de navegação

São **oito seções**, uma por universo, controladas por `st.sec` e pela função `navega()`:

| Seção | `st.sec` | Contêiner |
|---|---|---|
| Visão geral | `geral` | `#secGeral` — montada por `geralHTML()` |
| Empresas brasileiras | `empresas` | `#secEmpresas` — mosaico ou tabela |
| BDRs | `bdrs` | `#secBdrs` — tabela, cards ou matriz |
| ETFs | `etfs` | `#secEtfs` — tabela ou cards |
| Carteira | `carteira` | `#secCarteira` — posições com quantidade e preço médio |
| Favoritos | `favoritos` | `#secFavoritos` — lista de acompanhamento, sem posição |
| Radar de listagens | `radar` | `#secRadar` — montada por `radarHTML()` |
| Metodologia | `metodologia` | `#secMetodologia` |

**Carteira e Favoritos são listas distintas e ficam em seções separadas.** Carteira
guarda posição (quantidade e preço médio, em `mapaB3Carteira`); Favoritos é só
observação (`mapaB3Favoritos`). Marcar uma estrela não cria posição, e vice-versa —
juntar as duas numa seção só já confundiu os dois papéis uma vez.

A aba de ETFs **não tem treemap nem matriz**, de propósito: como BDR, é um conjunto
grande e plano sem categoria hierárquica curada à mão (o treemap é exclusivo de
`empresas`) e, diferente de BDR, ainda não tem histórico de retorno/liquidez para
sustentar um eixo de dispersão. Não adicione um até existir um `metricas-etfs.json`.

**Mosaico e tabela são modos internos**, guardados em `st.modoEmp` e `st.modoBdr` — não são
irmãos de "BDRs" na navegação. Essa confusão era o principal problema da versão anterior:
o usuário não distinguia universo de modo de visualização. Não volte a misturar os dois.

A tabela de BDR é a visualização **padrão**, porque 825 cards não permitem comparar. Os
cards continuam disponíveis como alternativa. A ordenação por coluna vive em
`st.bdrSort` + `st.bdrDir`; `valorCol()` é o único lugar que sabe extrair o valor
comparável de cada coluna, e sempre joga ausência de dado para o fim, nas duas direções.

**A tabela é desenhada por `desenhaTabelaBDR()`, não por `innerHTML = tabelaBDR()`.** São
825 linhas a 26 nós cada — 21 mil nós, cerca de 200 ms com layout, e isso acontecia a cada
tecla da busca e a cada clique de coluna. Duas correções, que precisam continuar juntas:

- **Marca de conteúdo.** As colunas saem de `cot()` e `met()`; quando `analise.json` ou
  `saude.json` chegam, o HTML é byte a byte o mesmo. A marca compara antes de tocar no DOM.
- **Cauda em lotes.** O primeiro lote (`LOTE_BDR`, 120 linhas) entra na hora e o resto entra
  em `setTimeout`, cedendo o fio entre lotes. Isso é **adiamento, não paginação**: ao fim as
  825 estão no DOM, e Ctrl+F, a contagem e o CSV continuam valendo sobre o recorte inteiro.
  Não troque por "carregar mais" com botão — a tabela existe porque 825 cards não comparam.

Três armadilhas que já custaram correção aqui: `cancelaCaudaBDR()` **precisa** baixar
`completaBDR`, senão sair da seção no meio deixa a tabela truncada e a marca diz que está
pronta; a guarda aceita `completaBDR || caudaBDR`, senão um render redundante no meio
reinicia a cauda do zero; e o fim da cauda chama `atualizaFavoritos()` e `atualizaSelecao()`,
porque as linhas do fim nascem depois e perderiam uma estrela marcada no meio do caminho.

**`atualizaFavoritos()` e `atualizaSelecao()` só escrevem quando o valor muda.** Reescrever
`textContent` idêntico em 825 estrelas suja o layout da tabela inteira — era o custo do
render que não mexe em nada (197 ms → 27 ms). A guarda já existia para as mensagens; vale
para os botões pelo mesmo motivo.

Os **recortes de exploração** (`RECORTES`) são atalhos declarados que combinam filtro e
ordenação. Cada um carrega o texto do critério que aplica, exibido na tela ao ser
selecionado. Eles **não são recomendação** e não podem ser renomeados para algo que sugira
isso ("melhores", "oportunidades", "comprar"). Todo recorte de ranking aplica um piso de
liquidez explícito — sem ele o topo vira papel que negociou uma única vez no período.

O estado compartilhável é restaurado por `leURL()` e escrito por `sincronizaURL()`. Antes
de ler cada universo, `padroesURL()` precisa zerar seus parâmetros: sem isso, voltar ou abrir
um link mais curto herda filtros da tela anterior. Nas empresas, a URL inclui modo, busca,
categorias, tags, combinação de tags, ordenação e regra de área. Nos BDRs, inclui também os
eixos da matriz. Filtros que podem conter vírgula são gravados como parâmetros repetidos;
não volte a serializá-los com `join(',')`. `refleteEstado()` mantém os controles visuais de
acordo com o estado lido. Rode `node scripts/valida-url.js` ao alterar qualquer parte disso.

## Onde está publicado

| Destino | URL | Estado |
|---|---|---|
| GitHub Pages | https://davifrancarlx-svg.github.io/mapa-b3/ | **canônico** — preços atualizam sozinhos |
| Lovable | https://mapa-b3.lovable.app | cópia estática, preços congelados na data do envio |

O Lovable recebeu uma cópia literal dos arquivos públicos dentro de `public/`, servida via
iframe. Ele **não** tem as automações. Para atualizar lá, reenvie `index.html`, todos os
JSONs de runtime usados pelos `fetch()` relativos, a `social.png` e a pasta `fontes/`
(essa última só uma vez: fontes não mudam a cada atualização de dados).

## Fonte dos dados, e por que essas

- **Cotações: Yahoo Finance** (`query1.finance.yahoo.com`), API **não oficial**, atraso de
  ~15 min. O endpoint em lote (`/v7/finance/quote`) exige cookie + crumb — há um passo de
  autenticação no script que parece gambiarra mas é necessário. O endpoint de símbolo único
  (`/v8/finance/chart`) dispensa auth, mas exigiria uma requisição por ticker.
- **Não use brapi.dev.** Foi avaliada e descartada: não tem mais tier gratuito, só um sandbox
  de 4 tickers. Precisaria de plano pago para as ~1300 ações do projeto.
- **Lista de BDRs: API oficial de empresas listadas da B3**
  (`listedCompaniesProxy/CompanyCall/GetCompaniesBDR`, parâmetros em base64). `codeCategoryBVMF`
  6 = não patrocinado, 3/4/5 = patrocinado I/II/III. As categorias 28/29/30 são BDRs de **ETF
  estrangeiro**, não de empresa — ficam de fora de propósito.
- **País/setor dos BDRs: Yahoo**, porque a B3 devolve "Não Classificados" para todos. Quando
  o perfil está ausente, `scripts/bdrs-complementos.json` usa página oficial da companhia
  ou documento regulatório e registra o link da fonte.
- **Lista de ETFs: API oficial de fundos listados da B3**
  (`fundsListedProxy/Search/GetListFunds`, parâmetros em base64 como no endpoint de BDR,
  mas outro sistema). `typeFund` cobre seis categorias (`ETF`, `ETF-RF`, `ETF-CRIPTO`,
  `ETF-INT-RF`, `ETF-FII`, `ETF-MOEDA`); cada uma já vem pronta como categoria, sem precisar
  de perfil externo. **Não existe fonte oficial limpa para índice de referência, taxa de
  administração ou patrimônio líquido por fundo** — o endpoint da B3 não tem detalhe por
  fundo, e a CVM (`dados.cvm.gov.br`, cadastro de fundos de índice) usa CNPJ como chave,
  sem correspondência com o `id` interno da B3. Cruzar as duas por nome arriscaria atribuir
  o patrimônio de um fundo a outro; por isso esses campos ficam de fora, e a ficha do ETF
  diz isso explicitamente em vez de fingir cobertura completa.
- **Detalhamento editorial dos ETFs:** os registros curados ficam em
  `etfs-detalhes.json`, e a cobertura aparece no diagnóstico de saúde como fonte
  `etfsDetalhes` — o universo é o **catálogo de ETF**, não a própria lista curada, porque
  a medida útil é quanto do catálogo já tem ficha. Entra **sem piso de cobertura**: a
  curadoria é progressiva e avança em lotes, então um limite ficaria vermelho para sempre
  e viraria ruído. O que faltava era o percentual aparecer — antes o único jeito de saber
  quantos fundos tinham ficha detalhada era abrir uma a uma. O contrato e os vocabulários
  ficam em `etfs-detalhes.schema.json`, com regras de preenchimento em `ETFS-DETALHES.md`. Essa
  camada deve permanecer separada de `etfs.json` e só pode ligar um registro ao catálogo
  pela coincidência de ticker e `idB3`, com CNPJ confirmado em fonte oficial. Não inferir
  índice, carteira, geografia ou estratégia apenas pelo nome do fundo. Ao alterar o
  esquema, rode `node scripts/valida-taxonomia-etfs.js`.
- **Ativo-lastro e relação do programa: descritivos operacionais oficiais do Banco B3.**
  `scripts/gera-bdrs-referencia.py` lê os PDFs e registra o link específico de cada programa.
- **Câmbio de referência: PTAX do Banco Central do Brasil.** Histórico do ativo-lastro e do
  câmbio usado na decomposição vem do Yahoo e continua identificado como fonte não oficial.
- **Eventos corporativos: conjunto IPE oficial da CVM**, limitado a metadados e documentos
  recentes de categorias definidas no gerador.

## Armadilhas que causam quebra silenciosa

- **Preço zero não é cotação, é ausência de dado.** Ação parada volta do Yahoo com
  `regularMarketPrice: 0`, e zero passa por qualquer teste de tipo. O corte é explícito em
  dois lugares (no script, na origem; e em `cot()`, na exibição). Não remova nenhum dos dois.
- **`file://` bloqueia `fetch`.** Abrir o HTML com duplo clique mostra o mapa **sem preços e
  sem BDRs**, silenciosamente — a falha é capturada de propósito para a página não quebrar.
  Para testar de verdade, sirva por HTTP.
- **`bdrs.json` e `etfs.json` não estão no cron.** Preços e métricas têm automações
  próprias, mas as duas listas mudam raramente; rode `gera-bdrs.js`/`gera-etfs.js` à mão
  quando precisar.
- **`metricas.json` tem cron diário separado.** Retornos usam 21/63/252 pregões ajustados;
  força relativa é a diferença para a mediana da indústria ou setor, e giro médio inclui
  sessões sem negócio. Não compare preços nominais de BDRs como medida de oportunidade.
- **`dm252` é o espelho de `dd252`, calculado no servidor, não no cliente.** `dd252` é a
  queda desde a máxima de 252 pregões (sempre ≤0); `dm252` é a alta desde a mínima (sempre
  ≥0) — ambos vêm do mesmo `calcula()`, agora de fato o mesmo: ele mora em
  `scripts/lib/serie.js`, ao lado de `min252`/`max252` que já existiam. O recorte
  BDR "Perto da mínima histórica" e a ordenação "Mais perto da mínima histórica" em
  Empresas usam esse campo — não derive a mínima no cliente a partir de `dd252`/`max252`;
  se o campo não existir na base, é porque ela é anterior a essa mudança e precisa rodar
  `atualiza-metricas.js`/`atualiza-metricas-empresas.js` de novo.
- **Os dois geradores de métricas compartilham `scripts/lib/serie.js`, e precisam continuar
  compartilhando.** As duas bases publicam os mesmos campos com os mesmos nomes e a página
  mostra as duas lado a lado. Enquanto havia duas implementações de `calcula()`, elas
  divergiram em silêncio: o gerador de BDR tratava **volume ausente como zero** (contra o
  que a própria metodologia da página afirma) e calculava "giro médio de 60 pregões" com
  menos de 60 sessões — um registro chegou a declarar `d60: 24` com 30 sessões de
  histórico. A versão das empresas era a estrita e virou a referência. Regra: janela
  incompleta ou volume desconhecido devolve `null`, nunca um número. `scripts/testa-serie.js`
  reprova tanto a quebra das regras quanto um gerador que volte a ter cópia própria.
- **`relativos()` continua diferente nos dois geradores, de propósito.** A versão das
  empresas agrupa por grupo **e data final**, exclui registros preservados e exige três
  amostras, registrando o tamanho em `nc*`/`ng*`; a de BDR compara contra a mediana do
  grupo sem essas restrições, e quem filtra amostra pequena é o cliente, em `forcaBDR()`.
  Unificar muda a força relativa publicada dos BDRs — é decisão de produto, não limpeza.
- **A série do gráfico vem comprimida, e o campo `sp` não existe mais.** Ele era
  exatamente `spP` normalizado em base 100 — a mesma curva transportada duas vezes. Hoje
  a base grava só `spP` (preço ajustado) e `spO` (offset em dias corridos sobre
  `spInicio`), e `serieSpark()` reconstrói `sp` e as datas no cliente. Os dois lados
  fazem a conta **em UTC**: em fuso local a amostra andaria um dia. Não volte a gravar
  `sp` nem `spD` "para simplificar o cliente" — são 1 MB nas duas bases. Registros
  preservados após falha podem carregar o formato antigo adiante, e por isso
  `serieSpark()` e os validadores aceitam os dois; um registro novo com `sp` gravado é
  erro e o validador reprova.
- **Paridade não é preço justo.** `analise.json` combina o preço do ativo-lastro no Yahoo,
  a relação oficial do programa e a PTAX do Banco Central. Horários, liquidez, custos e
  tributos diferem; mantenha a linguagem de referência indicativa e o residual explícito.
- **Acompanhamento e carteira são locais.** Favoritos, quantidade e preço médio ficam em
  `localStorage`; filtros e ficha aberta ficam na URL. Não introduza conta, backend ou
  sincronização sem uma decisão explícita do projeto.
- **Favorito vale para qualquer universo, mas o contador da tabela de BDR não.**
  `alternaFavorito()` aceita qualquer ticker resolvido por `ativoCarteira()` (empresa,
  BDR, ETF ou código presente nas cotações), e `leFavoritos()` aceita `AAAA9` e `AAAA99`.
  Já o botão "Acompanhando" da seção de BDR conta só `favoritosBDR()`: aquela tabela
  filtra BDRs e prometer um número que ela não pode mostrar é pior do que não contar.
  Pelo mesmo motivo, o painel de acompanhamento não trata favorito de empresa ou ETF
  como "código fora da base".
- **O botão "atualizar cotações" só relê o `precos.json` publicado.** Quem coleta no
  Yahoo é o GitHub Actions; a página é estática e não tem credencial. Por isso a
  mensagem distingue base nova de base igual — um "pronto" mudo já pareceu defeito.
- **Eventos não recebem resumo sintético.** `eventos.json` traz metadados e links oficiais da
  CVM. Exiba o original sem fingir interpretação editorial ou regulatória.
- **`FONTES` em `gera-saude.js` e `SAUDE_REGRAS` no `index.html` precisam ser idênticos.**
  `recebeSaude()` rejeita o arquivo inteiro se as chaves divergirem, de propósito: um
  diagnóstico parcial é pior do que nenhum, porque parece completo. Ao acrescentar fonte
  num, acrescente no outro — e dê a ela o texto próprio em `SEM_PISO` se não tiver piso de
  cobertura, senão ela herda a explicação de outra fonte e mente sobre o próprio motivo.
- **A classificação de BDR não pode ficar incompleta.** O gerador aborta se país, setor ou
  indústria faltar. Adicione o caso a `scripts/bdrs-complementos.json`, sempre com fonte
  oficial ou regulatória, e rode `node scripts/valida-bdrs.js`.
- **O `vm` (valor de mercado) é um retrato estático** da data do levantamento e **não
  acompanha o preço ao vivo**. Recalcular exigiria quantidade de ações em circulação, que não
  está na base. Os dois divergem com o tempo — e o rodapé da página declara isso. Não tente
  "corrigir" derivando valor de mercado do preço.
- **Tickers de BDR patrocinado não seguem o padrão `+34`.** Variam por programa (XP é
  `XPBR31`, Inter é `INBR32`, Aura é `AURA33`, PPLA é `PPLA35`). O `gera-bdrs.js` testa
  candidatos contra o Yahoo em vez de assumir sufixo.
- **Ticker de ETF assume `+11`, sem lista de sufixos alternativos.** Diferente do BDR
  patrocinado, nenhum contraexemplo foi encontrado até agora. Uma listagem oficial nova sem
  cotação positiva permanece no catálogo com `tickerVerificado: false`; uma falha transitória
  preserva um ticker antes confirmado com `stale: true`. O diagnóstico de saúde sinaliza os
  dois casos, e uma queda em massa da lista interrompe a geração antes de sobrescrever a base.
- **Os preços carregam depois do primeiro render**, de propósito: a página nunca fica em
  branco esperando rede.

## Prévia do link e tipografia

**O estado inteiro da tela vai na URL, então o link é a unidade de compartilhamento do
projeto.** O `<head>` carrega descrição, canonical, favicon, Open Graph e Twitter Card
para o link não chegar mudo. `valida-pagina.js` reprova a remoção de qualquer um deles.

**Nenhuma contagem nas meta tags.** Crawler não executa JS, então ali não há como derivar
de `E`/`BDR` — o número ficaria congelado no HTML e envelheceria sozinho, que é justamente
o problema resolvido no resto da página. O validador também reprova isso.

`social.png` é gerada por `node scripts/gera-social.js`: desenha o mosaico **real**, com o
`squarify()` extraído do próprio `index.html` (não reescrito — duas implementações já
divergiram uma vez neste projeto), e não escreve número nenhum, para não envelhecer com a
base. PNG e zlib de mão, sem dependência; a fonte do título é um bitmap 5×7 embutido,
porque rasterizar tipografia de verdade exigiria biblioteca. Regere ao mudar a paleta ou o
recorte de categorias. `og:image` precisa continuar **absoluta**: crawler não resolve
caminho relativo, e essa é a única exceção à regra de caminhos relativos do projeto.

**As fontes são auto-hospedadas em `fontes/`, e precisam continuar sendo.** O Google Fonts
era a única dependência externa de um projeto cuja regra número um é não ter nenhuma: tirava
o IP de cada visitante para o `gstatic.com`, punha um round-trip bloqueante antes do texto e
um ponto único de falha de terceiro. `node scripts/baixa-fontes.js` rebaixa os arquivos e
regenera `fontes/font-face.css` — rode só quando a tipografia mudar.

**Só o subset `latin`, e isso foi medido.** O português cabe inteiro em U+0000–00FF, e uma
varredura de `index.html`, `bdrs.json`, `etfs.json`, `etfs-detalhes.json`, `eventos.json` e
`analise.json` não achou **um** caractere que o `latin-ext` resolveria. O que sobra fora do
`latin` são símbolos (▲ ★ → ≥), que nenhum subset latino cobre e que já vinham da fonte de
sistema. Isso levou o custo de 821 KB em 18 arquivos para **370 KB em 9**. Não acrescente
subsets "por garantia" — meça antes, com o mesmo critério.

`valida-pagina.js` reprova qualquer recurso externo (`<link>`, `<script src>`, `url()` no
CSS) e qualquer `@font-face` apontando para arquivo ausente. Os `<a href>` externos das
fichas continuam valendo: são links que o usuário clica, não recursos carregados.

**Toda `var(--x)` de fonte tem de estar declarada.** Uma variável inexistente deixa o
`font-family` inválido e o elemento cai silenciosamente na fonte herdada, sem erro no
console — foi assim que `var(--sans)`, que nunca existiu, deixou o subtítulo da tabela em
mono no celular. O validador cobre isso.

**Botão sem `font-family` não herda a da página.** A estrela, a caixa de comparação e a
seta de detalhes vinham de Arial em 2.400 elementos da tabela, com tamanho e alinhamento
variando por sistema operacional. E `<b>` dentro de texto em mono pede o peso 700, que a
página não carrega: o navegador sintetizava o negrito. Por isso `b.num,.res .qt b,.cmpbar b`
fixam 600, o negrito de mono do projeto.

## Integridade editorial

O rodapé distingue explicitamente o que é dado oficial da B3, o que é estimativa e o que é
leitura analítica do autor. **Mantenha essa separação.**

**Nenhuma contagem em texto visível pode ser um literal.** Total de empresas vem de
`E.length`, de BDRs de `BDR.length`, e de categorias de `nCategorias()` — que conta os
`macro` distintos em uso, não as cores do tema. A Metodologia é justamente o texto que
promete rastreabilidade, e um `19` cravado ali passa a mentir na primeira categoria nova
sem que nada quebre. Os títulos de seção (`SECOES`) aceitam **função** em `k` e `d` por
isso; `cabecalhoSecao()` é chamado por `navega()` **e** por `render()`, porque o catálogo
de BDR só chega depois do primeiro desenho e o título precisa deixar de dizer "recibos de
depósito" quando o total existir.

Enquanto o catálogo não chega, o número **some** em vez de virar zero: `—` no contador, e
o total fora da frase. "0 BDRs no recorte" seria uma afirmação falsa sobre a base, não um
estado de carregamento. `valida-pagina.js` reprova o literal de volta, no script e no HTML.

As empresas brasileiras têm descrição e tags escritas à mão; os BDRs têm classificação
setorial rastreável, mas não têm tags de cruzamento nem análise autoral. Não gere descrições
sintéticas para BDR fingindo o mesmo nível de trabalho.

Nada na página é recomendação de investimento, e o texto reflete isso. Não adicione
linguagem que sugira conselho financeiro.

## Convenções de código

- **Comentários em português SEM acento** (`cotacoes`, `nao`, `referencia`) — ASCII puro.
  **Strings visíveis ao usuário COM acento** (`"Cotações"`, `"sem negociação"`). O código
  inteiro segue isso; mantenha.
- Comentário explica **por que**, não o que. O código já diz o que faz.
- Seções separadas por `/* ---------- nome ---------- */`.
- Nomes de variáveis curtos em português (`peso`, `filtra`, `desenha`, `abre`, `fecha`).
- Sem ponto e vírgula ausente, sem prettier: o estilo é compacto e denso de propósito.

## Como rodar e verificar

```bash
npx serve -l 4173 .
```

Acesse `http://localhost:4173`. Depois de qualquer mudança no `index.html`, vale conferir:

1. Em **Empresas brasileiras**, o mosaico desenha 369 blocos em 19 grupos
2. Em **BDRs**, a tabela lista 825 linhas e a ordenação por coluna inverte com o segundo clique
3. Em **ETFs**, a tabela lista as linhas do catálogo, o filtro de categoria funciona e a
   ordenação por coluna inverte com o segundo clique
4. Abrir uma ficha, apertar Esc, e o foco voltar para a linha ou card de origem
5. Nenhuma seção rola horizontalmente em 375 px de largura
6. Sem erro no console

**`node scripts/testa-navegador.js` faz esses seis itens sozinho**, num Chrome headless.
É o único teste que enxerga DOM: todos os outros rodam o código do `index.html` em `vm`
com DOM dublado, o que pega lógica mas não pega layout, foco nem rolagem. Os três defeitos
de acessibilidade corrigidos neste projeto — vazamento de foco da `cmpbar`, bloco de
mosaico sem rótulo, tooltip só no mouse — **passavam por todos os outros validadores**, e
foram reinjetados um a um para confirmar que este aqui reprova cada um.

Sem dependência e sem build, como o resto: servidor HTTP do próprio Node e Chrome por CDP
em WebSocket nativo. O runner `ubuntu-latest` já traz o `google-chrome-stable`, então não
há passo de instalação na CI; localmente ele procura nos caminhos usuais ou usa a variável
de ambiente `CHROME`. **Não troque por Playwright ou Puppeteer** sem uma decisão explícita:
seria o primeiro `package.json` do projeto e um download de navegador em toda execução.

As contagens que ele confere (369, 19, 825, 222) saem da própria página — `E.length`,
`nCategorias()`, `filtraBDR().length`, `ETF.length` — e não estão cravadas no teste, pelo
mesmo motivo do resto do projeto.

Vale rodar também `node scripts/valida-bdrs.js` e `node scripts/valida-etfs.js`, que além
da cobertura de cada catálogo conferem a sintaxe do JavaScript embutido no `index.html` e
se toda categoria/indústria tem tradução.

Atualizar dados:

```bash
node scripts/atualiza-precos.js   # rápido, ~13 requisições
node scripts/gera-bdrs.js         # lento, alguns minutos (1 requisição por empresa)
node scripts/gera-etfs.js         # lento, alguns minutos (1 requisição por fundo)
node scripts/valida-etfs.js
node scripts/atualiza-metricas.js # lento, historico diario de cada BDR
node scripts/valida-metricas.js
node scripts/atualiza-metricas-empresas.js
node scripts/valida-metricas-empresas.js
node scripts/atualiza-analise.js
node scripts/valida-analise.js
python scripts/atualiza-eventos.py
node scripts/valida-eventos.js
node scripts/gera-saude.js
node scripts/valida-saude.js
```

## Configuração do GitHub (não está no código)

Repositório precisa ser **público** (Actions e Pages ilimitados), Pages apontando para
`main` / `/`, e **Settings → Actions → General → Workflow permissions** em **Read and write**
— sem isso o workflow roda verde mas não consegue commitar o `precos.json`.
