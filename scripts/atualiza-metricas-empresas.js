/*
 * Calcula metricas historicas das empresas brasileiras. A chave e o codigo
 * interno da companhia. A referencia historica usa o giro medio de 20
 * sessoes, independentemente da classe usada na cotacao intradiaria.
 *
 * Uso: node scripts/atualiza-metricas-empresas.js
 */

const fs = require('fs');
const path = require('path');

const { espera, arred, mediana, extraiHistorico, historico, calcula } = require('./lib/serie');

const RAIZ = path.join(__dirname, '..');
const HTML = path.join(RAIZ, 'index.html');
const SAIDA = path.join(RAIZ, 'metricas-empresas.json');
const CONCORRENCIA = 6;

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
function relativos(metricas,empresas,chave,destino,grupo){
  const v=new Map(),amostra='n'+destino.slice(1),ch=e=>JSON.stringify([e[grupo],metricas[e.cod]?.dt]);
  empresas.forEach(e=>{const m=metricas[e.cod];if(m&&!m.stale&&e[grupo]&&Number.isFinite(m[chave])){const k=ch(e);if(!v.has(k))v.set(k,[]);v.get(k).push(m[chave]);}});
  empresas.forEach(e=>{const m=metricas[e.cod];if(!m)return;const a=!m.stale&&Number.isFinite(m[chave])?(v.get(ch(e))||[]):[];m[amostra]=a.length;m[destino]=a.length>=3?arred(m[chave]-mediana(a)):null;});
}

async function metricasEmpresa(e,busca=historico){
  const tickers=classes(e),candidatas=[],falhas=[];
  for(const t of tickers){try{const m=calcula(await busca(t),{ticker:t});if(!m||!Number.isFinite(m.g20))throw new Error('historico ou volume insuficiente');candidatas.push(m);}catch(err){falhas.push(t+': '+err.message);}}
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
