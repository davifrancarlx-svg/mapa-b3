const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('node:assert/strict');
const raiz=path.join(__dirname,'..'),html=fs.readFileSync(path.join(raiz,'index.html'),'utf8'),codigo=html.match(/<script>([\s\S]*?)<\/script>/)[1];
/* Testa o codigo embarcado, sem manter uma segunda implementacao do grafico. */
const funcoes=codigo.slice(codigo.indexOf('const EIXOS ='),codigo.indexOf('function tabelaEmpresas('));
const metricas={},st={sec:'bdrs',modoBdr:'matriz',matX:'g20',matY:'forca',bdrPais:new Set(),bdrSetor:new Set(),bdrIndustria:new Set(),bdrLiq:'todas',bdrFreq:'todas',bdrHist:'todos',bdrSort:'g20',bdrDir:'desc'};
let url='';
const ctx=vm.createContext({console,st,URLSearchParams,location:{search:''},history:{replaceState:(a,b,u)=>url=u},
  SECOES:{bdrs:{}},LIQ:{},FREQ:{},HIST:{},RECORTES:{},COLS:[{k:'g20'}],met:t=>metricas[t]||null,
  forcaBDR:b=>({v:metricas[b.ticker]?.ri63,rot:'vs. indústria'}),setorPT:s=>s,industriaPT:s=>s,corSetor:()=>'#123456'});
vm.runInContext(codigo.slice(codigo.indexOf('const esc ='),codigo.indexOf('\n',codigo.indexOf('const esc ='))),ctx);
vm.runInContext(codigo.slice(codigo.indexOf('const fmtPreco ='),codigo.indexOf('const met =')),ctx);
vm.runInContext(funcoes,ctx);
vm.runInContext(codigo.slice(codigo.indexOf('function sincronizaURL('),codigo.indexOf('const SECOES =')),ctx);
assert.equal(ctx.medianaMatriz([]),null);assert.equal(ctx.medianaMatriz([7]),7);
assert.equal(ctx.medianaMatriz([1,3,9]),3);assert.equal(ctx.medianaMatriz([1,3,5,9]),4);
assert.equal(ctx.escalaMatriz([5,5],false,0,100).pos(5),50);
assert.equal(ctx.escalaMatriz([100,100],true,0,100).pos(100),50);
const escala=ctx.escalaMatriz([10,100,1000],true,0,100);
assert.ok(Math.abs(escala.pos(100)-(escala.pos(10)+escala.pos(1000))/2)<1e-8);
assert.equal(ctx.fmtEixo('forca',2),'2 p.p.');assert.equal(ctx.fmtEixo('r63',2),'2%');assert.equal(ctx.fmtEixo('r63',NaN),'—');
const lista=['AAA134','BBB234','CCC334','DDD434','EEE534'].map(t=>({ticker:t,empresa:t,setor:'Tecnologia',industria:'Software'}));
metricas.AAA134={g20:100,r63:0,ri63:0,dt:'2026-08-31'};
metricas.BBB234={g20:300,r63:4,ri63:2,dt:'2026-09-01',stale:true};
metricas.CCC334={g20:0,r63:NaN,ri63:1};metricas.DDD434={g20:Infinity,r63:3,ri63:Infinity};
assert.equal(ctx.dadosMatriz(lista,'g20','forca').length,2);
assert.equal(ctx.dadosMatriz(lista,'r63','forca').length,2);
let saida=ctx.matrizBDR(lista,343);
for(const s of ['2 de 5 BDRs','3 sem valores válidos','p.p.','R$ 200','preservados após falha','Datas diferentes','data-mat-info','role="group"','Ver os 2 BDRs','scope="col"','viewBox="0 0 343 430"'])assert.ok(saida.includes(s),s+' ausente');
assert.equal((saida.match(/<circle /g)||[]).length,2);assert.equal((saida.match(/<tr><td>/g)||[]).length,2);
assert.ok(!/NaN|Infinity|undefined/.test(saida));
const leitura={textContent:''},focado={matches:()=>true,dataset:{matInfo:'ativo em foco'}};
ctx.document={activeElement:focado};ctx.$=()=>leitura;
vm.runInContext(codigo.slice(codigo.indexOf('function mostraPontoMatriz('),codigo.indexOf("document.body.addEventListener('pointerover',mostraPontoMatriz)")),ctx);
ctx.mostraPontoMatriz({target:{closest:()=>({dataset:{matInfo:'ativo sob o mouse'}})}});assert.equal(leitura.textContent,'ativo em foco');
ctx.document.activeElement=null;ctx.mostraPontoMatriz({target:{closest:()=>({dataset:{matInfo:'ativo sob o mouse'}})}});assert.equal(leitura.textContent,'ativo sob o mouse');
saida=ctx.matrizBDR([],343);assert.equal((saida.match(/<select /g)||[]).length,2);assert.ok(saida.includes('0 de 0'));assert.ok(!saida.includes('<svg'));
saida=ctx.matrizBDR([lista[4]],343);assert.ok(saida.includes('0 de 1'));assert.ok(saida.includes('Troque os eixos'));
saida=ctx.matrizBDR([{...lista[0],empresa:'<img src=x onerror=alert(1)>'}],343);assert.ok(!saida.includes('<img'));assert.ok(saida.includes('&lt;img'));
st.matX='r63';st.matY='r63';saida=ctx.matrizBDR(lista,1000);assert.ok(saida.includes('mesmo indicador'));assert.ok(saida.includes('0%'));
for(const x of ['__proto__','constructor','toString','invalido',null])assert.equal(ctx.eixosMatriz(x,x).x,'g20');
st.matX='v21';st.matY='r252';ctx.sincronizaURL();assert.ok(url.includes('matx=v21'));assert.ok(url.includes('maty=r252'));
ctx.location.search=url;st.matX='g20';st.matY='forca';ctx.leURL();assert.equal(st.matX,'v21');assert.equal(st.matY,'r252');
ctx.location.search='?sec=bdrs&modo=matriz&matx=constructor&maty=__proto__';ctx.leURL();assert.equal(st.matX,'g20');assert.equal(st.matY,'forca');
ctx.location.search='?sec=bdrs&modo=matriz';st.matX='r63';st.matY='v21';ctx.leURL();assert.equal(st.matX,'g20');assert.equal(st.matY,'forca');
const reais=JSON.parse(fs.readFileSync(path.join(raiz,'bdrs.json'),'utf8')).bdrs;
Object.assign(metricas,JSON.parse(fs.readFileSync(path.join(raiz,'metricas.json'),'utf8')).metricas);
const chaves=['g20','r63','r252','forca','dd252','v21'];
for(const x of chaves)for(const y of chaves){st.matX=x;st.matY=y;saida=ctx.matrizBDR(reais,343);assert.ok(!/NaN|Infinity|undefined/.test(saida),x+'/'+y);assert.equal((saida.match(/<circle /g)||[]).length,ctx.dadosMatriz(reais,x,y).length);}
console.log('OK: matriz, 36 pares de eixos, medianas, escala log, dados ausentes, URL e representacao textual');
