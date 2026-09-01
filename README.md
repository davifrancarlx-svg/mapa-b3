# Mapa da B3

Visualização em treemap das companhias com ações registradas na B3, organizadas em
19 categorias temáticas e cruzadas por tags de exposição, com cotações atualizadas
automaticamente durante o pregão. Tem também uma aba com todos os BDRs de empresas
(patrocinados e não patrocinados) compráveis na B3.

## Arquivos

| Caminho | O que é |
|---|---|
| `index.html` | A página inteira: dados, estilo e lógica em arquivo único |
| `precos.json` | Cotações (empresas + BDR), gerado automaticamente — **não editar à mão** |
| `bdrs.json` | Lista de BDRs (ticker, empresa, país, setor, indústria e fonte), gerado automaticamente — **não editar à mão** |
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
| `scripts/valida-bdrs.js` | Confere cobertura, fontes, taxonomia, traduções e sintaxe do JavaScript |
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
métricas, análise, eventos e saúde. Os caminhos precisam continuar relativos, sem `/` inicial.

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
  respeita os filtros ativos.
- A lista de acompanhamento é salva apenas no navegador. Nada é enviado a um servidor.
- É possível selecionar BDRs e abrir uma comparação lado a lado, sem nota composta.
- Seção, filtros, ordenação, visualização e ficha aberta ficam na URL para compartilhar o
  mesmo recorte.
- Os CSVs exportam os indicadores visíveis e também paridade, percentis e métricas das
  empresas brasileiras quando disponíveis.

### Empresas brasileiras, CVM e saúde dos dados

As fichas das empresas brasileiras agora trazem retorno, comparação com a categoria e o
segmento, giro, volatilidade e uma série compacta. A classe de referência histórica é a de
maior liquidez recente entre os códigos disponíveis; ela pode ser diferente da classe usada
na cotação intradiária.

Fatos relevantes, comunicados, avisos aos acionistas e calendários recentes vêm do conjunto
IPE oficial da CVM. O projeto exibe os metadados e liga ao documento original, sem produzir
resumo ou interpretação automática.

O botão de saúde no cabeçalho mostra data e cobertura de cada base. Os limites também são
verificados por scripts e pelo workflow de integração contínua. Para conferir tudo localmente:

```bash
node scripts/valida-bdrs.js
node scripts/valida-precos.js
node scripts/valida-metricas.js
node scripts/valida-metricas-empresas.js
node scripts/valida-analise.js
node scripts/valida-eventos.js
node scripts/gera-saude.js
node scripts/valida-saude.js
```
