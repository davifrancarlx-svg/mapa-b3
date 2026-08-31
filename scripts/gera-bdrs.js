/*
 * Gera bdrs.json: a lista de BDRs de empresas individuais compraveis na B3
 * (patrocinados + nao patrocinados), com ticker de negociacao, pais e setor.
 *
 * Ao contrario de atualiza-precos.js, este script NAO roda a cada 30 minutos.
 * Ele gera uma base de identidade (quais BDRs existem, de que empresa, pais,
 * setor) que muda raramente -- so quando a B3 lista ou cancela um programa de
 * BDR. Rode-o manualmente de vez em quando (a cada poucos meses basta).
 *
 * Fontes:
 *  - Lista oficial de BDRs: API de empresas listadas da B3
 *    (o mesmo sistema que alimentou a base de empresas brasileiras do mapa).
 *  - Pais/setor/industria: Yahoo Finance (nao oficial), porque a B3 nao
 *    classifica BDR por setor -- todos vem como "Nao Classificados".
 *
 * Uso: node scripts/gera-bdrs.js
 */

const fs = require('fs');
const path = require('path');

const SAIDA = path.join(__dirname, '..', 'bdrs.json');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36';
const espera = ms => new Promise(r => setTimeout(r, ms));

/* codeCategoryBVMF na API da B3: 6 = nao patrocinado (a maioria, ~810);
   3/4/5 = patrocinado niveis I/II/III (um punhado). 28/29/30 sao BDRs de
   ETF estrangeiro, nao de empresa -- ficam fora, no mesmo espirito do
   "ETFs ficaram de fora" que ja vale pro resto do mapa. */
const CATEGORIAS = [
  { codeCategoryBVMF: 6, tipo: 'não patrocinado' },
  { codeCategoryBVMF: 3, tipo: 'patrocinado nível I' },
  { codeCategoryBVMF: 4, tipo: 'patrocinado nível II' },
  { codeCategoryBVMF: 5, tipo: 'patrocinado nível III' }
];

/* Sufixo de negociacao: nao patrocinado e quase sempre 34.
   Patrocinado varia por programa (31, 32, 33, 35...) -- tentamos candidatos
   contra o Yahoo e ficamos com o primeiro que responde. */
const SUFIXOS_PATROCINADO = ['31', '32', '33', '34', '35', '39'];

async function buscaPaginaB3(codeCategoryBVMF, pageNumber){
  const params = { language: 'pt-br', pageNumber, pageSize: 100, codeCategoryBVMF };
  const b64 = Buffer.from(JSON.stringify(params)).toString('base64');
  const url = 'https://sistemaswebb3-listados.b3.com.br/listedCompaniesProxy/CompanyCall/GetCompaniesBDR/' + b64;
  const r = await fetch(url, { headers: { 'User-Agent': UA } });
  if(r.status !== 200) throw new Error('B3 respondeu ' + r.status);
  return r.json();
}

async function listaTodosBDR(){
  const todos = [];
  for(const cat of CATEGORIAS){
    let pagina = 1, totalPaginas = 1;
    do {
      const j = await buscaPaginaB3(cat.codeCategoryBVMF, pagina);
      (j.results || []).filter(x => x.status === 'A').forEach(x => todos.push({
        cvm: x.codeCVM,
        empresa: x.companyName,
        curto: x.issuingCompany,
        tipo: cat.tipo
      }));
      totalPaginas = j.page?.totalPages || 1;
      pagina++;
      await espera(300);
    } while(pagina <= totalPaginas);
    console.log(cat.tipo + ': ' + todos.filter(x => x.tipo === cat.tipo).length + ' empresas');
  }
  return todos;
}

async function chartMeta(ticker){
  try{
    const r = await fetch('https://query1.finance.yahoo.com/v8/finance/chart/' + ticker + '.SA?interval=1d&range=1d',
      { headers: { 'User-Agent': UA } });
    if(r.status !== 200) return null;
    const j = await r.json();
    return j.chart?.result?.[0]?.meta || null;
  } catch { return null; }
}

/* Resolve o ticker real de uma patrocinada tentando os sufixos conhecidos.
   Confere pelo preco existir (nao basta status 200: o Yahoo devolve chart
   vazio para simbolo inexistente, mas o meta.regularMarketPrice so aparece
   quando o papel e real). */
async function resolveSufixoPatrocinado(curto){
  for(const suf of SUFIXOS_PATROCINADO){
    const m = await chartMeta(curto + suf);
    if(m && typeof m.regularMarketPrice === 'number'){
      return curto + suf;
    }
    await espera(250);
  }
  return null;
}

async function autenticaYahoo(){
  const r = await fetch('https://fc.yahoo.com/', { headers:{ 'User-Agent':UA }, redirect:'manual' });
  const bruto = r.headers.getSetCookie ? r.headers.getSetCookie() : [];
  const cookie = bruto.map(c => c.split(';')[0]).join('; ');
  const cr = await fetch('https://query1.finance.yahoo.com/v1/test/getcrumb', { headers:{ 'User-Agent':UA, Cookie:cookie } });
  const crumb = (await cr.text()).trim();
  return { cookie, crumb };
}

/* Pais/setor/industria: a B3 nao tem essa classificacao para BDR, entao
   usamos o perfil que o Yahoo mantem da empresa por tras do papel. */
async function perfilYahoo(ticker, sessao, tentativa = 1){
  try{
    const url = 'https://query1.finance.yahoo.com/v10/finance/quoteSummary/' + ticker + '.SA'
      + '?modules=assetProfile&crumb=' + encodeURIComponent(sessao.crumb);
    const r = await fetch(url, { headers: { 'User-Agent': UA, Cookie: sessao.cookie } });
    if(r.status !== 200) throw new Error('status ' + r.status);
    const j = await r.json();
    const p = j.quoteSummary?.result?.[0]?.assetProfile;
    if(!p) return null;
    return { pais: p.country || null, setor: p.sector || null, industria: p.industry || null };
  } catch(err){
    if(tentativa < 2){ await espera(1000); return perfilYahoo(ticker, sessao, tentativa + 1); }
    return null;
  }
}

(async () => {
  console.log('buscando lista oficial de BDRs na B3...');
  const lista = await listaTodosBDR();
  console.log('total: ' + lista.length + ' BDRs de empresas (ETFs estrangeiros ficam de fora)');

  console.log('\nresolvendo ticker de negociação...');
  const comTicker = [];
  for(const item of lista){
    if(item.tipo === 'não patrocinado'){
      comTicker.push({ ...item, ticker: item.curto + '34' });
    } else {
      const t = await resolveSufixoPatrocinado(item.curto);
      if(t) comTicker.push({ ...item, ticker: t });
      else console.log('  não consegui resolver o ticker de ' + item.empresa + ' (' + item.curto + ')');
    }
  }
  console.log('tickers resolvidos: ' + comTicker.length + '/' + lista.length);

  console.log('\nbuscando país/setor no Yahoo (uma chamada por empresa, isto demora alguns minutos)...');
  const sessao = await autenticaYahoo();
  const finais = [];
  for(let i = 0; i < comTicker.length; i++){
    const item = comTicker[i];
    const perfil = await perfilYahoo(item.ticker, sessao);
    finais.push({
      ticker: item.ticker,
      empresa: item.empresa,
      tipo: item.tipo,
      pais: perfil?.pais || null,
      setor: perfil?.setor || null,
      industria: perfil?.industria || null
    });
    if((i + 1) % 50 === 0) console.log('  ' + (i + 1) + '/' + comTicker.length);
    await espera(300);
  }

  const semPerfil = finais.filter(x => !x.pais).length;
  console.log('\nconcluído: ' + finais.length + ' BDRs, ' + semPerfil + ' sem perfil de país/setor no Yahoo');

  const saida = {
    geradoEm: new Date().toISOString(),
    fonte: 'B3 (lista oficial) + Yahoo Finance (país/setor, não oficial)',
    total: finais.length,
    bdrs: finais
  };
  fs.writeFileSync(SAIDA, JSON.stringify(saida, null, 1) + '\n', 'utf8');
  console.log('gravado em ' + SAIDA);
})().catch(err => { console.error('ERRO:', err.message); process.exit(1); });
