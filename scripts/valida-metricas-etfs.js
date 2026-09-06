/*
 * Valida metricas-etfs.json sem consultar a rede.
 *
 * Esta base usa a serie AJUSTADA e e comparavel com as de BDR e empresas --
 * ao contrario da de FII, que usa preco. O validador guarda os dois lados
 * disso: exige que a metodologia declare a escolha e reprova a chegada dos
 * campos `vp*`, que sao a marca da serie de preco. Sem isso as duas convencoes
 * se misturam com o tempo e ninguem sabe mais o que cada `r252` significa.
 *
 * Uso: node scripts/valida-metricas-etfs.js
 */

const fs = require('fs'), path = require('path');
const { leCatalogo } = require('./atualiza-metricas-etfs');

function valida(base, catalogo){
  const erro = m => { throw new Error(m); };
  const tickers = new Set(catalogo.map(x => x.ticker));
  const elegiveis = catalogo.filter(x => x.tickerVerificado !== false).length;
  const registros = Object.entries(base.metricas || {});

  if(!elegiveis || registros.length / elegiveis < .85) erro('cobertura abaixo de 85% dos ETFs com ticker confirmado');
  if(!Number.isFinite(Date.parse(base.atualizadoEm))) erro('data de atualizacao invalida');
  if(base.totalETFs !== catalogo.length) erro('total declarado difere do catalogo');
  if(base.elegiveis !== elegiveis) erro('numero de elegiveis difere do catalogo');
  if(!/ajustada/i.test(base.metodologia || '')) erro('metodologia deve declarar que a serie e a ajustada');

  const numero = (v, min = -Infinity, max = Infinity) => v === null || (Number.isFinite(v) && v >= min && v <= max);
  const data = d => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) && Number.isFinite(Date.parse(d)) && new Date(d).toISOString().slice(0, 10) === d;

  for(const [k, m] of registros){
    if(!tickers.has(k)) erro(k + ' fora do catalogo de ETF');
    if(m.ticker !== k) erro(k + ' ticker interno diferente da chave');
    if(!data(m.dt) || !Number.isInteger(m.n) || m.n < 22) erro(k + ' historico invalido');

    /* Convencao de nome: aqui e retorno total sobre serie ajustada. Um campo
       vp* significaria que alguem trouxe a convencao do FII para ca. */
    for(const n of [21, 63, 252]){
      if(m['vp' + n] !== undefined) erro(k + ' publica vp' + n + '; nesta base a serie e ajustada e o campo e r' + n);
      if(!numero(m['r' + n], -100) || (m.n <= n && m['r' + n] !== null)) erro(k + ' retorno ' + n + ' invalido');
    }
    for(const n of [20, 60]){
      if(!numero(m['g' + n], 0) || !numero(m['d' + n], 0, n) || (m['d' + n] !== null && !Number.isInteger(m['d' + n]))) erro(k + ' liquidez invalida');
      if(m.n < n && (m['g' + n] !== null || m['d' + n] !== null)) erro(k + ' janela ' + n + ' incompleta virou numero');
    }
    if(!numero(m.dd252, -100, 0) || !numero(m.dm252, 0) || !numero(m.v21, 0)) erro(k + ' risco invalido');

    /* Serie comprimida, mesmo contrato das demais bases. */
    if(!Array.isArray(m.spP) || m.spP.length < 2 || m.spP.some(v => !Number.isFinite(v) || v <= 0)) erro(k + ' serie invalida');
    if(m.sp !== undefined) erro(k + ' sp e derivado de spP, nao deve ser gravado');
    if(m.spD !== undefined && !m.stale) erro(k + ' spD saiu da base; so registro preservado pode carregar o formato antigo');
    if(m.spD === undefined){
      if(!Array.isArray(m.spO) || m.spO.length !== m.spP.length || m.spO.some(o => !Number.isInteger(o) || o < 0) || m.spO[0] !== 0 || m.spO.some((o, i) => i && o <= m.spO[i - 1])) erro(k + ' offsets da serie invalidos');
      if(data(m.spInicio) && new Date(Date.parse(m.spInicio + 'T00:00:00Z') + m.spO.at(-1) * 86400000).toISOString().slice(0, 10) !== m.spFim) erro(k + ' ultimo offset nao reconstroi spFim');
    }

    /* ETF brasileiro nao distribui: campo de provento aqui e sinal de que a
       camada do FII vazou para esta base. */
    for(const c of ['prov12', 'provN', 'provV', 'provO', 'provUlt', 'provUltEm', 'provInicio']){
      if(m[c] !== undefined) erro(k + ' publica ' + c + '; ETF nao tem camada de provento nesta base');
    }
    if(m.stale !== undefined && m.stale !== true) erro(k + ' marcador de preservacao invalido');
  }

  if(base.preservados !== registros.filter(([, m]) => m.stale).length) erro('preservados declarado difere dos registros');
  return { registros: registros.length };
}

module.exports = { valida };

if(require.main === module){
  const base = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'metricas-etfs.json'), 'utf8'));
  const r = valida(base, leCatalogo());
  console.log('OK: ' + r.registros + ' ETFs com histórico');
}
