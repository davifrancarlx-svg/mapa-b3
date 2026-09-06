/*
 * Valida metricas-fiis.json sem consultar a rede.
 *
 * Alem das invariantes de serie que as outras duas bases ja tem, guarda o que
 * e proprio deste universo: os proventos. O risco especifico aqui e um
 * `prov12` que nao corresponda a lista publicada -- a pagina divide esse
 * numero pelo preco do dia para mostrar o rendimento, entao um total que nao
 * bate com as parcelas vira um percentual errado com aparencia de exato.
 *
 * Uso: node scripts/valida-metricas-fiis.js
 */

const fs = require('fs'), path = require('path');
const { leCatalogo, JANELA_PROVENTO } = require('./atualiza-metricas-fiis');

function valida(base, catalogo){
  const erro = m => { throw new Error(m); };
  const tickers = new Set(catalogo.map(f => f.ticker));
  const elegiveis = catalogo.filter(f => f.tickerVerificado !== false).length;
  const registros = Object.entries(base.metricas || {});

  if(!elegiveis || registros.length / elegiveis < .85) erro('cobertura abaixo de 85% dos fundos com ticker confirmado');
  if(!Number.isFinite(Date.parse(base.atualizadoEm))) erro('data de atualizacao invalida');
  if(base.totalFIIs !== catalogo.length) erro('total declarado difere do catalogo');
  if(base.elegiveis !== elegiveis) erro('numero de elegiveis difere do catalogo');
  /* O DY nao pode passar a ser publicado aqui sem uma decisao explicita: se
     virar campo, o cliente ganha uma segunda fonte de verdade para a mesma
     conta e as duas divergem na primeira mudanca de preco. */
  if(/dividend yield/i.test(base.metodologia || '') === false) erro('metodologia deve declarar onde o dividend yield e calculado');
  /* A serie desta base e preco, nao ajustado, e isso precisa continuar
     declarado: sem a frase, alguem compara vp252 com o r252 das outras bases
     como se fossem a mesma medida. */
  if(!/PRECO DE FECHAMENTO/.test(base.metodologia || '')) erro('metodologia deve declarar que a serie e o preco de fechamento');

  const numero = (v, min = -Infinity, max = Infinity) => v === null || (Number.isFinite(v) && v >= min && v <= max);
  const data = d => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) && Number.isFinite(Date.parse(d)) && new Date(d).toISOString().slice(0, 10) === d;
  const dias = (a, b) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000);

  for(const [k, m] of registros){
    if(!tickers.has(k)) erro(k + ' fora do catalogo de FII');
    if(m.ticker !== k) erro(k + ' ticker interno diferente da chave');
    if(!data(m.dt) || !Number.isInteger(m.n) || m.n < 22) erro(k + ' historico invalido');
    /* vp*, nao r*: variacao de preco nao e retorno total, e o nome tem de
       impedir a comparacao errada com as outras bases. */
    for(const n of [21, 63, 252]){
      if(m['r' + n] !== undefined) erro(k + ' publica r' + n + '; nesta base o campo e vp' + n + ', porque a serie e preco e nao retorno total');
      if(!numero(m['vp' + n], -100) || (m.n <= n && m['vp' + n] !== null)) erro(k + ' variacao de preco ' + n + ' invalida');
    }
    for(const n of [20, 60]){
      if(!numero(m['g' + n], 0) || !numero(m['d' + n], 0, n) || (m['d' + n] !== null && !Number.isInteger(m['d' + n]))) erro(k + ' liquidez invalida');
      if(m.n < n && (m['g' + n] !== null || m['d' + n] !== null)) erro(k + ' janela ' + n + ' incompleta virou numero');
    }
    if(!numero(m.dd252, -100, 0) || !numero(m.dm252, 0) || !numero(m.v21, 0)) erro(k + ' risco invalido');

    /* Serie comprimida, mesmo contrato das outras bases. */
    if(!Array.isArray(m.spP) || m.spP.length < 2 || m.spP.some(v => !Number.isFinite(v) || v <= 0)) erro(k + ' serie invalida');
    if(m.sp !== undefined) erro(k + ' sp e derivado de spP, nao deve ser gravado');
    if(m.spD !== undefined && !m.stale) erro(k + ' spD saiu da base; so registro preservado pode carregar o formato antigo');
    if(m.spD === undefined){
      if(!Array.isArray(m.spO) || m.spO.length !== m.spP.length || m.spO.some(o => !Number.isInteger(o) || o < 0) || m.spO[0] !== 0 || m.spO.some((o, i) => i && o <= m.spO[i - 1])) erro(k + ' offsets da serie invalidos');
      if(data(m.spInicio) && new Date(Date.parse(m.spInicio + 'T00:00:00Z') + m.spO.at(-1) * 86400000).toISOString().slice(0, 10) !== m.spFim) erro(k + ' ultimo offset nao reconstroi spFim');
    }

    /* ---------- proventos ---------- */
    if(!Number.isInteger(m.provN) || m.provN < 0) erro(k + ' contagem de proventos invalida');
    if(!Array.isArray(m.provO) || !Array.isArray(m.provV)) erro(k + ' listas de provento ausentes');
    if(m.provO.length !== m.provN || m.provV.length !== m.provN) erro(k + ' listas de provento nao batem com provN');
    if(m.provV.some(v => !Number.isFinite(v) || v <= 0)) erro(k + ' provento nao positivo na lista');
    if(m.provO.some(o => !Number.isInteger(o) || o < 0 || o >= JANELA_PROVENTO)) erro(k + ' offset de provento fora da janela de ' + JANELA_PROVENTO + ' dias');
    if(m.provO.some((o, i) => i && o < m.provO[i - 1])) erro(k + ' proventos fora de ordem');

    if(m.provN === 0){
      if(m.prov12 !== 0 || m.provUlt !== null || m.provUltEm !== null || m.provInicio !== null) erro(k + ' sem provento mas com resumo preenchido');
    } else {
      if(!data(m.provInicio)) erro(k + ' data inicial de provento invalida');
      if(m.provO[0] !== 0) erro(k + ' primeiro offset de provento deve ser zero');
      if(!data(m.provUltEm)) erro(k + ' data do ultimo provento invalida');
      /* O total tem de ser a soma das parcelas publicadas: e ele que a pagina
         divide pelo preco. */
      const soma = +m.provV.reduce((s, v) => s + v, 0).toFixed(4);
      if(Math.abs(soma - m.prov12) > 0.0002) erro(k + ' prov12 (' + m.prov12 + ') nao e a soma das parcelas (' + soma + ')');
      if(m.provUlt !== m.provV.at(-1)) erro(k + ' ultimo provento diferente da ultima parcela');
      if(new Date(Date.parse(m.provInicio + 'T00:00:00Z') + m.provO.at(-1) * 86400000).toISOString().slice(0, 10) !== m.provUltEm) erro(k + ' ultimo offset nao reconstroi a data do ultimo provento');
      /* A janela e ancorada na ultima observacao da serie, nao em hoje. */
      const d = dias(m.provUltEm, m.dt);
      if(!(d >= 0 && d < JANELA_PROVENTO)) erro(k + ' ultimo provento fora da janela ancorada em dt');
    }
    if(m.stale !== undefined && m.stale !== true) erro(k + ' marcador de preservacao invalido');
  }

  const comProvento = registros.filter(([, m]) => m.provN > 0).length;
  if(base.comProvento !== comProvento) erro('comProvento declarado difere dos registros');
  if(base.comProventoMensal !== registros.filter(([, m]) => m.provN >= 10).length) erro('comProventoMensal declarado difere dos registros');
  if(base.preservados !== registros.filter(([, m]) => m.stale).length) erro('preservados declarado difere dos registros');
  return { registros: registros.length, comProvento };
}

module.exports = { valida };

if(require.main === module){
  const base = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'metricas-fiis.json'), 'utf8'));
  const r = valida(base, leCatalogo());
  console.log('OK: ' + r.registros + ' FIIs com histórico, ' + r.comProvento + ' com provento nos últimos 12 meses');
}
