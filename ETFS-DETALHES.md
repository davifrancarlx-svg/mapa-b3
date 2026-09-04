# Detalhamento dos ETFs — contrato editorial

Este documento acompanha `etfs-detalhes.schema.json`, que é a fonte de verdade
do formato e dos vocabulários controlados. A base `etfs-detalhes.json` é consumida
pela ficha dos ETFs e contém somente fundos que concluíram a curadoria; os demais
continuam com a identificação e a categoria oficial do catálogo.

## Separação das bases

- `etfs.json` continua sendo o catálogo oficial: ticker, `idB3`, nome e categoria
  da B3. O gerador automático pode sobrescrevê-lo.
- `etfs-detalhes.json` é a camada editorial: CNPJ confirmado, gestor, índice,
  classificação, fotografia da carteira e fontes. Não será gerado a partir do
  nome do fundo.
- A ligação exige a coincidência de `ticker` **e** `idB3`. Nome semelhante não é
  chave de identidade.

O detalhamento pode ter cobertura menor que o catálogo. Um fundo sem evidência
suficiente fica fora de `etfs-detalhes.json`; não se publica um registro cheio de
“desconhecido” nem se completa o dado por inferência.

## O que cada registro deve responder

| Bloco | Pergunta respondida |
|---|---|
| `cnpj`, `gestor` e `administrador` | Qual é exatamente o fundo? |
| `resumo` | Em linguagem simples, o que ele acompanha e como entrega a exposição? |
| `indice` | Qual índice é seguido, quem o calcula e onde está a metodologia? |
| `classificacao.classesAtivo` | A carteira é de ações, renda fixa, FIIs, cripto, commodities, moedas ou combinações? |
| `classificacao.focoPrincipal` | É mercado amplo, setor, tema, fator, renda, vencimento ou outro recorte objetivo? |
| `classificacao.geografia` | Onde está a exposição econômica principal? |
| `setores`, `temas` e `fatores` | Que concentração ou regra ajuda a distinguir o fundo de seus pares? |
| `estrategias` | Como os componentes são escolhidos ou ponderados? |
| `formasExposicao` e `replicacao` | O fundo compra os ativos, cotas de outro veículo ou usa derivativos? |
| `politicaCambial` | O retorno em reais fica exposto, protegido ou usa estrutura quanto? |
| `carteira` | Quais são as principais posições e qual é a data dessa fotografia? |
| `fontes` | Qual evidência oficial sustenta identidade, índice, classificação e carteira? |

## Regras editoriais

1. O `resumo` tem uma ou duas frases e até 320 caracteres. A ordem preferida é:
   classe de ativo, geografia ou foco, forma de exposição e efeito cambial.
2. Categoria oficial da B3 e foco editorial são coisas diferentes. A categoria
   permanece em `etfs.json`; o foco descreve o conteúdo específico do fundo.
3. `setores`, `temas` e `fatores` são listas independentes. “Tecnologia” pode ser
   um setor; “inteligência artificial” é um tema; “momentum” é um fator.
4. `classesAtivo` e `formasExposicao` recebem todos os valores atômicos aplicáveis;
   não existe rótulo genérico “misto”. `multiativo` é usado em `focoPrincipal`
   somente quando a combinação de classes é a proposta central do índice.
5. Tema descreve uma tese econômica aplicada a uma cesta. Um fundo de ouro físico,
   por exemplo, usa classe `commodities` e foco `ativo-unico`; o tema `ouro` fica
   reservado a uma cesta temática, como empresas ligadas à cadeia do metal.
6. `principaisPosicoes` é uma fotografia, nunca uma promessa de composição atual.
   `dataReferencia` e `coberturaDivulgadaPct` são obrigatórias. Cada posição informa
   `nivel`: `direta` quando está no ETF brasileiro ou `look-through` quando abre a
   exposição econômica de um índice, ETF ou fundo subjacente.
7. Participações podem ser negativas ou superar 100% quando a própria fonte
   apresentar exposição nocional por derivativos. Isso deve ser explicado em
   `carteira.observacao`.
8. Países usam ISO 3166-1 alfa-2 e moedas usam ISO 4217. O texto visível será
   traduzido pela interface, sem proliferar grafias no arquivo.
9. Um valor novo de taxonomia exige revisão explícita do esquema e incremento de
   `taxonomiaVersao`; não se inventa uma etiqueta livre durante a coleta.
10. `fisica-nao-especificada` é preferível a inferir replicação completa ou por
    amostragem quando a fonte confirma ativos diretos, mas não distingue os dois métodos.

## Evidência mínima

Cada registro precisa cobrir quatro usos de fonte: `identidade`, `indice`,
`classificacao` e `carteira`. Uma mesma página pode sustentar mais de um uso, por
isso `fontes[].usos` é uma lista.

Fontes aceitas são as páginas e documentos oficiais do gestor ou administrador,
a metodologia do provedor do índice, B3 e CVM. O Yahoo Finance continua servindo
somente a preços e históricos; não sustenta CNPJ, composição nem classificação.

Antes de usar um documento da CVM, o CNPJ deve estar ligado ao ticker por uma
fonte oficial do próprio fundo. Não se cruza cadastro e catálogo apenas por nome.

## Vocabulário controlado

Os identificadores, rótulos e definições ficam nos blocos de `oneOf` dentro de
`$defs` no esquema. Isso deixa o mesmo arquivo utilizável tanto por validadores
quanto pela interface, sem manter uma segunda tabela de traduções.

As dimensões iniciais são:

- classe de ativo;
- foco principal;
- escopo geográfico;
- setor, tema e fator;
- estratégia;
- forma de exposição;
- política cambial;
- método de replicação;
- tipo e nível de posição, além da dimensão da exposição;
- origem e uso de cada fonte.

## Cobertura atual

A curadoria cobre quinze fundos: LFTS11, WRLD11, USTK11, GLDX11, HASH11, HERT11,
BOVA11, SMAL11, BNDX11, DOLA11, DIVO11, ISUS11, NTNS11, LFIX11 e GOAT11. O
conjunto testa renda fixa soberana e privada, inflação, ações brasileiras amplas,
small caps, dividendos, sustentabilidade, ações globais e setoriais, multiativos,
ouro, criptoativos, FIIs e exposição cambial por futuros. A interface consome os
registros concluídos e mantém a ficha básica nos demais fundos.
