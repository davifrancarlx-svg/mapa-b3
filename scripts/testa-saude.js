const assert=require('node:assert/strict'),fs=require('fs'),path=require('path'),vm=require('vm');
const {gera,avalia,avaliaFonte,FONTES}=require('./gera-saude'),{valida}=require('./valida-saude');
const agora=Date.parse('2026-09-03T15:00:00Z'),ts=new Date(agora).toISOString();
const bases={
  precos:{atualizadoEm:ts,tickersConsultados:2,tickersComPreco:99,precos:{A:{p:10,t:agora/1000},B:{p:20,t:agora/1000}}},
  bdrs:{geradoEm:ts,total:2,bdrs:[{ticker:'A',pais:'BR',setor:'Setor',industria:'Indústria'},{ticker:'B',pais:'US',setor:'Setor',industria:'Indústria'}]},
  metricasBdr:{atualizadoEm:ts,totalBDRs:2,metricas:{A:{n:252,dt:'2026-09-02'},B:{n:22,dt:'2026-09-03'}}},
  metricasEmpresas:{atualizadoEm:ts,totalEmpresas:2,metricas:{A:{n:252,dt:'2026-09-02'},B:{n:252,dt:'2026-09-03'}}},
  analise:{atualizadoEm:ts,totalBDRs:2,analise:{A:{precoAtivo:10,fator:1,dtAtivo:'2026-09-02'},B:{precoAtivo:10,fator:1,dtAtivo:'2026-09-03'}}},
  eventos:{atualizadoEm:ts,eventos:{A:[{dt:'2026-08-31',url:'https://www.rad.cvm.gov.br/documento'}]}}
};
const normal=gera(bases,agora);valida(normal);assert.equal(normal.estado,'ok');assert.equal(normal.fontes.precos.registros,2);assert.equal(normal.fontes.eventos.cobertura,null);
const casos=[normal];
for(const k of ['metricasBdr','metricasEmpresas','analise']){
  const b=structuredClone(bases),campo=k==='analise'?'analise':'metricas';b[k][campo].B.stale=true;
  const s=gera(b,agora);valida(s);casos.push(s);
  assert.equal(s.fontes[k].cobertura,100);assert.equal(s.fontes[k].coberturaRenovada,50);assert.equal(s.fontes[k].preservados,1);assert.equal(s.estado,'atencao');
}
for(const k of Object.keys(FONTES)){
  for(const valor of [null,{},'invalido']){const b=structuredClone(bases);b[k]=valor;const s=gera(b,agora);valida(s);assert.equal(s.estado,'atencao');casos.push(s);}
  for(const valor of [null,'invalida','2026-09-04T15:00:00Z']){const b=structuredClone(bases);b[k][k==='bdrs'?'geradoEm':'atualizadoEm']=valor;const s=gera(b,agora);valida(s);assert.equal(s.estado,'atencao');casos.push(s);}
}
for(const modifica of [b=>b.precos.precos.A.p=0,b=>b.precos.tickersConsultados=0,b=>b.precos.tickersConsultados=1,b=>b.bdrs.bdrs[1]=b.bdrs.bdrs[0],b=>b.bdrs.bdrs[0].industria='',b=>b.eventos.eventos={},b=>b.metricasBdr.metricas.A.dt='2026-02-30']){
  const b=structuredClone(bases);modifica(b);const s=gera(b,agora);valida(s);assert.equal(s.estado,'atencao');casos.push(s);
}
assert.equal(avaliaFonte(normal.fontes.precos,agora+72*36e5).length,0);
assert.equal(avaliaFonte(normal.fontes.precos,agora+72*36e5+1).length,1);
assert.equal(avaliaFonte(normal.fontes.bdrs,agora+1000*36e5).length,0);
assert.ok(avalia(normal,agora+97*36e5).some(a=>a.includes('Diagnóstico')));
assert.ok(avaliaFonte({...normal.fontes.metricasBdr,total:10001,renovados:9000},agora).some(a=>a.includes('Cobertura')));
for(const modifica of [s=>delete s.fontes.precos,s=>s.fontes.precos.cobertura=101,s=>s.fontes.analise.registros=-1,s=>s.fontes.precos.limiteHoras=999,s=>s.fontes.metricasBdr.observacaoInicio='2026-02-30',s=>s.estado='atencao',s=>s.avisos=['Inventado']]){
  const s=structuredClone(normal);modifica(s);assert.throws(()=>valida(s));
}
const codigo=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8').match(/<script>([\s\S]*?)<\/script>/)[1];
const box={innerHTML:''},botao={textContent:'',className:''};
const ctx=vm.createContext({Date,SAUDE:null,SAUDE_ESTADO:'carregando',$:id=>id==='saudeTxt'?botao:box,drw:{classList:{contains:()=>true}},render:()=>{},document:{addEventListener:()=>{}},setInterval:()=>{}});
vm.runInContext(codigo.slice(codigo.indexOf('const esc ='),codigo.indexOf('\n',codigo.indexOf('const esc ='))),ctx);
vm.runInContext(codigo.slice(codigo.indexOf('const SAUDE_REGRAS='),codigo.indexOf('/* ---------- tooltip do mosaico')),ctx);
assert.match(ctx.saudeHTML(agora),/Carregando/);ctx.atualizaSaude();assert.equal(botao.textContent,'carregando');
ctx.SAUDE_ESTADO='falha';assert.match(ctx.saudeHTML(agora),/desconhecida/);ctx.atualizaSaude();assert.equal(botao.textContent,'indisponível');
for(const s of casos){ctx.recebeSaude(s);for(const t of [agora,agora+97*36e5,agora-36e5])assert.equal(JSON.stringify(ctx.avisosSaude(s,t)),JSON.stringify(avalia(s,t)));}
ctx.recebeSaude(normal);assert.match(ctx.saudeHTML(agora),/2 renovados na última coleta/);assert.match(ctx.saudeHTML(agora),/sem prazo automático/);assert.match(ctx.saudeHTML(agora),/Sem percentual de cobertura/);assert.match(ctx.saudeHTML(agora+97*36e5),/cópia pode estar desatualizada/);
ctx.atualizaSaude();assert.ok(box.innerHTML.includes('Diagnóstico gerado'));assert.ok(!ctx.saudeHTML(agora).includes('null%'));
const mal=structuredClone(normal);mal.fontes.precos.avisos=['<img src=x onerror=alert(1)>'];mal.avisos=avalia(mal,agora);mal.estado='atencao';ctx.recebeSaude(mal);assert.ok(!ctx.saudeHTML(agora).includes('<img'));
assert.throws(()=>ctx.recebeSaude({estado:'ok'}));assert.equal(ctx.SAUDE,mal);
vm.runInContext(codigo.slice(codigo.indexOf('function carregaSaude('),codigo.indexOf('let ATIVO_ABERTO=')),ctx);
(async()=>{
  for(const resposta of [()=>Promise.reject(new Error('offline')),()=>Promise.resolve({ok:true,json:async()=>({estado:'ok'})}),()=>Promise.resolve({ok:false})]){
    ctx.fetch=resposta;ctx.carregaSaude();await new Promise(r=>setImmediate(r));assert.equal(ctx.SAUDE_ESTADO,'falha');assert.equal(botao.textContent,'indisponível');assert.match(box.innerHTML,/desconhecida/);
  }
  ctx.fetch=async()=>({ok:true,json:async()=>normal});ctx.carregaSaude();await new Promise(r=>setImmediate(r));assert.equal(ctx.SAUDE_ESTADO,'pronto');assert.match(box.innerHTML,/Diagnóstico gerado/);
  console.log('OK: saúde, contagens reais, preservados, dados ausentes, limites exatos, relógio, esquema e estados da interface');
})().catch(e=>{console.error(e);process.exitCode=1;});
