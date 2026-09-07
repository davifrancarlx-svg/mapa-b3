# Fundos imobiliários — fonte, junção e classificação

Leia antes de mexer em `scripts/gera-fiis.js` ou em `fiis.json`. As três
decisões abaixo custaram medição, e todas as três parecem erro à primeira
vista.

## O universo

**528 fundos imobiliários listados**, da API oficial de fundos listados da B3 —
o **mesmo endpoint dos ETFs**, `fundsListedProxy/Search/GetListFunds`, com
`typeFund` em `FII` no lugar das seis categorias de ETF. Os parâmetros vão em
base64, como no endpoint de BDR.

O mesmo endpoint expõe outros universos, se um dia forem úteis: FIAGRO (49),
FI-INFRA (41), FIP (25) e FIDC (5). Nenhum deles entra hoje: o pedido foi
fundo **imobiliário**, e FIAGRO é agro.

Não confundir com a categoria `ETF-FII` de `etfs.json`: aquilo é ETF que segue
índice de fundos imobiliários, não fundo imobiliário.

## Por que os FIIs têm patrimônio e os ETFs não

O `AGENTS.md` diz que ETF não tem patrimônio líquido nem taxa porque a CVM usa
CNPJ como chave e a B3 usa `id` interno, e cruzar por nome arriscaria atribuir
o patrimônio de um fundo a outro.

Nos FIIs existe um elo que não passa por nome: **o ISIN da cota**, publicado no
informe da CVM, tem o formato `BR` + acrônimo de 4 posições + `CTF` + dígitos.
O acrônimo é o mesmo que a B3 usa. Mas ele não basta, e o que se montou em volta
está na seção seguinte.

## A junção é pelo CNPJ, e o CNPJ vem da B3

`Search/GetDetailFund`, com o `idFNET` — que é o mesmo `id` que a listagem já
devolve — retorna o **CNPJ oficial** de cada fundo:

```
GET fundsListedProxy/Search/GetDetailFund/<base64 de
    {"language":"pt-br","idFNET":"259","idCEM":"BTCI","typeFund":"FII"}>

{ "acronym":"BTCI", "tradingCode":"BTCI11", "cnpj":"09552812000114",
  "classification":"Fundo Imobiliário / Outros", ... }
```

**528 de 528 fundos devolvem CNPJ.** A junção com o informe da CVM passou a ser
uma igualdade, não uma heurística.

### Como isto foi achado, e por que demorou

Os endpoints de detalhe que testei primeiro — sete formatos, todos por
acrônimo — devolviam 404 ou vazio. O que faltava era o parâmetro: ele quer
`idFNET`, não o acrônimo, e o nome do campo não sugere isso.

Achei abrindo a página que o investidor vê (`fundsListedPage/FII`), clicando em
"Consultar fundo" e olhando as requisições. Antes disso, o `Search/GetDownload`
por trás do botão "Exportar lista completa" também foi testado: traz Razão
Social, Fundo e Código — os mesmos três campos da listagem, sem CNPJ.

### O que isso apagou

Entre a manhã e a tarde de 06/09/2026 este arquivo descreveu uma junção em três
camadas, com o nome oficial completo em último recurso. Ela funcionava, mas
produzia erros reais — o RBLG11 (RB Capital Logístico) recebia o patrimônio do
RB Capital Renda I. **Toda essa camada saiu**, e com ela a regra "nunca por
nome" voltou ao lugar de onde não deveria ter saído.

Fica o registro para a próxima pessoa: se você está pensando em casar por
nome, o CNPJ existe e é exato.

### O `tradingCode` não serve para ticker

O mesmo endpoint devolve `tradingCode`, e é tentador usá-lo em vez do
`acrônimo+11`. Foi medido, e não serve:

| | `tradingCode` oficial | cotação no Yahoo |
|---|---|---|
| FLMA11 | `null` | **R$ 155,95** |
| FATN11 | `null` | **R$ 80,30** |
| KNUQ11 | `KNUQ15` | KNUQ11 tem preço, KNUQ15 não |
| OXRL11 | `OXRL13` | OXRL11 tem preço, OXRL13 não |

São 17 divergências: 15 com `tradingCode` nulo em fundos que negociam
normalmente, e 2 apontando para uma classe que não é a negociada. O campo
parece registrar a classe principal do fundo, não o papel que se compra. Por
isso o ticker continua sendo **acrônimo+11 confirmado no Yahoo**.

## Leitor de ZIP próprio


`scripts/lib/zip.js` lê o pacote da CVM com o `zlib` nativo. O projeto não tem
dependência, e o Node não traz leitor de zip. O `atualiza-eventos.py` resolve o
mesmo problema com o `zipfile` do Python, mas manter a geração dos FIIs em Node
evita um segundo runtime no caminho de uma base que entra na página.

Suporta o que a CVM publica — deflate e armazenado, sem cifra, sem Zip64 — e
**levanta erro em vez de devolver dado pela metade**: um CSV truncado viraria
cobertura falsa em vez de falha visível.

## Rodar

```bash
node scripts/gera-fiis.js                # lento: uma chamada ao Yahoo por fundo
node scripts/valida-fiis.js
node scripts/atualiza-metricas-fiis.js   # lento: histórico dos 416 com cotação
node scripts/valida-metricas-fiis.js
```
