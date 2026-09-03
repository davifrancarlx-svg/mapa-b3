const fs=require('fs'),path=require('path'),R=path.join(__dirname,'..');
const FONTES={precos:['Preços',80,72],bdrs:['Catálogo BDR',100,null],etfs:['Catálogo ETF',100,null],metricasBdr:['Histórico BDR',90,96],metricasEmpresas:['Histórico empresas',75,96],analise:['Ativo lastro',70,96],eventos:['Documentos CVM',null,120]};
const ARQUIVOS={precos:'precos.json',bdrs:'bdrs.json',etfs:'etfs.json',metricasBdr:'metricas.json',metricasEmpresas:'metricas-empresas.json',analise:'analise.json',eventos:'eventos.json'};
const objeto=x=>x&&typeof x==='object'&&!Array.isArray(x),percentual=(n,t)=>Number.isInteger(t)&&t>0?+(n/t*100).toFixed(1):null;
const data=d=>typeof d==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(d)&&Number.isFinite(Date.parse(d))&&new Date(d).toISOString().slice(0,10)===d;
function avaliaFonte(x,agora){
  const avisos=[...x.avisos],t=typeof x.atualizadoEm==='string'?Date.parse(x.atualizadoEm):NaN;
  if(!Number.isFinite(t))avisos.push('Data da coleta ausente ou inválida.');
  else if(t>agora+300000)avisos.push('Data da coleta no futuro; confira o relógio e a base.');
  else if(x.limiteHoras!==null&&agora-t>x.limiteHoras*36e5)avisos.push('Última coleta há mais de '+x.limiteHoras+' horas.');
  // Compara contagens, nao o percentual arredondado mostrado na tela.
  if(x.minCobertura!==null&&(x.total===null||x.total<=0||x.renovados/x.total*100<x.minCobertura))avisos.push('Cobertura renovada abaixo do limite de '+x.minCobertura+'%.');
  return avisos;
}
function avalia(s,agora=Date.now()){
  const avisos=Object.values(s.fontes).flatMap(x=>avaliaFonte(x,agora).map(a=>x.nome+': '+a));
  const t=Date.parse(s.geradoEm);
  if(!Number.isFinite(t)||t>agora+300000)avisos.unshift('Data do diagnóstico inválida ou no futuro.');
  else if(agora-t>96*36e5)avisos.unshift('Diagnóstico gerado há mais de 96 horas; a cópia pode estar desatualizada.');
  return avisos;
}
function gera(bases,agora=Date.now()){
  const fontes={};
  for(const [k,[nome,minCobertura,limiteHoras]] of Object.entries(FONTES)){
    const d=bases[k],avisos=[];let itens=[],validos=[],total=null;
    const x={nome,minCobertura,limiteHoras,atualizadoEm:typeof (d?.atualizadoEm||d?.geradoEm)==='string'?(d.atualizadoEm||d.geradoEm):null,total,registros:0,renovados:0,preservados:0,cobertura:null,coberturaRenovada:null,observacaoInicio:null,observacaoFim:null,avisos};
    fontes[k]=x;
    if(!objeto(d)){avisos.push('Base ausente, ilegível ou inválida.');continue;}
    if(k==='bdrs'){
      total=d.total;itens=Array.isArray(d.bdrs)?d.bdrs:[];
      const vistos=new Set();validos=itens.filter(b=>{if(!b||!['ticker','pais','setor','industria'].every(c=>typeof b[c]==='string'&&b[c].trim())||vistos.has(b.ticker))return false;vistos.add(b.ticker);return true;});
    }else if(k==='etfs'){
      total=d.total;itens=Array.isArray(d.etfs)?d.etfs:[];
      const vistos=new Set();validos=itens.filter(x=>{if(!x||!['ticker','nome','categoria'].every(c=>typeof x[c]==='string'&&x[c].trim())||vistos.has(x.ticker))return false;vistos.add(x.ticker);return true;});
    }else if(k==='eventos'){
      if(!objeto(d.eventos)||Object.values(d.eventos).some(a=>!Array.isArray(a)))avisos.push('Estrutura de documentos inválida.');
      else itens=Object.values(d.eventos).flat();
      validos=itens.filter(v=>v&&data(v.dt)&&typeof v.url==='string');
      if(!itens.length)avisos.push('Nenhum documento carregado; confira a base e o recorte.');
    }else{
      const campo=k==='precos'?'precos':k==='analise'?'analise':'metricas';
      total=k==='precos'?d.tickersConsultados:k==='metricasEmpresas'?d.totalEmpresas:d.totalBDRs;
      if(!objeto(d[campo]))avisos.push('Estrutura de registros inválida.');
      else itens=Object.values(d[campo]);
      validos=itens.filter(v=>objeto(v)&&(k==='precos'?Number.isFinite(v.p)&&v.p>0:k==='analise'?Number.isFinite(v.precoAtivo)&&v.precoAtivo>0&&Number.isFinite(v.fator)&&v.fator>0&&data(v.dtAtivo):Number.isInteger(v.n)&&v.n>=22&&data(v.dt)));
    }
    if(validos.length!==itens.length)avisos.push((itens.length-validos.length)+' registros inválidos ou duplicados, excluídos da cobertura.');
    if(k!=='eventos'){
      if(!Number.isInteger(total)||total<=0||validos.length>total){avisos.push('Total do universo ausente ou inconsistente.');total=null;}
      if(['metricasBdr','analise'].includes(k)&&Number.isInteger(bases.bdrs?.total)&&total!==bases.bdrs.total)avisos.push('Universo diferente do catálogo BDR.');
      if(['bdrs','etfs'].includes(k)&&itens.length!==d.total)avisos.push('Contagem do catálogo diferente do total declarado.');
    }
    const preservados=validos.filter(v=>v.stale===true).length,renovados=validos.length-preservados;
    const datas=validos.map(v=>k==='precos'&&Number.isFinite(v.t)&&v.t>0&&v.t<8640000000000?new Date(v.t*1000).toISOString().slice(0,10):k==='analise'?v.dtAtivo:v.dt).filter(data).sort();
    Object.assign(x,{total,registros:validos.length,renovados,preservados,cobertura:percentual(validos.length,total),coberturaRenovada:percentual(renovados,total),observacaoInicio:datas[0]||null,observacaoFim:datas.at(-1)||null});
  }
  const s={versao:2,geradoEm:new Date(agora).toISOString(),fontes};s.avisos=avalia(s,agora);s.estado=s.avisos.length?'atencao':'ok';return s;
}
module.exports={FONTES,ARQUIVOS,gera,avalia,avaliaFonte,percentual};
if(require.main===module){
  const bases={};for(const [k,f] of Object.entries(ARQUIVOS)){try{bases[k]=JSON.parse(fs.readFileSync(path.join(R,f),'utf8'));}catch{bases[k]=null;}}
  const s=gera(bases);require('./valida-saude').valida(s);
  const destino=path.join(R,'saude.json'),tmp=destino+'.tmp';fs.writeFileSync(tmp,JSON.stringify(s,null,1)+'\n');fs.renameSync(tmp,destino);
  console.log(s.estado.toUpperCase()+': '+(s.avisos.join('; ')||'coberturas e datas dentro dos limites'));
}
