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

const etfs = base.etfs || [];
if(base.total !== etfs.length) falha('total declarado difere do tamanho da lista');
if(new Set(etfs.map(x => x.ticker)).size !== etfs.length) falha('ha tickers repetidos');
if(!base.fontes?.lista || !base.fontes?.verificacaoTicker){
  falha('metadados de fonte incompletos');
}

etfs.forEach(x => {
  if(!x.ticker || !x.nome || !x.categoria) falha('identidade incompleta: ' + JSON.stringify(x));
  if(!CATEGORIAS.has(x.categoria)) falha('categoria fora da taxonomia: ' + x.ticker + ' / ' + x.categoria);
  if(!/^[A-Z0-9]{4}11$/.test(x.ticker)) falha('ticker fora do padrao +11: ' + x.ticker);
});

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
