/*
 * Busca cotacoes das acoes da B3 no Yahoo Finance e grava precos.json.
 *
 * A lista de tickers vem de duas fontes: o proprio mapa-b3.html (empresas
 * brasileiras) e o bdrs.json (BDRs), quando ele existir. bdrs.json e gerado
 * por scripts/gera-bdrs.js -- este script aqui so consome a lista, nao
 * decide quais BDRs existem.
 *
 * Uso: node scripts/atualiza-precos.js
 */

const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..');
const SAIDA = path.join(RAIZ, 'precos.json');
const BDRS = path.join(RAIZ, 'bdrs.json');

/* Aceita os dois nomes: no GitHub Pages o arquivo da raiz costuma virar
   index.html, mas localmente pode continuar como mapa-b3.html. */
const HTML = ['index.html', 'mapa-b3.html']
  .map(n => path.join(RAIZ, n))
  .find(p => fs.existsSync(p));
if(!HTML) throw new Error('nao achei index.html nem mapa-b3.html na raiz do projeto');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36';
const LOTE = 100;          // tickers por request
const PAUSA = 700;         // ms entre requests, para nao irritar o Yahoo
const COBERTURA_MINIMA = .5; // aborta se vier menos que isso, para nao gravar lixo por cima de dado bom

const espera = ms => new Promise(r => setTimeout(r, ms));

/* Le o bloco de dados embutido no HTML, casando as chaves para achar o fim. */
function leTickers(){
  const raw = fs.readFileSync(HTML, 'utf8');
  const marca = 'const D = ';
  const ini = raw.indexOf(marca);
  if(ini === -1) throw new Error('bloco de dados nao encontrado em mapa-b3.html');
  const start = ini + marca.length;
  let nivel = 0, texto = false, escape = false, fim = -1;
  for(let i = start; i < raw.length; i++){
    const c = raw[i];
    if(texto){
      if(escape) escape = false;
      else if(c === '\\') escape = true;
      else if(c === '"') texto = false;
      continue;
    }
    if(c === '"'){ texto = true; continue; }
    if(c === '{') nivel++;
    else if(c === '}'){ nivel--; if(nivel === 0){ fim = i + 1; break; } }
  }
  if(fim === -1) throw new Error('nao consegui delimitar o JSON do bloco de dados');
  const D = JSON.parse(raw.slice(start, fim));
  return D.empresas.flatMap(e => (e.tickers || '').split(',').map(s => s.trim()).filter(Boolean));
}

function leTickersBDR(){
  if(!fs.existsSync(BDRS)) return [];
  const j = JSON.parse(fs.readFileSync(BDRS, 'utf8'));
  return (j.bdrs || []).map(b => b.ticker).filter(Boolean);
}

/* O endpoint em lote do Yahoo exige cookie + crumb. O de simbolo unico nao,
   mas exigiria uma request por ticker. */
async function autentica(){
  const r = await fetch('https://fc.yahoo.com/', { headers:{ 'User-Agent':UA }, redirect:'manual' });
  const bruto = r.headers.getSetCookie ? r.headers.getSetCookie() : [];
  if(!bruto.length) throw new Error('Yahoo nao devolveu cookie');
  const cookie = bruto.map(c => c.split(';')[0]).join('; ');

  const cr = await fetch('https://query1.finance.yahoo.com/v1/test/getcrumb', {
    headers:{ 'User-Agent':UA, Cookie:cookie }
  });
  const crumb = (await cr.text()).trim();
  if(cr.status !== 200 || !crumb || crumb.length > 40) throw new Error('nao consegui obter o crumb (status ' + cr.status + ')');
  return { cookie, crumb };
}

async function buscaLote(simbolos, { cookie, crumb }, tentativa = 1){
  const url = 'https://query1.finance.yahoo.com/v7/finance/quote'
    + '?symbols=' + simbolos.map(s => s + '.SA').join(',')
    + '&crumb=' + encodeURIComponent(crumb);
  try{
    const r = await fetch(url, { headers:{ 'User-Agent':UA, Cookie:cookie } });
    if(r.status !== 200) throw new Error('status ' + r.status);
    const j = await r.json();
    return j.quoteResponse?.result || [];
  } catch(err){
    if(tentativa < 3){
      await espera(1500 * tentativa);
      return buscaLote(simbolos, { cookie, crumb }, tentativa + 1);
    }
    console.error('  lote falhou apos 3 tentativas:', err.message);
    return [];
  }
}

(async () => {
  const tickersEmpresas = leTickers();
  const tickersBDR = leTickersBDR();
  const tickers = [...new Set([...tickersEmpresas, ...tickersBDR])];
  console.log(tickersEmpresas.length + ' tickers de empresas + ' + tickersBDR.length + ' de BDR = ' + tickers.length + ' únicos');

  const sessao = await autentica();
  const precos = {};
  let lotes = 0;

  for(let i = 0; i < tickers.length; i += LOTE){
    const fatia = tickers.slice(i, i + LOTE);
    const res = await buscaLote(fatia, sessao);
    lotes++;
    res.forEach(q => {
      const cod = String(q.symbol || '').replace(/\.SA$/, '');
      // Acoes paradas voltam com preco 0: e ausencia de dado, nao cotacao.
      // Zero passaria pelo teste de tipo, entao o corte tem que ser explicito.
      if(!cod || typeof q.regularMarketPrice !== 'number' || q.regularMarketPrice <= 0) return;
      precos[cod] = {
        p: +q.regularMarketPrice.toFixed(2),
        v: typeof q.regularMarketChangePercent === 'number' ? +q.regularMarketChangePercent.toFixed(2) : null,
        f: typeof q.regularMarketPreviousClose === 'number' ? +q.regularMarketPreviousClose.toFixed(2) : null,
        vol: q.regularMarketVolume ?? 0,
        giro: typeof q.regularMarketVolume === 'number' ? Math.round(q.regularMarketPrice * q.regularMarketVolume) : 0,
        t: typeof q.regularMarketTime === 'number' ? q.regularMarketTime : null,
        estado: q.marketState || null
      };
    });
    console.log('  lote ' + lotes + ': ' + res.length + '/' + fatia.length);
    if(i + LOTE < tickers.length) await espera(PAUSA);
  }

  const achados = Object.keys(precos).length;
  const cobertura = achados / tickers.length;
  console.log('cobertura: ' + achados + '/' + tickers.length + ' (' + (cobertura*100).toFixed(1) + '%)');

  if(cobertura < COBERTURA_MINIMA){
    console.error('cobertura abaixo de ' + (COBERTURA_MINIMA*100) + '%, abortando sem gravar');
    process.exit(1);
  }

  const saida = {
    atualizadoEm: new Date().toISOString(),
    fonte: 'Yahoo Finance (nao oficial), cotacoes com atraso',
    tickersConsultados: tickers.length,
    tickersComPreco: achados,
    precos
  };
  fs.writeFileSync(SAIDA, JSON.stringify(saida, null, 1) + '\n', 'utf8');
  console.log('gravado em ' + SAIDA);
})().catch(err => { console.error('ERRO:', err.message); process.exit(1); });
