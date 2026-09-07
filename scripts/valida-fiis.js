/*
 * Valida fiis.json sem consultar a rede: identidade, coerencia da camada da
 * CVM e as invariantes que sustentam a classificacao.
 *
 * O ponto mais delicado desta base e a JUNCAO com o informe da CVM. Se ela
 * quebrar, o arquivo continua com aparencia perfeita e passa a atribuir o
 * patrimonio de um fundo a outro -- exatamente o risco que manteve patrimonio
 * fora de etfs.json. Por isso aqui se reprova qualquer registro que tenha dado
 * da CVM sem CNPJ, CNPJ repetido entre fundos, caminho de juncao nao
 * declarado, ou rotulo que nao decorra das fracoes publicadas.
 *
 * Sao tres camadas, e a ordem entre elas e o contrato: complemento conferido a
 * mao, ISIN da cota e, em ultimo recurso, nome oficial completo. A terceira
 * relaxou uma regra que este projeto declarava inviolavel, e por isso ela e
 * cercada aqui: nao pode ultrapassar a do ISIN em volume, exige similaridade
 * alta, e cada fundo carrega em juncaoVia de onde veio.
 *
 * Uso: node scripts/valida-fiis.js
 */

const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..');
const base = JSON.parse(fs.readFileSync(path.join(RAIZ, 'fiis.json'), 'utf8'));

const TIPOS = new Set(['Tijolo', 'Papel', 'Fundo de fundos', 'Híbrido']);
const CONCENTRACAO = 2 / 3;
const ROTULO = { tijolo: 'Tijolo', papel: 'Papel', cotas: 'Fundo de fundos' };

function falha(msg){
  console.error('ERRO: ' + msg);
  process.exitCode = 1;
}

const fiis = Array.isArray(base.fiis) ? base.fiis : [];
if(!Array.isArray(base.fiis)) falha('lista de FIIs ausente ou invalida');
if(typeof base.geradoEm !== 'string' || !Number.isFinite(Date.parse(base.geradoEm))) falha('data de geracao invalida');

/* Fonte declarada: sem isto a base perde a rastreabilidade que justifica
   publicar patrimonio de terceiro. */
for(const k of ['lista', 'informe', 'juncao', 'classificacao', 'ticker']){
  if(typeof base.fontes?.[k] !== 'string' || !base.fontes[k].trim()) falha('metadado de fonte ausente: ' + k);
}
/* A fonte declarada precisa descrever as TRES camadas. Antes esta regra exigia
   a frase "nunca por nome"; ela caiu em 06/09/2026, quando o nome virou ultimo
   recurso -- mas so sob as condicoes que o gerador aplica, e a declaracao tem
   de dizer isso, senao a proxima pessoa afrouxa mais um pouco sem perceber. */
for(const t of [/ISIN/i, /complemento/i, /ultimo/i])
  if(!t.test(base.fontes?.juncao || '')) falha('a juncao declarada precisa descrever as tres camadas (complemento, ISIN e nome em ultimo recurso)');

const cat = base.catalogoB3 || {};
if(cat.total !== fiis.length) falha('total declarado difere do tamanho da lista');
if(!Number.isInteger(cat.verificados) || !Number.isInteger(cat.preservados) || !Number.isInteger(cat.naoVerificados) ||
   cat.verificados + cat.preservados + cat.naoVerificados !== cat.total){
  falha('cobertura do catalogo oficial ausente ou inconsistente');
}

const cvm = base.cvm || {};
for(const k of ['correspondentes', 'comCarteira', 'ambiguos', 'juncaoFraca', 'porComplemento', 'porIsin', 'porNome']){
  if(!Number.isInteger(cvm[k]) || cvm[k] < 0) falha('contagem da CVM invalida: ' + k);
}
if(cvm.juncaoFraca > cvm.correspondentes) falha('mais juncoes fracas do que correspondencias');
/* Todo fundo com camada da CVM veio por exatamente um caminho. */
if(cvm.porComplemento + cvm.porIsin + cvm.porNome !== cvm.correspondentes) falha('caminhos de juncao nao somam o total de correspondencias');
/* A camada por nome e o unico ponto onde o projeto aceita casar por texto, e
   so em ultimo recurso. Se ela virar a principal, alguma das anteriores
   quebrou em silencio e o dado ficou mais fraco sem ninguem notar. */
if(cvm.porNome > cvm.porIsin) falha('mais fundos casados por nome do que por ISIN; a ordem das camadas inverteu');
if(cvm.correspondentes > fiis.length) falha('mais correspondencias da CVM do que fundos');
if(cvm.comCarteira > cvm.correspondentes) falha('carteira classificada sem correspondencia na CVM');

const dia = d => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) && Number.isFinite(Date.parse(d));
for(const k of ['competenciaInicio', 'competenciaFim']){
  if(cvm[k] !== null && !dia(cvm[k])) falha('competencia invalida: ' + k);
}
if(cvm.competenciaInicio && cvm.competenciaFim && cvm.competenciaInicio > cvm.competenciaFim) falha('intervalo de competencia invertido');

let comCVM = 0, comCarteira = 0, preservados = 0, naoVerificados = 0, fracas = 0;
const cnpjs = new Map();

fiis.forEach(x => {
  const id = x && x.ticker ? x.ticker : JSON.stringify(x);
  if(!x || typeof x.ticker !== 'string' || typeof x.nome !== 'string' || !x.nome.trim()) return falha('identidade incompleta: ' + id);
  if(!/^[A-Z0-9]{4}11$/.test(x.ticker)) falha('ticker fora do padrao +11: ' + id);
  if(!Number.isInteger(x.idB3) || x.idB3 <= 0) falha('id B3 invalido: ' + id);
  if(x.nomeCurto !== undefined && (typeof x.nomeCurto !== 'string' || !x.nomeCurto.trim())) falha('nome curto invalido: ' + id);
  if(x.stale !== undefined && x.stale !== true) falha('marcador de preservacao invalido: ' + id);
  if(x.tickerVerificado !== undefined && x.tickerVerificado !== false) falha('marcador de verificacao invalido: ' + id);
  if(x.stale === true && x.tickerVerificado === false) falha('registro preservado e nao verificado ao mesmo tempo: ' + id);
  if(x.stale === true) preservados++;
  if(x.tickerVerificado === false) naoVerificados++;
  if(x.cvmAmbiguo !== undefined && x.cvmAmbiguo !== true) falha('marcador de ambiguidade invalido: ' + id);

  /* Camada da CVM: ou vem inteira e ancorada num CNPJ, ou nao vem. */
  const camposCVM = ['cnpj', 'segmentoCVM', 'gestao', 'publicoAlvo', 'administrador', 'informeEm', 'similaridade', 'juncaoVia',
                     'patrimonioLiquido', 'valorPatrimonialCota', 'cotasEmitidas', 'cotistas', 'taxaAdministracao'];
  const temAlgum = camposCVM.some(c => x[c] !== undefined);
  if(x.juncaoFraca !== undefined && x.juncaoFraca !== true) falha('marcador de juncao fraca invalido: ' + id);
  if(x.juncaoFraca === true){
    fracas++;
    if(!temAlgum) falha('juncao fraca sem camada da CVM: ' + id);
  }
  if(temAlgum){
    comCVM++;
    if(typeof x.cnpj !== 'string' || !/^\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}$/.test(x.cnpj)) falha('dado da CVM sem CNPJ valido: ' + id);
    if(x.cvmAmbiguo === true) falha('fundo ambiguo nao pode carregar dado da CVM: ' + id);
    /* A similaridade e o que torna a juncao auditavel depois: sem ela nao da
       para saber se o par foi obvio ou apertado. */
    if(typeof x.similaridade !== 'number' || !(x.similaridade >= 0 && x.similaridade <= 1)) falha('similaridade ausente ou fora de 0..1: ' + id);
    /* De que evidencia veio este patrimonio -- sem isso nao da para auditar. */
    if(!['complemento', 'isin', 'isin-fraco', 'nome'].includes(x.juncaoVia)) falha('caminho de juncao invalido ou ausente: ' + id);
    if(x.juncaoVia === 'complemento'){
      if(typeof x.juncaoFonte !== 'string' || !/^https:\/\//.test(x.juncaoFonte)) falha('complemento sem fonte oficial: ' + id);
    } else if(x.juncaoFonte !== undefined) falha('fonte de complemento em juncao automatica: ' + id);
    /* Casar por nome sem folga seria o erro que a camada existe para evitar. */
    /* Jaccard, nao contencao -- ver o comentario das duas listas de ruido no
       gerador. O piso mais baixo reflete a medida mais exigente. */
    if(x.juncaoVia === 'nome' && !(x.similaridade >= 0.6)) falha('juncao por nome com similaridade insuficiente: ' + id);
    if(x.juncaoVia === 'isin-fraco' && x.juncaoFraca !== true) falha('juncao fraca sem o marcador: ' + id);
    if((x.similaridade < 0.4) !== (x.juncaoFraca === true)) falha('marcador de juncao fraca nao acompanha a similaridade: ' + id);
    if(!dia(x.informeEm)) falha('data do informe invalida: ' + id);
    for(const c of ['patrimonioLiquido', 'valorPatrimonialCota', 'cotasEmitidas', 'cotistas', 'taxaAdministracao']){
      if(x[c] !== undefined && x[c] !== null && (typeof x[c] !== 'number' || !Number.isFinite(x[c]))) falha('numero invalido em ' + c + ': ' + id);
    }
    /* Patrimonio liquido negativo NAO e erro: existe fundo com passivo a
       descoberto, e apagar isso esconderia justamente o caso que mais
       importa ver. Zero em valor da cota, sim, e erro -- o gerador troca por
       null, porque zero ali significa "nao informado" e afirmar que a cota
       vale zero seria mentir sobre o fundo. */
    if(x.valorPatrimonialCota !== undefined && x.valorPatrimonialCota !== null && x.valorPatrimonialCota === 0) falha('valor patrimonial da cota gravado como zero em vez de null: ' + id);
    if(x.cotasEmitidas !== undefined && x.cotasEmitidas !== null && !(x.cotasEmitidas > 0)) falha('quantidade de cotas nao positiva em vez de null: ' + id);
    if(typeof x.cotistas === 'number' && (!Number.isInteger(x.cotistas) || x.cotistas < 0)) falha('numero de cotistas invalido: ' + id);
    /* Um CNPJ so pode pertencer a um fundo: CNPJ repetido e a assinatura de
       uma juncao que colou o mesmo informe em dois tickers. */
    if(cnpjs.has(x.cnpj)) falha('CNPJ repetido em ' + cnpjs.get(x.cnpj) + ' e ' + id);
    else cnpjs.set(x.cnpj, x.ticker);
  } else if(x.cnpj !== undefined){
    falha('CNPJ sem nenhum dado da CVM: ' + id);
  }

  /* Classificacao: o rotulo tem de decorrer das fracoes publicadas, senao ele
     e opiniao disfarcada de derivacao. */
  const temCls = x.tipo !== undefined;
  if(temCls){
    comCarteira++;
    if(!TIPOS.has(x.tipo)) falha('tipo fora da taxonomia: ' + id + ' / ' + x.tipo);
    const fr = { tijolo: x.tijolo, papel: x.papel, cotas: x.cotas };
    for(const k of Object.keys(fr)){
      if(typeof fr[k] !== 'number' || !Number.isFinite(fr[k]) || fr[k] < 0 || fr[k] > 100) falha('fracao invalida em ' + k + ': ' + id);
    }
    const soma = fr.tijolo + fr.papel + fr.cotas;
    if(Math.abs(soma - 100) > 0.5) falha('fracoes somam ' + soma.toFixed(1) + ' em vez de 100: ' + id);
    const maior = Object.keys(fr).sort((a, b) => fr[b] - fr[a])[0];
    const esperado = fr[maior] / 100 >= CONCENTRACAO ? ROTULO[maior] : 'Híbrido';
    if(x.tipo !== esperado) falha('rotulo nao decorre das fracoes: ' + id + ' diz ' + x.tipo + ', fracoes indicam ' + esperado);
    if(!dia(x.carteiraEm)) falha('data da carteira invalida: ' + id);
    if(!temAlgum) falha('classificacao sem camada da CVM: ' + id);
  } else {
    for(const c of ['tijolo', 'papel', 'cotas', 'carteiraEm']){
      if(x[c] !== undefined) falha('fracao sem rotulo: ' + id);
    }
  }
});

if(new Set(fiis.map(x => x.ticker)).size !== fiis.length) falha('ha tickers repetidos');
if(new Set(fiis.map(x => x.idB3)).size !== fiis.length) falha('ha ids B3 repetidos');
if(preservados !== cat.preservados) falha('total de registros preservados inconsistente');
if(naoVerificados !== cat.naoVerificados) falha('total de tickers nao verificados inconsistente');
if(comCVM !== cvm.correspondentes) falha('total de correspondencias da CVM inconsistente com os registros');
if(comCarteira !== cvm.comCarteira) falha('total de carteiras classificadas inconsistente com os registros');
if(fracas !== cvm.juncaoFraca) falha('total de juncoes fracas inconsistente com os registros');
if(fiis.filter(x => x.cvmAmbiguo === true).length !== cvm.ambiguos) falha('total de fundos ambiguos inconsistente com o declarado');

/* A ordem alfabetica e contrato: o diff da base precisa ser legivel. */
const ordenado = fiis.map(x => x.ticker).join('|');
const esperada = fiis.map(x => x.ticker).sort((a, b) => a.localeCompare(b)).join('|');
if(ordenado !== esperada) falha('lista fora da ordem alfabetica de ticker');

if(!process.exitCode){
  const t = {};
  fiis.forEach(x => { const k = x.tipo || '(sem carteira)'; t[k] = (t[k] || 0) + 1; });
  const resumo = Object.keys(t).sort((a, b) => t[b] - t[a]).map(k => t[k] + ' ' + k).join(', ');
  console.log('OK: ' + fiis.length + ' FIIs; ' + comCVM + ' com informe da CVM (' + (comCVM / fiis.length * 100).toFixed(1) + '%); ' + resumo + '.');
}
