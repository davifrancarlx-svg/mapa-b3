/*
 * Valida a cobertura e os limites basicos de metricas.json.
 * Uso: node scripts/valida-metricas.js
 */

const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..');
const bdrs = JSON.parse(fs.readFileSync(path.join(RAIZ, 'bdrs.json'), 'utf8')).bdrs || [];
const base = JSON.parse(fs.readFileSync(path.join(RAIZ, 'metricas.json'), 'utf8'));
const metricas = base.metricas || {};
const universo = new Set(bdrs.map(b => b.ticker));
const erros = [];
const campos = ['r21','r63','r252','g20','g60','d20','d60','dd252','min252','max252','mm50','mm200','v21','ri21','ri63','ri252','rs21','rs63','rs252'];

const falha = msg => erros.push(msg);
if(base.totalBDRs !== bdrs.length) falha('totalBDRs diverge de bdrs.json');
if(!base.fonte || !base.metodologia || !base.atualizadoEm) falha('metadados de fonte, metodologia ou data ausentes');

Object.entries(metricas).forEach(([ticker,m]) => {
  if(!universo.has(ticker)) falha(ticker + ': fora do universo de BDRs');
  if(!m.dt || !m.n) falha(ticker + ': data ou numero de pregoes ausente');
  campos.forEach(c => {
    if(m[c] !== null && m[c] !== undefined && !Number.isFinite(m[c])) falha(ticker + ': ' + c + ' invalido');
  });
  if(m.d20 < 0 || m.d20 > 20) falha(ticker + ': d20 fora do limite');
  if(m.d60 < 0 || m.d60 > 60) falha(ticker + ': d60 fora do limite');
  if(m.g20 < 0 || m.g60 < 0) falha(ticker + ': giro negativo');
  if(m.min252 > m.max252) falha(ticker + ': minima acima da maxima');
  if(m.spP !== undefined || m.spD !== undefined){
    if(!Array.isArray(m.sp)||!Array.isArray(m.spP)||!Array.isArray(m.spD)||m.sp.length!==m.spP.length||m.sp.length!==m.spD.length||m.spP.some(v=>!Number.isFinite(v)||v<=0)||m.spD.some(d=>!/^\d{4}-\d{2}-\d{2}$/.test(d))) falha(ticker + ': amostras de preco e data invalidas');
  }
  ['21','63','252'].forEach(n => {
    if(typeof m['r' + n] === 'number' && (typeof m['ri' + n] !== 'number' || typeof m['rs' + n] !== 'number'))
      falha(ticker + ': retorno relativo de ' + n + ' pregoes ausente');
  });
});

const cobertura = Object.keys(metricas).length / bdrs.length;
if(cobertura < .9) falha('cobertura abaixo de 90%: ' + (cobertura*100).toFixed(1) + '%');
if(erros.length){
  console.error('ERRO: ' + erros.slice(0,30).join('\nERRO: '));
  if(erros.length > 30) console.error('... e mais ' + (erros.length-30) + ' erros');
  process.exit(1);
}
console.log('OK: ' + Object.keys(metricas).length + '/' + bdrs.length + ' BDRs com metricas (' + (cobertura*100).toFixed(1) + '%)');
