# Handoff curto — Mapa da B3

Atualizado em 04/09/2026. Este arquivo resume o estado do projeto para iniciar
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
- 222 ETFs nas seis categorias oficiais consultadas na B3.
- Seções: visão geral, empresas, BDRs, ETFs, carteira local, radar de listagens e metodologia.
- Carteira local aceita ticker, quantidade e preço médio e também torna os BDRs favoritos
  fáceis de localizar; nenhum dado pessoal é enviado ao servidor.
- URLs compartilham seção, ficha, modo, filtros e ordenação.
- Favoritos e comparação de BDRs permanecem locais no navegador.
- Preços vêm do Yahoo Finance e históricos/paridade possuem arquivos separados.
- O contrato da classificação detalhada dos ETFs está em
  `etfs-detalhes.schema.json`, com regras editoriais em `ETFS-DETALHES.md` e um piloto
  curado de 15/222 fundos em `etfs-detalhes.json`, já integrado às fichas correspondentes.

O projeto é HTML, CSS e JavaScript puro, sem framework, bundler ou dependências.
Não alterar essa arquitetura. Os `fetch()` precisam continuar relativos e os
JSONs de runtime devem permanecer separados.

## Alterações atuais não commitadas

As alterações abaixo estão no diretório de trabalho, mas ainda não foram
commitadas nem publicadas:

- botão **atualizar cotações** recarrega o `precos.json` publicado sem cache e
  preserva os preços já exibidos se a recarga falhar;
- nova seção **Carteira**, mantida em `localStorage`, aceita ticker, quantidade e
  preço médio e calcula custo, valor atual e resultado bruto;
- favoritos de BDR ficaram visíveis na Carteira e no botão de acompanhamento;
- `etfs-detalhes.schema.json` definiu o contrato e 15 vocabulários controlados para
  índice, classe, foco, geografia, estratégia, exposição, câmbio e carteira;
- `ETFS-DETALHES.md` fixou regras editoriais e exigência de fontes oficiais sem
  inferência pelo nome do fundo;
- `etfs-detalhes.json` contém LFTS11, WRLD11, USTK11, GLDX11, HASH11, HERT11,
  BOVA11, SMAL11, BNDX11, DOLA11, DIVO11, ISUS11, NTNS11, LFIX11 e GOAT11,
  com fontes oficiais e ligação protegida por ticker + `idB3`;
- o piloto levou o contrato à versão 2 e passou a distinguir posição direta de
  abertura econômica `look-through`;
- as fichas dos quinze ETFs curados mostram resumo, índice, classificação, implementação,
  posições, exposições, CNPJ, gestor e fontes; os demais mantêm a ficha anterior;
- a aba de ETFs usa a taxonomia em filtros de cobertura, classe real, foco, geografia e
  características, mostra badges na tabela e nos cards e preserva o recorte na URL;
- testes específicos de carteira, recarga de preços e taxonomia foram ligados ao
  workflow de validação.

Arquivos modificados:

`.github/workflows/valida.yml`, `AGENTS.md`, `CONTEXTO.md`, `README.md`, `index.html`,
`scripts/valida-pagina.js`, `scripts/valida-url.js`, `ETFS-DETALHES.md`,
`etfs-detalhes.json`, `etfs-detalhes.schema.json`, `scripts/testa-carteira.js`,
`scripts/testa-precos-ui.js` e `scripts/valida-taxonomia-etfs.js`.

Último commit anterior às mudanças: `7262af1` (`saude.json: regenera apos rebase
para refletir cotacoes mais recentes`). Branch atual: `main`.

## Verificações já concluídas

- Todos os validadores e testes Node do workflow passaram, inclusive os três
  testes novos.
- As fichas detalhadas e o fallback sem curadoria foram inspecionados no navegador
  integrado; os registros DOLA11 e GOAT11 também foram conferidos após as ampliações.
- O teste Python de eventos não rodou porque não há Python disponível neste host;
  nenhum arquivo Python foi alterado.

## Próxima entrega recomendada

Ampliar a curadoria em lotes pequenos, priorizando fatores ainda não cobertos, temas
globais e renda fixa por diferentes prazos. Cada lote deve passar pelo validador antes
de aparecer na ficha.

## Prompt curto para a próxima conversa

> Leia `AGENTS.md` e `CONTEXTO.md`. Continue a partir do estado não commitado
> atual. Primeiro revise o diff sem desfazer as mudanças existentes. Depois
> implemente apenas o próximo bloco recomendado: amplie `etfs-detalhes.json` com um
> novo lote pequeno e representativo, usando fontes oficiais e mantendo o validador verde.
> Não publique nem faça commit sem eu pedir.
