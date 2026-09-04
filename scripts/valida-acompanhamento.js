const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('node:assert/strict');
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8'),codigo=html.match(/<script>([\s\S]*?)<\/script>/)[1];
const nos={},no=id=>nos[id]||={textContent:'',value:'',attrs:{},setAttribute(k,v){this.attrs[k]=v;},focus(){ctx.document.activeElement=this;},querySelector(){return null;}};
const botao=(t,classe)=>({dataset:{fav:t},attrs:{},textContent:'',vivo:true,setAttribute(k,v){this.attrs[k]=v;},hasAttribute(){return false;},classList:{contains:c=>c===classe},closest(){return null;}});
const bt=botao('AAPL34','fav'),ficha=botao('AAPL34','btn');
let bloqueado=false,gravado='["AAPL34"]',renders=0,painel=false,removeFoco=false;
const st={sec:'bdrs',modoBdr:'tabela',soFav:false,qb:'apple',bdrPais:new Set(['US']),bdrSetor:new Set(['Technology']),bdrIndustria:new Set(['Hardware']),bdrLiq:'100k',bdrFreq:'alta',bdrHist:'com',recorte:'forca'};
/* Favorito vale para qualquer universo: o resolver e stub aqui para o teste
   ficar sobre a logica de acompanhamento, nao sobre os catalogos. */
const conhecidos={AAPL34:'BDR',MSFT34:'BDR',PETR4:'Empresa brasileira',BOVA11:'ETF'};
const ctx=vm.createContext({console,st,BDR:[{ticker:'AAPL34'},{ticker:'MSFT34'}],BDR_CARGA:'pronta',FAVORITOS:new Set(),COMPARAR:new Set(['MSFT34']),AVISO_FAV:'',EVENTO_FAV:'',lastFocus:null,
  ativoCarteira:t=>conhecidos[t]?{ticker:t,nome:t,tipo:conhecidos[t]}:null,
  $:no,document:{activeElement:bt,querySelectorAll:()=>[bt,ficha],body:{contains:n=>!!n&&n.vivo!==false}},drw:{classList:{contains:()=>painel}},chipsBDR(){},
  render(){renders++;if(removeFoco){bt.vivo=false;if(ctx.lastFocus)ctx.lastFocus.vivo=false;}},
  localStorage:{setItem(k,v){assert.equal(k,'mapaB3Favoritos');if(bloqueado)throw new Error('sem acesso');gravado=v;}}});
vm.runInContext(codigo.slice(codigo.indexOf('const esc ='),codigo.indexOf('\n',codigo.indexOf('const esc ='))),ctx);
vm.runInContext(codigo.slice(codigo.indexOf('function leFavoritos('),codigo.indexOf('function leComparacao(')),ctx);
assert.deepEqual([...ctx.leFavoritos(['AAPL34','AAPL34','MSFT34',1,null,'<script>'])],['AAPL34','MSFT34']);
assert.throws(()=>ctx.leFavoritos('AAPL34'));assert.throws(()=>ctx.leFavoritos({}));assert.throws(()=>ctx.leFavoritos(null));
ctx.FAVORITOS=ctx.leFavoritos(JSON.parse(gravado));ctx.atualizaFavoritos();assert.equal(bt.textContent,'★');assert.equal(ficha.textContent,'★ Acompanhando');
assert.equal(ctx.alternaFavorito('INVALIDO'),false);assert.equal(ctx.alternaFavorito('MSFT34'),true);assert.equal(renders,0);
assert.deepEqual(JSON.parse(gravado),['AAPL34','MSFT34']);assert.deepEqual([...ctx.COMPARAR],['MSFT34']);
assert.equal(ctx.alternaFavorito('AAPL34'),true);assert.equal(bt.attrs['aria-pressed'],'false');assert.equal(ficha.textContent,'☆ Acompanhar');assert.equal(bt.attrs['aria-label'],'Adicionar AAPL34 ao acompanhamento');
const anterior=gravado;bloqueado=true;ctx.alternaFavorito('AAPL34');assert.equal(gravado,anterior);assert.ok(ctx.FAVORITOS.has('AAPL34'));assert.match(no('favMsg').textContent,/somente nesta sessão/);assert.equal(no('favMsg').textContent,no('favFichaMsg').textContent);
bloqueado=false;ctx.salvaFavoritos();assert.equal(ctx.AVISO_FAV,'');assert.ok(JSON.parse(gravado).includes('AAPL34'));
st.soFav=true;ctx.FAVORITOS.add('ZZZZ34');let texto=ctx.acompanhamentoHTML([{ticker:'AAPL34'}]);
for(const s of ['1 de 2','1 oculto','fora da base atual','ZZZZ34','não os seus favoritos','data-fav-acao="filtros"'])assert.ok(texto.includes(s),s+' ausente');
assert.ok(ctx.FAVORITOS.has('ZZZZ34'));assert.equal(ctx.alternaFavorito('ZZZZ34'),true);assert.ok(!ctx.FAVORITOS.has('ZZZZ34'));
ctx.BDR_CARGA='falha';assert.match(ctx.acompanhamentoHTML([]),/Sua lista salva foi preservada/);ctx.BDR_CARGA='carregando';assert.match(ctx.acompanhamentoHTML([]),/Carregando o catálogo/);ctx.BDR_CARGA='pronta';
ctx.FAVORITOS.clear();assert.match(ctx.acompanhamentoHTML([]),/ainda não acompanha/);assert.ok(!ctx.acompanhamentoHTML([]).includes('data-fav-acao="filtros"'));
ctx.FAVORITOS.add('AAPL34');ctx.limpaFiltrosBDR();assert.equal(st.soFav,true);assert.equal(ctx.FAVORITOS.size,1);assert.equal(st.qb,'');assert.equal(st.bdrPais.size+st.bdrSetor.size+st.bdrIndustria.size,0);assert.equal(st.recorte,null);assert.equal(st.bdrLiq,'todas');
removeFoco=true;ctx.document.activeElement=bt;ctx.alternaFavorito('AAPL34');assert.equal(ctx.document.activeElement,no('soFav'));
ctx.FAVORITOS.add('AAPL34');painel=true;ctx.document.activeElement=ficha;ctx.lastFocus={vivo:true,closest:()=>({dataset:{tk:'AAPL34'}})};
ctx.alternaFavorito('AAPL34');assert.equal(ctx.lastFocus,no('soFav'));assert.equal(ctx.document.activeElement,ficha);assert.equal(ficha.textContent,'☆ Acompanhar');
/* Qualquer ativo pode ser favorito; o contador da tabela de BDR conta so BDR. */
removeFoco=false;painel=false;ctx.lastFocus=null;ctx.FAVORITOS.clear();
assert.deepEqual([...ctx.leFavoritos(['PETR4','TAEE11','AAPL34','XX1','TICKERLONGO','<script>'])],['PETR4','TAEE11','AAPL34']);
assert.equal(ctx.alternaFavorito('PETR4'),true);assert.ok(ctx.FAVORITOS.has('PETR4'));
assert.equal(ctx.alternaFavorito('BOVA11'),true);assert.equal(ctx.favoritosBDR().length,0);
assert.equal(ctx.alternaFavorito('NADA9'),false);
ctx.atualizaFavoritos();assert.equal(no('nFav').textContent,0);
assert.ok(!codigo.slice(codigo.indexOf('function sincronizaURL('),codigo.indexOf('function leURL(')).includes('FAVORITOS'));
assert.ok(codigo.slice(codigo.indexOf("$('csvBdr').onclick"),codigo.indexOf("$('csvEmp').onclick")).includes('filtraBDR().forEach'));
assert.ok(codigo.includes('if(st.soFav) r = r.filter(b => FAVORITOS.has(b.ticker));'));
console.log('OK: acompanhamento, persistencia, falha de gravacao, filtros, catalogo ausente, botoes e retorno de foco');
