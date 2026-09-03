# Handoff curto — Mapa da B3

Atualizado em 03/09/2026. Este arquivo resume o estado do projeto para iniciar
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
- Seções: visão geral, empresas, BDRs, ETFs, radar de listagens e metodologia.
- URLs compartilham seção, ficha, modo, filtros e ordenação.
- Favoritos e comparação de BDRs permanecem locais no navegador.
- Preços vêm do Yahoo Finance e históricos/paridade possuem arquivos separados.

O projeto é HTML, CSS e JavaScript puro, sem framework, bundler ou dependências.
Não alterar essa arquitetura. Os `fetch()` precisam continuar relativos e os
JSONs de runtime devem permanecer separados.

## Última entrega — revisão de ETFs e primeiro item das listas

As alterações abaixo estão no diretório de trabalho, mas ainda não foram
commitadas nem publicadas:

- corrigida a sobreposição do cabeçalho sobre o primeiro ativo nas tabelas de
  empresas, BDRs e ETFs;
- catálogo de ETF atualizado de 219 para 222 registros oficiais;
- 219 tickers confirmados por cotação positiva no Yahoo;
- BRIA11, OBRA11 e LLBR11 vieram da B3, mas continuam sinalizados com
  `tickerVerificado: false` até haver confirmação de cotação positiva;
- interface mostra cobertura de preços, negociação no dia e tickers pendentes;
- tabela de ETF ganhou estado de negociação e aviso sobre preço nominal;
- ficha de ETF separa a fonte oficial B3 da verificação não oficial no Yahoo;
- gerador de ETF ganhou repetição de chamadas, preservação após falha, trava
  contra redução anormal do catálogo e gravação atômica;
- validadores conferem fonte, IDs B3, categorias, cobertura e impedem a volta da
  sobreposição da primeira linha;
- `saude.json` separa a integridade do catálogo da confirmação no Yahoo: os 222
  registros oficiais formam cobertura disponível de 100%, e o diagnóstico detalha
  os três tickers ainda não confirmados sem transformar isso em falha do catálogo.

Arquivos modificados:

`AGENTS.md`, `README.md`, `etfs.json`, `index.html`, `saude.json`,
`scripts/gera-etfs.js`, `scripts/gera-saude.js`, `scripts/valida-etfs.js` e
`scripts/valida-pagina.js`.

Último commit anterior às mudanças: `453e12c` (`Adiciona aba de ETFs: catalogo
oficial da B3, cotacoes e interface propria`). Branch atual: `main`.

## Verificações já concluídas

- Todos os validadores e testes Node do workflow passaram.
- Empresas, BDRs e ETFs ficaram sem sobreposição na primeira linha.
- ETF foi conferido em desktop e 375 px, sem rolagem horizontal da página.
- Tabela, cards, filtro de renda fixa, ordenação, ficha compartilhável, retorno
  de foco e console foram testados no navegador.
- O teste Python de eventos não rodou porque não há Python disponível neste host;
  nenhum arquivo Python foi alterado.

## Próxima entrega recomendada

Criar `metricas-etfs.json` e os respectivos gerador e validador, seguindo a
metodologia de histórico diário ajustado já usada no projeto. Primeira versão:

1. retornos de 21, 63 e 252 pregões;
2. giro médio e dias negociados em 20 pregões;
3. distância da máxima e volatilidade;
4. datas, cobertura, preservação após falha e integração com `saude.json`;
5. somente depois, filtros e recortes de ETF com piso explícito de liquidez.

Não criar matriz, ranking ou linguagem de “melhores ETFs” antes dessa base.
Preço nominal isolado não mede oportunidade.

## Prompt curto para a próxima conversa

> Leia `AGENTS.md` e `CONTEXTO.md`. Continue a partir do estado não commitado
> atual. Primeiro revise o diff sem desfazer as mudanças existentes. Depois
> implemente apenas o próximo bloco recomendado: a base histórica de métricas
> para ETFs, com gerador, validação, saúde dos dados e testes. Não publique nem
> faça commit sem eu pedir.
