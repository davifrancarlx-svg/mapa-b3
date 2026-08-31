/*
 * Valida a cobertura editorial dos BDRs sem consultar a rede.
 * Uso: node scripts/valida-bdrs.js
 */

const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..');
const base = JSON.parse(fs.readFileSync(path.join(RAIZ, 'bdrs.json'), 'utf8'));
const complementos = JSON.parse(fs.readFileSync(path.join(__dirname, 'bdrs-complementos.json'), 'utf8'));
const html = fs.readFileSync(path.join(RAIZ, 'index.html'), 'utf8');

const SETORES = new Set([
  'Technology', 'Financial Services', 'Healthcare', 'Consumer Cyclical',
  'Consumer Defensive', 'Industrials', 'Energy', 'Utilities', 'Real Estate',
  'Basic Materials', 'Communication Services'
]);

function falha(msg){
  console.error('ERRO: ' + msg);
  process.exitCode = 1;
}

const bdrs = base.bdrs || [];
if(base.total !== bdrs.length) falha('total declarado difere do tamanho da lista');
if(new Set(bdrs.map(b => b.ticker)).size !== bdrs.length) falha('ha tickers repetidos');
if(!base.fontes?.lista || !base.fontes?.perfilPadrao || !base.fontes?.complementos){
  falha('metadados de fonte incompletos');
}

bdrs.forEach(b => {
  if(!b.ticker || !b.empresa || !b.tipo) falha('identidade incompleta: ' + JSON.stringify(b));
  if(!b.pais || !b.setor || !b.industria) falha('classificacao incompleta: ' + b.ticker);
  if(!SETORES.has(b.setor)) falha('setor fora da taxonomia: ' + b.ticker + ' / ' + b.setor);
});

Object.entries(complementos).forEach(([ticker, c]) => {
  const b = bdrs.find(x => x.ticker === ticker);
  if(!b) falha('complemento sem BDR ativo: ' + ticker);
  if(!c.fontePerfil?.nome || !/^https:\/\//.test(c.fontePerfil?.url || '')){
    falha('complemento sem fonte HTTPS: ' + ticker);
  }
  if(b && (!b.fontePerfil || b.fontePerfil.url !== c.fontePerfil.url)){
    falha('fonte do complemento nao chegou a base: ' + ticker);
  }
});

const mapa = html.match(/const INDUSTRIA_PT = (\{[\s\S]*?\n\});/);
if(!mapa){
  falha('mapa de traducao de industrias nao encontrado');
} else {
  const traducoes = Function('return (' + mapa[1] + ')')();
  const semTraducao = [...new Set(bdrs.map(b => b.industria).filter(i => !traducoes[i]))];
  if(semTraducao.length) falha('industrias sem traducao: ' + semTraducao.join(', '));
}

const script = html.match(/<script>([\s\S]*?)<\/script>/);
if(!script){
  falha('script principal nao encontrado');
} else {
  try { Function(script[1]); }
  catch(err){ falha('JavaScript invalido no index.html: ' + err.message); }
}

if(!process.exitCode){
  console.log('OK: ' + bdrs.length + ' BDRs classificados, ' + Object.keys(complementos).length + ' complementos com fonte e todas as industrias traduzidas');
}
