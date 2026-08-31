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
| `bdrs.json` | Lista de BDRs (ticker, empresa, país, setor), gerado automaticamente — **não editar à mão** |
| `scripts/atualiza-precos.js` | Busca as cotações e grava o `precos.json` |
| `scripts/gera-bdrs.js` | Busca a lista de BDRs na B3 + país/setor no Yahoo e grava o `bdrs.json` |
| `.github/workflows/precos.yml` | Roda `atualiza-precos.js` a cada 30 min durante o pregão |

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

## Como as cotações funcionam

O workflow roda a cada 30 minutos, de segunda a sexta, das 13h às 21h UTC — que
corresponde a 10h–18h de Brasília, cobrindo o pregão da B3 com folga. O Brasil não
tem mais horário de verão, então esse intervalo vale o ano todo.

Cada execução busca os 476 tickers em 5 requisições ao Yahoo Finance, grava o
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
descrição escrita à mão, tags de cruzamento nem curadoria analítica. É a lista completa,
com dado leve — nome, ticker, país, setor, indústria, preço. País/setor/indústria não
têm classificação oficial da B3 para BDR, então vêm do perfil que o Yahoo Finance mantém
de cada empresa (por isso aparecem em inglês, traduzido só o necessário).

**Resolução de ticker.** Não patrocinado quase sempre segue `<código curto>34`
(ex.: `AAPL34`). Patrocinado varia por programa — `gera-bdrs.js` testa candidatos
(`31,32,33,34,35,39`) contra o Yahoo e usa o primeiro que responde com preço válido.

**`bdrs.json` não faz parte do cron de 30 minutos.** Ele muda raramente — só quando a
B3 lista ou cancela um programa de BDR — então rode `node scripts/gera-bdrs.js` manualmente
de vez em quando (a cada poucos meses já cobre). Ele demora alguns minutos porque busca
o perfil de cada empresa individualmente no Yahoo. Depois de gerar, rode
`node scripts/atualiza-precos.js` uma vez para os preços dos BDRs aparecerem, e faça o
commit dos dois arquivos.
