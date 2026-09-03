# Mapa da B3

Visualização em treemap das companhias com ações registradas na B3, organizadas em
19 categorias temáticas e cruzadas por tags de exposição, com cotações atualizadas
automaticamente durante o pregão. Tem também uma aba com todos os BDRs de empresas
(patrocinados e não patrocinados) compráveis na B3, e uma aba com os ETFs listados,
por categoria oficial da B3.

## Arquivos

| Caminho | O que é |
|---|---|
| `index.html` | A página inteira: dados, estilo e lógica em arquivo único |
| `precos.json` | Cotações (empresas + BDR), gerado automaticamente — **não editar à mão** |
| `bdrs.json` | Lista de BDRs (ticker, empresa, país, setor, indústria e fonte), gerado automaticamente — **não editar à mão** |
| `etfs.json` | Lista de ETFs (ticker, nome do fundo e categoria oficial da B3), gerado automaticamente — **não editar à mão** |
| `metricas.json` | Indicadores históricos dos BDRs, gerado diariamente — **não editar à mão** |
| `metricas-empresas.json` | Indicadores históricos das empresas brasileiras, gerado diariamente — **não editar à mão** |
| `bdrs-referencia.json` | Ativo-lastro, bolsa e relação do programa, extraídos dos documentos oficiais do Banco B3 |
| `analise.json` | Paridade indicativa, decomposição cambial e percentis dos BDRs — **não editar à mão** |
| `eventos.json` | Documentos corporativos recentes do conjunto IPE da CVM — **não editar à mão** |
| `saude.json` | Datas, coberturas e alertas das bases — **não editar à mão** |
| `scripts/atualiza-precos.js` | Busca as cotações e grava o `precos.json` |
| `scripts/atualiza-metricas.js` | Calcula retornos, força relativa e liquidez histórica dos BDRs |
| `scripts/atualiza-metricas-empresas.js` | Calcula os mesmos indicadores para empresas brasileiras |
| `scripts/gera-bdrs-referencia.py` | Extrai ativo-lastro e relação dos PDFs oficiais do Banco B3 |
| `scripts/atualiza-analise.js` | Calcula paridade, efeito do câmbio e percentis dos BDRs |
| `scripts/atualiza-eventos.py` | Busca documentos recentes no conjunto IPE oficial da CVM |
| `scripts/gera-saude.js` | Consolida cobertura, atualização e alertas das bases |
| `scripts/gera-bdrs.js` | Busca a lista de BDRs na B3 + país/setor no Yahoo e grava o `bdrs.json` |
| `scripts/bdrs-complementos.json` | Complementos verificados para perfis ausentes no Yahoo, com fonte por companhia |
| `scripts/gera-etfs.js` | Busca a lista de ETFs na B3 (seis categorias), verifica o ticker no Yahoo e grava o `etfs.json` |
| `scripts/valida-bdrs.js` | Confere cobertura, fontes, taxonomia, traduções e sintaxe do JavaScript |
| `scripts/valida-etfs.js` | Confere cobertura, taxonomia de categorias, tradução e sintaxe do JavaScript |
| `scripts/valida-bdrs-referencia.js` | Confere cobertura, relações e fontes oficiais dos programas |
| `scripts/valida-metricas.js` | Confere cobertura e limites dos indicadores históricos |
| `scripts/valida-pagina.js` | Confere sintaxe, navegação, elementos críticos e caminhos relativos |
| `.github/workflows/precos.yml` | Roda `atualiza-precos.js` a cada 30 min durante o pregão |
| `.github/workflows/metricas.yml` | Atualiza métricas, paridade e saúde após o pregão |
| `.github/workflows/eventos.yml` | Atualiza diariamente os documentos recentes da CVM |
| `.github/workflows/valida.yml` | Valida página e bases em todo push e pull request |

## Rodando localmente

O `precos.json` é carregado via `fetch`, que o navegador bloqueia em `file://`.
Então abrir o HTML com duplo clique mostra o mapa **sem preços**. Para ver com
cotações, sirva por HTTP:

```bash
npx serve -l 4173 .
```

E acesse `http://localhost:4173`.

Para atualizar as cotações na sua máquina:

```bash
node scripts/atualiza-precos.js
```

`atualiza-precos.js` já busca preço tanto das empresas brasileiras quanto dos BDRs
listados em `bdrs.json`, se esse arquivo existir. Não precisa rodar os dois scripts
juntos — o de preços lê a lista, não a gera.

## Publicado no GitHub Pages

**https://davifrancarlx-svg.github.io/mapa-b3/**

Repositório público (Actions e Pages ilimitados nesse caso), Pages servindo a branch
`main` a partir da raiz, e permissão de escrita liberada em
**Settings → Actions → General → Workflow permissions** — sem isso o workflow não
conseguiria commitar o `precos.json` de volta no repositório.

Se algum dia recriar o projeto do zero, esses três passos (repositório público, Pages
apontando pra `main`/`/`, permissão de escrita no Actions) são o que precisa configurar
de novo — nada disso está no código, é configuração do lado do GitHub.

A publicação no Lovable é uma cópia estática servida em iframe e não executa os workflows.
Ao atualizá-la, envie o `index.html` e todos os JSONs carregados por `fetch`: preços, BDRs,
ETFs, métricas, análise, eventos e saúde. Os caminhos precisam continuar relativos, sem `/` inicial.

## Como as cotações funcionam

O workflow roda a cada 30 minutos, de segunda a sexta, das 13h às 21h UTC — que
corresponde a 10h–18h de Brasília, cobrindo o pregão da B3 com folga. O Brasil não
tem mais horário de verão, então esse intervalo vale o ano todo.

Cada execução busca em lotes todos os tickers das empresas e dos BDRs, grava o
`precos.json` e commita **apenas se algum preço mudou**.

Para mudar a frequência, edite o `cron` em `.github/workflows/precos.yml`. Você também
pode disparar uma atualização manual pela aba **Actions** do repositório.

### Limitações que valem saber

- **O Yahoo Finance não é fonte oficial da B3.** É uma API não documentada, com atraso
  de cerca de 15 minutos, que pode mudar ou sair do ar sem aviso. Se isso acontecer,
  só o `scripts/atualiza-precos.js` precisa mudar — a página lê do `precos.json` e não
  sabe de onde o dado veio.
- **Cobertura de ~86%.** Das 476 ações, cerca de 411 retornam cotação. As que ficam de
  fora são justamente as sem negociação relevante, que aparecem como "sem cotação".
- **O valor de mercado não acompanha o preço.** O tamanho dos blocos no mosaico vem de
  uma estimativa fixa da data do levantamento. Recalcular exigiria a quantidade de ações
  em circulação, que não está na base. Os dois vão divergir com o tempo, e o rodapé da
  página diz isso.
- **Workflows agendados hibernam** após 60 dias sem atividade no repositório. Qualquer
  commit manual reativa.

### Proteções do script

- Tenta cada lote 3 vezes, com espera crescente, antes de desistir dele
- Aborta sem gravar se a cobertura vier abaixo de 50%, para não substituir dado bom por lixo
- Descarta preço zero, que é como o Yahoo devolve ação parada
- Se o `precos.json` faltar ou a rede cair, a página funciona normalmente, apenas sem preços

## Escolha da classe de referência

121 empresas têm mais de uma classe de ação (a RPAD tem três; quatro empresas têm quatro).
O card e o tooltip mostram a classe de **maior volume no dia**, decidido pelo dado que a
própria API devolve — e não por convenção de sufixo, que erraria nos casos em que a Unit
negocia mais que a ON. A ficha lateral mostra todas as classes, marcando a de referência
com o selo `ref`.

## Aba de BDRs

825 BDRs de empresas individuais (811 não patrocinados + 14 patrocinados), vindos da
lista oficial de empresas listadas da B3. ETFs internacionais listados como BDR (321,
incluindo ETPs de cripto) ficam de fora — mesmo espírito do "ETFs ficaram de fora" que
já vale pro resto do mapa.

**Diferença importante em relação às empresas brasileiras**: a aba de BDR não tem
tags de cruzamento nem curadoria analítica. É a lista completa, com dado leve — nome,
ticker, país, setor, indústria, preço e fonte da classificação. País/setor/indústria não
têm classificação oficial da B3 para BDR, então a fonte padrão é o perfil que o Yahoo
Finance mantém de cada empresa. Os termos são exibidos em português. Quando o perfil
está ausente, `scripts/bdrs-complementos.json` registra a classificação e a fonte oficial
da companhia ou o documento regulatório usado. A ficha de cada BDR liga diretamente à
fonte correspondente.

**Resolução de ticker.** Não patrocinado quase sempre segue `<código curto>34`
(ex.: `AAPL34`). Patrocinado varia por programa — `gera-bdrs.js` testa candidatos
(`31,32,33,34,35,39`) contra o Yahoo e usa o primeiro que responde com preço válido.

**`bdrs.json` não faz parte do cron de 30 minutos.** Ele muda raramente — só quando a
B3 lista ou cancela um programa de BDR — então rode `node scripts/gera-bdrs.js` manualmente
de vez em quando (a cada poucos meses já cobre). Ele demora alguns minutos porque busca
o perfil de cada empresa individualmente no Yahoo. Depois de gerar, rode
`node scripts/atualiza-precos.js` uma vez para os preços dos BDRs aparecerem, e faça o
commit dos dois arquivos.

Antes do commit, valide a integridade da base:

```bash
node scripts/valida-bdrs.js
node scripts/valida-pagina.js
node scripts/valida-comparador.js
node scripts/valida-matriz.js
node scripts/valida-acompanhamento.js
node scripts/testa-metricas-empresas.js
node scripts/valida-bdrs-referencia.js
```

O gerador também aborta se algum BDR ficar sem país, setor ou indústria. Assim, uma nova
listagem que ainda não tenha perfil no Yahoo precisa ganhar um complemento verificado em
vez de entrar silenciosamente com campos vazios.

### Métricas para descoberta de oportunidades

A aba permite filtrar por país, setor, indústria e liquidez recente, além de ordenar por
retorno em 21, 63 ou 252 pregões, força relativa contra a indústria, giro médio e distância
da máxima de 252 pregões. A ficha detalha também volatilidade e frequência de negociação.

Os retornos usam preço diário ajustado do Yahoo Finance. A força relativa é a diferença,
em pontos percentuais, para a mediana dos BDRs da mesma indústria ou setor; ela é uma
ferramenta de comparação, não uma recomendação. O giro médio de 20 e 60 pregões inclui
sessões com volume zero, para não superestimar a liquidez dos recibos pouco negociados.

O workflow diário roda depois da atualização intradiária de preços. Para atualizar e
validar manualmente:

```bash
node scripts/atualiza-metricas.js
node scripts/valida-metricas.js
```

O gerador preserva a observação anterior de um ticker quando uma falha isolada ocorre,
marcando-a como desatualizada, e aborta sem gravar se menos de 90% do universo receber
histórico novo.

### Paridade, câmbio e ativo-lastro

Cada BDR com referência disponível mostra o ativo negociado no exterior, a relação entre
BDRs e ações, a PTAX mais recente, a paridade indicativa e o desvio observado. A relação
vem do descritivo operacional oficial do programa no Banco B3. O preço e o histórico do
ativo-lastro vêm do Yahoo Finance; o câmbio de referência vem do Banco Central.

A paridade é uma aproximação, não preço justo ou arbitragem executável. Horários de
fechamento, liquidez, custos, impostos e defasagem entre fontes podem gerar diferenças.
A decomposição histórica separa retorno do ativo, efeito cambial e um residual que reúne
esses desencontros.

Para refazer a referência oficial e a análise:

```bash
python scripts/gera-bdrs-referencia.py
node scripts/atualiza-analise.js
node scripts/valida-analise.js
```

O extrator de referência é deliberadamente manual: baixa e lê um PDF oficial por programa,
por isso leva vários minutos e requer `pypdf`. Essa dependência é apenas de curadoria;
o site publicado continua sendo HTML, CSS e JavaScript puros, sem build ou pacote em runtime.

### Exploração, comparação e estado compartilhável

- A tabela continua sendo o modo padrão para os 825 BDRs; cards e matriz são alternativas.
- A matriz cruza retorno, força relativa, liquidez, volatilidade ou distância da máxima e
  respeita os filtros ativos. Mostra cobertura e exclusões, unidades corretas (força relativa
  em pontos percentuais), datas dos históricos, medianas do recorte e legenda setorial.
  O giro usa escala logarítmica e exclui zero; as medianas usam os valores originais.
  Os pontos têm tamanho fixo, valores no foco/cursor e uma lista textual equivalente para
  consulta no celular e por teclado. Os eixos selecionados ficam na URL (`matx` e `maty`).
- A lista de acompanhamento é salva apenas no navegador. Nada é enviado a um servidor.
- O acompanhamento distingue lista vazia, ativos ocultos pelos filtros e códigos salvos
  ausentes do catálogo atual. Códigos ausentes não são apagados automaticamente e podem
  ser removidos individualmente. Limpar filtros não limpa a lista nem desativa esse modo.
- Falhas de leitura ou gravação no armazenamento local são informadas. Se a gravação for
  bloqueada, a alteração continua na sessão e a lista previamente salva é preservada.
  Botões da tabela e da ficha mantêm o mesmo estado; remover a linha de origem devolve
  o foco ao botão Acompanhando ao fechar a ficha.
- O parâmetro `acompanhando=1` no link ativa a lista local de quem o abre, sem transmitir
  os tickers pessoais. O CSV segue os filtros e exporta somente os BDRs visíveis.
- É possível selecionar de dois a quatro BDRs e abrir uma comparação lado a lado, sem
  nota composta. A seleção persiste localmente, não muda com os filtros e não entra na URL.
  Se o navegador bloquear o armazenamento, ela continua disponível na sessão, com aviso.
- O comparador informa país, setor, indústria, referências da classificação, retornos,
  grupo da força relativa, liquidez, risco, paridade, datas e fontes por ativo. Sinaliza
  setores distintos, datas divergentes, baixa liquidez e históricos ausentes ou preservados.
- Os minigráficos não são sobrepostos no comparador: a base compacta não traz datas por
  ponto e pode conter históricos de extensões diferentes. As janelas numéricas permanecem
  explícitas, sem sugerir uma evolução sincronizada que os dados não permitem demonstrar.
- Seção, filtros, ordenação, visualização e ficha aberta ficam na URL para compartilhar o
  mesmo recorte.
- Nas empresas, o link inclui também a combinação das tags (`qualquer` ou `todas`), a
  ordenação e a regra de área do mosaico. Categorias, tags, países, setores e indústrias
  usam parâmetros repetidos, para preservar nomes que contêm vírgula. Parâmetros inválidos
  são ignorados; buscas e listas têm limites defensivos. Ao abrir outro link ou usar os
  controles de voltar/avançar, parâmetros ausentes restauram os padrões em vez de herdar
  filtros anteriores. No celular, a tabela continua sendo o padrão das empresas quando o
  link não escolhe explicitamente o modo. `node scripts/valida-url.js` cobre esses casos.
- Os CSVs exportam os indicadores visíveis e também paridade, percentis e métricas das
  empresas brasileiras quando disponíveis.

#### Exportação CSV rastreável

O CSV segue os filtros e a ordenação da tabela, inclusive o acompanhamento local.
O nome do arquivo usa o instante da exportação (UTC), não a data da curadoria. Cada linha
registra os filtros e a ordenação efetivos, a versão do formato, as datas de coleta completas
e fontes por ativo. O contexto não contém a lista completa de favoritos nem a seleção do
comparador; contém apenas a indicação de que o filtro de acompanhamento estava ativo.
Em modo matriz, são exportados todos os ativos do recorte filtrado, inclusive os que não
podem ser plotados por falta de um dos eixos.

Os campos vazios representam ausência, enquanto zero e retornos negativos são preservados.
Os históricos e análises preservados após falha recebem sinalização. Comparações de empresas
com amostra insuficiente ou histórico preservado ficam vazias, como na ficha. O CSV dos BDRs
traz também a força exibida na tabela, seu grupo e a amostra da indústria, além das colunas
de comparação originais. Paridade continua indicativa e acompanha as datas do ativo e da PTAX.
As contagens de documentos CVM só são preenchidas após o carregamento da base; o arquivo
distingue documentos carregados do total encontrado no recorte e inclui os links oficiais.
Nenhum arquivo é gerado para um recorte vazio ou enquanto o catálogo BDR está indisponível.

Formato: UTF-8 com BOM, separador ponto e vírgula, decimais com ponto, campos entre aspas
e quebras de linha CRLF. Na importação, escolha esses separadores e preserve tickers e
identificadores como texto. Campos de texto com prefixos de fórmula recebem um apóstrofo;
valores numéricos negativos não são alterados. Essa mitigação segue as orientações da
[OWASP](https://owasp.org/www-community/attacks/CSV_Injection), mas não é garantia universal:
salvar e reabrir o CSV em outro aplicativo pode alterar a proteção. Não habilite execução
de fórmulas ou conteúdo externo a partir de textos exportados.

`node scripts/testa-csv.js` verifica os filtros, datas, células especiais, estados ausentes,
campos preservados e a liberação dos recursos do download sem depender da rede.

### Empresas brasileiras, CVM e saúde dos dados

As fichas das empresas brasileiras agora trazem retorno, comparação com a categoria e o
segmento, giro, volatilidade e uma série compacta. A classe de referência histórica é a de
maior giro médio em 20 sessões entre as classes com histórico suficiente na data mais
recente disponível; ela pode ser diferente da classe usada na cotação intradiária. Todas
as classes são consultadas. Falhas parciais ficam identificadas na ficha e na base.

Comparações por categoria e segmento exigem pelo menos três empresas com retorno para
a mesma data final, excluindo históricos preservados após falha. A base informa a amostra
de cada comparação; datas iguais não garantem ausência de lacunas nas séries originais.
Volume ausente não vira zero e janelas incompletas de 60 sessões ficam sem indicador.
O gráfico informa seu período efetivo, inclusive quando há menos de um ano disponível.
Ao passar o mouse — ou usar as setas com o gráfico focado — a curva informa a data e o
preço ajustado da amostra. Bases anteriores continuam exibindo o índice normalizado até
a próxima coleta bem-sucedida. Os geradores guardam somente as amostras semanais usadas
na curva, não o histórico diário bruto.
O CSV distingue o ticker de referência histórica do ticker da cotação intradiária.

O gerador valida a saída e exige pelo menos 85% de cobertura nova entre empresas com
ticker antes de gravar. `node scripts/testa-metricas-empresas.js` testa os cálculos sem rede.

Fatos relevantes, comunicados, avisos aos acionistas e calendários recentes vêm do conjunto
[IPE oficial da CVM](https://dados.cvm.gov.br/dataset/cia_aberta-doc-ipe). O projeto exibe
os metadados e liga ao documento original, sem produzir resumo ou interpretação automática.
A fonte informa atualização semanal; a consulta diária do projeto não significa tempo real.
O recorte cobre 180 dias inclusivos pela data de entrega, não pela data do acontecimento,
e carrega os oito registros mais recentes por empresa. A ficha informa quantos foram
encontrados antes desse limite e permite expandir os documentos além dos cinco iniciais.
Protocolos e versões distintos são preservados, mesmo quando o assunto é igual.
Os links são restritos a HTTPS em domínios da CVM. Falha de download, alteração das
colunas obrigatórias, base vazia ou queda superior a 50% impedem a substituição da base.
Carregamento, falha e ausência de documentos no recorte têm mensagens próprias na interface.

O botão de saúde no cabeçalho mostra data e cobertura de cada base. Os limites também são
verificados por scripts e pelo workflow de integração contínua. A cobertura disponível
inclui registros preservados após falha; a renovada os exclui. Os percentuais são calculados
pelos registros, não pelos contadores de sucesso declarados nos arquivos. O diagnóstico
mostra o denominador, a última coleta e o intervalo das datas das observações disponíveis.
Os validadores específicos de cada base continuam responsáveis pela integridade completa.

Os catálogos de BDR e ETF exigem 100% de cobertura disponível. Tickers de ETF ainda sem
confirmação positiva no Yahoo permanecem detalhados no diagnóstico, mas não tornam um
catálogo oficial completo inválido. Os pisos de cobertura renovada são 80% para preços,
90% para histórico BDR, 75% para histórico de empresas e 70% para ativo-lastro.
Documentos CVM não recebem percentual de cobertura. Ausência de base não vira 0% silencioso:
gera aviso e percentual indisponível. O catálogo é manual, sem prazo automático de atraso.

Os limites de atraso continuam em horas corridas: 72 para preços, 96 para históricos e
ativo-lastro e 120 para consulta de documentos. Não são um calendário de pregões ou feriados.
O navegador reavalia as datas ao carregar, ao voltar à aba e a cada minuto; um diagnóstico
com mais de 96 horas também gera aviso, mesmo se estiver marcado como `ok` no arquivo.
Isso depende do relógio do dispositivo. O painel não certifica os downloads da sessão nem
a atualidade de cada observação. Carregamento e falha têm estados próprios, sem indicar
que está tudo certo. Uma cópia antiga de `saude.json` sem o novo esquema é indicada como
indisponível: envie o HTML e a base juntos ao atualizar a cópia estática.

Para conferir tudo localmente:

```bash
node scripts/valida-bdrs.js
node scripts/valida-precos.js
node scripts/valida-metricas.js
node scripts/valida-metricas-empresas.js
node scripts/valida-analise.js
node scripts/valida-eventos.js
node scripts/testa-eventos.js
python -B scripts/testa-eventos.py
node scripts/gera-saude.js
node scripts/testa-saude.js
node scripts/valida-saude.js
```

## Aba de ETFs

222 ETFs listados oficialmente pela B3 nas seis categorias oficiais de
fundo listado tipo ETF: renda variável, renda fixa, cripto, renda fixa internacional,
FII e moeda. Desses, 219 têm ticker confirmado por cotação positiva e três listagens novas
estão sinalizadas como aguardando confirmação. Vêm da lista oficial de fundos da B3 (`fundsListedProxy/Search/GetListFunds`),
o mesmo padrão de engenharia reversa já usado para BDR, só que em outro endpoint.

**Base bem mais enxuta que a de BDR, de propósito**: só ticker, nome do fundo e categoria
oficial, além da cotação. Não há índice de referência, taxa de administração nem patrimônio
líquido — nenhuma fonte oficial encontrada expõe esses campos por fundo sem risco de cruzar
o dado de um fundo com outro (a B3 identifica cada fundo por um `id` interno; a CVM, por
CNPJ; não existe chave em comum entre as duas). Por isso a ficha do ETF é mais curta que a
do BDR: sem desempenho histórico, sem comparação, sem recorte de exploração — um recorte
de ranking exigiria um piso de liquidez que só existe quando há histórico, e não há
`metricas-etfs.json` ainda.

A interface explica, em linguagem curta, o foco de cada uma das seis categorias e repete
o contexto na ficha do ETF. Essa explicação é da classe oficial, não uma descrição da
carteira específica: posições e pesos continuam exigindo o regulamento e a lâmina do gestor.

**Ticker**: `<código da B3>+11`, verificado contra o Yahoo. Uma listagem oficial nova sem
cotação positiva continua no catálogo, marcada como não confirmada, em vez de desaparecer
silenciosamente. Uma falha transitória preserva tickers já confirmados e o diagnóstico de
saúde detalha quantos foram confirmados na coleta. Nenhum contraexemplo de `+11` foi encontrado até agora.

**`etfs.json` não faz parte do cron de 30 minutos**, pelo mesmo motivo do `bdrs.json`: muda
raramente. Rode `node scripts/gera-etfs.js` manualmente de vez em quando e, depois,
`node scripts/atualiza-precos.js` para os preços dos ETFs aparecerem.

```bash
node scripts/gera-etfs.js
node scripts/valida-etfs.js
```
