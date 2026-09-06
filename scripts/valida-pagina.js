const fs=require('fs'),path=require('path'),h=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
const falha=m=>{throw new Error(m);};
const scripts=[...h.matchAll(/<script>([\s\S]*?)<\/script>/g)];if(scripts.length!==1)falha('a pagina deve manter um unico script embutido');
new Function(scripts[0][1]);
['secGeral','secEmpresas','secBdrs','secEtfs','secCarteira','secFavoritos','secRadar','secMetodologia','drw','cmpbar','boxMatrizB','saudeBt','atualizaPrecosBt','formCarteira','etfCoberturas','etfClasses','etfFocos','etfGeografias','etfCaracteristicas'].forEach(id=>{if(!h.includes('id="'+id+'"'))falha('elemento ausente: '+id);});
['function squarify(','function peso(','const txOn =','lastFocus','wrap.inert'].forEach(x=>{if(!h.includes(x))falha('invariante ausente: '+x);});
/* A cmpbar e irma de .wrap: travar so o wrap deixa os botoes dela alcancaveis
   por Tab a partir de uma ficha aria-modal. Um unico lugar escreve wrap.inert,
   e toda abertura de ficha passa por ele. */
const js=scripts[0][1];
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
const secoes=[...h.matchAll(/<button data-sec="([^"]+)"/g)].map(x=>x[1]);if(JSON.stringify(secoes)!==JSON.stringify(['geral','empresas','bdrs','etfs','carteira','favoritos','radar','metodologia']))falha('navegacao primaria invalida');
const fetches=[...scripts[0][1].matchAll(/fetch\('([^']+)'/g)].map(x=>x[1]);if(fetches.some(x=>x.startsWith('/')))falha('fetch com barra inicial quebra o deploy em subcaminho');
['precos.json','bdrs.json','etfs.json','etfs-detalhes.json','metricas.json','metricas-empresas.json','analise.json','eventos.json','saude.json'].forEach(x=>{if(!fetches.includes(x))falha('carga ausente: '+x);});
['ETF_DETALHE','function detalheETFHTML(','function normalizaSelecoesETF(','etfCobertura','posição direta','exposição econômica'].forEach(x=>{if(!h.includes(x))falha('integracao do detalhamento ETF ausente: '+x);});
if(!/table\.tab thead th\{\s*position:sticky;top:0;/.test(h))falha('cabecalho das tabelas pode sobrepor a primeira linha');
if(/table\.tab thead th\{top:\d+px\}/.test(h))falha('offset responsivo reintroduz sobreposicao na primeira linha');
console.log('OK: estrutura, JavaScript e caminhos relativos da pagina validos');
