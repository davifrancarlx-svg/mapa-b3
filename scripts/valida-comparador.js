const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('node:assert/strict');
const raiz=path.join(__dirname,'..'),html=fs.readFileSync(path.join(raiz,'index.html'),'utf8');
const codigo=html.match(/<script>([\s\S]*?)<\/script>/)[1];
/* Executa as funcoes reais do HTML sem inicializar rede ou navegador. */
function funcao(nome){
  const inicio=codigo.indexOf('function '+nome+'(');assert.ok(inicio>=0,nome+' ausente');
  for(let fim=codigo.indexOf('\n}',inicio);fim>=0;fim=codigo.indexOf('\n}',fim+2)){
    const trecho=codigo.slice(inicio,fim+2);
    try { new vm.Script('('+trecho+')');return trecho; } catch {}
  }
  throw new Error('funcao incompleta: '+nome);
}
const bdrs=JSON.parse(fs.readFileSync(path.join(raiz,'bdrs.json'),'utf8')).bdrs;
const metricas=JSON.parse(fs.readFileSync(path.join(raiz,'metricas.json'),'utf8')).metricas;
const analise=JSON.parse(fs.readFileSync(path.join(raiz,'analise.json'),'utf8')).analise;
const precos=JSON.parse(fs.readFileSync(path.join(raiz,'precos.json'),'utf8')).precos;
const nos={},no=id=>nos[id]||=( {textContent:'',setAttribute(){},classList:{toggle(){}}} );
let salvo='',bloqueado=false;
const ctx=vm.createContext({console,MAX_COMPARAR:4,BDR:bdrs,COMPARAR:new Set(),FAVORITOS:new Set(),
  $:no,document:{querySelectorAll:()=>[]},localStorage:{setItem(k,v){if(bloqueado)throw new Error('bloqueado');salvo=v;}},
  met:t=>metricas[t]||null,ana:t=>analise[t]||null,cot:t=>precos[t]?.p>0?precos[t]:null,
  paisPT:v=>v,setorPT:v=>v,industriaPT:v=>v,forcaBDR:b=>({rot:'vs. indústria',v:metricas[b.ticker]?.ri63}),
  fontePerfilBDR:b=>({nome:'Fonte de '+b.empresa,url:'https://finance.yahoo.com/quote/'+b.ticker+'/profile/'})});
vm.runInContext(codigo.slice(codigo.indexOf('const esc ='),codigo.indexOf('\n',codigo.indexOf('const esc ='))),ctx);
vm.runInContext(codigo.slice(codigo.indexOf('const fmtPreco ='),codigo.indexOf('const met =')),ctx);
['leComparacao','salvaComparacao','alternaComparacao','atualizaSelecao','comparacaoHTML'].forEach(n=>vm.runInContext(funcao(n),ctx));
const ler=v=>ctx.leComparacao(v);
assert.equal(ler({}).size,0);assert.equal(ler(null).size,0);
assert.deepEqual([...ler(['AAPL34','AAPL34',null,3,'<img>','A1EG34'])],['AAPL34','A1EG34']);
const tickers=['AAPL34','MSFT34','A1EG34','M1BT34','TSLA34'];
assert.equal(ler(tickers).size,4);
for(const t of tickers.slice(0,4))assert.equal(ctx.alternaComparacao(t),true);
assert.equal(ctx.alternaComparacao(tickers[4]),false);assert.equal(ctx.COMPARAR.size,4);
assert.match(no('cmpMsg').textContent,/Limite de quatro/);
assert.equal(ctx.alternaComparacao('INVALIDO'),false);
assert.equal(ctx.alternaComparacao(tickers[0]),true);assert.equal(ctx.COMPARAR.size,3);
assert.equal(ctx.alternaComparacao(tickers[4]),true);assert.deepEqual(JSON.parse(salvo),[...ctx.COMPARAR]);
bloqueado=true;assert.equal(ctx.alternaComparacao(tickers[4]),true);assert.match(no('cmpMsg').textContent,/somente nesta sessão/);
assert.equal(ctx.COMPARAR.has(tickers[4]),false);
let tabela=ctx.comparacaoHTML(tickers.slice(0,4).map(t=>bdrs.find(b=>b.ticker===t)));
for(const texto of ['Classificação','Setores diferentes','Sem histórico','Sem análise','Data da PTAX','Banco B3','Yahoo Finance','Último negócio','não é preço justo','scope="row"','scope="col"','role="region"'])assert.ok(tabela.includes(texto),texto+' ausente');
assert.ok(!tabela.includes('undefined'));assert.ok(!tabela.includes('NaN'));assert.ok(!tabela.includes('<svg'));
const b=bdrs.find(b=>b.ticker==='AAPL34'),c=bdrs.find(b=>b.ticker==='MSFT34');
const m=metricas[b.ticker],a=analise[b.ticker];
metricas[b.ticker]={...m,dt:'2000-01-01',stale:true,g20:0,d20:0,r21:0};
analise[b.ticker]={...a,pSetor63:0,stale:true};
tabela=ctx.comparacaoHTML([{...b,empresa:'<img src=x onerror=alert(1)>'},c]);
for(const texto of ['As datas finais','liquidez reduzida','Preservado após falha','Preservada após falha','0/20','>0</td>','&lt;img'])assert.ok(tabela.includes(texto),texto+' ausente');
assert.ok(!tabela.includes('<img'));
assert.ok(codigo.includes("if(ev.target.closest('button,a,input,select,textarea'))return;"),'teclado de controles nao deve abrir a linha');
assert.ok(codigo.includes("$('cmpbar').inert=true"),'barra deve ficar inerte durante a comparacao');
assert.ok(codigo.includes("$('cmpbar').inert=false"),'fechamento deve liberar a barra');
const sync=codigo.slice(codigo.indexOf('function sincronizaURL('),codigo.indexOf('function leURL('));
assert.ok(!sync.includes('COMPARAR'),'selecao pessoal nao deve ir para a URL');
console.log('OK: comparador, limite, persistencia, dados ausentes/zero, datas, fontes e protecoes de acessibilidade');
