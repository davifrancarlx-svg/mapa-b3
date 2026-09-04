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
  foco no fechamento; `wrap.inert` trava o fundo. Foi trabalho de acessibilidade feito de
  propósito, não sobra de código.
- **`txOn()`** — calcula luminância relativa e escolhe texto claro ou escuro conforme a cor
  de fundo do bloco. Sem isso o contraste quebra em várias categorias.
- **Setas ▲▼ junto da variação** — a direção não pode depender só de verde/vermelho, por
  causa de quem não distingue as duas cores. Não remova em nome do "visual mais limpo".

## Arquitetura e fluxo de dados

```
index.html          const D = {...}  ← 369 empresas, embutido no arquivo (fonte da verdade)
   │                fetch('precos.json')   ← cotações, carregado em runtime
   │                fetch('bdrs.json')     ← lista de BDRs, carregado em runtime
   │                fetch('etfs.json')     ← lista de ETFs, carregado em runtime
   │                fetch('etfs-detalhes.json') ← curadoria progressiva de índice e carteira
   │                fetch('metricas.json') ← indicadores históricos, carregado em runtime
   │                fetch('metricas-empresas.json') ← indicadores das empresas brasileiras
   │                fetch('analise.json')  ← ativo-lastro, paridade, câmbio e percentis
   │                fetch('eventos.json')  ← documentos recentes da CVM
   │                fetch('saude.json')    ← datas, coberturas e alertas das bases
   │                localStorage           ← carteira e acompanhamento locais
   │
scripts/atualiza-precos.js   lê os tickers DO index.html + do bdrs.json + do etfs.json → grava precos.json
scripts/gera-bdrs.js         API da B3 + perfis do Yahoo + complementos → grava bdrs.json
scripts/gera-etfs.js         API da B3 (fundos listados) + verificação de ticker no Yahoo → grava etfs.json
scripts/atualiza-metricas.js Yahoo diário ajustado → grava metricas.json
scripts/atualiza-metricas-empresas.js Yahoo diário ajustado → grava metricas-empresas.json
scripts/gera-bdrs-referencia.py PDFs oficiais do Banco B3 → grava bdrs-referencia.json
scripts/atualiza-analise.js ativo-lastro + PTAX + histórico → grava analise.json
scripts/atualiza-eventos.py conjunto IPE oficial da CVM → grava eventos.json
scripts/gera-saude.js cobertura e atualização → grava saude.json
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
iframe. Ele **não** tem as automações. Para atualizar lá, reenvie `index.html` e todos os
JSONs de runtime usados pelos `fetch()` relativos.

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
  `etfs-detalhes.json`; o contrato e os vocabulários ficam em
  `etfs-detalhes.schema.json`, com regras de preenchimento em `ETFS-DETALHES.md`. Essa
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
  ≥0) — ambos vêm do mesmo `calcula()` em `atualiza-metricas.js` e
  `atualiza-metricas-empresas.js`, ao lado de `min252`/`max252` que já existiam. O recorte
  BDR "Perto da mínima histórica" e a ordenação "Mais perto da mínima histórica" em
  Empresas usam esse campo — não derive a mínima no cliente a partir de `dd252`/`max252`;
  se o campo não existir na base, é porque ela é anterior a essa mudança e precisa rodar
  `atualiza-metricas.js`/`atualiza-metricas-empresas.js` de novo.
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

## Integridade editorial

O rodapé distingue explicitamente o que é dado oficial da B3, o que é estimativa e o que é
leitura analítica do autor. **Mantenha essa separação.**

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
