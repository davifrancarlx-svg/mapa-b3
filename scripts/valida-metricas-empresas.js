const fs=require('fs'),path=require('path'),{leEmpresas,classes}=require('./atualiza-metricas-empresas');
function valida(base,empresas){
  const erro=m=>{throw new Error(m);},porCod=new Map(empresas.map(e=>[e.cod,e])),registros=Object.entries(base.metricas||{}),total=empresas.filter(e=>classes(e).length).length;
  if(!total||registros.length/total<.85)erro('cobertura abaixo de 85%');
  if(!Number.isFinite(Date.parse(base.atualizadoEm)))erro('data de atualizacao invalida');
  const numero=(v,min=-Infinity,max=Infinity)=>v===null||(Number.isFinite(v)&&v>=min&&v<=max);
  const data=d=>typeof d==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(d)&&Number.isFinite(Date.parse(d))&&new Date(d).toISOString().slice(0,10)===d;
  for(const [k,m] of registros){
    const e=porCod.get(k);if(!e||!classes(e).includes(m.ticker))erro(k+' ticker fora da empresa');
    if(!data(m.dt)||!Number.isInteger(m.n)||m.n<22)erro(k+' historico invalido');
    for(const n of [21,63,252])if(!numero(m['r'+n],-100)||(m.n<=n&&m['r'+n]!==null))erro(k+' retorno '+n+' invalido');
    for(const n of [20,60]){
      if(!numero(m['g'+n],0)||!numero(m['d'+n],0,n)||(m['d'+n]!==null&&!Number.isInteger(m['d'+n])))erro(k+' liquidez invalida');
      if(base.versao===2&&m.n<n&&(m['g'+n]!==null||m['d'+n]!==null))erro(k+' janela '+n+' incompleta');
    }
    if(!numero(m.dd252,-100,0)||!numero(m.dm252,0)||!numero(m.v21,0)||!Array.isArray(m.spP)||m.spP.length<2||m.spP.some(v=>!Number.isFinite(v)||v<=0))erro(k+' risco ou serie invalida');
    /* Serie comprimida: spP e spO, sem sp (derivado no cliente) nem spD.
       Registro preservado apos falha pode trazer o formato antigo adiante. */
    if(m.spD!==undefined){
      if(!Array.isArray(m.sp)||!Array.isArray(m.spD)||m.sp.length!==m.spP.length||m.spD.length!==m.spP.length||m.spD.some(d=>!data(d)))erro(k+' amostras de data invalidas');
    }else{
      if(m.sp!==undefined)erro(k+' sp e derivado de spP, nao deve ser gravado');
      if(!Array.isArray(m.spO)||m.spO.length!==m.spP.length||m.spO.some(o=>!Number.isInteger(o)||o<0)||m.spO[0]!==0||m.spO.some((o,i)=>i&&o<=m.spO[i-1]))erro(k+' offsets da serie invalidos');
      else if(data(m.spInicio)&&new Date(Date.parse(m.spInicio+'T00:00:00Z')+m.spO.at(-1)*86400000).toISOString().slice(0,10)!==m.spFim)erro(k+' ultimo offset nao reconstroi spFim');
    }
    for(const p of ['c','g'])for(const n of [21,63,252]){
      if(!(base.versao!==2&&m['r'+p+n]===undefined)&&!numero(m['r'+p+n]))erro(k+' relativo invalido');
      if(base.versao===2){const am=m['n'+p+n];if(!Number.isInteger(am)||am<0||am>registros.length||((am<3||m.stale)&&m['r'+p+n]!==null))erro(k+' amostra relativa invalida');}
    }
    if(base.versao===2&&!m.stale){
      if(m.criterioReferencia!=='g20'||!Number.isInteger(m.classesConsultadas)||m.classesConsultadas!==classes(e).length||!Number.isInteger(m.classesValidas)||m.classesValidas<1||m.classesValidas>m.classesConsultadas||typeof m.referenciaParcial!=='boolean'||!Array.isArray(m.falhasClasses)||m.referenciaParcial!==(m.classesValidas<m.classesConsultadas))erro(k+' criterio de referencia invalido');
      if(!data(m.spInicio)||m.spFim!==m.dt||m.spInicio>m.spFim||m.spN!==Math.min(252,m.n))erro(k+' periodo da serie invalido');
    }
  }
  if(base.versao===2){
    const preservados=registros.filter(([,m])=>m.stale).length;
    if(base.preservados!==preservados||base.comHistoricoNovo!==registros.length-preservados||base.comHistoricoNovo/total<.85)erro('contagem ou cobertura nova invalida');
    const ausentes=empresas.filter(e=>!base.metricas[e.cod]).map(e=>e.cod).sort();
    if(JSON.stringify([...(base.semHistorico||[])].sort())!==JSON.stringify(ausentes))erro('lista sem historico inconsistente');
  }
  return registros.length;
}
module.exports={valida};
if(require.main===module){const empresas=leEmpresas(),base=JSON.parse(fs.readFileSync(path.join(__dirname,'..','metricas-empresas.json'),'utf8'));console.log('OK: '+valida(base,empresas)+'/'+empresas.length+' empresas; tickers, janelas, numeros e amostras validados'+(base.versao===2?'':' (base legada)'));}
