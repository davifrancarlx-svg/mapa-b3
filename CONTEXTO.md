# Handoff curto — Mapa da B3

Atualizado em 06/09/2026. Este arquivo resume o estado do projeto para iniciar
uma nova conversa sem reconstruir o histórico. As regras técnicas completas e
obrigatórias estão em `AGENTS.md`; detalhes operacionais estão em `README.md`.

## Objetivo

Ferramenta de exploração para localizar o que investigar no mercado brasileiro,
com foco em categorização, preço, histórico e liquidez. Não produz recomendação
de investimento nem nota composta.

Publicação canônica: <https://davifrancarlx-svg.github.io/mapa-b3/>

Repositório: <https://github.com/davifrancarlx-svg/mapa-b3>

## Estado atual

- 369 empresas brasileiras, curadas manualmente em `const D` dentro de `index.html`.
- 825 BDRs, com país, setor, indústria traduzida e fonte rastreável.
- 222 ETFs nas seis categorias oficiais, com 15 detalhados em `etfs-detalhes.json`.
- 528 fundos imobiliários — **a lista completa que a B3 publica**. 476 (90,2%) com
  informe da CVM: 434 pelo ISIN e 42 pelo nome oficial completo, em último recurso e
  marcados. Classificados pela carteira declarada (220 tijolo, 121 fundo de fundos,
  79 papel, 35 híbrido, 73 sem carteira). Ver `FIIS.md`.
- Nove seções: visão geral, empresas, BDRs, ETFs, FIIs, carteira, favoritos, radar
  e metodologia.
- URLs compartilham seção, ficha, modo, filtros e ordenação.
- Favoritos, carteira e comparação permanecem locais no navegador.
- **27 validadores**, todos verdes, incluindo um que abre a página num Chrome headless
  com 30 verificações.
- Seis bases entram sob demanda, e falha de carga tem estado próprio: a página
  distingue "carregando" de "não foi possível" e volta a tentar sozinha.
- **Oito seções**: a Metodologia foi removida a pedido do autor.
- A carteira atravessa desktops por um `carteira.json` cifrado com WebCrypto.

O projeto é HTML, CSS e JavaScript puro, sem framework, bundler ou dependências —
agora inclusive sem o Google Fonts. Não alterar essa arquitetura. Os `fetch()`
precisam continuar relativos e os JSONs de runtime devem permanecer separados.

## Revisão em blocos (commitada e publicada)

Commits `aea6a93` e `7d979e0` em `main`, publicados no GitHub Pages e no Lovable.

**Carga e render**
- Três bases pesadas (`analise.json`, `metricas-empresas.json`, `eventos.json`) entram
  sob demanda via `garante()`, não no boot. Pontos de entrada: `navega()`, as funções que
  abrem ficha e `tentaAtivo()`.
- A série do gráfico foi comprimida: `sp` saiu da base (era `spP` normalizado, derivado no
  cliente) e `spD` virou `spO`, offset em dias sobre `spInicio`, em UTC dos dois lados.
- `agendaRender()` agrupa em 32 ms os renders de bases que chegam juntas.
- **Primeira tela: 5,4 MB → 1,6 MB decodificados; 273 KB transferidos.**

**Acessibilidade**
- `travaFundo()`/`destravaFundo()` são o único lugar que escreve `wrap.inert`, e travam
  também a `#cmpbar` — que é irmã de `.wrap` e ficava alcançável por Tab a partir de um
  diálogo `aria-modal`.
- Tooltip do mosaico aparece no `focusin`, não só no `mousemove`: 182 dos 369 blocos são
  pequenos demais para caber rótulo. O `aria-label` passou a trazer nome, códigos,
  categoria e preço, com a direção da variação escrita por extenso.

**Desempenho da tabela de BDR**
- `desenhaTabelaBDR()` compara o conteúdo antes de tocar no DOM e entrega o primeiro lote
  na hora, com o resto em `setTimeout` — adiamento, não paginação: ao fim as 825 estão no
  DOM. `atualizaFavoritos()` e `atualizaSelecao()` só escrevem quando o valor muda.
- **Render de 197 ms → 27 ms (redundante) e 57 ms (clique de coluna).**

**Dados**
- `scripts/lib/serie.js` unifica o núcleo dos dois geradores de métricas. Havia duas
  `calcula()` divergentes: a de BDR tratava **volume ausente como zero**, contra a própria
  metodologia da página, e calculava giro de 60 pregões com menos de 60 sessões. Dezoito
  registros de `metricas.json` foram alinhados à regra estrita.
- `relativos()` continua diferente nos dois geradores, **de propósito** — unificar mudaria
  a força relativa publicada dos BDRs, e isso é decisão de produto.

**Integridade e distribuição**
- Toda contagem em texto visível é derivada (`E.length`, `BDR.length`, `nCategorias()`).
- `etfs-detalhes.json` entrou no diagnóstico de saúde como oitava fonte, sem piso de
  cobertura: mostra 15/222 (6,8%) sem virar alarme permanente.
- `<head>` ganhou descrição, canonical, favicon, Open Graph e Twitter Card; `social.png` é
  gerada por `scripts/gera-social.js` em Node puro.
- Fontes auto-hospedadas em `fontes/` (163 KB, 5 arquivos, só o subset `latin` — medido:
  o `latin-ext` não resolve **nenhum** caractere da base).
- Corrigidos: `var(--sans)` que nunca existiu, 2.399 elementos caindo em Arial e 43
  negritos sintéticos.
- Os três workflows que commitam `saude.json` passaram a compartilhar o grupo
  `commit-dados`.

**Testes**
- `scripts/testa-navegador.js`: 16 verificações num Chrome headless, por CDP puro, sem
  dependência. Cobre o checklist manual inteiro do `AGENTS.md`.
- Novos: `testa-serie.js`, `testa-navegador.js`, `gera-social.js`, `baixa-fontes.js`.
- `valida-pagina.js` ganhou invariantes estruturais: trava de foco, contagens derivadas,
  meta tags, variáveis CSS declaradas e ausência de recurso externo.

## Arquivos alterados

`index.html`, `AGENTS.md`, `README.md`, `CONTEXTO.md`, `metricas.json`,
`metricas-empresas.json`, `saude.json`, `social.png` (novo), `fontes/` (nova),
`.github/workflows/{valida,precos,metricas,eventos}.yml`, e em `scripts/`:
`lib/serie.js`, `testa-serie.js`, `testa-navegador.js`, `gera-social.js`,
`baixa-fontes.js` (novos), `atualiza-metricas.js`, `atualiza-metricas-empresas.js`,
`valida-pagina.js`, `valida-metricas.js`, `valida-metricas-empresas.js`,
`valida-comparador.js`, `valida-acompanhamento.js`, `gera-saude.js`, `testa-saude.js`,
`testa-csv.js`, `testa-precos-ui.js`, `testa-metricas-empresas.js`.

## Verificações concluídas

- Os 23 validadores passam, incluindo o de navegador.
- Cada invariante novo foi provado por mutação em sandbox: o teste de navegador reprova
  os 6 defeitos reinjetados, e `valida-pagina.js` reprova as 14 regressões estruturais.
- O teste Python de eventos não rodou: não há Python neste host. Nenhum arquivo Python
  foi alterado.

## Pendências deliberadas

- **Mobile saiu do escopo (06/09/2026).** O uso é só desktop; ver "Público e plataforma"
  no `AGENTS.md`. O diagnóstico fica registrado caso volte: em 375 px a navegação tem
  627 px de conteúdo em 335 px, e quatro das oito seções ficam invisíveis. **Não é
  pendência.**
- O mosaico tem 369 paradas de Tab. Resolver exige `tabindex` rotativo com navegação por
  setas, que mexe perto do `squarify()`.
- Unificar `relativos()` entre os geradores — muda dado publicado.

## Decisões declaradas em 06/09/2026

- **Fundos imobiliários entraram, com histórico.** Novo universo, pedido
  explicitamente e priorizado acima dos blocos de melhoria. `fiis.json` (catálogo,
  CVM, classificação) e `metricas-fiis.json` (399 fundos com histórico, 342 com
  distribuição). Duas decisões que estão em `FIIS.md` e não devem ser desfeitas:
  a série é o **preço**, não o ajustado (campos `vp*`), e a coluna de distribuição
  **não é dividend yield**.
- **ETFs ganharam histórico.** `metricas-etfs.json`, série ajustada e campos `r*`,
  comparáveis com BDR e empresas — o oposto do FII, e medido antes de decidir.
- **Correções de integridade.** Um literal de contagem que eu mesmo tinha introduzido
  na ficha de FII ("112 dos 528"), a fórmula do peso duplicada no mini mapa,
  `<main>` e link de pular, e `no-store` trocado por `no-cache` em todos os `fetch`.
  A regra de contagem literal deixou de ser uma lista curada e passou a ser genérica,
  cobrindo markup e script; sete regressões foram reinjetadas para provar que ela pega.
- **A Metodologia sai no futuro.** O autor declarou que a seção não lhe é útil. Ainda
  **não** é tarefa — esperar o pedido. Ao remover, lembrar que `SECOES`, `navega()`,
  `leURL()`/`padroesURL()`, `cabecalhoSecao()` e vários validadores citam
  `metodologia`, e que parte das contagens derivadas vive nesse texto.
- **A carteira precisa sobreviver à troca de desktop.** Hoje mora só em
  `localStorage` e zera em cada máquina. Isto é a "decisão explícita do projeto" que
  o `AGENTS.md` exigia para relaxar a regra de não ter sincronização. **Ponto em
  aberto antes de implementar:** o repositório é público, então commitar quantidade e
  preço médio publica a posição financeira do autor, e o histórico do git a preserva.

## Junção com a CVM: onde parou

A cobertura foi de 82,2% para **90,2%** com a camada 3 (nome oficial completo). Os 52
que faltam **não estão no informe da CVM**, ou estão sob um nome que nenhuma camada
alcança — não é limitação de código, é ausência de dado público ligando ticker a CNPJ.

Para eles existe `scripts/fiis-complementos.json`, que nasce vazio: cada entrada é um
CNPJ conferido à mão numa fonte oficial, com o link registrado, no mesmo padrão do
`bdrs-complementos.json`. Ele tem prioridade sobre as duas junções automáticas.

Dois pares aceitos pela camada 3 são plausíveis mas não prováveis pelo nome, e valeria
confirmá-los ali: **KOIM11** (Kinea Oportunidades Imobiliárias ↔ "Oportunidades
Imobiliárias I") e **PLAG11** (Pátria Logística Agro ↔ "Pátria Agro"), ambos com
Jaccard 0,67. Os dois trazem o aviso na ficha.

## O que sobrou

O backlog foi ao chão. O que resta são decisões de produto, não pendências:

- **Matriz de dispersão dos ETFs.** `metricas-etfs.json` destravou tecnicamente,
  mas seria um terceiro modo de visualização numa aba que hoje tem dois. Não foi
  feita de propósito — é escolha do autor, não impedimento.
- **FIAGRO (49) e FI-INFRA (41)** saem do mesmo endpoint da B3 com uma linha. **Não
  foram adicionados**, e não devem entrar na seção de fundos imobiliários sem
  decisão explícita: FIAGRO é agro, e misturá-lo ali quebraria o significado da
  seção. Se entrarem, entram como universo próprio.

Sem solução conhecida: separar rendimento de amortização nos FIIs. A CVM publica o
percentual de amortização mensal, mas ele identifica só 12 dos 54 fundos com
distribuição suspeita.

## Prompt curto para a próxima conversa

> Leia `AGENTS.md` e `CONTEXTO.md`. Continue a partir do estado não commitado atual.
> Primeiro revise o diff sem desfazer as mudanças existentes. Não publique nem faça
> commit sem eu pedir.
