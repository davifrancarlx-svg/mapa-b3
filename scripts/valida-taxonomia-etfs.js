/*
 * Confere o contrato, os vocabularios e a integridade da camada editorial.
 */

const fs = require('fs');
const path = require('path');

const ARQUIVO = path.join(__dirname, '..', 'etfs-detalhes.schema.json');
const schema = JSON.parse(fs.readFileSync(ARQUIVO, 'utf8'));
const DETALHES = path.join(__dirname, '..', 'etfs-detalhes.json');
const CATALOGO = path.join(__dirname, '..', 'etfs.json');

function falha(msg){
  console.error('ERRO: ' + msg);
  process.exitCode = 1;
}

const vocabularios = [
  'classeAtivo', 'foco', 'escopoGeografico', 'setor', 'tema', 'fator',
  'estrategia', 'formaExposicao', 'politicaCambial', 'replicacao',
  'tipoPosicao', 'nivelPosicao', 'dimensaoExposicao', 'origemFonte', 'usoFonte'
];
const blocos = ['etf', 'indice', 'classificacao', 'geografia', 'carteira', 'posicao', 'exposicao', 'fontes', 'fonte'];

if(schema.$schema !== 'https://json-schema.org/draft/2020-12/schema') falha('versao JSON Schema inesperada');
if(schema.properties?.versaoSchema?.const !== 2 || schema.properties?.taxonomiaVersao?.const !== 2) falha('versoes do contrato ausentes ou invalidas');
if(!schema.$defs || typeof schema.$defs !== 'object' || Array.isArray(schema.$defs)) falha('$defs ausente ou invalido');

for(const nome of blocos){
  const x = schema.$defs?.[nome];
  if(!x || typeof x !== 'object' || Array.isArray(x)) falha('bloco ausente: ' + nome);
}

for(const nome of vocabularios){
  const x = schema.$defs?.[nome], itens = x?.oneOf;
  if(!Array.isArray(itens) || !itens.length){ falha('vocabulario vazio ou ausente: ' + nome); continue; }
  const ids = [], titulos = [];
  for(const item of itens){
    if(!item || typeof item.const !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(item.const)) falha('identificador invalido em ' + nome + ': ' + JSON.stringify(item));
    if(typeof item?.title !== 'string' || !item.title.trim()) falha('rotulo ausente em ' + nome + ': ' + JSON.stringify(item));
    ids.push(item.const); titulos.push(item.title);
  }
  if(new Set(ids).size !== ids.length) falha('identificador repetido em ' + nome);
  if(new Set(titulos).size !== titulos.length) falha('rotulo repetido em ' + nome);
}

function percorre(valor, caminho = '#'){
  if(Array.isArray(valor)){ valor.forEach((x,i) => percorre(x, caminho + '/' + i)); return; }
  if(!valor || typeof valor !== 'object') return;
  if(typeof valor.$ref === 'string'){
    const prefixo = '#/$defs/';
    if(!valor.$ref.startsWith(prefixo)) falha('referencia externa nao permitida em ' + caminho + ': ' + valor.$ref);
    else if(!schema.$defs?.[valor.$ref.slice(prefixo.length)]) falha('referencia inexistente em ' + caminho + ': ' + valor.$ref);
  }
  Object.entries(valor).forEach(([k,v]) => percorre(v, caminho + '/' + k));
}
percorre(schema);

function resolve(ref){ return schema.$defs[ref.slice('#/$defs/'.length)]; }
function validaValor(valor, regra, caminho){
  if(regra.$ref) return validaValor(valor, resolve(regra.$ref), caminho);
  if(Object.hasOwn(regra, 'const') && valor !== regra.const) falha(caminho + ' deve ser ' + JSON.stringify(regra.const));
  if(Array.isArray(regra.oneOf)){
    const permitidos = regra.oneOf.map(x => x.const);
    if(!permitidos.includes(valor)) falha(caminho + ' fora do vocabulario: ' + JSON.stringify(valor));
  }
  if(regra.type === 'object'){
    if(!valor || typeof valor !== 'object' || Array.isArray(valor)){ falha(caminho + ' deve ser objeto'); return; }
    for(const campo of regra.required || []) if(!Object.hasOwn(valor, campo)) falha(caminho + ' sem campo obrigatorio: ' + campo);
    if(regra.additionalProperties === false) for(const campo of Object.keys(valor)) if(!Object.hasOwn(regra.properties || {}, campo)) falha(caminho + ' com campo inesperado: ' + campo);
    for(const [campo, sub] of Object.entries(regra.properties || {})) if(Object.hasOwn(valor, campo)) validaValor(valor[campo], sub, caminho + '.' + campo);
  }
  if(regra.type === 'array'){
    if(!Array.isArray(valor)){ falha(caminho + ' deve ser lista'); return; }
    if(regra.minItems != null && valor.length < regra.minItems) falha(caminho + ' tem poucos itens');
    if(regra.maxItems != null && valor.length > regra.maxItems) falha(caminho + ' tem itens demais');
    if(regra.uniqueItems && new Set(valor.map(x => JSON.stringify(x))).size !== valor.length) falha(caminho + ' tem itens repetidos');
    if(regra.items) valor.forEach((x,i) => validaValor(x, regra.items, caminho + '[' + i + ']'));
  }
  if(regra.type === 'string'){
    if(typeof valor !== 'string'){ falha(caminho + ' deve ser texto'); return; }
    if(regra.minLength != null && valor.length < regra.minLength) falha(caminho + ' e curto demais');
    if(regra.maxLength != null && valor.length > regra.maxLength) falha(caminho + ' e longo demais');
    if(regra.pattern && !(new RegExp(regra.pattern)).test(valor)) falha(caminho + ' tem formato invalido');
    if(regra.format === 'date' && !/^\d{4}-\d{2}-\d{2}$/.test(valor)) falha(caminho + ' nao e data ISO');
    if(regra.format === 'date-time' && !Number.isFinite(Date.parse(valor))) falha(caminho + ' nao e data e hora ISO');
    if(regra.format === 'uri'){ try { if(new URL(valor).protocol !== 'https:') throw new Error(); } catch { falha(caminho + ' nao e URL HTTPS valida'); } }
  }
  if(regra.type === 'integer' && !Number.isInteger(valor)) falha(caminho + ' deve ser inteiro');
  if(regra.type === 'number' && (typeof valor !== 'number' || !Number.isFinite(valor))) falha(caminho + ' deve ser numero');
  if(typeof valor === 'number'){
    if(regra.minimum != null && valor < regra.minimum) falha(caminho + ' abaixo do minimo');
    if(regra.exclusiveMinimum != null && valor <= regra.exclusiveMinimum) falha(caminho + ' abaixo do minimo exclusivo');
    if(regra.maximum != null && valor > regra.maximum) falha(caminho + ' acima do maximo');
  }
}

const obrigatoriosETF = new Set(schema.$defs?.etf?.required || []);
for(const campo of ['ticker','idB3','cnpj','gestor','resumo','indice','classificacao','carteira','fontes','revisadoEm']){
  if(!obrigatoriosETF.has(campo)) falha('campo obrigatorio ausente no ETF: ' + campo);
}
const usosObrigatorios = ['identidade','indice','classificacao','carteira'];
const usosNoSchema = (schema.$defs?.fontes?.allOf || []).map(x => x?.contains?.properties?.usos?.contains?.const).filter(Boolean);
for(const uso of usosObrigatorios){
  if(!usosNoSchema.includes(uso)) falha('evidencia obrigatoria ausente: ' + uso);
}

if(!fs.existsSync(DETALHES)){
  falha('etfs-detalhes.json ausente');
} else {
  const base = JSON.parse(fs.readFileSync(DETALHES, 'utf8'));
  const catalogo = JSON.parse(fs.readFileSync(CATALOGO, 'utf8'));
  validaValor(base, schema, 'base');
  const camposRaiz = Object.keys(schema.properties || {});
  for(const campo of schema.required || []){
    if(!Object.hasOwn(base, campo)) falha('campo obrigatorio ausente na base: ' + campo);
  }
  for(const campo of Object.keys(base)){
    if(!camposRaiz.includes(campo)) falha('campo inesperado na base: ' + campo);
  }
  if(base.versaoSchema !== schema.properties?.versaoSchema?.const) falha('versaoSchema diverge do contrato');
  if(base.taxonomiaVersao !== schema.properties?.taxonomiaVersao?.const) falha('taxonomiaVersao diverge do contrato');
  if(typeof base.geradoEm !== 'string' || !Number.isFinite(Date.parse(base.geradoEm))) falha('data de geracao da base invalida');
  if(!Array.isArray(base.etfs)) falha('lista editorial de ETFs ausente ou invalida');
  else {
    if(base.totalDetalhados !== base.etfs.length) falha('totalDetalhados diverge do tamanho da lista');
    if(new Set(base.etfs.map(x => x?.ticker)).size !== base.etfs.length) falha('ticker repetido no detalhamento');
    if(new Set(base.etfs.map(x => x?.idB3)).size !== base.etfs.length) falha('idB3 repetido no detalhamento');
  }
  if(base.totalCatalogo !== catalogo.total || catalogo.total !== catalogo.etfs?.length) falha('totalCatalogo diverge de etfs.json');
  const porTicker = new Map((catalogo.etfs || []).map(x => [x.ticker, x]));
  if(new Set((base.etfs || []).map(x => x.cnpj)).size !== (base.etfs || []).length) falha('CNPJ repetido no detalhamento');
  for(const x of base.etfs || []){
    const oficial = porTicker.get(x?.ticker);
    if(!oficial || oficial.idB3 !== x.idB3) falha('ligacao ticker + idB3 invalida: ' + (x?.ticker || 'sem ticker'));
    const usos = new Set((x.fontes || []).flatMap(f => f.usos || []));
    for(const uso of usosObrigatorios) if(!usos.has(uso)) falha(x.ticker + ' sem fonte para ' + uso);
    const posicoes = x.carteira?.principaisPosicoes || [];
    if(x.carteira?.quantidadePosicoes != null && x.carteira.quantidadePosicoes < posicoes.length) falha(x.ticker + ' tem quantidadePosicoes menor que a lista publicada');
    const soma = posicoes.reduce((total,p) => total + p.participacaoPct, 0);
    if(Math.abs(soma - x.carteira?.coberturaDivulgadaPct) > .02) falha(x.ticker + ' tem coberturaDivulgadaPct diferente da soma das posicoes');
    const geo = x.classificacao?.geografia;
    if(geo?.escopo === 'brasil' && !geo.paisesPrincipais.includes('BR')) falha(x.ticker + ' sem BR na geografia brasileira');
    if(geo?.escopo === 'estados-unidos' && !geo.paisesPrincipais.includes('US')) falha(x.ticker + ' sem US na geografia americana');
    if(geo?.escopo === 'nao-se-aplica' && geo.paisesPrincipais.length) falha(x.ticker + ' tem pais em geografia nao aplicavel');
  }
}

if(!process.exitCode){
  console.log('OK: esquema com ' + vocabularios.length + ' vocabularios; base editorial ligada ao catalogo');
}
