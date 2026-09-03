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
const TEMP = SAIDA + '.tmp';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36';
const espera = ms => new Promise(r => setTimeout(r, ms));
const URL_LISTA = 'https://sistemaswebb3-listados.b3.com.br/fundsListedPage/';

/* typeFund na API da B3: seis categorias de fundo listado tipo ETF.
   ETF-MOEDA existe na taxonomia da B3 mas pode vir vazia (0 fundos hoje) --
   mantido na lista para nao perder a categoria se algum dia for listado ali. */
const TIPOS = ['ETF', 'ETF-RF', 'ETF-CRIPTO', 'ETF-INT-RF', 'ETF-FII', 'ETF-MOEDA'];

/* Cobertura minima renovada contra a Yahoo. Um item novo sem confirmacao
   continua visivel e sinalizado; um ticker antes confirmado e preservado.
   O lote aborta se a falha for sistemica. */
const COBERTURA_MINIMA = 0.85;

async function buscaPaginaB3(typeFund, pageNumber){
  const params = { language: 'pt-br', typeFund, pageNumber, pageSize: 100 };
  const b64 = Buffer.from(JSON.stringify(params)).toString('base64');
  const url = 'https://sistemaswebb3-listados.b3.com.br/fundsListedProxy/Search/GetListFunds/' + b64;
  const r = await fetch(url, { headers: { 'User-Agent': UA } });
  if(r.status !== 200) throw new Error('B3 respondeu ' + r.status);
  const j = await r.json();
  if(!Array.isArray(j.results)){
    throw new Error('B3 devolveu estrutura inesperada em ' + typeFund + ', pagina ' + pageNumber);
  }
  if(typeFund === 'ETF-MOEDA' && j.results.length === 0 && (!j.page || !Number.isInteger(j.page.totalPages) || j.page.totalPages < 1)) j.page = {totalPages:1};
  if(!j.page || !Number.isInteger(j.page.totalPages) || j.page.totalPages < 1){
    throw new Error('B3 devolveu paginacao inesperada em ' + typeFund + ', pagina ' + pageNumber);
  }
  return j;
}

async function listaTodosETF(){
  const todos = [];
  for(const tipo of TIPOS){
    let pagina = 1, totalPaginas = 1;
    do {
      const j = await buscaPaginaB3(tipo, pagina);
      j.results.forEach(x => {
        if(!Number.isInteger(x.id) || x.id <= 0 || typeof x.acronym !== 'string' || !/^[A-Z0-9]{4}$/.test(x.acronym) || typeof x.fundName !== 'string' || !x.fundName.trim()){
          throw new Error('fundo com identidade inesperada na B3: ' + JSON.stringify(x));
        }
        todos.push({idB3:x.id, acronym:x.acronym, nome:x.fundName.trim(), nomeCurto:typeof x.tradingName==='string'?x.tradingName.trim():'', categoria:tipo});
      });
      totalPaginas = j.page.totalPages;
      pagina++;
      await espera(300);
    } while(pagina <= totalPaginas);
    console.log(tipo + ': ' + todos.filter(x => x.categoria === tipo).length + ' fundos');
  }
  const ids = new Set(), tickers = new Set();
  for(const x of todos){
    if(ids.has(x.idB3)) throw new Error('id B3 repetido no catalogo: ' + x.idB3);
    if(tickers.has(x.acronym + '11')) throw new Error('ticker derivado repetido no catalogo: ' + x.acronym + '11');
    ids.add(x.idB3); tickers.add(x.acronym + '11');
  }
  return todos;
}

async function chartMeta(ticker, tentativa = 1){
  try{
    const r = await fetch('https://query1.finance.yahoo.com/v8/finance/chart/' + ticker + '.SA?interval=1d&range=1d',
      { headers: { 'User-Agent': UA } });
    if(r.status !== 200){
      if(tentativa < 3 && (r.status === 429 || r.status >= 500)){ await espera(500 * tentativa); return chartMeta(ticker, tentativa + 1); }
      return null;
    }
    const j = await r.json();
    return j.chart?.result?.[0]?.meta || null;
  } catch {
    if(tentativa < 3){ await espera(500 * tentativa); return chartMeta(ticker, tentativa + 1); }
    return null;
  }
}

/* Ticker assumido: acronym+11, confirmado por amostragem manual contra a B3
   (BBSD->BBSD11, BBOV->BBOV11). Confere pelo preco existir (nao basta status
   200: o Yahoo devolve chart vazio para simbolo inexistente). Sem lista de
   sufixos alternativos como SUFIXOS_PATROCINADO em gera-bdrs.js -- nenhum
   contraexemplo de +11 foi encontrado ainda. */
async function resolveTickerETF(acronym){
  const t = acronym + '11';
  const m = await chartMeta(t);
  return (m && Number.isFinite(m.regularMarketPrice) && m.regularMarketPrice > 0) ? t : null;
}

function leAnterior(){
  if(!fs.existsSync(SAIDA)) return {total:0,etfs:[]};
  try { return JSON.parse(fs.readFileSync(SAIDA, 'utf8')); }
  catch(err){ throw new Error('base anterior invalida: ' + err.message); }
}

function gravaAtomico(saida){
  fs.writeFileSync(TEMP, JSON.stringify(saida, null, 1) + '\n', 'utf8');
  fs.renameSync(TEMP, SAIDA);
}

(async () => {
  console.log('buscando lista oficial de ETFs na B3...');
  const anterior = leAnterior();
  const lista = await listaTodosETF();
  console.log('total: ' + lista.length + ' fundos nas seis categorias de ETF');
  const totalAnterior = anterior.catalogoB3?.total || anterior.total || 0;
  if(totalAnterior && lista.length < Math.ceil(totalAnterior * 0.95)){
    throw new Error('catalogo da B3 caiu de ' + totalAnterior + ' para ' + lista.length + '; atualizacao interrompida para evitar perda em massa');
  }

  console.log('\nverificando ticker de negociação (uma chamada por fundo)...');
  const finais = [], naoVerificados = [];
  const anteriores = new Map((anterior.etfs || []).map(x => [x.idB3, x]));
  let preservados = 0;
  for(let i = 0; i < lista.length; i++){
    const item = lista[i];
    const ticker = await resolveTickerETF(item.acronym);
    if(ticker){
      const final = { ticker, nome: item.nome, categoria: item.categoria };
      if(item.nomeCurto) final.nomeCurto = item.nomeCurto;
      if(item.idB3 != null) final.idB3 = item.idB3;
      finais.push(final);
    } else {
      const antigo = anteriores.get(item.idB3), esperado = item.acronym + '11';
      if(antigo && antigo.ticker === esperado){
        const final = {ticker:esperado, nome:item.nome, categoria:item.categoria};
        if(item.nomeCurto) final.nomeCurto = item.nomeCurto;
        final.idB3 = item.idB3; final.stale = true;
        finais.push(final); preservados++;
        console.log('  preservado apos falha de verificacao: ' + esperado);
      } else {
        const final = {ticker:esperado, nome:item.nome, categoria:item.categoria};
        if(item.nomeCurto) final.nomeCurto = item.nomeCurto;
        final.idB3 = item.idB3; final.tickerVerificado = false;
        finais.push(final); naoVerificados.push(final);
        console.log('  novo fundo sem ticker verificavel: ' + item.nome + ' (' + esperado + ')');
      }
    }
    if((i + 1) % 50 === 0) console.log('  ' + (i + 1) + '/' + lista.length);
    await espera(250);
  }

  const renovados = finais.length - preservados - naoVerificados.length, cobertura = lista.length ? renovados / lista.length : 0;
  console.log('\ntickers verificados agora: ' + renovados + '/' + lista.length + ' (' + (cobertura * 100).toFixed(1) + '%); preservados: ' + preservados);
  if(cobertura < COBERTURA_MINIMA){
    throw new Error('cobertura de tickers verificados abaixo de ' + (COBERTURA_MINIMA * 100) + '%; confira a API da B3 e o sufixo assumido (+11)');
  }
  if(naoVerificados.length) console.log('atencao: ' + naoVerificados.length + ' tickers derivados ainda sem cotacao positiva: ' + naoVerificados.map(x=>x.ticker).join(', '));

  const categorias = Object.fromEntries(TIPOS.map(tipo => [tipo, lista.filter(x => x.categoria === tipo).length]));

  const saida = {
    geradoEm: new Date().toISOString(),
    fontes: {
      lista: 'B3 (GetListFunds, seis categorias oficiais de fundo listado tipo ETF)',
      listaUrl: URL_LISTA,
      verificacaoTicker: 'Yahoo Finance (confirma que o ticker acronym+11 tem cotação positiva; não é fonte da lista nem da categoria)',
      verificacaoTickerUrl: 'https://finance.yahoo.com/'
    },
    catalogoB3: {total:lista.length, categorias, verificadosAgora:renovados, preservados, naoVerificados:naoVerificados.length},
    total: finais.length,
    etfs: finais
  };
  gravaAtomico(saida);
  console.log('gravado em ' + SAIDA);
})().catch(err => { console.error('ERRO:', err.message); process.exit(1); });
