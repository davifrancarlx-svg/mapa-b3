const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('node:assert/strict');
const codigo=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8').match(/<script>([\s\S]*?)<\/script>/)[1];
const nos={},no=id=>nos[id]||={disabled:false,textContent:'',innerHTML:'',title:''};let chamada='',renders=0;
const ctx=vm.createContext({console,Date,PRECOS:{ANTIGA:{p:1}},COLETAS:{precos:''},PRECO_TS:'',isoCSV:d=>new Date(d).toISOString(),render:()=>renders++,$:no,fetch:async(url,opt)=>{chamada=url;assert.equal(opt.cache,'no-store');return {ok:true,json:async()=>({atualizadoEm:'2026-09-04T12:30:00Z',precos:{PETR4:{p:30}}})};}});
vm.runInContext(codigo.slice(codigo.indexOf('function carregaPrecos('),codigo.indexOf('function carregaBDRs(')),ctx);
(async()=>{
  await ctx.carregaPrecos(true);assert.match(chamada,/^precos\.json\?v=\d+$/);assert.equal(ctx.PRECOS.PETR4.p,30);assert.equal(no('atualizaPrecosBt').disabled,false);assert.equal(no('atualizaPrecosBt').textContent,'atualizar cotações');assert.match(no('precosMsg').textContent,/Base publicada conferida/);assert.equal(renders,1);
  const anterior=ctx.PRECOS;ctx.fetch=async()=>({ok:true,json:async()=>({precos:{}})});await ctx.carregaPrecos(true);assert.equal(ctx.PRECOS,anterior);assert.match(no('precosMsg').textContent,/base anterior foi mantida/i);
  chamada='';ctx.fetch=async url=>{chamada=url;return {ok:true,json:async()=>({precos:{VALE3:{p:50}}})};};await ctx.carregaPrecos();assert.equal(chamada,'precos.json');assert.equal(ctx.PRECOS.VALE3.p,50);
  console.log('OK: recarga manual de preços, cache descartado, estados do botão e preservação após falha');
})().catch(e=>{console.error(e);process.exitCode=1;});
