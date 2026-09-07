/*
 * Roda a pagina de verdade num Chrome headless e confere o checklist manual do
 * AGENTS.md. E o unico teste que enxerga DOM: os outros rodam o codigo do
 * index.html em `vm` com DOM dublado, o que pega logica mas nao pega layout,
 * foco nem rolagem. Os tres defeitos de acessibilidade corrigidos neste
 * projeto (vazamento de foco da cmpbar, bloco de mosaico sem rotulo, nav
 * cortada no celular) passariam por todos os outros validadores.
 *
 * Sem dependencia e sem build, como o resto: servidor HTTP do proprio Node,
 * Chrome por CDP em WebSocket nativo. O runner ubuntu-latest do GitHub ja traz
 * o google-chrome-stable instalado; local, procura nos caminhos usuais ou usa
 * a variavel CHROME.
 *
 * Uso: node scripts/testa-navegador.js
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');

const RAIZ = path.join(__dirname, '..');
const TIPOS = { '.html':'text/html; charset=utf-8', '.json':'application/json; charset=utf-8',
  '.woff2':'font/woff2', '.png':'image/png', '.css':'text/css; charset=utf-8' };

const CAMINHOS = [
  process.env.CHROME,
  '/usr/bin/google-chrome-stable', '/usr/bin/google-chrome', '/usr/bin/chromium-browser', '/usr/bin/chromium',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
].filter(Boolean);

const espera = ms => new Promise(r => setTimeout(r, ms));

/* ---------- servidor estatico ---------- */
function servidor(){
  return new Promise(ok => {
    const s = http.createServer((req, res) => {
      const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html';
      const alvo = path.join(RAIZ, rel);
      if(!alvo.startsWith(RAIZ) || !fs.existsSync(alvo) || fs.statSync(alvo).isDirectory()){ res.writeHead(404); res.end(); return; }
      res.writeHead(200, { 'Content-Type': TIPOS[path.extname(alvo)] || 'application/octet-stream' });
      fs.createReadStream(alvo).pipe(res);
    });
    s.listen(0, '127.0.0.1', () => ok(s));
  });
}

/* ---------- Chrome por CDP ---------- */
async function navegador(){
  const bin = CAMINHOS.find(p => fs.existsSync(p));
  if(!bin) throw new Error('Chrome nao encontrado. Instale-o ou aponte a variavel CHROME para o executavel.');
  const perfil = fs.mkdtempSync(path.join(os.tmpdir(), 'mapa-b3-'));
  const proc = spawn(bin, ['--headless=new','--disable-gpu','--no-sandbox','--no-first-run','--disable-dev-shm-usage',
    '--remote-debugging-port=0','--user-data-dir=' + perfil,'about:blank'], { stdio:'ignore' });

  const arquivo = path.join(perfil, 'DevToolsActivePort');
  let porta = null;
  for(let i = 0; i < 100 && !porta; i++){
    await espera(100);
    if(fs.existsSync(arquivo)){ const l = fs.readFileSync(arquivo, 'utf8').split('\n'); if(l[0]) porta = l[0].trim(); }
  }
  if(!porta) { proc.kill(); throw new Error('Chrome nao abriu a porta de depuracao'); }

  /* O endpoint /json/version devolve o alvo do NAVEGADOR, que so entende
     Browser e Target -- os dominios Page e Runtime vivem no alvo da aba. */
  let aba = null;
  for(let i = 0; i < 60 && !aba; i++){
    const lista = await (await fetch('http://127.0.0.1:' + porta + '/json/list')).json();
    aba = lista.find(t => t.type === 'page' && t.webSocketDebuggerUrl);
    if(!aba) await espera(100);
  }
  if(!aba){ proc.kill(); throw new Error('Chrome nao expos nenhuma aba para depuracao'); }
  const ws = new WebSocket(aba.webSocketDebuggerUrl);
  await new Promise((ok, erro) => { ws.onopen = ok; ws.onerror = () => erro(new Error('falha ao conectar no Chrome')); });

  let seq = 0;
  const pendentes = new Map(), ouvintes = [];
  ws.onmessage = ev => {
    const m = JSON.parse(ev.data);
    if(m.id && pendentes.has(m.id)){
      const { ok, erro } = pendentes.get(m.id); pendentes.delete(m.id);
      m.error ? erro(new Error(m.error.message)) : ok(m.result);
    } else if(m.method) ouvintes.forEach(f => f(m));
  };
  const envia = (method, params = {}) => new Promise((ok, erro) => { const id = ++seq; pendentes.set(id, { ok, erro }); ws.send(JSON.stringify({ id, method, params })); });
  const fecha = () => { try{ ws.close(); }catch{} proc.kill(); try{ fs.rmSync(perfil, { recursive:true, force:true }); }catch{} };
  return { envia, ouvintes, fecha };
}

/* ---------- execucao ---------- */
const falhas = [], passos = [];
function confere(nome, condicao, detalhe = ''){
  (condicao ? passos : falhas).push(nome + (detalhe ? ' — ' + detalhe : ''));
  console.log((condicao ? '  ok   ' : '  FALHA') + '  ' + nome + (detalhe ? ' — ' + detalhe : ''));
}

(async () => {
  const s = await servidor();
  const base = 'http://127.0.0.1:' + s.address().port + '/index.html';
  const nav = await navegador();
  const { envia, ouvintes } = nav;

  const erros = [];
  ouvintes.push(m => {
    if(m.method === 'Runtime.exceptionThrown') erros.push('exceção: ' + (m.params.exceptionDetails?.exception?.description || m.params.exceptionDetails?.text || '?').split('\n')[0]);
    if(m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') erros.push('console.error: ' + m.params.args.map(a => a.value ?? a.description ?? '').join(' ').slice(0, 160));
  });

  await envia('Page.enable'); await envia('Runtime.enable'); await envia('Log.enable');
  ouvintes.push(m => { if(m.method === 'Log.entryAdded' && m.params.entry.level === 'error') erros.push('log: ' + m.params.entry.text.slice(0, 160)); });

  async function avalia(expr){
    const r = await envia('Runtime.evaluate', { expression: '(async()=>{' + expr + '})()', awaitPromise:true, returnByValue:true });
    if(r.exceptionDetails) throw new Error('erro na página: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text).split('\n')[0]);
    return r.result.value;
  }
  async function abre(largura = 1280, altura = 900){
    await envia('Emulation.setDeviceMetricsOverride', { width:largura, height:altura, deviceScaleFactor:1, mobile:largura < 768 });
    await envia('Page.navigate', { url: base });
    await new Promise(ok => { const f = m => { if(m.method === 'Page.loadEventFired'){ ouvintes.splice(ouvintes.indexOf(f), 1); ok(); } }; ouvintes.push(f); });
    await avalia("let t=Date.now();while(Date.now()-t<6000){if(typeof BDR!=='undefined'&&BDR.length&&typeof ETF!=='undefined'&&ETF.length)break;await new Promise(r=>setTimeout(r,80));}return 1;");
  }
  const vai = sec => avalia(`document.querySelector('nav.prim button[data-sec="${sec}"]').click();await new Promise(r=>setTimeout(r,260));return st.sec;`);

  console.log('servindo ' + base + '\n');
  await abre();

  /* 1. mosaico: contagens derivadas da propria base, nunca cravadas aqui */
  await vai('empresas');
  const mosaico = await avalia(`render();await new Promise(r=>setTimeout(r,300));
    const tiles=[...document.querySelectorAll('.tile')];
    /* Quase metade dos blocos nao cabe rotulo visivel: para o teclado, o
       aria-label e a UNICA identificacao, e precisa trazer nome, codigos e
       categoria -- nao so o nome, como trazia antes. */
    const magros=tiles.filter(t=>((t.getAttribute('aria-label')||'').split(',').length)<3);
    const mudos=tiles.filter(t=>!t.textContent.trim());
    /* Tooltip no foco: sem ele o bloco mudo e um retangulo colorido e calado. */
    const tip=document.getElementById('tip');escondeTip();
    mudos[0].dispatchEvent(new FocusEvent('focusin',{bubbles:true}));
    const tipNoFoco=+getComputedStyle(tip).opacity>0&&(tip.querySelector('.t1')||{}).textContent;
    return {blocos:tiles.length, grupos:document.querySelectorAll('#mapa .grp').length,
      esperadoBlocos:E.length, esperadoGrupos:nCategorias(),
      magros:magros.length, exemploMagro:magros[0]?magros[0].getAttribute('aria-label'):'',
      mudos:mudos.length, tipNoFoco};`);
  confere('mosaico desenha um bloco por empresa', mosaico.blocos === mosaico.esperadoBlocos, mosaico.blocos + '/' + mosaico.esperadoBlocos);
  confere('mosaico agrupa por categoria', mosaico.grupos === mosaico.esperadoGrupos, mosaico.grupos + '/' + mosaico.esperadoGrupos + ' grupos');
  confere('rótulo do bloco traz nome, códigos e categoria', !mosaico.magros, mosaico.magros ? mosaico.magros + ' blocos magros, ex.: "' + mosaico.exemploMagro + '"' : mosaico.mudos + ' blocos sem rótulo visível dependem disso');
  confere('tooltip aparece no foco do bloco', !!mosaico.tipNoFoco, String(mosaico.tipNoFoco || 'não apareceu'));

  /* 2. tabela de BDR: total e ordenacao que inverte no segundo clique */
  await vai('bdrs');
  const bdr = await avalia(`let t=Date.now();
    while(Date.now()-t<8000&&document.querySelectorAll('#boxTabelaB tbody tr').length<filtraBDR().length)await new Promise(r=>setTimeout(r,120));
    const cli=c=>{document.querySelector('#boxTabelaB th button[data-col="'+c+'"]').click();return st.bdrDir;};
    const a=cli('preco'),b=cli('preco');
    await new Promise(r=>setTimeout(r,900));
    return {linhas:document.querySelectorAll('#boxTabelaB tbody tr').length, esperado:filtraBDR().length, dir1:a, dir2:b,
      ordemBate:[...document.querySelectorAll('#boxTabelaB tbody tr')].map(x=>x.dataset.tk).join()===filtraBDR().map(x=>x.ticker).join()};`);
  confere('tabela de BDR lista o recorte inteiro', bdr.linhas === bdr.esperado, bdr.linhas + '/' + bdr.esperado + ' linhas');
  confere('ordenação inverte no segundo clique', bdr.dir1 !== bdr.dir2, bdr.dir1 + ' → ' + bdr.dir2);
  confere('ordem no DOM bate com a lista ordenada', bdr.ordemBate);

  /* 3. tabela de ETF: filtro de categoria e ordenacao */
  await vai('etfs');
  const etf = await avalia(`const n=()=>document.querySelectorAll('#boxTabelaEtf tbody tr').length;
    const todos=n(); const cat=[...document.querySelectorAll('#etfCategorias input')][0];
    cat.checked=true;cat.dispatchEvent(new Event('change',{bubbles:true}));await new Promise(r=>setTimeout(r,260));
    const filtrado=n();
    cat.checked=false;cat.dispatchEvent(new Event('change',{bubbles:true}));await new Promise(r=>setTimeout(r,260));
    const cli=()=>{document.querySelector('#boxTabelaEtf th button[data-col="ticker"]').click();return st.etfDir;};
    const a=cli(),b=cli();
    return {todos,filtrado,restaurado:n(),esperado:ETF.length,dir1:a,dir2:b};`);
  confere('tabela de ETF lista o catálogo', etf.todos === etf.esperado, etf.todos + '/' + etf.esperado);
  confere('filtro de categoria reduz e restaura', etf.filtrado > 0 && etf.filtrado < etf.todos && etf.restaurado === etf.todos, etf.todos + ' → ' + etf.filtrado + ' → ' + etf.restaurado);
  confere('ordenação de ETF inverte', etf.dir1 !== etf.dir2, etf.dir1 + ' → ' + etf.dir2);

  /* Historico de ETF: serie AJUSTADA, ao contrario da de FII. As duas
     convencoes convivem no mesmo projeto, e a unica coisa que impede de
     trocarem de lugar e alguem conferir. */
  const metEtfC = await avalia(`await new Promise(r=>setTimeout(r,400));
    const linhas=[...document.querySelectorAll('#boxTabelaEtf tbody tr')];
    const comRet=linhas.filter(tr=>/\\d/.test(tr.querySelectorAll('td')[7].textContent)).length;
    const esperado=ETF.filter(x=>typeof METRICAS_ETF[x.ticker]?.r252==='number').length;
    const rot=[...document.querySelectorAll('#boxTabelaEtf thead th')].map(t=>t.textContent.trim().replace(/[▲▼]/g,''));
    const temVp=Object.values(METRICAS_ETF).some(m=>m.vp252!==undefined);
    const temProv=Object.values(METRICAS_ETF).some(m=>m.prov12!==undefined);
    const alvo=ETF.find(x=>METRICAS_ETF[x.ticker]);
    const tr=linhas.find(x=>x.dataset.te===alvo.ticker);
    tr.focus();tr.click();await new Promise(r=>setTimeout(r,300));
    const temGrafico=!!drw.querySelector('.spark');
    const temBloco=/Histórico e liquidez/.test(drw.textContent);
    document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}));
    await new Promise(r=>setTimeout(r,260));
    return {comRet,esperado,rot,temVp,temProv,temGrafico,temBloco,carregadas:Object.keys(METRICAS_ETF).length,tk:alvo.ticker};`);
  confere('métricas de ETF entram sob demanda', metEtfC.carregadas > 0, metEtfC.carregadas + ' com histórico');
  confere('retorno de ETF aparece onde a janela fecha', metEtfC.comRet === metEtfC.esperado && metEtfC.comRet > 0, metEtfC.comRet + '/' + metEtfC.esperado);
  confere('ETF usa a convenção da série ajustada', !metEtfC.temVp && !metEtfC.temProv && metEtfC.rot.includes('Retorno 12m'),
    metEtfC.temVp ? 'vp* vazou do FII' : metEtfC.temProv ? 'provento vazou do FII' : 'r252 e sem provento');
  confere('ficha de ETF traz histórico e gráfico', metEtfC.temBloco && metEtfC.temGrafico, metEtfC.tk);

  /* 3b. tabela de FII: total, filtro por tipo de carteira, ordenacao e P/VP */
  await vai('fiis');
  const fii = await avalia(`const n=()=>document.querySelectorAll('#boxTabelaFii tbody tr').length;
    const todos=n(); const tipo=[...document.querySelectorAll('#fiiTipos input')][0]; const rotulo=tipo.value;
    tipo.checked=true;tipo.dispatchEvent(new Event('change',{bubbles:true}));await new Promise(r=>setTimeout(r,260));
    const filtrado=n();
    const soDoTipo=[...document.querySelectorAll('#boxTabelaFii tbody tr')].every(tr=>tr.querySelectorAll('td')[3].textContent.trim()===rotulo);
    tipo.checked=false;tipo.dispatchEvent(new Event('change',{bubbles:true}));await new Promise(r=>setTimeout(r,260));
    const cli=()=>{document.querySelector('#boxTabelaFii th button[data-col=\\'pvp\\']').click();return st.fiiDir;};
    const a=cli(),b=cli();
    await new Promise(r=>setTimeout(r,260));
    const comPvp=[...document.querySelectorAll('#boxTabelaFii tbody tr')].filter(tr=>/\\d/.test(tr.querySelectorAll('td')[6].textContent)).length;
    const esperadoPvp=FII.filter(x=>{const r=cot(x.ticker);return r&&typeof x.valorPatrimonialCota==='number'&&x.valorPatrimonialCota>0;}).length;
    return {todos,filtrado,soDoTipo,rotulo,restaurado:n(),esperado:FII.length,dir1:a,dir2:b,comPvp,esperadoPvp};`);
  confere('tabela de FII lista o catálogo', fii.todos === fii.esperado, fii.todos + '/' + fii.esperado);
  confere('filtro por tipo de carteira reduz, isola e restaura', fii.filtrado > 0 && fii.filtrado < fii.todos && fii.soDoTipo && fii.restaurado === fii.todos,
    fii.todos + ' → ' + fii.filtrado + ' (' + fii.rotulo + ') → ' + fii.restaurado);
  confere('ordenação de FII inverte', fii.dir1 !== fii.dir2, fii.dir1 + ' → ' + fii.dir2);
  confere('P/VP aparece onde há preço e valor patrimonial', fii.comPvp === fii.esperadoPvp && fii.comPvp > 0, fii.comPvp + '/' + fii.esperadoPvp + ' linhas com P/VP');

  /* A ficha do FII e a unica que mostra composicao de carteira em barras. */
  const fichaFii = await avalia(`const alvo=FII.find(x=>x.tipo&&cot(x.ticker));
    const tr=[...document.querySelectorAll('#boxTabelaFii tbody tr')].find(x=>x.dataset.tf===alvo.ticker);
    tr.focus();tr.click();await new Promise(r=>setTimeout(r,300));
    /* Escopado ao bloco da carteira: o de proventos tambem usa .dist. */
    const bloco=[...drw.querySelectorAll('.bloco')].find(b=>/Composição da carteira/.test(b.querySelector('h3')?.textContent||''));
    const barras=bloco?bloco.querySelectorAll('.dist .l').length:0;
    const temPatrimonio=/Patrimônio/.test(drw.textContent);
    document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}));
    await new Promise(r=>setTimeout(r,260));
    return {aberta:true,tk:alvo.ticker,barras,temPatrimonio,
      voltou:document.activeElement.dataset&&document.activeElement.dataset.tf===alvo.ticker,
      destravou:document.querySelector('.wrap').inert===false};`);
  confere('ficha de FII mostra composição da carteira', fichaFii.barras === 3 && fichaFii.temPatrimonio, fichaFii.tk + ', ' + fichaFii.barras + ' faixas');
  confere('Esc na ficha de FII devolve o foco à linha', fichaFii.voltou && fichaFii.destravou);

  /* 3c. distribuicao: a coluna nao pode se vender como dividend yield, e quem
     distribuiu mais que o proprio preco tem de chegar marcado -- senao o topo
     de uma ordenacao vira devolucao de capital com cara de renda. */
  const dist = await avalia(`document.querySelector('#boxTabelaFii th button[data-col="dist"]').click();
    await new Promise(r=>setTimeout(r,300));
    const linhas=[...document.querySelectorAll('#boxTabelaFii tbody tr')];
    const cel=tr=>tr.querySelectorAll('td')[7];
    const marcados=linhas.filter(tr=>cel(tr).querySelector('.na[title]')).length;
    const esperado=FII.filter(x=>{const d=distFii(x);return d!==null&&d>=100;}).length;
    const comValor=linhas.filter(tr=>/\\d/.test(cel(tr).textContent)).length;
    const esperadoValor=FII.filter(x=>distFii(x)!==null).length;
    const rot=[...document.querySelectorAll('#boxTabelaFii thead th')].map(t=>t.textContent.trim().replace(/[▲▼]/g,''));
    /* A serie desta base e preco: nenhuma variacao de 12 meses pode explodir
       como o ajustado explodia (XPML marcava +713,7%). */
    const absurdos=Object.values(METRICAS_FII).filter(m=>typeof m.vp252==='number'&&Math.abs(m.vp252)>150).length;
    const temR252=Object.values(METRICAS_FII).some(m=>m.r252!==undefined);
    return {marcados,esperado,comValor,esperadoValor,rot,absurdos,temR252,
      dizRendimento:rot.some(r=>/rendimento/i.test(r)), dizDistribuido:rot.some(r=>/distribuído/i.test(r))};`);
  confere('coluna de distribuição não se chama rendimento', !dist.dizRendimento && dist.dizDistribuido, dist.rot[7] + ' / ' + dist.rot[8]);
  confere('distribuição aparece onde há provento e preço', dist.comValor === dist.esperadoValor && dist.comValor > 0, dist.comValor + '/' + dist.esperadoValor);
  confere('quem distribuiu mais que o próprio preço vem marcado', dist.marcados === dist.esperado && dist.marcados > 0, dist.marcados + ' marcados');
  confere('variação de 12 meses vem da série de preço, não da ajustada', dist.absurdos === 0 && !dist.temR252, dist.absurdos + ' acima de 150%');

  /* 4. ficha: Esc devolve o foco a origem, e o fundo fica inerte de verdade */
  await vai('bdrs');
  const ficha = await avalia(`let t=Date.now();
    while(Date.now()-t<8000&&document.querySelectorAll('#boxTabelaB tbody tr').length<filtraBDR().length)await new Promise(r=>setTimeout(r,120));
    COMPARAR.add(BDR[0].ticker);atualizaSelecao();
    const tr=document.querySelector('#boxTabelaB tbody tr'),tk=tr.dataset.tk;
    tr.focus();tr.click();await new Promise(r=>setTimeout(r,260));
    const aberta=drw.classList.contains('on');
    const barraVisivel=!document.getElementById('cmpbar').classList.contains('hide');
    document.getElementById('limpaCmp').focus();
    const vazou=document.activeElement.id==='limpaCmp';
    document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}));
    await new Promise(r=>setTimeout(r,260));
    const volta=document.activeElement.dataset&&document.activeElement.dataset.tk;
    COMPARAR.clear();salvaComparacao();atualizaSelecao();
    return {aberta,barraVisivel,vazou,voltou:volta===tk,tk,
      destravou:document.querySelector('.wrap').inert===false&&document.getElementById('cmpbar').inert===false};`);
  confere('ficha abre a partir da linha', ficha.aberta, ficha.tk);
  confere('foco não escapa do diálogo modal', ficha.barraVisivel && !ficha.vazou);
  confere('Esc devolve o foco à origem', ficha.voltou);
  confere('fechamento destrava fundo e barra', ficha.destravou);

  /* 5. nenhuma secao rola horizontalmente em 375 px */
  await abre(375, 812);
  const rolagem = [];
  for(const sec of ['geral','empresas','bdrs','etfs','fiis','carteira','favoritos','radar']){
    await vai(sec);
    const x = await avalia('return {larg:innerWidth,scroll:document.documentElement.scrollWidth};');
    if(x.scroll > x.larg + 1) rolagem.push(sec + ' (' + x.scroll + '>' + x.larg + ')');
  }
  confere('nenhuma seção rola horizontalmente em 375 px', !rolagem.length, rolagem.join(', '));

  /* 6. console limpo, do carregamento ao fim do passeio */
  confere('sem erro no console', !erros.length, erros.slice(0, 3).join(' | '));

  nav.fecha(); s.close();
  console.log('\n' + passos.length + ' verificações passaram' + (falhas.length ? ', ' + falhas.length + ' falharam' : ''));
  if(falhas.length){ console.error('\nFALHOU:\n- ' + falhas.join('\n- ')); process.exit(1); }
  console.log('OK: mosaico, tabelas, ordenação, ficha, foco, responsivo e console — na página de verdade');
})().catch(e => { console.error('ERRO:', e.message); process.exit(1); });
