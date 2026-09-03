# Contexto do projeto — Mapa da B3

Leia isto antes de editar qualquer coisa. O projeto tem decisões deliberadas que
parecem erro à primeira vista, e o modo de falha mais comum é um agente "melhorar"
algo que era intencional.

## O que é

Página única que mostra as companhias da B3 num treemap interativo, mais uma aba com
os BDRs de empresas negociados no Brasil. Cotações atualizadas automaticamente durante
o pregão.

- **369 empresas brasileiras** — dados curados à mão (categoria temática, tags de
  cruzamento, descrição de onde a empresa ganha dinheiro)
- **825 BDRs** — lista completa da B3, com país, setor, indústria traduzida e fonte da classificação

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
   │                fetch('metricas.json') ← indicadores históricos, carregado em runtime
   │                fetch('metricas-empresas.json') ← indicadores das empresas brasileiras
   │                fetch('analise.json')  ← ativo-lastro, paridade, câmbio e percentis
   │                fetch('eventos.json')  ← documentos recentes da CVM
   │                fetch('saude.json')    ← datas, coberturas e alertas das bases
   │
scripts/atualiza-precos.js   lê os tickers DO index.html + do bdrs.json → grava precos.json
scripts/gera-bdrs.js         API da B3 + perfis do Yahoo + complementos → grava bdrs.json
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

São **cinco seções**, uma por universo, controladas por `st.sec` e pela função `navega()`:

| Seção | `st.sec` | Contêiner |
|---|---|---|
| Visão geral | `geral` | `#secGeral` — montada por `geralHTML()` |
| Empresas brasileiras | `empresas` | `#secEmpresas` — mosaico ou tabela |
| BDRs | `bdrs` | `#secBdrs` — tabela ou cards |
| Radar de listagens | `radar` | `#secRadar` — montada por `radarHTML()` |
| Metodologia | `metodologia` | `#secMetodologia` |

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
- **`bdrs.json` não está no cron.** Preços e métricas têm automações próprias, mas a lista
  de BDRs muda raramente; rode `gera-bdrs.js` à mão quando precisar.
- **`metricas.json` tem cron diário separado.** Retornos usam 21/63/252 pregões ajustados;
  força relativa é a diferença para a mediana da indústria ou setor, e giro médio inclui
  sessões sem negócio. Não compare preços nominais de BDRs como medida de oportunidade.
- **Paridade não é preço justo.** `analise.json` combina o preço do ativo-lastro no Yahoo,
  a relação oficial do programa e a PTAX do Banco Central. Horários, liquidez, custos e
  tributos diferem; mantenha a linguagem de referência indicativa e o residual explícito.
- **Acompanhamento é local.** Favoritos ficam em `localStorage`; filtros e ficha aberta ficam
  na URL. Não introduza conta, backend ou sincronização sem uma decisão explícita do projeto.
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
3. Abrir uma ficha, apertar Esc, e o foco voltar para a linha ou card de origem
4. Nenhuma seção rola horizontalmente em 375 px de largura
5. Sem erro no console

Vale rodar também `node scripts/valida-bdrs.js`, que além da cobertura dos BDRs confere a
sintaxe do JavaScript embutido no `index.html` e se toda indústria tem tradução.

Atualizar dados:

```bash
node scripts/atualiza-precos.js   # rápido, ~13 requisições
node scripts/gera-bdrs.js         # lento, alguns minutos (1 requisição por empresa)
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
