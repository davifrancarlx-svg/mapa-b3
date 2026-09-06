/*
 * Calcula metricas historicas dos ETFs: retorno, liquidez, volatilidade e a
 * serie do grafico. A chave e o ticker, como em metricas.json.
 *
 * Usa `calcula()` de scripts/lib/serie.js SOBRE A SERIE AJUSTADA, como as
 * bases de BDR e de empresas -- e ao contrario da de FII. A diferenca foi
 * medida antes de decidir, e o ETF brasileiro simplesmente nao tem o problema
 * que obrigou o FII a mudar:
 *
 *   BOVA11  preco +31,6%   ajustado +31,6%   0 proventos em 2 anos
 *   IVVB11  preco +13,3%   ajustado +13,3%   0 proventos
 *   HASH11  preco -38,2%   ajustado -38,2%   0 proventos
 *
 * ETF brasileiro reinveste em vez de distribuir, entao nao ha fator retroativo
 * se acumulando e as duas series coincidem. Por isso aqui os campos se chamam
 * `r21/r63/r252`, como nas outras duas bases, e SAO comparaveis com elas.
 * Se algum dia surgir ETF que distribua com frequencia, remeça essa conta
 * antes de confiar no ajustado.
 *
 * Nao ha camada de provento aqui, pelo mesmo motivo: nao existe o que somar.
 *
 * Uso: node scripts/atualiza-metricas-etfs.js
 */

const fs = require('fs');
const path = require('path');

const { espera, historico, calcula } = require('./lib/serie');

const RAIZ = path.join(__dirname, '..');
const CATALOGO = path.join(RAIZ, 'etfs.json');
const SAIDA = path.join(RAIZ, 'metricas-etfs.json');
const CONCORRENCIA = 6;

/* Medida contra os que tem ticker confirmado, nao contra o catalogo inteiro:
   um fundo recem-listado sem cotacao ainda nao pode ter historico, e cobra-lo
   derrubaria a geracao sem que nada estivesse errado. */
const COBERTURA_MINIMA = 0.85;

function leCatalogo(){
  if(!fs.existsSync(CATALOGO)) throw new Error('etfs.json ausente; rode node scripts/gera-etfs.js antes');
  const j = JSON.parse(fs.readFileSync(CATALOGO, 'utf8'));
  const lista = Array.isArray(j.etfs) ? j.etfs : [];
  if(!lista.length) throw new Error('catalogo de ETF vazio');
  return lista;
}

async function metricasETF(ticker, busca = historico){
  const m = calcula(await busca(ticker), { ticker });
  if(!m) throw new Error('historico insuficiente');
  return m;
}

function confereCobertura(novos, elegiveis){
  if(!elegiveis || novos / elegiveis < COBERTURA_MINIMA){
    throw new Error('cobertura nova abaixo de ' + (COBERTURA_MINIMA * 100) + '% (' + novos + '/' + elegiveis + ')');
  }
}

async function atualiza(){
  const catalogo = leCatalogo();
  const elegiveis = catalogo.filter(x => x.tickerVerificado !== false);
  const anterior = fs.existsSync(SAIDA) ? JSON.parse(fs.readFileSync(SAIDA, 'utf8')).metricas || {} : {};
  const metricas = {}, falhas = [];
  let prox = 0, novos = 0;

  async function trabalha(){
    while(true){
      const i = prox++;
      if(i >= elegiveis.length) return;
      const x = elegiveis[i];
      try{ metricas[x.ticker] = await metricasETF(x.ticker); novos++; }
      catch(err){
        /* Preserva o ultimo retrato valido e marca, como as demais bases. */
        if(anterior[x.ticker]){
          metricas[x.ticker] = { ...anterior[x.ticker], stale: true };
          if(metricas[x.ticker].n < 60){ metricas[x.ticker].g60 = null; metricas[x.ticker].d60 = null; }
        }
        falhas.push(x.ticker + ': ' + err.message);
      }
      if((i + 1) % 40 === 0) console.log('  ' + (i + 1) + '/' + elegiveis.length);
      await espera(80);
    }
  }

  console.log('Consultando ' + elegiveis.length + ' ETFs com ticker confirmado (de ' + catalogo.length + ' no catálogo)...');
  await Promise.all(Array.from({ length: CONCORRENCIA }, trabalha));
  confereCobertura(novos, elegiveis.length);

  const out = {
    versao: 1,
    atualizadoEm: new Date().toISOString(),
    fonte: 'Yahoo Finance (nao oficial), serie diaria ajustada',
    totalETFs: catalogo.length,
    elegiveis: elegiveis.length,
    metodologia: 'Mesmos campos e mesma serie ajustada das bases de BDR e empresas (scripts/lib/serie.js), e comparaveis com elas: ETF brasileiro nao distribui com frequencia, entao serie ajustada e serie de preco coincidem (BOVA11, IVVB11 e HASH11 conferidos, zero proventos em dois anos).',
    comHistoricoNovo: novos,
    preservados: Object.values(metricas).filter(m => m.stale).length,
    falhas,
    semHistorico: elegiveis.filter(x => !metricas[x.ticker]).map(x => x.ticker),
    metricas
  };
  require('./valida-metricas-etfs').valida(out, catalogo);
  fs.writeFileSync(SAIDA, JSON.stringify(out, null, 1) + '\n');
  console.log('gravado: ' + Object.keys(metricas).length + '/' + elegiveis.length);
  if(falhas.length) console.log('falhas: ' + falhas.length);
}

module.exports = { leCatalogo, metricasETF, confereCobertura };
if(require.main === module) atualiza().catch(e => { console.error('ERRO:', e.message); process.exit(1); });
