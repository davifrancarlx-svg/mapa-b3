/*
 * Calcula metricas historicas das empresas brasileiras. A chave e o codigo
 * interno da companhia, e o ticker de referencia segue a maior liquidez do
 * dia, como na interface.
 *
 * Uso: node scripts/atualiza-metricas-empresas.js
 */

const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..');
const HTML = path.join(RAIZ, 'index.html');
const PRECOS = path.join(RAIZ, 'precos.json');
const SAIDA = path.join(RAIZ, 'metricas-empresas.json');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/122.0 Safari/537.36';
const CONCORRENCIA = 6;
const espera = ms => new Promise(r => setTimeout(r, ms));
const arred = (n,c=2) => Number.isFinite(n) ? +n.toFixed(c) : null;
const media = a => a.length ? a.reduce((s,n)=>s+n,0)/a.length : null;
const mediana = a => { if(!a.length) return null; const s=[...a].sort((x,y)=>x-y),m=Math.floor(s.length/2); return s.length%2?s[m]:(s[m-1]+s[m])/2; };
const retorno = (a,n) => a.length>n && a[a.length-1-n]>0 ? (a[a.length-1]/a[a.length-1-n]-1)*100 : null;

function leEmpresas(){
  const raw=fs.readFileSync(HTML,'utf8'), marca='const D = ', ini=raw.indexOf(marca), start=ini+marca.length;
  let nivel=0,texto=false,escape=false,fim=-1;
  for(let i=start;i<raw.length;i++){
    const c=raw[i];
    if(texto){ if(escape) escape=false; else if(c==='\\') escape=true; else if(c==='"') texto=false; continue; }
    if(c==='"'){texto=true;continue;} if(c==='{') nivel++; else if(c==='}' && --nivel===0){fim=i+1;break;}
  }
  return JSON.parse(raw.slice(start,fim)).empresas;
}
function referencia(e, precos){
  const ts=(e.tickers||'').split(',').map(x=>x.trim()).filter(Boolean);
  return ts.sort((a,b)=>(precos[b]?.vol||0)-(precos[a]?.vol||0))[0] || null;
}
async function historico(ticker,tentativa=1){
  try{
    const u='https://query1.finance.yahoo.com/v8/finance/chart/'+ticker+'.SA?interval=1d&range=2y&events=div%2Csplits&includeAdjustedClose=true';
    const r=await fetch(u,{headers:{'User-Agent':UA}}); if(r.status!==200) throw new Error('status '+r.status);
    const h=(await r.json()).chart?.result?.[0],q=h?.indicators?.quote?.[0],aj=h?.indicators?.adjclose?.[0]?.adjclose||q?.close;
    if(!h?.timestamp||!q?.close||!aj) throw new Error('serie vazia');
    return h.timestamp.map((ts,i)=>({ts,p:q.close[i],a:aj[i],vol:q.volume?.[i]||0}))
      .filter(x=>Number.isFinite(x.p)&&x.p>0&&Number.isFinite(x.a)&&x.a>0);
  }catch(err){ if(tentativa<3){await espera(700*tentativa);return historico(ticker,tentativa+1);} throw err; }
}
function desvio(a){if(a.length<2)return null;const m=media(a);return Math.sqrt(a.reduce((s,n)=>s+(n-m)**2,0)/(a.length-1));}
function calcula(rows,ticker){
  if(rows.length<22)return null; const ult=rows.at(-1),a=rows.map(x=>x.a),g=rows.map(x=>x.p*x.vol);
  const j20=rows.slice(-20),j60=rows.slice(-60),j252=rows.slice(-252),r22=a.slice(-22),rd=r22.slice(1).map((p,i)=>Math.log(p/r22[i]));
  const max=Math.max(...j252.map(x=>x.a)),min=Math.min(...j252.map(x=>x.a)),base=j252[0].a;
  return {ticker,dt:new Date(ult.ts*1000).toISOString().slice(0,10),n:rows.length,
    r21:arred(retorno(a,21)),r63:arred(retorno(a,63)),r252:arred(retorno(a,252)),
    g20:arred(media(g.slice(-20)),0),g60:arred(media(g.slice(-60)),0),d20:j20.filter(x=>x.vol>0).length,d60:j60.filter(x=>x.vol>0).length,
    dd252:arred((ult.a/max-1)*100),min252:arred(min),max252:arred(max),
    mm50:rows.length>=50?arred((ult.a/media(a.slice(-50))-1)*100):null,
    mm200:rows.length>=200?arred((ult.a/media(a.slice(-200))-1)*100):null,
    v21:rd.length>=15?arred(desvio(rd)*Math.sqrt(252)*100):null,
    sp:j252.filter((x,i)=>i%5===0||i===j252.length-1).map(x=>arred(x.a/base*100,1))};
}
function relativos(metricas,empresas,chave,destino,grupo){
  const v={}; empresas.forEach(e=>{const n=metricas[e.cod]?.[chave];if(typeof n==='number')(v[e[grupo]]||=[]).push(n);});
  const b=Object.fromEntries(Object.entries(v).map(([k,a])=>[k,mediana(a)]));
  empresas.forEach(e=>{const m=metricas[e.cod],x=b[e[grupo]];if(m&&typeof m[chave]==='number'&&typeof x==='number')m[destino]=arred(m[chave]-x);});
}

(async()=>{
  const empresas=leEmpresas(), precos=JSON.parse(fs.readFileSync(PRECOS,'utf8')).precos||{};
  const anterior=fs.existsSync(SAIDA)?JSON.parse(fs.readFileSync(SAIDA,'utf8')).metricas||{}:{};
  const metricas={},falhas=[]; let prox=0,novos=0;
  async function trabalha(){while(true){const i=prox++;if(i>=empresas.length)return;const e=empresas[i],t=referencia(e,precos);
    if(!t){falhas.push(e.cod+': sem ticker');continue;} try{const m=calcula(await historico(t),t);if(!m)throw new Error('historico curto');metricas[e.cod]=m;novos++;}
    catch(err){if(anterior[e.cod])metricas[e.cod]={...anterior[e.cod],stale:true};falhas.push(e.cod+': '+err.message);} if((i+1)%40===0)console.log('  '+(i+1)+'/'+empresas.length);await espera(80);}}
  await Promise.all(Array.from({length:CONCORRENCIA},trabalha));
  ['21','63','252'].forEach(n=>{relativos(metricas,empresas,'r'+n,'rc'+n,'macro');relativos(metricas,empresas,'r'+n,'rg'+n,'seg');});
  if(novos/empresas.filter(e=>e.tickers).length<.85)throw new Error('cobertura nova abaixo de 85%');
  const out={atualizadoEm:new Date().toISOString(),fonte:'Yahoo Finance (nao oficial), serie diaria ajustada',totalEmpresas:empresas.length,
    comHistoricoNovo:novos,semHistorico:empresas.filter(e=>!metricas[e.cod]).map(e=>e.cod),metricas};
  fs.writeFileSync(SAIDA,JSON.stringify(out,null,1)+'\n'); console.log('gravado: '+Object.keys(metricas).length+'/'+empresas.length); if(falhas.length)console.log('falhas: '+falhas.length);
})().catch(e=>{console.error('ERRO:',e.message);process.exit(1);});
