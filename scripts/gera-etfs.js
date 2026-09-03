/*
 * Gera etfs.json: catalogo de ETFs negociados na B3 (renda variavel, renda
 * fixa, cripto, renda fixa internacional, FII e moeda), com ticker de
 * negociacao e categoria oficial da B3.
 *
 * Como bdrs.json, este script NAO roda a cada 30 minutos. Ele gera uma base
 * de identidade (quais ETFs existem, de que categoria) que muda raramente --
 * so quando a B3 lista ou cancela um fundo. Rode-o manualmente de vez em
 * quando (a cada poucos meses basta).
 *
 * Fontes:
 *  - Lista oficial de ETFs: API de fundos listados da B3 (mesmo estilo da
 *    API de BDR usada em gera-bdrs.js, endpoint diferente).
 *  - Verificacao de ticker: Yahoo Finance (nao oficial) -- so confirma que
 *    acronym+11 tem cotacao, nao e fonte da lista nem da categoria.
 *
 * Uso: node scripts/gera-etfs.js
 */

const fs = require('fs');
const path = require('path');

const SAIDA = path.join(__dirname, '..', 'etfs.json');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36';
const espera = ms => new Promise(r => setTimeout(r, ms));

/* typeFund na API da B3: seis categorias de fundo listado tipo ETF.
   ETF-MOEDA existe na taxonomia da B3 mas pode vir vazia (0 fundos hoje) --
   mantido na lista para nao perder a categoria se algum dia for listado ali. */
const TIPOS = ['ETF', 'ETF-RF', 'ETF-CRIPTO', 'ETF-INT-RF', 'ETF-FII', 'ETF-MOEDA'];

/* Cobertura minima de tickers verificados contra a Yahoo. Um item isolado
   que nao verifica e descartado e logado (mesmo tratamento que gera-bdrs.js
   da a uma patrocinada sem sufixo resolvido); so abortamos o lote inteiro se
   a falha for sistemica (API mudou de formato, Yahoo bloqueou geral). */
const COBERTURA_MINIMA = 0.85;

async function buscaPaginaB3(typeFund, pageNumber){
  const params = { language: 'pt-br', typeFund, pageNumber, pageSize: 100 };
  const b64 = Buffer.from(JSON.stringify(params)).toString('base64');
  const url = 'https://sistemaswebb3-listados.b3.com.br/fundsListedProxy/Search/GetListFunds/' + b64;
  const r = await fetch(url, { headers: { 'User-Agent': UA } });
  if(r.status !== 200) throw new Error('B3 respondeu ' + r.status);
  return r.json();
}

async function listaTodosETF(){
  const todos = [];
  for(const tipo of TIPOS){
    let pagina = 1, totalPaginas = 1;
    do {
      const j = await buscaPaginaB3(tipo, pagina);
      (j.results || []).forEach(x => todos.push({
        idB3: x.id,
        acronym: x.acronym,
        nome: x.fundName,
        nomeCurto: x.tradingName,
        categoria: tipo
      }));
      totalPaginas = j.page?.totalPages || 1;
      pagina++;
      await espera(300);
    } while(pagina <= totalPaginas);
    console.log(tipo + ': ' + todos.filter(x => x.categoria === tipo).length + ' fundos');
  }
  return todos;
}

async function chartMeta(ticker){
  try{
    const r = await fetch('https://query1.finance.yahoo.com/v8/finance/chart/' + ticker + '.SA?interval=1d&range=1d',
      { headers: { 'User-Agent': UA } });
    if(r.status !== 200) return null;
    const j = await r.json();
    return j.chart?.result?.[0]?.meta || null;
  } catch { return null; }
}

/* Ticker assumido: acronym+11, confirmado por amostragem manual contra a B3
   (BBSD->BBSD11, BBOV->BBOV11). Confere pelo preco existir (nao basta status
   200: o Yahoo devolve chart vazio para simbolo inexistente). Sem lista de
   sufixos alternativos como SUFIXOS_PATROCINADO em gera-bdrs.js -- nenhum
   contraexemplo de +11 foi encontrado ainda. */
async function resolveTickerETF(acronym){
  const t = acronym + '11';
  const m = await chartMeta(t);
  return (m && typeof m.regularMarketPrice === 'number') ? t : null;
}

(async () => {
  console.log('buscando lista oficial de ETFs na B3...');
  const lista = await listaTodosETF();
  console.log('total: ' + lista.length + ' fundos nas seis categorias de ETF');

  console.log('\nverificando ticker de negociação (uma chamada por fundo)...');
  const finais = [];
  for(let i = 0; i < lista.length; i++){
    const item = lista[i];
    const ticker = await resolveTickerETF(item.acronym);
    if(ticker){
      const final = { ticker, nome: item.nome, categoria: item.categoria };
      if(item.nomeCurto) final.nomeCurto = item.nomeCurto;
      if(item.idB3 != null) final.idB3 = item.idB3;
      finais.push(final);
    } else {
      console.log('  não consegui verificar o ticker de ' + item.nome + ' (' + item.acronym + '11)');
    }
    if((i + 1) % 50 === 0) console.log('  ' + (i + 1) + '/' + lista.length);
    await espera(250);
  }

  const cobertura = lista.length ? finais.length / lista.length : 0;
  console.log('\ntickers verificados: ' + finais.length + '/' + lista.length + ' (' + (cobertura * 100).toFixed(1) + '%)');
  if(cobertura < COBERTURA_MINIMA){
    throw new Error('cobertura de tickers verificados abaixo de ' + (COBERTURA_MINIMA * 100) + '%; confira a API da B3 e o sufixo assumido (+11)');
  }

  const saida = {
    geradoEm: new Date().toISOString(),
    fontes: {
      lista: 'B3 (GetListFunds, seis categorias oficiais de fundo listado tipo ETF)',
      verificacaoTicker: 'Yahoo Finance (confirma que o ticker acronym+11 tem cotação; não é fonte da lista nem da categoria)'
    },
    total: finais.length,
    etfs: finais
  };
  fs.writeFileSync(SAIDA, JSON.stringify(saida, null, 1) + '\n', 'utf8');
  console.log('gravado em ' + SAIDA);
})().catch(err => { console.error('ERRO:', err.message); process.exit(1); });
