const fs=require('fs'),path=require('path'),R=path.join(__dirname,'..');
const le=f=>fs.existsSync(path.join(R,f))?JSON.parse(fs.readFileSync(path.join(R,f),'utf8')):null;
const p=le('precos.json'),b=le('bdrs.json'),m=le('metricas.json'),e=le('metricas-empresas.json'),a=le('analise.json'),v=le('eventos.json');
const idade=x=>x?Math.round((Date.now()-new Date(x).getTime())/36e5):null,avisos=[];
const fontes={
  precos:{atualizadoEm:p?.atualizadoEm||null,cobertura:p?+(p.tickersComPreco/p.tickersConsultados*100).toFixed(1):0,registros:p?.tickersComPreco||0},
  bdrs:{atualizadoEm:b?.geradoEm||null,cobertura:b?100:0,registros:b?.total||0},
  metricasBdr:{atualizadoEm:m?.atualizadoEm||null,cobertura:m?+(Object.keys(m.metricas||{}).length/m.totalBDRs*100).toFixed(1):0,registros:Object.keys(m?.metricas||{}).length},
  metricasEmpresas:{atualizadoEm:e?.atualizadoEm||null,cobertura:e?+(Object.keys(e.metricas||{}).length/e.totalEmpresas*100).toFixed(1):0,registros:Object.keys(e?.metricas||{}).length},
  analise:{atualizadoEm:a?.atualizadoEm||null,cobertura:a?+((a.atualizados??a.comAnalise)/a.totalBDRs*100).toFixed(1):0,registros:a?.atualizados??a?.comAnalise??0},
  eventos:{atualizadoEm:v?.atualizadoEm||null,cobertura:null,registros:Object.values(v?.eventos||{}).flat().length}
};
if(fontes.precos.cobertura<80)avisos.push('Cobertura de precos abaixo de 80%');
if(!b)avisos.push('Base de BDR ausente');
if(fontes.metricasBdr.cobertura<90)avisos.push('Cobertura historica de BDR abaixo de 90%');
if(fontes.metricasEmpresas.cobertura<75)avisos.push('Cobertura historica de empresas abaixo de 75%');
if(fontes.analise.cobertura<70)avisos.push('Cobertura de ativo lastro abaixo de 70%');
if(!v)avisos.push('Base de eventos da CVM ausente');
if(idade(p?.atualizadoEm)>72)avisos.push('Cotacoes sem atualizar ha mais de 72 horas');
if(idade(m?.atualizadoEm)>96)avisos.push('Metricas de BDR sem atualizar ha mais de 96 horas');
if(idade(e?.atualizadoEm)>96)avisos.push('Metricas de empresas sem atualizar ha mais de 96 horas');
if(idade(a?.atualizadoEm)>96)avisos.push('Analise de ativo lastro sem atualizar ha mais de 96 horas');
if(idade(v?.atualizadoEm)>120)avisos.push('Eventos da CVM sem atualizar ha mais de 120 horas');
const out={geradoEm:new Date().toISOString(),estado:avisos.length?'atencao':'ok',avisos,fontes};fs.writeFileSync(path.join(R,'saude.json'),JSON.stringify(out,null,1)+'\n');
console.log(out.estado.toUpperCase()+': '+(avisos.join('; ')||'todas as coberturas dentro dos limites'));
