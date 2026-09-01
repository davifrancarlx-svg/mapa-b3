/*
 * Junta ativo lastro, cambio, preco e retornos para explicar o BDR em reais.
 * Paridade e um valor indicativo: horarios, custos e liquidez diferem.
 *
 * Uso: node scripts/atualiza-analise.js
 */

const fs=require('fs'),path=require('path');
const RAIZ=path.join(__dirname,'..'),REF=path.join(RAIZ,'bdrs-referencia.json'),SAIDA=path.join(RAIZ,'analise.json');
const UA='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/122.0 Safari/537.36',espera=ms=>new Promise(r=>setTimeout(r,ms));
const SUBUNIDADE={GBp:{moeda:'GBP',div:100},GBX:{moeda:'GBP',div:100},ZAc:{moeda:'ZAR',div:100},ILA:{moeda:'ILS',div:100}};
const arred=(n,c=2)=>Number.isFinite(n)?+n.toFixed(c):null;
const retorno=(a,n)=>a.length>n&&a[a.length-1-n]>0?(a.at(-1)/a[a.length-1-n]-1)*100:null;

async function json(url,tentativa=1){
  try{const r=await fetch(url,{headers:{'User-Agent':UA}});if(r.status!==200)throw new Error('status '+r.status);return r.json();}
  catch(e){if(tentativa<3){await espera(600*tentativa);return json(url,tentativa+1);}throw e;}
}
async function resolve(ref,empresa){
  const q=encodeURIComponent(ref.isinAtivo||ref.ativo+' '+empresa);
  const j=await json('https://query1.finance.yahoo.com/v1/finance/search?q='+q+'&quotesCount=8&newsCount=0');
  const lista=(j.quotes||[]).filter(x=>x.quoteType==='EQUITY'&&!String(x.symbol).endsWith('.SA'));
  const exato=lista.find(x=>x.symbol===ref.ativo||x.symbol===ref.ativo.replace('.','-'));
  return (exato||lista[0])?.symbol||null;
}
async function serie(simbolo){
  const j=await json('https://query1.finance.yahoo.com/v8/finance/chart/'+encodeURIComponent(simbolo)+'?interval=1d&range=2y&events=div%2Csplits&includeAdjustedClose=true');
  const h=j.chart?.result?.[0],q=h?.indicators?.quote?.[0],aj=h?.indicators?.adjclose?.[0]?.adjclose||q?.close;
  if(!h?.timestamp||!aj)throw new Error('serie vazia');
  const rows=h.timestamp.map((ts,i)=>({ts,a:aj[i],p:q?.close?.[i]})).filter(x=>Number.isFinite(x.a)&&x.a>0);
  const j252=rows.slice(-252),base=j252[0]?.a,moedaOriginal=h.meta?.currency||null,unidade=SUBUNIDADE[moedaOriginal]||{moeda:moedaOriginal,div:1};
  return {moeda:unidade.moeda,moedaOriginal,bolsaYahoo:h.meta?.exchangeName||h.meta?.exchange||null,
    preco:(typeof h.meta?.regularMarketPrice==='number'?h.meta.regularMarketPrice:rows.at(-1)?.p)/unidade.div,
    t:h.meta?.regularMarketTime||rows.at(-1)?.ts,dt:new Date(rows.at(-1).ts*1000).toISOString().slice(0,10),
    r21:arred(retorno(rows.map(x=>x.a),21)),r63:arred(retorno(rows.map(x=>x.a),63)),r252:arred(retorno(rows.map(x=>x.a),252)),
    sp:j252.filter((x,i)=>i%5===0||i===j252.length-1).map(x=>arred(x.a/base*100,1))};
}
async function cambioYahoo(moeda){
  if(moeda==='BRL')return {moeda,preco:1,r21:0,r63:0,r252:0};
  const s=await serie(moeda+'BRL=X'); return {moeda,preco:s.preco,r21:s.r21,r63:s.r63,r252:s.r252,dt:s.dt};
}
async function ptax(moeda){
  if(moeda==='BRL')return {valor:1,dt:new Date().toISOString().slice(0,10)};
  const fim=new Date(),ini=new Date(Date.now()-10*864e5),fmt=d=>String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')+'-'+d.getFullYear();
  const base='https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata/CotacaoMoedaPeriodo(moeda=@moeda,dataInicial=@ini,dataFinalCotacao=@fim)';
  const u=base+'?%40moeda=\''+moeda+'\'&%40ini=\''+fmt(ini)+'\'&%40fim=\''+fmt(fim)+'\'&%24format=json';
  const v=(await json(u)).value||[];if(!v.length)return null;const x=v.at(-1);return {valor:x.cotacaoVenda,dt:String(x.dataHoraCotacao||'').slice(0,10)};
}
function combina(a,b){return typeof a==='number'&&typeof b==='number'?arred(((1+a/100)*(1+b/100)-1)*100):null;}
function percentis(analise,bdrs,metricas){
  ['industria','setor'].forEach(grupo=>{
    const g={};bdrs.forEach(b=>{const v=metricas[b.ticker]?.r63;if(typeof v==='number')(g[b[grupo]]||=[]).push(v);});
    bdrs.forEach(b=>{const v=metricas[b.ticker]?.r63,a=g[b[grupo]]||[],x=analise[b.ticker];if(x&&typeof v==='number'&&a.length)x[grupo==='industria'?'pIndustria63':'pSetor63']=Math.round(a.filter(n=>n<=v).length/a.length*100);});
  });
}

(async()=>{
  const bdrs=JSON.parse(fs.readFileSync(path.join(RAIZ,'bdrs.json'),'utf8')).bdrs||[],refs=JSON.parse(fs.readFileSync(REF,'utf8')).referencias||{};
  const metricas=JSON.parse(fs.readFileSync(path.join(RAIZ,'metricas.json'),'utf8')).metricas||{},precos=JSON.parse(fs.readFileSync(path.join(RAIZ,'precos.json'),'utf8')).precos||{};
  const anterior=fs.existsSync(SAIDA)?JSON.parse(fs.readFileSync(SAIDA,'utf8')).analise||{}:{},analise={},falhas=[];
  let prox=0,novos=0;const resolvidos={};
  async function trabalha(){while(true){const i=prox++;if(i>=bdrs.length)return;const b=bdrs[i],ref=refs[b.ticker];if(!ref)continue;
    try{let simbolo=anterior[b.ticker]?.simbolo,dados=null;const direto=ref.tipoLastro==='ADR'||/NASDAQ|NYSE|AMEX/i.test(ref.bolsa||'');
      if(!simbolo&&direto)simbolo=ref.ativo.replace('.','-');
      if(simbolo){try{dados=await serie(simbolo);}catch(e){simbolo=null;}}
      if(!simbolo){simbolo=await resolve(ref,b.empresa);if(!simbolo)throw new Error('ticker exterior nao resolvido');dados=await serie(simbolo);}
      const s=dados;resolvidos[s.moeda]=true;analise[b.ticker]={simbolo,moeda:s.moeda,moedaOriginal:s.moedaOriginal,bolsa:s.bolsaYahoo||ref.bolsa,
        precoAtivo:arred(s.preco,4),tAtivo:s.t,dtAtivo:s.dt,u21:s.r21,u63:s.r63,u252:s.r252,spu:s.sp,
        fator:ref.fator,bdrs:ref.bdrs,acoes:ref.acoes,fontePrograma:ref.fonte};novos++;}
    catch(e){if(anterior[b.ticker]?.simbolo&&anterior[b.ticker]?.fator)analise[b.ticker]={...anterior[b.ticker],stale:true};falhas.push(b.ticker+': '+e.message);}
    if((i+1)%50===0)console.log('  ativos '+(i+1)+'/'+bdrs.length);await espera(80);}}
  await Promise.all(Array.from({length:6},trabalha));
  const cambios={};for(const moeda of Object.keys(resolvidos)){try{cambios[moeda]={hist:await cambioYahoo(moeda),ptax:await ptax(moeda)};}catch(e){falhas.push(moeda+': cambio '+e.message);}}
  bdrs.forEach(b=>{const a=analise[b.ticker],m=metricas[b.ticker],p=precos[b.ticker];if(!a)return;const c=cambios[a.moeda],fx=c?.hist,oficial=c?.ptax;
    if(oficial?.valor&&a.precoAtivo&&a.fator){a.cambio=arred(oficial.valor,6);a.dtCambio=oficial.dt;a.paridade=arred(a.precoAtivo*a.cambio*a.fator);a.desvio=p?.p?arred((p.p/a.paridade-1)*100):null;}
    ['21','63','252'].forEach(n=>{a['c'+n]=fx?.['r'+n]??null;a['e'+n]=combina(a['u'+n],a['c'+n]);a['res'+n]=typeof m?.['r'+n]==='number'&&typeof a['e'+n]==='number'?arred(m['r'+n]-a['e'+n]):null;});
  });
  percentis(analise,bdrs,metricas);
  const out={atualizadoEm:new Date().toISOString(),fontes:{programas:'Banco B3, descritivos operacionais',cambio:'Banco Central do Brasil, PTAX',historico:'Yahoo Finance, nao oficial'},
    metodologia:'Paridade indicativa = preco do ativo lastro x PTAX x acoes por BDR; decomposicao combina retorno do ativo e cambio; diferenca residual inclui horarios e liquidez',
    totalBDRs:bdrs.length,comReferencia:Object.keys(refs).length,comAnalise:Object.keys(analise).length,atualizados:novos,
    desatualizados:Object.values(analise).filter(x=>x.stale).length,falhas,analise};
  fs.writeFileSync(SAIDA,JSON.stringify(out,null,1)+'\n');console.log('gravado: '+Object.keys(analise).length+'/'+bdrs.length);
})().catch(e=>{console.error('ERRO:',e.message);process.exit(1);});
