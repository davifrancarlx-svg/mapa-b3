const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('node:assert/strict');
const raiz=path.join(__dirname,'..');
const codigo=fs.readFileSync(path.join(raiz,'index.html'),'utf8').match(/<script>([\s\S]*?)<\/script>/)[1];
const trecho=(a,b)=>codigo.slice(codigo.indexOf(a),codigo.indexOf(b,codigo.indexOf(a)));
async function carga(invertida){
  const respostas={},pendentes={},estado={};
  const ctx=vm.createContext({METRICAS:{},COLETAS:{},PARES_INDUSTRIA:{},METRICA_TS:'',
    fetch:u=>new Promise(ok=>pendentes[u]=()=>ok({ok:true,json:async()=>respostas[u]})),
    isoCSV:d=>new Date(d).toISOString(),concluiBase:(n,ok)=>estado[n]=ok,agendaRender(){},tentaAtivo(){},$:()=>({})});
  vm.runInContext(trecho('let SERIES_BDR =','function carregaMetricasEtfs(')+trecho('function carregaMetricas(){','function carregaAnalise('),ctx);
  respostas['metricas.json']={atualizadoEm:'2026-09-21T00:00:00Z',metricas:{AAAA34:{n:100}}};
  respostas['metricas-series.json']={atualizadoEm:'2026-09-21T00:00:00Z',series:{AAAA34:{spP:[1,2]}}};
  ctx.carregaMetricas();const p=ctx.carregaSeriesBdr();
  const ordem=invertida?['metricas-series.json','metricas.json']:['metricas.json','metricas-series.json'];
  for(const arq of ordem){pendentes[arq]();await new Promise(ok=>setImmediate(ok));}
  await p;assert.equal(ctx.METRICAS.AAAA34.spP.length,2);assert.equal(estado.seriesBdr,true);
  respostas['metricas-series.json'].atualizadoEm='2026-09-20T00:00:00Z';
  respostas['metricas-series.json'].series.AAAA34.spP=[99];
  const outro=ctx.carregaSeriesBdr();pendentes['metricas-series.json']();await outro;
  assert.equal(estado.seriesBdr,false);assert.equal(ctx.METRICAS.AAAA34.spP.length,2);
}
async function preservacao(){
  const gerador=fs.readFileSync(path.join(__dirname,'atualiza-metricas.js'),'utf8'),gravados={};
  const dados={'bdrs.json':{bdrs:Array.from({length:10},(_,i)=>({ticker:'BDR'+i,setor:'s',industria:'i'}))},
    'metricas.json':{metricas:{BDR0:{n:100,r21:1}}},
    'metricas-series.json':{series:{BDR0:{spP:[10,11],spO:[0,5],spInicio:'2026-01-01'}}}};
  const lib={...require('./lib/serie'),espera:async()=>{},historico:async t=>{if(t==='BDR0')throw Error('rede');return t;},calcula:()=>({n:100,r21:2,spP:[20,21],spO:[0,5]})};
  const ctx=vm.createContext({__dirname,console:{log(){},error:console.error},process:{exit(){throw Error('gerador abortou');}},require:n=>n==='fs'?{existsSync:p=>!!dados[path.basename(p)],readFileSync:p=>JSON.stringify(dados[path.basename(p)]),writeFileSync:(p,s)=>gravados[path.basename(p)]=JSON.parse(s)}:n==='path'?path:lib});
  await vm.runInContext(gerador,ctx);
  assert.equal(gravados['metricas.json'].metricas.BDR0.stale,true);
  assert.deepEqual(gravados['metricas-series.json'].series.BDR0.spP,[10,11]);
  assert.equal(gravados['metricas.json'].atualizadoEm,gravados['metricas-series.json'].atualizadoEm);
}
function carteira(){
  const nos={},no=id=>nos[id]||={value:'',textContent:''};
  const ctx=vm.createContext({$:no,CARTEIRA:[],CARTEIRA_EDITANDO:null,AVISO_CARTEIRA:'',localStorage:{setItem(){throw Error('quota');}},ativoCarteira:()=>({}),limpaFormCarteira(){},renderCarteira(){}});
  vm.runInContext(trecho('function custoCarteiraValido(','/* ---------- carteira cifrada')+trecho("$('formCarteira').onsubmit=", "$('carteiraTicker').addEventListener"),ctx);
  no('carteiraTicker').value='PETR4';no('carteiraQtd').value='2';no('carteiraPm').value='10';
  no('formCarteira').onsubmit({preventDefault(){}});
  assert.match(ctx.AVISO_CARTEIRA,/somente nesta sessão/);assert.equal(ctx.CARTEIRA.length,1);
  let aberto='';ctx.ativoCarteira=()=>({tipo:'FII'});ctx.abreFII=t=>aberto=t;
  vm.runInContext(trecho('function removePosicao(', 'function leFavoritos('),ctx);
  ctx.abrePosicao('MXRF11');assert.equal(aberto,'MXRF11');
  ctx.removePosicao('PETR4');assert.equal(ctx.CARTEIRA.length,0);assert.match(ctx.AVISO_CARTEIRA,/somente nesta sessão/);
}
function workflow(){
  assert.match(fs.readFileSync(path.join(raiz,'.github/workflows/valida.yml'),'utf8'),/node --experimental-websocket scripts\/testa-navegador\.js/);
  const y=fs.readFileSync(path.join(raiz,'.github/workflows/metricas.yml'),'utf8');
  for(const t of ['fiis','etfs'])assert.ok(y.indexOf('atualiza-metricas-'+t+'.js')<y.indexOf('valida-metricas-'+t+'.js')&&y.includes('atualiza-metricas-'+t+'.js'));
  const add=y.match(/git add ([^\r\n]+)/)[1];
  for(const f of ['metricas-series.json','metricas-fiis.json','metricas-etfs.json'])assert.ok(add.includes(f));
}
(async()=>{await carga(false);await carga(true);await preservacao();carteira();workflow();console.log('OK: ordem de cargas, coletas divergentes, preservacao apos falha, carteira sem armazenamento e arquivos publicados');})().catch(e=>{console.error(e);process.exitCode=1;});
