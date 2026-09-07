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

## A junção com a CVM tem três camadas

O informe tem CNPJ como chave e a B3 tem `acronym`, e **não existe ponte pública
entre os dois**. Procurei em três lugares antes de desistir:

- a B3 **não expõe CNPJ por fundo** — sete formatos de endpoint de detalhe
  testados, todos 404 ou vazios;
- o `Codigo_ISIN` do informe vem sujo: vazio, `0`, `000000000000`, ou com o
  acrônimo de **outro** fundo (o HIRE traz o ISIN do HYPI);
- o arquivo de instrumentos da B3, que teria o mapa ticker↔ISIN, está atrás do
  **UP2DATA**, que é serviço registrado — a API devolve um token e o download
  para na autenticação, pelo navegador também.

Daí as três camadas, da evidência mais forte para a mais fraca:

| camada | evidência | quando entra |
|---|---|---|
| 1. complemento manual | pessoa conferiu o CNPJ em fonte oficial e registrou o link | sempre que existir |
| 2. ISIN da cota | `BR` + acrônimo + `CTF`, oficial dos dois lados | se não houver complemento |
| 3. nome oficial completo | último recurso, marcado | se as duas falharem |

Cada fundo grava **`juncaoVia`** com o caminho que o trouxe. Sem isso não há
como auditar depois de que evidência cada patrimônio saiu.

### A camada 3 relaxou uma regra, e por isso vem cercada

Este arquivo dizia, em maiúsculas, que a junção nunca seria por nome — porque
cruzar por nome arriscaria atribuir o patrimônio de um fundo a outro. O risco é
real, e eu o reproduzi: a versão frouxa casava assim, tudo com similaridade
1,00,

```
BTCI11 (BTG CRI)   → BTG RENDA URBANA     ← outro fundo
HSAF11 (HSI CRI)   → HSI - MALLS          ← outro fundo
FIIP11 (RB Cap I)  → RB CAPITAL RENDA I   ← ISIN de HUSC
HIRE11             → HIRE PROPERTIES      ← ISIN de HYPI
```

O defeito era o **nome abreviado**: `tradingName` "FII BTG CRI", tirando as
palavras de ruído, vira o token único `BTG`. Um token em comum dá proporção
1,00 e não identifica nada.

A camada 3 usa o **`fundName` completo**, e mais quatro travas:

- pelo menos **dois** termos distintivos em comum, não um;
- **Jaccard** mínimo de 0,60 — não contenção. A diferença não é detalhe: com
  contenção, `RB CAPITAL` cabendo em `RB CAPITAL LOGÍSTICO` dava 1,00 e o
  "LOGÍSTICO" não custava nada, e foi assim que o RBLG11 casou com o RB Capital
  Renda I. Jaccard faz o que sobra fora da interseção pesar;
- **lista de ruído própria e conservadora**. A lista agressiva do desempate
  engolia `RENDA`, `RECEBÍVEIS`, `CRI`, `MULTIESTRATÉGIA` e os ordinais —
  exatamente os termos que separam "RB Capital **Renda I**" de "RB Capital
  **Logístico**";
- folga sobre o segundo colocado, e só CNPJ que **nenhum outro ticker
  reivindicou** — um CNPJ não pertence a dois fundos.

As duas primeiras travas foram acrescentadas depois de **auditar os 39 pares**
que a versão inicial produzia: três estavam errados (RBLG11 → RB Capital Renda I,
SPXG11 → BGR Galpões, MCRE11 → Iron Capital). Com Jaccard e a lista
conservadora, os três caem — junto com dois que provavelmente estavam certos
mas abreviados demais para provar. **Perder um par correto é preferível a
publicar um errado**, e os que caem podem entrar no arquivo de complementos.

`valida-fiis.js` reprova se a camada de nome ultrapassar a do ISIN em volume:
se ela virar a principal, alguma das anteriores quebrou em silêncio e o dado
ficou mais fraco sem ninguém notar.

Na página, o fundo casado por nome traz o aviso na ficha, com o CNPJ ao lado —
é a evidência mais fraca da base e o leitor precisa saber disso antes de usar o
patrimônio para decidir algo.

### O que ainda não fecha

Os fundos que sobram **não estão no informe da CVM**, ou estão sob um nome que
nenhuma das três camadas alcança. Não é limitação do código: não existe o dado
público para ligar. Para esses, o caminho é o `scripts/fiis-complementos.json`,
um a um, com o link da fonte — mesmo padrão do `bdrs-complementos.json`.

**A lista de fundos, essa, está completa:** são todos os que a B3 lista. O que
varia é quanto de camada da CVM cada um tem.

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
