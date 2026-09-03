const fs=require('fs'),path=require('path'),{FONTES,avalia,percentual}=require('./gera-saude');
function valida(s){
  const erro=m=>{throw new Error('saude.json: '+m);},lista=a=>Array.isArray(a)&&a.every(x=>typeof x==='string');
  if(!s||s.versao!==2||typeof s.geradoEm!=='string'||!Number.isFinite(Date.parse(s.geradoEm))||!s.fontes||!lista(s.avisos))erro('metadados inválidos');
  if(Object.keys(s.fontes).sort().join()!==Object.keys(FONTES).sort().join())erro('fontes incompletas');
  for(const [k,[nome,min,horas]] of Object.entries(FONTES)){
    const x=s.fontes[k];if(!x||x.nome!==nome||x.minCobertura!==min||x.limiteHoras!==horas||!lista(x.avisos))erro(k+' regras inválidas');
    if(x.atualizadoEm!==null&&typeof x.atualizadoEm!=='string')erro(k+' data inválida');
    for(const c of ['registros','renovados','preservados'])if(!Number.isInteger(x[c])||x[c]<0)erro(k+' contagem inválida');
    if(x.renovados+x.preservados!==x.registros)erro(k+' contagens inconsistentes');
    if(x.total!==null&&(!Number.isInteger(x.total)||x.total<=0||x.registros>x.total))erro(k+' universo inválido');
    if(x.cobertura!==percentual(x.registros,x.total)||x.coberturaRenovada!==percentual(x.renovados,x.total))erro(k+' cobertura inconsistente');
    if(k==='eventos'&&x.total!==null)erro('documentos não têm cobertura percentual');
    for(const c of ['observacaoInicio','observacaoFim'])if(x[c]!==null&&(typeof x[c]!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(x[c])||!Number.isFinite(Date.parse(x[c]))||new Date(x[c]).toISOString().slice(0,10)!==x[c]))erro(k+' observação inválida');
    if((x.observacaoInicio===null)!==(x.observacaoFim===null)||x.observacaoInicio>x.observacaoFim)erro(k+' intervalo inválido');
  }
  const avisos=avalia(s,Date.parse(s.geradoEm));
  if(JSON.stringify(s.avisos)!==JSON.stringify(avisos)||s.estado!==(avisos.length?'atencao':'ok'))erro('estado inconsistente');
  return s;
}
module.exports={valida};
if(require.main===module){const s=valida(JSON.parse(fs.readFileSync(path.join(__dirname,'..','saude.json'),'utf8'))),avisos=avalia(s);if(avisos.length){console.error(avisos.join('\n'));process.exitCode=1;}else console.log('OK: estrutura, coberturas renovadas e datas das fontes validadas');}
