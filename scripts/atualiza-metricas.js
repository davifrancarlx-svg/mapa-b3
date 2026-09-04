/*
 * Calcula metricas historicas dos BDRs a partir de cotacoes diarias ajustadas.
 * O navegador recebe so os indicadores prontos; o historico bruto nao vai para
 * metricas.json, para manter a pagina leve.
 *
 * Uso: node scripts/atualiza-metricas.js
 */

const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..');
const BDRS = path.join(RAIZ, 'bdrs.json');
const SAIDA = path.join(RAIZ, 'metricas.json');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36';
const CONCORRENCIA = 6;
const COBERTURA_MINIMA = .9;
const espera = ms => new Promise(r => setTimeout(r, ms));

const arred = (n, casas = 2) => Number.isFinite(n) ? +n.toFixed(casas) : null;
const media = a => a.length ? a.reduce((s,n)=>s+n,0) / a.length : null;
const mediana = a => {
  if(!a.length) return null;
  const s = [...a].sort((x,y)=>x-y), m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m-1] + s[m]) / 2;
};
const retorno = (a, n) => a.length > n && a[a.length-1-n] > 0
  ? (a[a.length-1] / a[a.length-1-n] - 1) * 100 : null;

function desvio(a){
  if(a.length < 2) return null;
  const m = media(a);
  return Math.sqrt(a.reduce((s,n)=>s + Math.pow(n-m, 2), 0) / (a.length-1));
}

async function historico(ticker, tentativa = 1){
  try{
    const url = 'https://query1.finance.yahoo.com/v8/finance/chart/' + ticker + '.SA'
      + '?interval=1d&range=2y&events=div%2Csplits&includeAdjustedClose=true';
    const r = await fetch(url, { headers:{ 'User-Agent':UA } });
    if(r.status !== 200) throw new Error('status ' + r.status);
    const j = await r.json();
    const h = j.chart?.result?.[0];
    const q = h?.indicators?.quote?.[0];
    const aj = h?.indicators?.adjclose?.[0]?.adjclose || q?.close;
    if(!h?.timestamp || !q?.close || !aj) throw new Error('serie vazia');
    return h.timestamp.map((ts, i) => ({
      ts,
      p: q.close[i],
      a: aj[i],
      vol: q.volume?.[i] || 0
    })).filter(x => Number.isFinite(x.p) && x.p > 0 && Number.isFinite(x.a) && x.a > 0);
  } catch(err){
    if(tentativa < 3){
      await espera(700 * tentativa);
      return historico(ticker, tentativa + 1);
    }
    throw err;
  }
}

function calcula(rows){
  if(rows.length < 22) return null;
  const ult = rows[rows.length-1];
  const ajustados = rows.map(x => x.a);
  const giro = rows.map(x => x.p * x.vol);
  const j20 = rows.slice(-20), j60 = rows.slice(-60), j252 = rows.slice(-252);
  const janelaRet = ajustados.slice(-22);
  const retDia = janelaRet.slice(1).map((p,i) => Math.log(p / janelaRet[i]));
  const max252 = Math.max(...j252.map(x => x.a));
  const min252 = Math.min(...j252.map(x => x.a));
  const baseSpark = j252[0].a;
  const amostras = j252.filter((x,i) => i % 5 === 0 || i === j252.length-1);
  const sp = amostras.map(x => arred(x.a / baseSpark * 100, 1));
  return {
    dt: new Date(ult.ts * 1000).toISOString().slice(0,10),
    n: rows.length,
    r21: arred(retorno(ajustados, 21)),
    r63: arred(retorno(ajustados, 63)),
    r252: arred(retorno(ajustados, 252)),
    g20: arred(media(giro.slice(-20)), 0),
    g60: arred(media(giro.slice(-60)), 0),
    d20: j20.filter(x => x.vol > 0).length,
    d60: j60.filter(x => x.vol > 0).length,
    dd252: arred((ult.a / max252 - 1) * 100),
    dm252: arred((ult.a / min252 - 1) * 100),
    min252: arred(min252),
    max252: arred(max252),
    mm50: rows.length >= 50 ? arred((ult.a / media(ajustados.slice(-50)) - 1) * 100) : null,
    mm200: rows.length >= 200 ? arred((ult.a / media(ajustados.slice(-200)) - 1) * 100) : null,
    v21: retDia.length >= 15 ? arred(desvio(retDia) * Math.sqrt(252) * 100) : null,
    spInicio: new Date(j252[0].ts * 1000).toISOString().slice(0,10),
    spFim: new Date(ult.ts * 1000).toISOString().slice(0,10),
    spN: j252.length,
    sp,
    spP: amostras.map(x => arred(x.a, 4)),
    spD: amostras.map(x => new Date(x.ts * 1000).toISOString().slice(0,10))
  };
}

function relativos(metricas, bdrs, chave, destino, grupo){
  const valores = {};
  bdrs.forEach(b => {
    const v = metricas[b.ticker]?.[chave];
    if(typeof v !== 'number') return;
    const g = b[grupo];
    (valores[g] ||= []).push(v);
  });
  const bases = Object.fromEntries(Object.entries(valores).map(([g,a]) => [g, mediana(a)]));
  bdrs.forEach(b => {
    const m = metricas[b.ticker], base = bases[b[grupo]];
    if(m && typeof m[chave] === 'number' && typeof base === 'number') m[destino] = arred(m[chave] - base);
  });
}

(async () => {
  const base = JSON.parse(fs.readFileSync(BDRS, 'utf8'));
  const bdrs = base.bdrs || [];
  const anterior = fs.existsSync(SAIDA) ? JSON.parse(fs.readFileSync(SAIDA, 'utf8')).metricas || {} : {};
  const metricas = {};
  const falhas = [];
  let proximo = 0, novos = 0;

  async function trabalha(){
    while(true){
      const i = proximo++;
      if(i >= bdrs.length) return;
      const b = bdrs[i];
      try{
        const m = calcula(await historico(b.ticker));
        if(!m) throw new Error('menos de 22 pregoes');
        metricas[b.ticker] = m;
        novos++;
      } catch(err){
        if(anterior[b.ticker]) metricas[b.ticker] = { ...anterior[b.ticker], stale:true };
        falhas.push(b.ticker + ': ' + err.message);
      }
      if((i + 1) % 50 === 0) console.log('  ' + (i + 1) + '/' + bdrs.length);
      await espera(90);
    }
  }

  console.log('buscando dois anos de historico para ' + bdrs.length + ' BDRs...');
  await Promise.all(Array.from({length:CONCORRENCIA}, trabalha));

  const cobertura = novos / bdrs.length;
  if(cobertura < COBERTURA_MINIMA){
    throw new Error('cobertura nova de ' + (cobertura*100).toFixed(1) + '% abaixo do minimo de ' + (COBERTURA_MINIMA*100) + '%');
  }

  ['21','63','252'].forEach(n => {
    relativos(metricas, bdrs, 'r' + n, 'ri' + n, 'industria');
    relativos(metricas, bdrs, 'r' + n, 'rs' + n, 'setor');
  });

  const saida = {
    atualizadoEm: new Date().toISOString(),
    fonte: 'Yahoo Finance (nao oficial), serie diaria ajustada',
    metodologia: 'Retornos em pregoes; forca relativa em pontos percentuais contra a mediana da industria e do setor; giro medio inclui sessoes sem negocio',
    totalBDRs: bdrs.length,
    comHistoricoNovo: novos,
    preservados: Object.values(metricas).filter(m => m.stale).length,
    semHistorico: bdrs.filter(b => !metricas[b.ticker]).map(b => b.ticker),
    metricas
  };
  fs.writeFileSync(SAIDA, JSON.stringify(saida, null, 1) + '\n', 'utf8');
  console.log('gravado em ' + SAIDA + ': ' + Object.keys(metricas).length + '/' + bdrs.length + ' BDRs com metricas');
  if(falhas.length) console.log('falhas: ' + falhas.join(', '));
})().catch(err => { console.error('ERRO:', err.message); process.exit(1); });
