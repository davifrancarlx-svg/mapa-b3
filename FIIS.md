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
O acrônimo é o mesmo que a B3 usa. Oficial dos dois lados.

### Mas o ISIN não é único, e essa é a armadilha

Administradores repetem o mesmo ISIN em fundos diferentes:

```
BRSPTWCTF002  ->  SP Downtown, SF, BFC, JK 1455, MS, FL Square, FLFC
BRXPMLCTF000  ->  XP Malls  +  Península
BRTRXFCTF003  ->  TRX Real Estate  +  Liquidez Projetos GD
```

Aceitar o primeiro candidato daria ao XPML11 o patrimônio do Península.

**Por isso o ISIN só levanta candidatos, e o nome desempata** — nessa ordem, e
só nessa. O inverso não funciona: usar nome como filtro de entrada derrubaria
dezenas de pares corretos, porque a B3 abrevia (`FII BTHR`, `FII GUARDIAN`,
`FII RTEL`) enquanto a CVM escreve por extenso e às vezes com erro de digitação
(`FII GUARDIAL LOGISTICA` para o Guardian). A medição:

| situação | fundos | o que acontece |
|---|---|---|
| candidato único | 426 | entra, com a similaridade gravada |
| disputa resolvida com folga | 10 | entra o vencedor (XPML: 1,00 contra 0,00) |
| disputa sem folga | 2 | **fica sem camada da CVM** (BPLC e HSAF, 1,00 contra 1,00) |

Classes do mesmo fundo (mesma raiz de CNPJ, Resolução CVM 175) não disputam
entre si — vale a de informe mais recente. Só raízes diferentes caracterizam
disputa.

Cada registro guarda `similaridade`, e os 17 pares aceitos com nome pouco
parecido levam `juncaoFraca: true`. A junção fica auditável depois, e
`valida-fiis.js` reprova CNPJ repetido entre dois tickers — que é a assinatura
de uma junção que colou o mesmo informe em dois fundos.

## A classificação não vem do campo de segmento da CVM

O informe tem `Segmento_Atuacao`, e ele foi **descartado como classificação
principal** por duas razões medidas:

1. **61% dos fundos caem em "Multicategoria" ou "Outros"** — não separa nada.
2. **Ele erra.** O MXRF11, o fundo de papel mais conhecido do país, está
   classificado como **"Logística"**.

A classificação sai da **carteira declarada** no arquivo `ativo_passivo`: são
contas do balanço (imóveis, CRI, cotas de outros fundos), não rótulo. Isso
atende à regra do projeto de não inferir estratégia pelo nome do fundo — aqui
não se infere nada, se mede o que o fundo declarou ter.

```
HGLG  Tijolo   tijolo  99%              [CVM dizia: Multicategoria]
AFHI  Papel                papel 100%   [CVM dizia: Multicategoria]
MXRF  Papel                papel  77%   [CVM dizia: Logística]
```

Dois terços numa classe definem o rótulo; abaixo disso é `Híbrido`. **As três
frações vão publicadas junto com o rótulo**, então a classificação é auditável,
e `valida-fiis.js` reprova rótulo que não decorra delas. O `Segmento_Atuacao`
continua gravado como informação de origem — só não manda.

### Componente negativa não é composição

O GSRF declara cotas de fundo **negativas**. Dividir por um total que se anula
produzia `158,8% tijolo, -58,8% cotas`, com rótulo confiante em cima. Hoje
qualquer componente negativa cancela a classificação inteira: sem número
honesto, sem rótulo.

## Armadilhas de dado

- **112 dos 528 não têm cotação, e isso é normal.** A lista da B3 inclui fundos
  restritos a investidor qualificado, que têm CNPJ e informe mas nunca
  negociaram em bolsa. Foi medido duas vezes, e **nenhum sufixo alternativo**
  (`11B`, `12`, `13`, `10`, `11A`) devolve preço para eles — não é o `+11` que
  está errado. Por isso o piso de cobertura de ticker é 70%, e não os 85% de
  `gera-etfs.js`: copiar aquele número derrubava a geração toda vez. O que de
  fato protege contra a API quebrar é a **guarda relativa** contra a última
  geração boa (queda maior que 15% aborta).
- **Patrimônio líquido negativo é real.** O Panamby declara −R$ 27,3 milhões.
  Não trate como erro nem apague: é justamente o caso que mais importa ver.
- **Zero em valor da cota é ausência de dado, não valor.** Alguns informes vêm
  com cotas emitidas zeradas, e um declara 500 bilhões de cotas para R$ 50 mil
  de patrimônio. O gerador grava `null`; afirmar que a cota vale R$ 0,00 seria
  mentir sobre o fundo. Mesma lógica do preço zero em `precos.json`.
- **O informe é mensal e atrasa.** A competência mais recente costuma ficar
  um a dois meses atrás da data de hoje. Todo campo vindo da CVM anda com
  `informeEm` / `carteiraEm` do lado.

## Histórico: por que a série é o preço, e não o ajustado

Esta é a única base do projeto em que a série **não** usa o preço ajustado.
Foi medido, fundo a fundo:

| | variação de preço | "retorno" ajustado |
|---|---|---|
| XPML11 | **+0,3%** (103,67 → 104,03) | +713,7% |
| HYPI11 | **0,0%** (181,50 → 181,50) | +520,0% |
| PNPR11 | **−8,2%** | +548,4% |

O ajustado do Yahoo desconta cada distribuição do histórico. Em ação isso
funciona; em FII — que distribui todo mês, ainda amortiza cota e faz emissão
com frequência — o fator retroativo se acumula e a série deixa de descrever
qualquer coisa. Em fundo normal o ajustado está certo: HGLG11 dá −4,2% de
preço e +4,4% ajustado, e a diferença é exatamente o rendimento de 9%. Mas não
dá para publicar uma coluna que só vale para parte da base.

Como num FII o resultado se separa limpo em duas pernas — variação da cota e
distribuição — e a base já publica a distribuição ao lado, o preço informa
**mais** do que o retorno total embolado.

Por isso os campos se chamam **`vp21`/`vp63`/`vp252`**, e não `r21`/`r63`/`r252`.
Um `r252` aqui seria lido como o `r252` das outras bases, e as duas coisas não
são comparáveis. `valida-metricas-fiis.js` reprova a volta de `r252` a esta base
e exige que a metodologia declare a troca.

Depois da correção, **nenhum** fundo tem variação de 12 meses acima de 150% —
antes eram seis.

## "Distribuído 12m" não é dividend yield

A coluna mede o que o fundo **distribuiu** em 12 meses como percentual do preço
de hoje. Não se chama rendimento porque o evento de provento do Yahoo junta
rendimento e **amortização de cota** — devolução de capital — sem separar as
duas, e amortização não é renda: o fundo devolve o próprio patrimônio e a cota
cai junto.

O tamanho do problema, medido nos 342 fundos com distribuição:

| faixa | fundos |
|---|---|
| até 20% do preço (rendimento plausível) | 288 |
| 20% a 100% | 44 |
| **acima de 100% do próprio preço** | 10 |

Tentei usar o campo `Percentual_Amortizacao_Cotas_Mes` do informe da CVM como
detector oficial: ele pega só **12 dos 54** fundos acima de 20%, então não
serve para separar.

O que a página faz, sem inventar limiar: marca com **!** quem distribuiu **mais
que o próprio preço** — isso não é um corte arbitrário, é uma impossibilidade,
porque nenhuma renda de 12 meses vale mais que o ativo inteiro. São os 10 da
tabela acima, todos devolvendo capital. E a coluna vizinha, variação de preço,
mostra a contrapartida na mesma linha: o HDEL11 aparece com 2816% distribuído e
−96,7% de cota.

O dividend yield **não é gravado na base**. `prov12` guarda a soma em reais e a
página divide pelo preço do dia, como já faz com o P/VP — gravar o percentual
congelaria numerador e denominador em datas diferentes e criaria duas fontes de
verdade para a mesma conta. O validador reprova a mudança.

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
