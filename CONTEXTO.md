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
- Oito seções: visão geral, empresas, BDRs, ETFs, carteira, favoritos, radar e metodologia.
- URLs compartilham seção, ficha, modo, filtros e ordenação.
- Favoritos, carteira e comparação permanecem locais no navegador.
- **23 validadores**, todos verdes, incluindo um que abre a página num Chrome headless.

O projeto é HTML, CSS e JavaScript puro, sem framework, bundler ou dependências —
agora inclusive sem o Google Fonts. Não alterar essa arquitetura. Os `fetch()`
precisam continuar relativos e os JSONs de runtime devem permanecer separados.

## Alterações não commitadas

Uma revisão completa em blocos. Nenhuma foi commitada nem publicada.

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

- **Bloco 4, pulado a pedido:** no celular a navegação tem 627 px de conteúdo em 335 px
  com `scrollbar-width:none`, então Favoritos, Radar e Metodologia ficam invisíveis, sem
  pista de que a barra rola. O mesmo vale para os recortes de exploração.
- O mosaico tem 369 paradas de Tab. Resolver exige `tabindex` rotativo com navegação por
  setas, que mexe perto do `squarify()`.
- Unificar `relativos()` entre os geradores — muda dado publicado.

## Próxima entrega recomendada

Commitar e publicar o que está acima, depois retomar a ampliação de
`etfs-detalhes.json` em lotes pequenos, com fontes oficiais e o validador verde.

## Prompt curto para a próxima conversa

> Leia `AGENTS.md` e `CONTEXTO.md`. Continue a partir do estado não commitado atual.
> Primeiro revise o diff sem desfazer as mudanças existentes. Não publique nem faça
> commit sem eu pedir.
