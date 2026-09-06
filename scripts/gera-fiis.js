/*
 * Gera fiis.json: catalogo dos fundos de investimento imobiliario listados na
 * B3, com ticker, dados patrimoniais oficiais da CVM e a composicao declarada
 * da carteira.
 *
 * Como bdrs.json e etfs.json, este script NAO roda a cada 30 minutos. E base
 * de identidade e de fundamento, que muda quando a B3 lista um fundo ou
 * quando a CVM publica o informe do mes. Rode a mao de vez em quando.
 *
 * Fontes, todas oficiais:
 *  - Lista: API de fundos listados da B3, mesmo endpoint dos ETFs com
 *    typeFund 'FII' (GetListFunds).
 *  - Fundamento e carteira: informe mensal de FII da CVM (dados abertos),
 *    arquivos `geral`, `complemento` e `ativo_passivo`.
 *  - Verificacao de ticker: Yahoo Finance (nao oficial) -- so confirma que
 *    acronym+11 tem cotacao; nao e fonte da lista nem da classificacao.
 *
 * A JUNCAO E PELO ISIN, NAO PELO NOME. O informe da CVM tem CNPJ como chave e
 * a B3 tem `acronym`; cruzar por nome arriscaria atribuir o patrimonio de um
 * fundo a outro, que e exatamente o motivo de etfs.json nao ter patrimonio.
 * O ISIN da cota resolve isso: BR + acronimo de 4 posicoes + CTF + digitos,
 * entao o proprio ISIN carrega o acronimo da B3, de forma deterministica e
 * oficial dos dois lados.
 *
 * Uso: node scripts/gera-fiis.js
 */

const fs = require('fs');
const path = require('path');
const { lista: listaZip, extrai, csv } = require('./lib/zip');

const SAIDA = path.join(__dirname, '..', 'fiis.json');
const TEMP = SAIDA + '.tmp';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36';
const espera = ms => new Promise(r => setTimeout(r, ms));

/* Piso mais baixo que o dos ETFs (0.85), e de proposito. A lista da B3 inclui
   fundos restritos a investidor qualificado, que existem, tem CNPJ e informe,
   e nunca negociaram em bolsa: 112 dos 528 nao tem cotacao no Yahoo. Foi
   medido duas vezes, e nenhum sufixo alternativo (11B, 12, 13, 10, 11A)
   devolve preco para eles -- ou seja, nao e o `+11` que esta errado, e o
   universo que e assim mesmo. O piso existe para pegar a API quebrando, e por
   isso ha tambem a guarda relativa contra a base anterior, que e a que de fato
   detecta uma queda subita. */
const COBERTURA_MINIMA = 0.70;
const QUEDA_MAXIMA = 0.15;         /* contra a ultima geracao bem-sucedida */
const COBERTURA_CVM_MINIMA = 0.70; /* fundos da B3 com informe correspondente */
const CONCENTRACAO = 2 / 3;        /* fatia minima para rotular; abaixo disso e hibrido */

/* O ISIN do informe NAO e unico: administradores preenchem com valor repetido
   (BRSPTWCTF002 aparece em sete fundos diferentes, BRXPMLCTF000 cobre o XP
   Malls e o Peninsula). Quando mais de um fundo reivindica o acronimo, o nome
   desempata -- e so aqui, como desempate, nunca como porta de entrada: o
   `tradingName` da B3 costuma ser o proprio acronimo ("FII BTHR"), entao usar
   nome como filtro derrubaria dezenas de pares corretos. */
const LIMIAR_DESEMPATE = 0.6;  /* o vencedor precisa parecer mesmo com o fundo */
const MARGEM_DESEMPATE = 0.4;  /* e precisa ganhar do segundo com folga */
const LIMIAR_FRACO = 0.4;      /* candidato unico abaixo disto entra sinalizado */

/* Palavras que todo FII tem no nome e que nao distinguem nada. */
const RUIDO = new Set(['FUNDO', 'FUNDOS', 'DE', 'DO', 'DA', 'DOS', 'DAS', 'INVESTIMENTO', 'INVESTIMENTOS',
  'IMOBILIARIO', 'IMOBILIARIA', 'IMOBILIARIOS', 'FII', 'RESPONSABILIDADE', 'LIMITADA', 'LTDA', 'RL', 'RESP',
  'E', 'EM', 'FI', 'FDO', 'I', 'II', 'III', 'RECEBIVEIS', 'CRI', 'MULTIESTRATEGIA', 'RENDA', 'CLASSE',
  'UNICA', 'COTAS', 'PARTICIPACOES']);

const termos = s => String(s == null ? '' : s).normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toUpperCase().replace(/[^A-Z0-9 ]/g, ' ').split(/\s+/).filter(t => t.length > 1 && !RUIDO.has(t));

/* Contencao, nao Jaccard: o nome da B3 e abreviado e o da CVM e por extenso,
   entao o que importa e o menor estar contido no maior. */
function similar(a, b){
  const A = new Set(termos(a)), B = new Set(termos(b));
  if(!A.size || !B.size) return 0;
  let comuns = 0;
  for(const t of A) if(B.has(t)) comuns++;
  return comuns / Math.min(A.size, B.size);
}

/* Dois anos: um fundo que parou de entregar informe em 2026 mas continua
   listado ainda tem o ultimo retrato valido em 2025. */
const ANOS = [new Date().getUTCFullYear() - 1, new Date().getUTCFullYear()];
const URL_CVM = ano => 'https://dados.cvm.gov.br/dados/FII/DOC/INF_MENSAL/DADOS/inf_mensal_fii_' + ano + '.zip';

/* Grupos da carteira declarada no informe `ativo_passivo`. Sao contas do
   balanco, nao rotulo: e por isso que servem para classificar sem inferir
   nada a partir do nome do fundo. */
const CARTEIRA = {
  tijolo: ['Direitos_Bens_Imoveis', 'Terrenos', 'Imoveis_Renda_Acabados', 'Imoveis_Renda_Construcao', 'Imoveis_Venda_Acabados', 'Imoveis_Venda_Construcao', 'Outros_Direitos_Reais'],
  papel: ['CRI', 'CRI_CRA', 'Letras_Hipotecarias', 'LCI', 'LCI_LCA', 'LIG', 'Debentures', 'Cedulas_Debentures', 'Notas_Promissorias'],
  cotas: ['FII', 'Outras_Cotas_FI', 'Fundo_Acoes', 'FIP', 'FDIC', 'Acoes_Sociedades_Atividades_FII', 'Cotas_Sociedades_Atividades_FII']
};
const ROTULO = { tijolo: 'Tijolo', papel: 'Papel', cotas: 'Fundo de fundos' };

const num = v => { const x = parseFloat(String(v == null ? '' : v).replace(',', '.')); return Number.isFinite(x) ? x : null; };
const arred = (x, c) => x === null ? null : +x.toFixed(c);

/* ---------- B3 ---------- */

async function buscaPaginaB3(pageNumber){
  const b64 = Buffer.from(JSON.stringify({ language: 'pt-br', typeFund: 'FII', pageNumber, pageSize: 100 })).toString('base64');
  const r = await fetch('https://sistemaswebb3-listados.b3.com.br/fundsListedProxy/Search/GetListFunds/' + b64, { headers: { 'User-Agent': UA } });
  if(r.status !== 200) throw new Error('B3 respondeu ' + r.status);
  const j = await r.json();
  if(!Array.isArray(j.results)) throw new Error('B3 devolveu estrutura inesperada na pagina ' + pageNumber);
  if(!j.page || !Number.isInteger(j.page.totalPages) || j.page.totalPages < 1) throw new Error('B3 devolveu paginacao inesperada na pagina ' + pageNumber);
  return j;
}

async function listaTodosFII(){
  const todos = [];
  let pagina = 1, totalPaginas = 1;
  do {
    const j = await buscaPaginaB3(pagina);
    j.results.forEach(x => {
      if(!Number.isInteger(x.id) || x.id <= 0 || typeof x.acronym !== 'string' || !/^[A-Z0-9]{4}$/.test(x.acronym) || typeof x.fundName !== 'string' || !x.fundName.trim()){
        throw new Error('fundo com identidade inesperada na B3: ' + JSON.stringify(x));
      }
      todos.push({ idB3: x.id, acronym: x.acronym, nome: x.fundName.trim(), nomeCurto: typeof x.tradingName === 'string' ? x.tradingName.trim() : '' });
    });
    totalPaginas = j.page.totalPages;
    pagina++;
    await espera(300);
  } while(pagina <= totalPaginas);

  const ids = new Set(), acronimos = new Set();
  for(const x of todos){
    if(ids.has(x.idB3)) throw new Error('id B3 repetido no catalogo: ' + x.idB3);
    if(acronimos.has(x.acronym)) throw new Error('acronimo repetido no catalogo da B3: ' + x.acronym);
    ids.add(x.idB3); acronimos.add(x.acronym);
  }
  return todos;
}

/* ---------- Yahoo, so para confirmar o ticker ---------- */

async function chartMeta(ticker, tentativa){
  tentativa = tentativa || 1;
  try{
    const r = await fetch('https://query1.finance.yahoo.com/v8/finance/chart/' + ticker + '.SA?interval=1d&range=1d', { headers: { 'User-Agent': UA } });
    if(r.status !== 200){
      if(tentativa < 3 && (r.status === 429 || r.status >= 500)){ await espera(500 * tentativa); return chartMeta(ticker, tentativa + 1); }
      return null;
    }
    const j = await r.json();
    const res = j.chart && j.chart.result && j.chart.result[0];
    return res ? res.meta || null : null;
  } catch {
    if(tentativa < 3){ await espera(500 * tentativa); return chartMeta(ticker, tentativa + 1); }
    return null;
  }
}

/* Cota de FII negocia como acronym+11, mesma premissa dos ETFs e pelo mesmo
   motivo: nenhum contraexemplo encontrado. Nao basta status 200 -- o Yahoo
   devolve chart vazio para simbolo inexistente. */
async function resolveTicker(acronym){
  const t = acronym + '11';
  const m = await chartMeta(t);
  return (m && Number.isFinite(m.regularMarketPrice) && m.regularMarketPrice > 0) ? t : null;
}

/* ---------- CVM ---------- */

/* Fica a versao mais recente de cada fundo: o informe e mensal e sofre
   reapresentacao (campo Versao), entao a mesma competencia aparece varias
   vezes. */
function maisRecente(linhas){
  const u = {};
  for(const l of linhas){
    const k = l.CNPJ_Fundo_Classe;
    if(!k) continue;
    const atual = u[k];
    if(!atual || l.Data_Referencia > atual.Data_Referencia || (l.Data_Referencia === atual.Data_Referencia && +l.Versao > +atual.Versao)) u[k] = l;
  }
  return u;
}

async function baixaInforme(){
  const geral = [], complemento = [], ativoPassivo = [];
  for(const ano of ANOS){
    const r = await fetch(URL_CVM(ano), { headers: { 'User-Agent': UA } });
    if(r.status !== 200){
      if(ano === ANOS[0]){ console.log('  informe de ' + ano + ' indisponivel (HTTP ' + r.status + '), seguindo so com ' + ANOS[1]); continue; }
      throw new Error('CVM respondeu ' + r.status + ' para o informe de ' + ano);
    }
    const buf = Buffer.from(await r.arrayBuffer());
    const entradas = listaZip(buf);
    const pega = parte => {
      const e = entradas.find(x => x.nome.indexOf(parte) >= 0);
      if(!e) throw new Error('informe de ' + ano + ' sem o arquivo ' + parte);
      return csv(extrai(buf, e).toString('latin1'));
    };
    geral.push(...pega('geral'));
    complemento.push(...pega('complemento'));
    ativoPassivo.push(...pega('ativo_passivo'));
    console.log('  ' + ano + ': ' + geral.length + ' linhas acumuladas em geral');
  }
  if(!geral.length) throw new Error('nenhum informe da CVM foi lido');
  return { geral: maisRecente(geral), complemento: maisRecente(complemento), ativoPassivo: maisRecente(ativoPassivo) };
}

/* ISIN de cota de FII: BR + acronimo(4) + CTF + digitos, entao o proprio ISIN
   carrega o acronimo da B3. E o unico elo entre o CNPJ da CVM e a lista da B3
   que nao passa por nome.
   Mas ele NAO e unico: administradores repetem o mesmo ISIN em fundos
   diferentes -- BRSPTWCTF002 aparece em sete, BRXPMLCTF000 cobre o XP Malls e
   o Peninsula. Por isso o ISIN so levanta candidatos; quem decide e o
   `resolveCVM`. */
function candidatosPorISIN(geral){
  const porAcr = new Map();
  for(const g of Object.values(geral)){
    const m = /^BR([A-Z0-9]{4})CTF/.exec(g.Codigo_ISIN || '');
    if(!m) continue;
    if(!porAcr.has(m[1])) porAcr.set(m[1], []);
    porAcr.get(m[1]).push(g);
  }
  /* Classes do mesmo fundo (mesma raiz de CNPJ, Resolucao CVM 175) nao sao
     concorrentes entre si: vale a de informe mais recente. So raizes
     diferentes caracterizam disputa de verdade. */
  for(const [acr, linhas] of porAcr){
    const porRaiz = new Map();
    for(const l of linhas){
      const raiz = (l.CNPJ_Fundo_Classe || '').slice(0, 10);
      const atual = porRaiz.get(raiz);
      if(!atual || l.Data_Referencia > atual.Data_Referencia || (l.Data_Referencia === atual.Data_Referencia && +l.Versao > +atual.Versao)) porRaiz.set(raiz, l);
    }
    porAcr.set(acr, [...porRaiz.values()]);
  }
  return porAcr;
}

/* Candidato unico entra: nao ha o que confundir, e exigir semelhanca de nome
   aqui derrubaria dezenas de pares corretos (a B3 chama o Guardian Logistica
   de "FII GUARDIAN" e a CVM de "FII GUARDIAL LOGISTICA", com typo).
   Com mais de um candidato o nome decide, e so aceita quem ganha com folga --
   senao o fundo fica sem camada da CVM, porque atribuir o patrimonio errado e
   pior do que nao ter patrimonio. */
function resolveCVM(item, candidatos){
  if(!candidatos || !candidatos.length) return { estado: 'ausente' };
  const pontos = candidatos
    .map(g => ({ g, s: Math.max(similar(item.nome, g.Nome_Fundo_Classe), similar(item.nomeCurto, g.Nome_Fundo_Classe)) }))
    .sort((a, b) => b.s - a.s);
  if(pontos.length === 1) return { estado: pontos[0].s >= LIMIAR_FRACO ? 'ok' : 'fraca', g: pontos[0].g, s: pontos[0].s };
  const melhor = pontos[0], segundo = pontos[1];
  if(melhor.s >= LIMIAR_DESEMPATE && melhor.s - segundo.s >= MARGEM_DESEMPATE) return { estado: 'ok', g: melhor.g, s: melhor.s };
  return { estado: 'ambiguo' };
}

/* Classifica pela carteira DECLARADA, nao pelo nome nem pelo rotulo da CVM.
   O campo Segmento_Atuacao existe, mas 61% dos fundos caem em
   "Multicategoria"/"Outros" e ha erro observado (MXRF, fundo de papel,
   aparece como "Logistica"), entao ele entra so como informacao de origem. */
function classifica(ap){
  if(!ap) return null;
  const soma = campos => campos.reduce((s, c) => s + (num(ap[c]) || 0), 0);
  const v = { tijolo: soma(CARTEIRA.tijolo), papel: soma(CARTEIRA.papel), cotas: soma(CARTEIRA.cotas) };
  /* Componente negativa nao e composicao. O GSRF declara cotas de fundo
     negativas, e dividir por um total que se anula produzia "158,8% tijolo,
     -58,8% cotas" com rotulo confiante em cima. Sem numero honesto, sem
     rotulo. */
  if(Object.keys(v).some(k => v[k] < 0)) return null;
  const total = v.tijolo + v.papel + v.cotas;
  if(!(total > 0)) return null;
  const fr = { tijolo: v.tijolo / total, papel: v.papel / total, cotas: v.cotas / total };
  const maior = Object.keys(fr).sort((a, b) => fr[b] - fr[a])[0];
  return {
    tipo: fr[maior] >= CONCENTRACAO ? ROTULO[maior] : 'Híbrido',
    tijolo: arred(fr.tijolo * 100, 1),
    papel: arred(fr.papel * 100, 1),
    cotas: arred(fr.cotas * 100, 1),
    carteiraEm: ap.Data_Referencia || null
  };
}

function leAnterior(){
  if(!fs.existsSync(SAIDA)) return { fiis: [] };
  try { return JSON.parse(fs.readFileSync(SAIDA, 'utf8')); }
  catch(err){ throw new Error('base anterior invalida: ' + err.message); }
}

(async () => {
  console.log('buscando lista oficial de FIIs na B3...');
  const anterior = leAnterior();
  const lista = await listaTodosFII();
  console.log('total: ' + lista.length + ' fundos imobiliarios listados');
  const totalAnterior = (anterior.catalogoB3 && anterior.catalogoB3.total) || 0;
  if(totalAnterior && lista.length < Math.ceil(totalAnterior * 0.95)){
    throw new Error('catalogo da B3 caiu de ' + totalAnterior + ' para ' + lista.length + '; atualizacao interrompida para evitar perda em massa');
  }

  console.log('\nbaixando informe mensal de FII da CVM...');
  const informe = await baixaInforme();
  const candidatos = candidatosPorISIN(informe.geral);
  const disputados = [...candidatos.entries()].filter(([, v]) => v.length > 1);
  console.log('  ' + Object.keys(informe.geral).length + ' fundos no informe; ' + candidatos.size + ' acronimos com ISIN utilizavel');
  if(disputados.length) console.log('  ' + disputados.length + ' acronimos com mais de um fundo reivindicando o ISIN: ' + disputados.map(([a]) => a).join(', '));

  console.log('\nverificando ticker de negociacao (uma chamada por fundo)...');
  const finais = [], naoVerificados = [];
  const anteriores = new Map((anterior.fiis || []).map(x => [x.idB3, x]));
  let preservados = 0, comCVM = 0, comCarteira = 0, ambiguos = 0, fracas = 0;

  for(let i = 0; i < lista.length; i++){
    const item = lista[i];
    const esperado = item.acronym + '11';
    const ticker = await resolveTicker(item.acronym);
    const f = { ticker: esperado, nome: item.nome, idB3: item.idB3 };
    if(item.nomeCurto) f.nomeCurto = item.nomeCurto;

    if(!ticker){
      const antigo = anteriores.get(item.idB3);
      if(antigo && antigo.ticker === esperado && antigo.tickerVerificado !== false){ f.stale = true; preservados++; }
      else { f.tickerVerificado = false; naoVerificados.push(f); }
    }

    const r = resolveCVM(item, candidatos.get(item.acronym));
    if(r.estado === 'ambiguo'){ f.cvmAmbiguo = true; ambiguos++; }
    if(r.estado === 'ok' || r.estado === 'fraca'){
      comCVM++;
      if(r.estado === 'fraca'){ f.juncaoFraca = true; fracas++; }
      f.similaridade = arred(r.s, 2);
      const g = r.g;
      const cnpj = g.CNPJ_Fundo_Classe;
      const c = informe.complemento[cnpj], ap = informe.ativoPassivo[cnpj];
      f.cnpj = cnpj;
      f.segmentoCVM = g.Segmento_Atuacao || null;
      f.gestao = g.Tipo_Gestao || null;
      f.publicoAlvo = g.Publico_Alvo || null;
      f.administrador = g.Nome_Administrador || null;
      f.informeEm = g.Data_Referencia || null;
      if(c){
        /* Patrimonio liquido negativo e real: ha fundo com passivo a
           descoberto (o Panamby declara -27,3 mi). Ja o zero em cota e em
           quantidade emitida e ausencia de dado, nao valor -- alguns informes
           vem com cotas emitidas zeradas, e um deles declara 500 bilhoes de
           cotas para 50 mil reais de patrimonio. Publicar "a cota vale R$ 0"
           seria afirmacao falsa sobre o fundo. */
        f.patrimonioLiquido = num(c.Patrimonio_Liquido);
        const vp = arred(num(c.Valor_Patrimonial_Cotas), 2), cotas = num(c.Cotas_Emitidas);
        f.valorPatrimonialCota = vp === 0 ? null : vp;
        f.cotasEmitidas = cotas > 0 ? cotas : null;
        f.cotistas = num(c.Total_Numero_Cotistas);
        f.taxaAdministracao = arred(num(c.Percentual_Despesas_Taxa_Administracao), 6);
      }
      const cls = classifica(ap);
      if(cls){ Object.assign(f, cls); comCarteira++; }
    }
    finais.push(f);

    if((i + 1) % 50 === 0) console.log('  ' + (i + 1) + '/' + lista.length);
    await espera(250);
  }

  const renovados = finais.length - preservados - naoVerificados.length;
  const cobertura = renovados / lista.length, coberturaCVM = comCVM / lista.length;
  console.log('\ntickers confirmados agora: ' + renovados + '/' + lista.length + ' (' + (cobertura * 100).toFixed(1) + '%); preservados: ' + preservados);
  console.log('com informe da CVM: ' + comCVM + ' (' + (coberturaCVM * 100).toFixed(1) + '%); com carteira classificada: ' + comCarteira);
  console.log('descartados por disputa de ISIN: ' + ambiguos + '; aceitos com nome pouco parecido: ' + fracas);
  if(cobertura < COBERTURA_MINIMA) throw new Error('cobertura de tickers abaixo de ' + (COBERTURA_MINIMA * 100) + '%; confira a API da B3 e o sufixo assumido (+11)');
  const verificadosAntes = (anterior.catalogoB3 && anterior.catalogoB3.verificados) || 0;
  if(verificadosAntes && renovados < Math.floor(verificadosAntes * (1 - QUEDA_MAXIMA))){
    throw new Error('tickers confirmados cairam de ' + verificadosAntes + ' para ' + renovados + ' (queda maior que ' + (QUEDA_MAXIMA * 100) + '%); atualizacao interrompida para nao trocar catalogo bom por falha transitoria');
  }
  if(coberturaCVM < COBERTURA_CVM_MINIMA) throw new Error('cobertura do informe da CVM abaixo de ' + (COBERTURA_CVM_MINIMA * 100) + '%; confira o layout do arquivo e o padrao de ISIN');
  if(naoVerificados.length) console.log('atencao: ' + naoVerificados.length + ' sem cotacao positiva: ' + naoVerificados.map(x => x.ticker).join(', '));

  const tipos = {};
  finais.forEach(f => { const k = f.tipo || '(sem carteira)'; tipos[k] = (tipos[k] || 0) + 1; });
  console.log('\nclassificacao pela carteira declarada:');
  Object.keys(tipos).sort((a, b) => tipos[b] - tipos[a]).forEach(k => console.log('  ' + String(tipos[k]).padStart(4) + '  ' + k));

  const competencias = finais.map(f => f.informeEm).filter(Boolean).sort();
  const saida = {
    geradoEm: new Date().toISOString(),
    fontes: {
      lista: 'B3 (GetListFunds, typeFund FII)',
      informe: 'CVM - informe mensal de FII (dados abertos), arquivos geral, complemento e ativo_passivo',
      juncao: 'ISIN da cota (BR+acronimo+CTF), oficial nos dois lados; nunca por nome',
      classificacao: 'derivada da carteira declarada no informe; ' + Math.round(CONCENTRACAO * 100) + '% ou mais numa classe define o rotulo, abaixo disso Hibrido',
      ticker: 'Yahoo Finance (nao oficial), so para confirmar acronimo+11'
    },
    catalogoB3: { total: lista.length, verificados: renovados, preservados, naoVerificados: naoVerificados.length },
    cvm: {
      correspondentes: comCVM,
      comCarteira,
      ambiguos,
      juncaoFraca: fracas,
      competenciaInicio: competencias[0] || null,
      competenciaFim: competencias[competencias.length - 1] || null
    },
    fiis: finais.sort((a, b) => a.ticker.localeCompare(b.ticker))
  };
  fs.writeFileSync(TEMP, JSON.stringify(saida, null, 1) + '\n', 'utf8');
  fs.renameSync(TEMP, SAIDA);
  console.log('\ngravado fiis.json com ' + finais.length + ' fundos (' + (fs.statSync(SAIDA).size / 1024).toFixed(0) + ' KB)');
})().catch(e => { console.error('ERRO:', e.message); process.exit(1); });
