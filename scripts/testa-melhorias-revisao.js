const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('node:assert/strict');
const codigo=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8').match(/<script>([\s\S]*?)<\/script>/)[1];
const trecho=(a,b)=>{const i=codigo.indexOf(a),j=codigo.indexOf(b,i);assert.ok(i>=0&&j>i,a);return codigo.slice(i,j);};
const {csv}=require('./lib/zip');
assert.deepEqual(csv('\uFEFFnome;valor\r\n"Fundo; Exemplo";10\r\n"Linha\ncom ""aspas""";\r\n'),[{nome:'Fundo; Exemplo',valor:'10'},{nome:'Linha\ncom "aspas"',valor:''}]);
assert.deepEqual(csv('a;b\n1;2\n\n'),[{a:'1',b:'2'}]);
assert.deepEqual(csv('a;b\n"";""\n'),[{a:'',b:''}]);
for(const ruim of ['a;b\n"ab;2','a;b\n"a"x;2','a;b\n1;2;3'])assert.throws(()=>csv(ruim));
const ctx=vm.createContext({CARTEIRA:[],cot:()=>({p:1e308}),console});
vm.runInContext(trecho('function leCarteira(','function numeroCarteira(')+trecho('function totaisCarteira(','function resultadoCarteira('),ctx);
assert.throws(()=>ctx.leCarteira([{ticker:'PETR4',qtd:1e308,pm:1e308}]));
assert.throws(()=>ctx.leCarteira([{ticker:'PETR4',qtd:1e308,pm:1},{ticker:'VALE3',qtd:1e308,pm:1}]));
assert.equal(ctx.leCarteira([{ticker:'PETR4',qtd:0.5,pm:2}]).length,1);
const totais=ctx.totaisCarteira([{ticker:'PETR4',qtd:2,pm:1}]);
assert.equal(totais.atual,null);assert.equal(totais.resultado,null);assert.equal(totais.retorno,null);
async function cifraInvalida(){
  let chamadas=0;
  const c=vm.createContext({crypto:{subtle:{importKey(){chamadas++;throw Error('nao deveria derivar');}}},TextEncoder,TextDecoder,Uint8Array,btoa,atob});
  vm.runInContext(trecho('const SYNC_ITERACOES','function ativoCarteira('),c);
  const arq={versao:1,cifrado:true,algoritmo:'AES-GCM-256 + PBKDF2-SHA256',iteracoes:310000,salt:btoa('x'.repeat(16)),iv:btoa('x'.repeat(12)),dados:btoa('x'.repeat(16))};
  for(const extra of [{versao:2},{iteracoes:2147483647},{iteracoes:0},{salt:btoa('x')},{iv:btoa('x')},{dados:'!!!!'},{dados:'A'.repeat(1398132)},{algoritmo:'CBC'}])await assert.rejects(()=>c.decifraCarteira('senha',{...arq,...extra}));
  assert.equal(chamadas,0,'arquivo invalido chegou ao WebCrypto');
}
async function restauracao(){
  const nos={},no=id=>nos[id]||={value:'teste',innerHTML:'',textContent:''};let pedidos=[];
  const c=vm.createContext({$:no,CARTEIRA:[{ticker:'PETR4',qtd:1,pm:1}],JSON,esc:String,comparaCarteiras:()=>({entram:[],saem:[],mudam:[]}),
    fetch:()=>new Promise(ok=>pedidos.push(ok)),decifraCarteira:async(s,a)=>a.posicoes,salvaCarteira:()=>true,render(){}});
  vm.runInContext(trecho('const syncMsg =','const par ='),c);
  const resposta=q=>({ok:true,json:async()=>({posicoes:[{ticker:'PETR4',qtd:q,pm:2}]})});
  let p=no('syncImporta').onclick();pedidos.shift()(resposta(2));await p;
  c.CARTEIRA[0].qtd=3;no('syncConfirma').onclick();assert.equal(c.CARTEIRA[0].qtd,3);assert.match(no('syncMsg').textContent,/mudou desde/);
  const antigo=no('syncImporta').onclick(),novo=no('syncImporta').onclick();const [a,b]=pedidos.splice(0);
  b(resposta(5));await novo;const confirma=no('syncConfirma').onclick;
  a(resposta(9));await antigo;assert.equal(no('syncConfirma').onclick,confirma);confirma();assert.equal(c.CARTEIRA[0].qtd,5);
  confirma();assert.equal(c.CARTEIRA[0].qtd,5);
}
async function rede(){
  let tentativas=0,prazos=0;
  const abort={timeout(ms){assert.equal(ms,25000);prazos++;return 'sinal';}};
  const c=vm.createContext({UA:'teste',espera:async()=>{},AbortSignal:abort,console:{error(){}},fetch:async(u,o)=>{assert.equal(o.signal,'sinal');tentativas++;return {status:200,json:async()=>{if(tentativas<3)throw Error('corpo interrompido');return {ok:true};}};}});
  const analise=fs.readFileSync(path.join(__dirname,'atualiza-analise.js'),'utf8');
  vm.runInContext(analise.slice(analise.indexOf('async function json('),analise.indexOf('async function resolve(')),c);
  assert.equal((await c.json('https://teste.invalid')).ok,true);assert.equal(tentativas,3);assert.equal(prazos,3);
  const precos=fs.readFileSync(path.join(__dirname,'atualiza-precos.js'),'utf8');
  vm.runInContext(precos.slice(precos.indexOf('async function autentica('),precos.indexOf('(async () =>')),c);
  tentativas=0;c.fetch=async(u,o)=>{assert.equal(o.signal,'sinal');tentativas++;throw Error('timeout');};
  assert.equal((await c.buscaLote(['PETR4'],{cookie:'',crumb:''})).length,0);assert.equal(tentativas,3);
  tentativas=0;c.fetch=async(u,o)=>{assert.equal(o.signal,'sinal');tentativas++;return {headers:{getSetCookie:()=>['a=b']},status:200,text:async()=>'crumb'};};
  assert.equal((await c.autentica()).crumb,'crumb');assert.equal(tentativas,2);
}
(async()=>{await cifraInvalida();await restauracao();await rede();console.log('OK: CSV com aspas, overflow, importacao limitada, previa obsoleta/concorrente, timeout e retentativa do corpo JSON');})().catch(e=>{console.error(e);process.exitCode=1;});
