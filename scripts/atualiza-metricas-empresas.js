/*
 * Calcula metricas historicas das empresas brasileiras. A chave e o codigo
 * interno da companhia. A referencia historica usa o giro medio de 20
 * sessoes, independentemente da classe usada na cotacao intradiaria.
 *
 * Uso: node scripts/atualiza-metricas-empresas.js
 */

const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..');
const HTML = path.join(RAIZ, 'index.html');
const SAIDA = path.join(RAIZ, 'metricas-empresas.json');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/122.0 Safari/537.36';
const CONCORRENCIA = 6;
const espera = ms => new Promise(r => setTimeout(r, ms));
const arred = (n,c=2) => Number.isFinite(n) ? +n.toFixed(c) : null;
const media = a => a.length ? a.reduce((s,n)=>s+n,0)/a.length : null;
const mediana = a => { if(!a.length) return null; const s=[...a].sort((x,y)=>x-y),m=Math.floor(s.length/2); return s.length%2?s[m]:(s[m-1]+s[m])/2; };
const retorno = (a,n) => a.length>n && a[a.length-1-n]>0 ? (a[a.length-1]/a[a.length-1-n]-1)*100 : null;

function leEmpresas(raw=fs.readFileSync(HTML,'utf8')){
  const marca='const D = ', ini=raw.indexOf(marca), start=ini+marca.length;
  if(ini<0)throw new Error('bloco const D ausente');
  let nivel=0,texto=false,escape=false,fim=-1;
  for(let i=start;i<raw.length;i++){
    const c=raw[i];
    if(texto){ if(escape) escape=false; else if(c==='\\') escape=true; else if(c==='"') texto=false; continue; }
    if(c==='"'){texto=true;continue;} if(c==='{') nivel++; else if(c==='}' && --nivel===0){fim=i+1;break;}
  }
  if(fim<0)throw new Error('bloco const D incompleto');
  const empresas=JSON.parse(raw.slice(start,fim)).empresas;
  if(!Array.isArray(empresas)||!empresas.length)throw new Error('base de empresas vazia');
  return empresas;
}
const classes=e=>[...new Set((e.tickers||'').split(',').map(x=>x.trim()).filter(Boolean))];
function referencia(candidatas){
  const validas=candidatas.filter(m=>m&&Number.isFinite(m.g20)&&m.g20>=0);
  /* Datas anteriores nao disputam liquidez com uma classe mais recente. */
  const data=validas.map(m=>m.dt).sort().at(-1);
  return validas.filter(m=>m.dt===data).sort((a,b)=>b.g20-a.g20||a.ticker.localeCompare(b.ticker))[0]||null;
}
function extraiHistorico(h){
  const q=h?.indicators?.quote?.[0],aj=h?.indicators?.adjclose?.[0]?.adjclose;
  if(!Array.isArray(h?.timestamp)||!Array.isArray(q?.close)||!Array.isArray(aj))throw new Error('serie ajustada ausente');
  return h.timestamp.map((ts,i)=>({ts,p:q.close[i],a:aj[i],vol:Number.isFinite(q.volume?.[i])&&q.volume[i]>=0?q.volume[i]:null}))
    .filter(x=>Number.isFinite(x.ts)&&Number.isFinite(x.p)&&x.p>0&&Number.isFinite(x.a)&&x.a>0).sort((a,b)=>a.ts-b.ts);
}
async function historico(ticker,tentativa=1){
  try{
    const u='https://query1.finance.yahoo.com/v8/finance/chart/'+ticker+'.SA?interval=1d&range=2y&events=div%2Csplits&includeAdjustedClose=true';
    const r=await fetch(u,{headers:{'User-Agent':UA},signal:AbortSignal.timeout(25000)}); if(r.status!==200) throw new Error('status '+r.status);
    return extraiHistorico((await r.json()).chart?.result?.[0]);
  }catch(err){ if(tentativa<3){await espera(700*tentativa);return historico(ticker,tentativa+1);} throw err; }
}
function desvio(a){if(a.length<2)return null;const m=media(a);return Math.sqrt(a.reduce((s,n)=>s+(n-m)**2,0)/(a.length-1));}
function calcula(rows,ticker){
  if(rows.length<22)return null; const ult=rows.at(-1),a=rows.map(x=>x.a);
  const j20=rows.slice(-20),j60=rows.slice(-60),j252=rows.slice(-252),r22=a.slice(-22),rd=r22.slice(1).map((p,i)=>Math.log(p/r22[i]));
  const max=Math.max(...j252.map(x=>x.a)),min=Math.min(...j252.map(x=>x.a)),base=j252[0].a,amostras=j252.filter((x,i)=>i%5===0||i===j252.length-1);
  const completa=(janela,n)=>janela.length===n&&janela.every(x=>Number.isFinite(x.vol)&&x.vol>=0);
  return {ticker,dt:new Date(ult.ts*1000).toISOString().slice(0,10),n:rows.length,
    r21:arred(retorno(a,21)),r63:arred(retorno(a,63)),r252:arred(retorno(a,252)),
    g20:completa(j20,20)?arred(media(j20.map(x=>x.p*x.vol)),0):null,g60:completa(j60,60)?arred(media(j60.map(x=>x.p*x.vol)),0):null,
    d20:completa(j20,20)?j20.filter(x=>x.vol>0).length:null,d60:completa(j60,60)?j60.filter(x=>x.vol>0).length:null,
    dd252:arred((ult.a/max-1)*100),dm252:arred((ult.a/min-1)*100),min252:arred(min),max252:arred(max),
    mm50:rows.length>=50?arred((ult.a/media(a.slice(-50))-1)*100):null,
    mm200:rows.length>=200?arred((ult.a/media(a.slice(-200))-1)*100):null,
    v21:rd.length>=15?arred(desvio(rd)*Math.sqrt(252)*100):null,
    spInicio:new Date(j252[0].ts*1000).toISOString().slice(0,10),spFim:new Date(ult.ts*1000).toISOString().slice(0,10),spN:j252.length,
    sp:amostras.map(x=>arred(x.a/base*100,1)),spP:amostras.map(x=>arred(x.a,4)),spD:amostras.map(x=>new Date(x.ts*1000).toISOString().slice(0,10))};
}
function relativos(metricas,empresas,chave,destino,grupo){
  const v=new Map(),amostra='n'+destino.slice(1),ch=e=>JSON.stringify([e[grupo],metricas[e.cod]?.dt]);
  empresas.forEach(e=>{const m=metricas[e.cod];if(m&&!m.stale&&e[grupo]&&Number.isFinite(m[chave])){const k=ch(e);if(!v.has(k))v.set(k,[]);v.get(k).push(m[chave]);}});
  empresas.forEach(e=>{const m=metricas[e.cod];if(!m)return;const a=!m.stale&&Number.isFinite(m[chave])?(v.get(ch(e))||[]):[];m[amostra]=a.length;m[destino]=a.length>=3?arred(m[chave]-mediana(a)):null;});
}

async function metricasEmpresa(e,busca=historico){
  const tickers=classes(e),candidatas=[],falhas=[];
  for(const t of tickers){try{const m=calcula(await busca(t),t);if(!m||!Number.isFinite(m.g20))throw new Error('historico ou volume insuficiente');candidatas.push(m);}catch(err){falhas.push(t+': '+err.message);}}
  const m=referencia(candidatas);if(!m)throw new Error(falhas.join('; ')||'sem ticker');
  return {...m,criterioReferencia:'g20',classesConsultadas:tickers.length,classesValidas:candidatas.length,referenciaParcial:falhas.length>0,falhasClasses:falhas};
}
function confereCobertura(novos,total){
  if(!total||novos/total<.85)throw new Error('cobertura nova abaixo de 85%');
}
async function atualiza(){
  const empresas=leEmpresas();
  const anterior=fs.existsSync(SAIDA)?JSON.parse(fs.readFileSync(SAIDA,'utf8')).metricas||{}:{};
  const metricas={},falhas=[]; let prox=0,novos=0;
  async function trabalha(){while(true){const i=prox++;if(i>=empresas.length)return;const e=empresas[i];
    if(!classes(e).length)continue;try{metricas[e.cod]=await metricasEmpresa(e);novos++;}
    catch(err){if(anterior[e.cod]&&classes(e).includes(anterior[e.cod].ticker)){metricas[e.cod]={...anterior[e.cod],stale:true};if(metricas[e.cod].n<60){metricas[e.cod].g60=null;metricas[e.cod].d60=null;}}falhas.push(e.cod+': '+err.message);} if((i+1)%40===0)console.log('  '+(i+1)+'/'+empresas.length);await espera(80);}}
  console.log('Consultando as classes de '+empresas.length+' empresas...');
  await Promise.all(Array.from({length:CONCORRENCIA},trabalha));
  ['21','63','252'].forEach(n=>{relativos(metricas,empresas,'r'+n,'rc'+n,'macro');relativos(metricas,empresas,'r'+n,'rg'+n,'seg');});
  confereCobertura(novos,empresas.filter(e=>classes(e).length).length);
  const out={versao:2,atualizadoEm:new Date().toISOString(),fonte:'Yahoo Finance (nao oficial), serie diaria ajustada',totalEmpresas:empresas.length,
    metodologia:'Referencia por giro medio de 20 sessoes entre classes com historico suficiente na data mais recente; relativos contra pelo menos 3 empresas com a mesma data final, excluindo registros preservados',
    comHistoricoNovo:novos,preservados:Object.values(metricas).filter(m=>m.stale).length,falhas,semHistorico:empresas.filter(e=>!metricas[e.cod]).map(e=>e.cod),metricas};
  require('./valida-metricas-empresas').valida(out,empresas);
  fs.writeFileSync(SAIDA,JSON.stringify(out,null,1)+'\n'); console.log('gravado: '+Object.keys(metricas).length+'/'+empresas.length); if(falhas.length)console.log('falhas: '+falhas.length);
}
module.exports={leEmpresas,classes,extraiHistorico,calcula,referencia,relativos,metricasEmpresa,confereCobertura};
if(require.main===module)atualiza().catch(e=>{console.error('ERRO:',e.message);process.exit(1);});
