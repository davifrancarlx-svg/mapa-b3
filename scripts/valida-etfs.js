/*
 * Valida a cobertura editorial dos ETFs sem consultar a rede.
 * Uso: node scripts/valida-etfs.js
 */

const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..');
const base = JSON.parse(fs.readFileSync(path.join(RAIZ, 'etfs.json'), 'utf8'));
const html = fs.readFileSync(path.join(RAIZ, 'index.html'), 'utf8');

const CATEGORIAS = new Set(['ETF', 'ETF-RF', 'ETF-CRIPTO', 'ETF-INT-RF', 'ETF-FII', 'ETF-MOEDA']);

function falha(msg){
  console.error('ERRO: ' + msg);
  process.exitCode = 1;
}

const etfs = Array.isArray(base.etfs) ? base.etfs : [];
if(!Array.isArray(base.etfs)) falha('lista de ETFs ausente ou invalida');
if(typeof base.geradoEm !== 'string' || !Number.isFinite(Date.parse(base.geradoEm))) falha('data de geracao invalida');
if(base.total !== etfs.length) falha('total declarado difere do tamanho da lista');
if(new Set(etfs.map(x => x.ticker)).size !== etfs.length) falha('ha tickers repetidos');
if(!base.fontes?.lista || base.fontes?.listaUrl !== 'https://sistemaswebb3-listados.b3.com.br/fundsListedPage/' || !base.fontes?.verificacaoTicker || base.fontes?.verificacaoTickerUrl !== 'https://finance.yahoo.com/'){
  falha('metadados de fonte incompletos');
}
const cat = base.catalogoB3 || {};
if(cat.total !== etfs.length || !Number.isInteger(cat.verificadosAgora) || !Number.isInteger(cat.preservados) || !Number.isInteger(cat.naoVerificados) || cat.verificadosAgora + cat.preservados + cat.naoVerificados !== cat.total){
  falha('cobertura do catalogo oficial ausente ou inconsistente');
}
if(!cat.categorias || typeof cat.categorias !== 'object' || Array.isArray(cat.categorias) || Object.keys(cat.categorias).some(c => !CATEGORIAS.has(c)) || Object.values(cat.categorias).some(n => !Number.isInteger(n) || n < 0) || Object.values(cat.categorias).reduce((a,n)=>a+n,0) !== cat.total){
  falha('contagem por categoria inconsistente');
}

etfs.forEach(x => {
  if(!x || typeof x.ticker !== 'string' || !x.ticker.trim() || typeof x.nome !== 'string' || !x.nome.trim() || typeof x.categoria !== 'string' || !x.categoria.trim()) falha('identidade incompleta: ' + JSON.stringify(x));
  if(!CATEGORIAS.has(x.categoria)) falha('categoria fora da taxonomia: ' + x.ticker + ' / ' + x.categoria);
  if(!/^[A-Z0-9]{4}11$/.test(x.ticker)) falha('ticker fora do padrao +11: ' + x.ticker);
  if(!Number.isInteger(x.idB3) || x.idB3 <= 0) falha('id B3 invalido: ' + x.ticker);
  if(x.nomeCurto !== undefined && (typeof x.nomeCurto !== 'string' || !x.nomeCurto.trim())) falha('nome curto invalido: ' + x.ticker);
  if(x.stale !== undefined && x.stale !== true) falha('marcador de preservacao invalido: ' + x.ticker);
  if(x.tickerVerificado !== undefined && x.tickerVerificado !== false) falha('marcador de verificacao invalido: ' + x.ticker);
});
if(new Set(etfs.map(x => x.idB3)).size !== etfs.length) falha('ha ids B3 repetidos');
for(const c of CATEGORIAS){
  if(cat.categorias && (cat.categorias[c] || 0) !== etfs.filter(x => x.categoria === c).length) falha('contagem divergente em ' + c);
}
if(etfs.filter(x => x.stale === true).length !== cat.preservados) falha('total de registros preservados inconsistente');
if(etfs.filter(x => x.tickerVerificado === false).length !== cat.naoVerificados) falha('total de tickers nao verificados inconsistente');

const mapa = html.match(/const CATEGORIA_ETF_PT = (\{[\s\S]*?\n\});/);
if(!mapa){
  falha('mapa de traducao de categorias de ETF nao encontrado');
} else {
  const traducoes = Function('return (' + mapa[1] + ')')();
  const semTraducao = [...new Set(etfs.map(x => x.categoria).filter(c => !traducoes[c]))];
  if(semTraducao.length) falha('categorias sem traducao: ' + semTraducao.join(', '));
}

const script = html.match(/<script>([\s\S]*?)<\/script>/);
if(!script){
  falha('script principal nao encontrado');
} else {
  try { Function(script[1]); }
  catch(err){ falha('JavaScript invalido no index.html: ' + err.message); }
}

if(!process.exitCode){
  console.log('OK: ' + etfs.length + ' ETFs catalogados e todas as categorias traduzidas');
}
