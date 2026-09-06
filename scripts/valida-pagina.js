const fs=require('fs'),path=require('path'),h=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
const falha=m=>{throw new Error(m);};
const scripts=[...h.matchAll(/<script>([\s\S]*?)<\/script>/g)];if(scripts.length!==1)falha('a pagina deve manter um unico script embutido');
new Function(scripts[0][1]);
['secGeral','secEmpresas','secBdrs','secEtfs','secFiis','secCarteira','secFavoritos','secRadar','secMetodologia','drw','cmpbar','boxMatrizB','saudeBt','atualizaPrecosBt','formCarteira','etfCoberturas','etfClasses','etfFocos','etfGeografias','etfCaracteristicas','fiiTipos','fiiNegociacoes','fiiGestoes','fiiSegmentos','boxTabelaFii','boxCardsFii','guiaFii'].forEach(id=>{if(!h.includes('id="'+id+'"'))falha('elemento ausente: '+id);});
['function squarify(','function peso(','const txOn =','lastFocus','wrap.inert'].forEach(x=>{if(!h.includes(x))falha('invariante ausente: '+x);});
/* A cmpbar e irma de .wrap: travar so o wrap deixa os botoes dela alcancaveis
   por Tab a partir de uma ficha aria-modal. Um unico lugar escreve wrap.inert,
   e toda abertura de ficha passa por ele. */
const js=scripts[0][1];
/* Comentario de codigo pode citar numero da base a vontade -- "varrer as 369
   empresas custava caro" e explicacao, nao afirmacao na tela. As regras de
   contagem olham so esta versao, sem comentarios. O `:` antes de // evita
   comer o https:// de uma URL. */
const jsVisivel=js.replace(/\/\*[\s\S]*?\*\//g,' ').replace(/(^|[^:])\/\/[^\n]*/g,'$1');
/* O markup estatico tambem afirma numeros na tela -- a nota de cada secao
   e escrita direto no HTML, fora do <script>. */
const htmlVisivel=h.replace(/<script[\s\S]*?<\/script>/g,' ').replace(/<!--[\s\S]*?-->/g,' ');
const conta=(re,alvo=js)=>(alvo.match(re)||[]).length;
if(!/function travaFundo\(\)\{\s*wrap\.inert\s*=\s*true;\s*\$\('cmpbar'\)\.inert\s*=\s*true;\s*\}/.test(js))falha('travaFundo deve travar .wrap e a cmpbar juntos');
if(!/function destravaFundo\(\)\{\s*wrap\.inert\s*=\s*false;\s*\$\('cmpbar'\)\.inert\s*=\s*false;\s*\}/.test(js))falha('destravaFundo deve destravar .wrap e a cmpbar juntos');
if(conta(/wrap\.inert\s*=/g)!==2)falha('wrap.inert so pode ser escrito dentro de travaFundo e destravaFundo');
const aberturas=conta(/drw\.classList\.add\('on'\)/g),travas=conta(/(?<!des)travaFundo\(\)/g)-1;
if(aberturas!==travas)falha('cada abertura de ficha precisa de travaFundo(): '+aberturas+' aberturas para '+travas+' chamadas');

/* Contagem em texto visivel tem de sair de E, BDR ou nCategorias(), nunca de
   um literal: a Metodologia e o Retrato afirmam numeros sobre a base, e um
   numero cravado envelhece em silencio na proxima empresa ou categoria. */
if(!/const nCategorias = \(\) =>/.test(js))falha('nCategorias() ausente: as contagens precisam ser derivadas');
[[/\d+\s+categorias temáticas/,'numero de categorias cravado'],
 [/<b>\d+<\/b><span>categorias/,'card de categorias com numero cravado'],
 [/B3 · \d+ companhias/,'kicker de empresas com numero cravado'],
 [/B3 · \d+ recibos'/,'kicker de BDRs com numero cravado'],
 [/\d+ companhias com ações registradas/,'total de empresas cravado'],
 [/BDR\.length \|\| \d/,'total de BDRs com fallback cravado']
].forEach(([re,msg])=>{if(re.test(js))falha(msg+': use E.length, BDR.length ou nCategorias()');});
['>369<','>825<','>222<'].forEach(x=>{if(h.includes(x))falha('contagem cravada no HTML: '+x);});

/* A lista acima e curada e so cobre os universos que existiam quando foi
   escrita -- foi assim que "112 dos 528 sao restritos" entrou na ficha de FII
   sem nada reprovar. Esta regra e generica: numero literal colado num
   substantivo de universo, em qualquer lugar do JS.
   Funciona porque contagem derivada nunca aparece assim no fonte: ela e
   sempre `X.length + ' fundos'`, com o digito do lado de fora da string. */
const UNIVERSOS = 'empresas|companhias|BDRs|recibos|ETFs|FIIs|fundos|categorias';
/* Numero aproximado NAO e contagem da base: "mais de 50 companhias ja
   registradas na CVM" e narrativa sobre o mercado, e quem conta a propria
   base sabe o numero exato -- ninguem escreve "mais de 528 fundos" sobre
   uma lista que tem na mao. */
const APROXIMA = /(?:mais|cerca|perto|menos|acima) de\s*$|(?:quase|até|aproximadamente|em torno de)\s*$/i;
[[new RegExp('\\b\\d+\\s+(?:' + UNIVERSOS + ')\\b', 'g'), 'contagem de universo cravada'],
 [/\b\d+\s+d(?:os|as)\s+\d+\b/g, 'proporcao "N dos M" cravada']
].forEach(([re, msg]) => {
  for(const [onde, texto] of [['script', jsVisivel], ['markup', htmlVisivel]])
  for(const m of texto.matchAll(re)){
    if(APROXIMA.test(texto.slice(Math.max(0, m.index - 26), m.index))) continue;
    falha(msg + ' no ' + onde + ': "' + m[0] + '" - derive de E.length, BDR.length, ETF.length, FII.length ou nCategorias()');
  }
});

/* A formula do peso do bloco vive num lugar so. Ela ja esteve escrita a mao
   no miniMapa alem de em peso(), e ajustar o expoente ou o piso fazia a previa
   da Visao geral divergir do mosaico em silencio -- a mesma classe do
   calcula() duplicado que este projeto ja pagou uma vez. */
if(!/const pesoVM = e => Math\.pow/.test(js))falha('pesoVM ausente: a formula do peso precisa de uma fonte unica');
if((js.match(/Math\.pow\(Math\.max\(e\.vm/g)||[]).length!==1)falha('a formula do peso aparece mais de uma vez; use pesoVM()');

/* Landmark e link de pular: a secao de BDR passa de 2.500 paradas de Tab, e
   sem isto nao ha rota de saida pelo teclado. */
if(!/<main id="conteudo" tabindex="-1">/.test(h))falha('<main id="conteudo"> ausente');
if(!/<a class="pular" href="#conteudo">/.test(h))falha('link de pular ausente');
if(h.indexOf('</main>')>h.indexOf('<footer'))falha('o rodape ficou dentro do <main> e deixa de ser landmark contentinfo');

/* no-store proibe o navegador de guardar e nao compra frescor nenhum sobre
   no-cache, que tambem revalida sempre. Sao ~410 KB comprimidos por recarga. */
if(/fetch\([^)]*cache:\s*'no-store'/.test(js))falha('fetch com no-store: use no-cache, que revalida igual e aceita 304');

/* O estado inteiro da tela vai na URL: o link e a unidade de compartilhamento
   do projeto, e sem estas tags ele chega sem titulo, resumo nem imagem. */
const cabeca=h.slice(0,h.indexOf('</head>'));
[['<meta name="description"','descrição'],['rel="canonical"','canonical'],['rel="icon"','favicon'],
 ['property="og:title"','og:title'],['property="og:description"','og:description'],['property="og:image"','og:image'],
 ['property="og:url"','og:url'],['name="twitter:card"','twitter:card']
].forEach(([x,rot])=>{if(!cabeca.includes(x))falha('meta ausente no head: '+rot);});
const og=cabeca.match(/property="og:image" content="([^"]+)"/);
if(!og||!/^https:\/\//.test(og[1]))falha('og:image precisa de URL absoluta; crawler nao resolve caminho relativo');
if(!fs.existsSync(path.join(__dirname,'..',og[1].split('/').pop())))falha('og:image aponta para arquivo que nao existe: rode node scripts/gera-social.js');
/* Crawler nao executa JS: contagem em meta nao teria como ser derivada. */
[...cabeca.matchAll(/<meta [^>]*content="([^"]*)"/g)].forEach(m=>{
  if(/\b(369|825|222)\b/.test(m[1]))falha('contagem cravada em meta tag: o crawler não executa JS, então ela envelhece sozinha');
});

/* Regra numero um do projeto: nenhuma dependencia externa. Isto vale para
   RECURSOS carregados, nao para <a href> das fontes citadas nas fichas -- essas
   sao links que o usuario clica, e devem continuar existindo. */
[...h.matchAll(/<link\b[^>]*>/g)].map(m=>m[0]).forEach(tag=>{
  if(/href="https?:\/\//.test(tag)&&!/rel="canonical"/.test(tag))
    falha('recurso externo no <link>: '+tag.slice(0,80));
});
if(/<script[^>]+src="https?:\/\//.test(h))falha('script externo: o projeto nao tem dependencia');
if(/url\(\s*['"]?https?:\/\//.test(h))falha('recurso externo em url() do CSS');
['fonts.googleapis.com','fonts.gstatic.com'].forEach(d=>{if(h.includes(d))falha('fonte de terceiro reintroduzida: '+d+'; use fontes/ e scripts/baixa-fontes.js');});
[...h.matchAll(/src:url\(fontes\/([a-z0-9-]+\.woff2)\)/g)].forEach(m=>{
  if(!fs.existsSync(path.join(__dirname,'..','fontes',m[1])))falha('@font-face aponta para arquivo ausente: fontes/'+m[1]+'; rode node scripts/baixa-fontes.js');
});

/* Variavel de fonte inexistente deixa font-family invalido e o elemento cai na
   fonte herdada, sem erro nenhum no console. */
[...h.matchAll(/var\(--([a-z]+)\)/g)].map(m=>m[1]).forEach(v=>{
  if(!new RegExp('--'+v+'\\s*:').test(h))falha('variavel CSS usada e nunca declarada: --'+v);
});
const secoes=[...h.matchAll(/<button data-sec="([^"]+)"/g)].map(x=>x[1]);if(JSON.stringify(secoes)!==JSON.stringify(['geral','empresas','bdrs','etfs','fiis','carteira','favoritos','radar','metodologia']))falha('navegacao primaria invalida');
const fetches=[...scripts[0][1].matchAll(/fetch\('([^']+)'/g)].map(x=>x[1]);if(fetches.some(x=>x.startsWith('/')))falha('fetch com barra inicial quebra o deploy em subcaminho');
['precos.json','bdrs.json','etfs.json','etfs-detalhes.json','fiis.json','metricas.json','metricas-empresas.json','analise.json','eventos.json','saude.json'].forEach(x=>{if(!fetches.includes(x))falha('carga ausente: '+x);});
['ETF_DETALHE','function detalheETFHTML(','function normalizaSelecoesETF(','etfCobertura','posição direta','exposição econômica'].forEach(x=>{if(!h.includes(x))falha('integracao do detalhamento ETF ausente: '+x);});
if(!/table\.tab thead th\{\s*position:sticky;top:0;/.test(h))falha('cabecalho das tabelas pode sobrepor a primeira linha');
if(/table\.tab thead th\{top:\d+px\}/.test(h))falha('offset responsivo reintroduz sobreposicao na primeira linha');
console.log('OK: estrutura, JavaScript e caminhos relativos da pagina validos');
