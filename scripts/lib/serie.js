/*
 * Nucleo compartilhado dos dois geradores de metricas: atualiza-metricas.js
 * (BDRs) e atualiza-metricas-empresas.js (empresas brasileiras).
 *
 * As duas bases publicam os MESMOS campos com os mesmos nomes, e a pagina
 * mostra os dois lado a lado. Antes havia duas implementacoes, e elas ja
 * tinham divergido em silencio -- o gerador de BDR tratava volume ausente
 * como zero e calculava "giro medio de 60 pregoes" com menos de 60 sessoes.
 * A versao das empresas era a estrita, e virou a referencia aqui.
 *
 * Sem dependencia externa e sem build: e require() puro, como o resto de
 * scripts/. Ao mexer, rode os dois validadores e testa-metricas-empresas.js.
 */

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36';

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
const desvio = a => {
  if(a.length < 2) return null;
  const m = media(a);
  return Math.sqrt(a.reduce((s,n)=>s + (n-m)**2, 0) / (a.length-1));
};

/* Data da amostra sempre em UTC, e a serie do grafico guarda offset em dias
   corridos sobre spInicio em vez de repetir a data inteira. O cliente refaz o
   mesmo calculo em UTC: em fuso local a amostra andaria um dia. */
const dia = ts => new Date(ts * 1000).toISOString().slice(0,10);
const offsetDias = (a, b) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000);

/* Volume ausente NAO e zero: vira null e derruba o giro daquela janela, em vez
   de virar uma sessao sem negocio que nunca existiu. A pagina afirma isso na
   metodologia; o gerador de BDR contradizia o proprio texto. */
function extraiHistorico(h){
  const q = h?.indicators?.quote?.[0], aj = h?.indicators?.adjclose?.[0]?.adjclose;
  if(!Array.isArray(h?.timestamp) || !Array.isArray(q?.close) || !Array.isArray(aj)) throw new Error('serie ajustada ausente');
  return h.timestamp.map((ts,i) => ({
    ts, p: q.close[i], a: aj[i],
    vol: Number.isFinite(q.volume?.[i]) && q.volume[i] >= 0 ? q.volume[i] : null
  })).filter(x => Number.isFinite(x.ts) && Number.isFinite(x.p) && x.p > 0 && Number.isFinite(x.a) && x.a > 0)
    .sort((a,b) => a.ts - b.ts);
}

/* Proventos vem no mesmo chart (`events=div`), e ate agora eram descartados.
   Nao entram em calcula() de proposito: BDR e acao brasileira nao publicam
   rendimento por este caminho, e enfiar o campo la faria as duas bases
   existentes crescerem com uma coluna sempre vazia. Quem usa e o gerador de
   FII, onde o rendimento mensal e a medida central do universo. */
function extraiProventos(h){
  const d = h?.events?.dividends;
  if(!d || typeof d !== 'object') return [];
  return Object.values(d)
    .filter(x => x && Number.isFinite(x.date) && Number.isFinite(x.amount) && x.amount > 0)
    .map(x => ({ d: dia(x.date), v: x.amount }))
    .sort((a, b) => a.d.localeCompare(b.d));
}

const urlChart = ticker => 'https://query1.finance.yahoo.com/v8/finance/chart/' + ticker + '.SA'
  + '?interval=1d&range=2y&events=div%2Csplits&includeAdjustedClose=true';

async function baixaChart(ticker){
  const r = await fetch(urlChart(ticker), { headers:{ 'User-Agent':UA }, signal: AbortSignal.timeout(25000) });
  if(r.status !== 200) throw new Error('status ' + r.status);
  return (await r.json()).chart?.result?.[0];
}

/* A retentativa cobre o download E a extracao, como sempre cobriu: um payload
   truncado chega com status 200 e so estoura na hora de ler a serie ajustada. */
async function tentaTres(fn, tentativa = 1){
  try{ return await fn(); }
  catch(err){
    if(tentativa < 3){ await espera(700 * tentativa); return tentaTres(fn, tentativa + 1); }
    throw err;
  }
}

async function historico(ticker){
  return tentaTres(async () => extraiHistorico(await baixaChart(ticker)));
}

async function historicoProventos(ticker){
  return tentaTres(async () => {
    const c = await baixaChart(ticker);
    return { rows: extraiHistorico(c), proventos: extraiProventos(c) };
  });
}

/* `extras` entra primeiro para preservar a ordem dos campos ja publicados
   (a base de empresas comeca por `ticker`), e so por isso. */
function calcula(rows, extras = {}){
  if(rows.length < 22) return null;
  const ult = rows.at(-1), a = rows.map(x => x.a);
  const j20 = rows.slice(-20), j60 = rows.slice(-60), j252 = rows.slice(-252);
  const r22 = a.slice(-22), rd = r22.slice(1).map((p,i) => Math.log(p / r22[i]));
  const max = Math.max(...j252.map(x=>x.a)), min = Math.min(...j252.map(x=>x.a));
  const amostras = j252.filter((x,i) => i % 5 === 0 || i === j252.length-1), inicio = dia(j252[0].ts);
  /* Janela curta ou volume desconhecido nao viram numero: "giro medio de 60
     pregoes" com 24 sessoes seria uma medida que a serie nao sustenta. */
  const completa = (janela,n) => janela.length === n && janela.every(x => Number.isFinite(x.vol) && x.vol >= 0);
  return {
    ...extras,
    dt: dia(ult.ts), n: rows.length,
    r21: arred(retorno(a,21)), r63: arred(retorno(a,63)), r252: arred(retorno(a,252)),
    g20: completa(j20,20) ? arred(media(j20.map(x=>x.p*x.vol)),0) : null,
    g60: completa(j60,60) ? arred(media(j60.map(x=>x.p*x.vol)),0) : null,
    d20: completa(j20,20) ? j20.filter(x=>x.vol>0).length : null,
    d60: completa(j60,60) ? j60.filter(x=>x.vol>0).length : null,
    dd252: arred((ult.a/max-1)*100), dm252: arred((ult.a/min-1)*100),
    min252: arred(min), max252: arred(max),
    mm50: rows.length >= 50 ? arred((ult.a/media(a.slice(-50))-1)*100) : null,
    mm200: rows.length >= 200 ? arred((ult.a/media(a.slice(-200))-1)*100) : null,
    v21: rd.length >= 15 ? arred(desvio(rd)*Math.sqrt(252)*100) : null,
    spInicio: inicio, spFim: dia(ult.ts), spN: j252.length,
    spP: amostras.map(x => arred(x.a,4)),
    spO: amostras.map(x => offsetDias(inicio, dia(x.ts)))
  };
}

module.exports = { UA, espera, arred, media, mediana, retorno, desvio, dia, offsetDias, extraiHistorico, extraiProventos, historico, historicoProventos, calcula };
