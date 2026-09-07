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
 * A JUNCAO COM A CVM E PELO CNPJ, E O CNPJ VEM DA PROPRIA B3.
 * `Search/GetDetailFund` devolve o CNPJ de cada fundo a partir do `idFNET`,
 * que e o mesmo `id` da listagem. E junção exata: nada de casar por nome, e
 * nada de depender do `Codigo_ISIN` do informe, que vem vazio, "0", ou com o
 * acronimo de outro fundo (o HIRE traz o do HYPI).
 *
 * O MESMO ENDPOINT DEVOLVE `tradingCode`, E ELE NAO SERVE PARA TICKER.
 * Foi medido: vem `null` para fundos que negociam normalmente (FLMA11 a
 * R$ 155,95, FATN11 a R$ 80,30) e, quando difere do +11, e o +11 que tem
 * cotacao no Yahoo, nao o oficial (KNUQ11 tem preco, KNUQ15 nao). O campo
 * parece registrar a classe principal, nao o que se negocia. Por isso o ticker
 * continua sendo acronimo+11 confirmado no Yahoo.
 *
 * Uso: node scripts/gera-fiis.js
 */

const fs = require('fs');
const path = require('path');
const { lista: listaZip, extrai, csv } = require('./lib/zip');

const SAIDA = path.join(__dirname, '..', 'fiis.json');
const COMPLEMENTOS = path.join(__dirname, 'fiis-complementos.json');
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
/* Duas chamadas por fundo agora: o CNPJ na B3 e o ticker no Yahoo. */
const CONCORRENCIA = 6;
const COBERTURA_MINIMA = 0.70;
const QUEDA_MAXIMA = 0.15;         /* contra a ultima geracao bem-sucedida */
const COBERTURA_CVM_MINIMA = 0.70; /* fundos da B3 com informe correspondente */
const CONCENTRACAO = 2 / 3;        /* fatia minima para rotular; abaixo disso e hibrido */

/* Rede de seguranca para quando o detalhe da B3 falhar num fundo especifico.
   Deixou de ser o caminho principal quando o CNPJ passou a vir da propria B3,
   e por isso nasce vazio. */
function leComplementos(){
  if(!fs.existsSync(COMPLEMENTOS)) return {};
  const j = JSON.parse(fs.readFileSync(COMPLEMENTOS, 'utf8')).fundos || {};
  for(const [tk, v] of Object.entries(j)){
    if(!/^[A-Z0-9]{4}11$/.test(tk)) throw new Error('complemento com ticker invalido: ' + tk);
    if(!v || !/^\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}$/.test(v.cnpj || '')) throw new Error('complemento sem CNPJ valido: ' + tk);
    /* Sem fonte nao entra: o valor deste arquivo e ser conferivel. */
    if(typeof v.fonte !== 'string' || !/^https:\/\//.test(v.fonte)) throw new Error('complemento sem fonte oficial: ' + tk);
  }
  return j;
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

/* O CNPJ oficial de cada fundo, direto da B3. Uma chamada por fundo, como a
   verificacao de ticker -- e a que torna a juncao com a CVM exata. */
const formataCnpj = c => {
  const d = String(c == null ? '' : c).replace(/\D/g, '');
  return d.length === 14 ? d.slice(0,2)+'.'+d.slice(2,5)+'.'+d.slice(5,8)+'/'+d.slice(8,12)+'-'+d.slice(12) : null;
};

async function detalheB3(item, tentativa){
  tentativa = tentativa || 1;
  const b64 = Buffer.from(JSON.stringify({ language:'pt-br', idFNET:String(item.idB3), idCEM:item.acronym, typeFund:'FII' })).toString('base64');
  try{
    const r = await fetch('https://sistemaswebb3-listados.b3.com.br/fundsListedProxy/Search/GetDetailFund/' + b64, { headers:{ 'User-Agent':UA } });
    if(r.status !== 200){
      if(tentativa < 3){ await espera(400 * tentativa); return detalheB3(item, tentativa + 1); }
      return null;
    }
    const t = await r.text();
    if(t.length < 5) return null;
    const j = JSON.parse(t);
    /* Ignoramos j.classification de proposito: e a classificacao setorial da
       B3, e foi medida contra a nossa. Repete o defeito do Segmento_Atuacao da
       CVM (o MXRF, fundo de papel, aparece como "Logistica" nas duas) e nao
       preenche nenhum dos 18 fundos sem informe, que e onde faria falta.
       Quem classifica aqui e a carteira declarada. */
    return formataCnpj(j.cnpj) ? { cnpj: formataCnpj(j.cnpj) } : null;
  } catch {
    if(tentativa < 3){ await espera(400 * tentativa); return detalheB3(item, tentativa + 1); }
    return null;
  }
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

async function atualiza(){
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
  const porCnpj = new Map(Object.values(informe.geral).map(g => [g.CNPJ_Fundo_Classe, g]));
  console.log('  ' + porCnpj.size + ' fundos no informe');

  /* ---------- CNPJ oficial, um por fundo ---------- */
  console.log('\nbuscando o CNPJ de cada fundo na B3 (uma chamada por fundo)...');
  const complementos = leComplementos();
  const resolvido = new Map();
  let semCnpj = 0, prox0 = 0;
  async function buscaCnpj(){
    while(true){
      const i = prox0++;
      if(i >= lista.length) return;
      const item = lista[i];
      const tk = item.acronym + '11';
      /* Complemento manual manda: alguem conferiu numa fonte oficial. */
      const c = complementos[tk];
      const d = c ? { cnpj: c.cnpj } : await detalheB3(item);
      if(!d){ semCnpj++; }
      else resolvido.set(tk, { cnpj: d.cnpj, via: c ? 'complemento' : 'b3', fonte: c ? c.fonte : undefined });
      if((i + 1) % 100 === 0) console.log('  ' + (i + 1) + '/' + lista.length);
      await espera(120);
    }
  }
  await Promise.all(Array.from({ length: CONCORRENCIA }, buscaCnpj));

  /* Um CNPJ nao pertence a dois fundos. Se aparecer repetido, alguma coisa na
     B3 mudou e e melhor derrubar os dois do que atribuir patrimonio errado. */
  const vistos = new Map(), duplicados = [];
  for(const [tk, r] of resolvido){
    if(vistos.has(r.cnpj)) duplicados.push(tk + ' e ' + vistos.get(r.cnpj) + ' com o mesmo CNPJ ' + r.cnpj);
    else vistos.set(r.cnpj, tk);
  }
  if(duplicados.length) throw new Error('CNPJ repetido entre fundos: ' + duplicados.join('; '));

  const comInforme = [...resolvido.values()].filter(r => porCnpj.has(r.cnpj)).length;
  console.log('  CNPJ obtido: ' + resolvido.size + '/' + lista.length + ' (' + semCnpj + ' sem); com informe na CVM: ' + comInforme);

  console.log('\nverificando ticker de negociacao (uma chamada por fundo)...');
  const finais = [], naoVerificados = [];
  const anteriores = new Map((anterior.fiis || []).map(x => [x.idB3, x]));
  let preservados = 0, comCVM = 0, comCarteira = 0;

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

    const r = resolvido.get(esperado);
    /* O CNPJ e oficial e vale por si: fica gravado mesmo quando a CVM nao tem
       informe para ele, porque identifica o fundo e permite conferir a mao. */
    if(r){
      f.cnpj = r.cnpj;
      f.juncaoVia = r.via;
      if(r.via === 'complemento') f.juncaoFonte = r.fonte;
    }
    const g = r ? informe.geral[r.cnpj] : null;
    if(g){
      comCVM++;
      const cnpj = r.cnpj;
      const c = informe.complemento[cnpj], ap = informe.ativoPassivo[cnpj];
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
  console.log('CNPJ pela B3: ' + finais.filter(f => f.juncaoVia === 'b3').length + '; por complemento manual: ' + finais.filter(f => f.juncaoVia === 'complemento').length + '; sem CNPJ: ' + finais.filter(f => !f.cnpj).length);
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
      juncao: 'CNPJ, e o CNPJ vem da propria B3 (Search/GetDetailFund, pelo idFNET que e o id da listagem). Juncao exata: nunca por nome, e sem depender do Codigo_ISIN do informe, que vem vazio ou com o acronimo de outro fundo. O caminho de cada fundo fica em juncaoVia: b3 ou complemento manual.',
      classificacao: 'derivada da carteira declarada no informe; ' + Math.round(CONCENTRACAO * 100) + '% ou mais numa classe define o rotulo, abaixo disso Hibrido',
      ticker: 'Yahoo Finance (nao oficial), so para confirmar acronimo+11'
    },
    catalogoB3: { total: lista.length, verificados: renovados, preservados, naoVerificados: naoVerificados.length },
    cvm: {
      correspondentes: comCVM,
      comCarteira,
      comCnpj: finais.filter(f => f.cnpj).length,
      porB3: finais.filter(f => f.juncaoVia === 'b3').length,
      porComplemento: finais.filter(f => f.juncaoVia === 'complemento').length,
      competenciaInicio: competencias[0] || null,
      competenciaFim: competencias[competencias.length - 1] || null
    },
    fiis: finais.sort((a, b) => a.ticker.localeCompare(b.ticker))
  };
  fs.writeFileSync(TEMP, JSON.stringify(saida, null, 1) + '\n', 'utf8');
  fs.renameSync(TEMP, SAIDA);
  console.log('\ngravado fiis.json com ' + finais.length + ' fundos (' + (fs.statSync(SAIDA).size / 1024).toFixed(0) + ' KB)');
}

/* Sem este guard o arquivo nao pode ser exigido: um require dispararia as
   1056 chamadas de rede da geracao. Os geradores de metricas ja faziam assim;
   este ficou de fora ate alguem tentar reaproveitar leComplementos daqui. */
module.exports = { leComplementos, formataCnpj };

if(require.main === module) atualiza().catch(e => { console.error('ERRO:', e.message); process.exit(1); });
