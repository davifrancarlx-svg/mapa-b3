const fs=require('fs'),path=require('path'),{leEmpresas}=require('./atualiza-metricas-empresas');
const CATEGORIAS=['Fato Relevante','Comunicado ao Mercado','Calendário de Eventos Corporativos','Aviso aos Acionistas'];
function oficial(url){
  try{const u=new URL(url);return typeof url==='string'&&!url.includes('\\')&&u.protocol==='https:'&&(u.hostname==='cvm.gov.br'||u.hostname.endsWith('.cvm.gov.br'))&&!u.username&&!u.password&&!u.port;}catch{return false;}
}
function identidade(x){
  if(x.protocolo)return JSON.stringify([x.protocolo,x.versao]);
  const u=new URL(x.url);u.searchParams.sort();u.hash='';return u.href;
}
function valida(e,empresas){
  const erro=m=>{throw new Error(m);},data=d=>typeof d==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(d)&&Number.isFinite(Date.parse(d))&&new Date(d).toISOString().slice(0,10)===d;
  if(!Number.isFinite(Date.parse(e.atualizadoEm))||!e.fonte||!e.eventos||Array.isArray(e.eventos))erro('metadados ausentes');
  const fontes=Array.isArray(e.fonte)?e.fonte:[e.fonte];if(!fontes.length||fontes.some(u=>!oficial(u)))erro('fonte nao oficial');
  const codigos=new Set(empresas.map(x=>x.cod));let n=0,total=0;
  if(e.versao===2){
    if(!data(e.janela?.inicio)||!data(e.janela?.fim)||(Date.parse(e.janela.fim)-Date.parse(e.janela.inicio))/86400000!==179||e.janela.dias!==180||e.limitePorEmpresa!==8)erro('janela ou limite invalido');
    if(JSON.stringify([...(e.categorias||[])].sort())!==JSON.stringify([...CATEGORIAS].sort()))erro('categorias invalidas');
  }
  for(const [cod,itens] of Object.entries(e.eventos)){
    if(!codigos.has(cod)||!Array.isArray(itens)||!itens.length||itens.length>8)erro(cod+' registros invalidos');
    const ids=new Set();let anterior='9999-12-31';
    for(const x of itens){
      if(!oficial(x.url)||!data(x.dt)||!CATEGORIAS.includes(x.categoria)||x.dt>anterior)erro(cod+' link, data, categoria ou ordem invalida');
      for(const k of ['tipo','assunto','especie','protocolo','apresentacao'])if(x[k]!=null&&typeof x[k]!=='string')erro(cod+' campo textual invalido');
      if(x.versao!=null&&(!Number.isInteger(x.versao)||x.versao<1))erro(cod+' versao invalida');
      if(e.versao===2&&(x.dt<e.janela.inicio||x.dt>e.janela.fim))erro(cod+' documento fora da janela');
      const id=identidade(x);if(ids.has(id))erro(cod+' documento duplicado');ids.add(id);anterior=x.dt;n++;
    }
    if(e.versao===2){const t=e.totaisPorEmpresa?.[cod];if(!Number.isInteger(t)||t<itens.length||itens.length!==Math.min(8,t))erro(cod+' total inconsistente');total+=t;}
  }
  if(e.empresasComEventos!==Object.keys(e.eventos).length)erro('contagem de empresas inconsistente');
  if(e.versao===2&&(e.documentosExibidos!==n||e.documentosNoRecorte!==total||Object.keys(e.totaisPorEmpresa).length!==e.empresasComEventos))erro('totais inconsistentes');
  return n;
}
module.exports={oficial,identidade,valida};
if(require.main===module){const e=JSON.parse(fs.readFileSync(path.join(__dirname,'..','eventos.json'),'utf8'));console.log('OK: '+valida(e,leEmpresas())+' documentos; fontes, identificadores, datas e contagens validados');}
