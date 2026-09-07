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
/* A serie do grafico vive em arquivo proprio desde que saiu do boot. */
const baseSerie = JSON.parse(fs.readFileSync(path.join(RAIZ, 'metricas-series.json'), 'utf8'));
const series = baseSerie.series || {};
const universo = new Set(bdrs.map(b => b.ticker));
const erros = [];
const campos = ['r21','r63','r252','g20','g60','d20','d60','dd252','dm252','min252','max252','mm50','mm200','v21','ri21','ri63','ri252','rs21','rs63','rs252'];

const falha = msg => erros.push(msg);
if(base.totalBDRs !== bdrs.length) falha('totalBDRs diverge de bdrs.json');
if(!base.fonte || !base.metodologia || !base.atualizadoEm) falha('metadados de fonte, metodologia ou data ausentes');

/* Os dois arquivos sao um so dado partido em dois. Se sairem de coletas
   diferentes, a ficha mostra o grafico de um dia com os indicadores de outro
   e nada quebra -- por isso a data tem de bater exatamente. */
if(baseSerie.atualizadoEm !== base.atualizadoEm) falha('metricas-series.json e de outra coleta que metricas.json');
if(baseSerie.totalBDRs !== base.totalBDRs) falha('totalBDRs diverge entre os dois arquivos');
if(!baseSerie.metodologia) falha('metadados de metricas-series.json ausentes');
/* Serie orfa: registro que saiu de metricas.json e ficou para tras aqui. */
Object.keys(series).forEach(t => { if(!metricas[t]) falha(t + ': serie sem registro correspondente em metricas.json'); });
/* E o contrario: quem tem historico suficiente precisa ter serie. */
Object.entries(metricas).forEach(([t, m]) => {
  if(Number.isInteger(m.n) && m.n >= 22 && !series[t]) falha(t + ': registro com historico mas sem serie em metricas-series.json');
});
/* A serie NAO pode voltar para metricas.json: o boot pagava 187 KB
   comprimidos por uma curva que so aparece ao abrir uma ficha. */
Object.entries(metricas).forEach(([t, m]) => {
  ['spP','spO','spInicio','spFim','spN','sp','spD'].forEach(c => {
    if(m[c] !== undefined) falha(t + ': ' + c + ' voltou para metricas.json; a serie mora em metricas-series.json');
  });
});

Object.entries(metricas).forEach(([ticker,m]) => {
  if(!universo.has(ticker)) falha(ticker + ': fora do universo de BDRs');
  if(!m.dt || !m.n) falha(ticker + ': data ou numero de pregoes ausente');
  campos.forEach(c => {
    if(m[c] !== null && m[c] !== undefined && !Number.isFinite(m[c])) falha(ticker + ': ' + c + ' invalido');
  });
  if(m.d20 < 0 || m.d20 > 20) falha(ticker + ': d20 fora do limite');
  if(m.d60 < 0 || m.d60 > 60) falha(ticker + ': d60 fora do limite');
  if(m.g20 < 0 || m.g60 < 0) falha(ticker + ': giro negativo');
  /* Mesma regra da base de empresas: janela incompleta nao vira numero.
     "Giro medio de 60 pregoes" com 24 sessoes seria medida sem lastro. */
  [20,60].forEach(n => {
    if(m.n < n && (m['g'+n] !== null || m['d'+n] !== null)) falha(ticker + ': janela de ' + n + ' incompleta com valor gravado');
  });
  if(m.min252 > m.max252) falha(ticker + ': minima acima da maxima');
  if(Number.isFinite(m.dd252) && m.dd252 > 0) falha(ticker + ': dd252 positivo');
  if(Number.isFinite(m.dm252) && m.dm252 < 0) falha(ticker + ': dm252 negativo');
  /* Serie comprimida: spP e spO, agora no arquivo separado. Registro
     preservado apos falha pode trazer o formato antigo (sp + spD) adiante, e
     continua valido. */
  const m2 = series[ticker];
  if(m2 && m2.spP !== undefined){
    const m = m2;
    if(!Array.isArray(m.spP)||m.spP.length<2||m.spP.some(v=>!Number.isFinite(v)||v<=0)) falha(ticker + ': amostras de preco invalidas');
    const antigo = m.spD !== undefined;
    if(antigo){
      if(!Array.isArray(m.sp)||!Array.isArray(m.spD)||m.sp.length!==m.spP.length||m.spD.length!==m.spP.length||m.spD.some(d=>!/^\d{4}-\d{2}-\d{2}$/.test(d))) falha(ticker + ': amostras de data invalidas');
    } else {
      if(m.sp !== undefined) falha(ticker + ': sp e derivado de spP, nao deve ser gravado');
      if(!Array.isArray(m.spO)||m.spO.length!==m.spP.length||m.spO.some(o=>!Number.isInteger(o)||o<0)) falha(ticker + ': offsets da serie invalidos');
      if(m.spO[0]!==0) falha(ticker + ': primeiro offset deve ser zero');
      if(m.spO.some((o,i)=>i&&o<=m.spO[i-1])) falha(ticker + ': offsets fora de ordem');
      if(!/^\d{4}-\d{2}-\d{2}$/.test(m.spInicio||'')) falha(ticker + ': spInicio ausente para reconstruir as datas');
      const fim = new Date(Date.parse(m.spInicio+'T00:00:00Z') + m.spO[m.spO.length-1]*86400000).toISOString().slice(0,10);
      if(fim !== m.spFim) falha(ticker + ': ultimo offset nao reconstroi spFim');
    }
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
