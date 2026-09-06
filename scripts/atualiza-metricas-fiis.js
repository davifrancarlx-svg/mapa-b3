/*
 * Calcula metricas historicas dos fundos imobiliarios: retorno, liquidez,
 * volatilidade, serie do grafico e -- o que distingue este universo --
 * os PROVENTOS mensais.
 *
 * A chave e o ticker, como em metricas.json (BDRs), e o calculo vem do mesmo
 * scripts/lib/serie.js -- unificar isso ja custou uma divergencia silenciosa
 * neste projeto e nao se repete aqui.
 *
 * MAS a serie de entrada e diferente: aqui e o PRECO de fechamento, nao o
 * ajustado, e por isso os retornos se chamam vp21/vp63/vp252. O motivo, com
 * as medicoes, esta no comentario de metricasFII() logo abaixo.
 *
 * O QUE ESTE GERADOR NAO FAZ: nao publica dividend yield. Ele grava a soma
 * distribuida em 12 meses (`prov12`) e a pagina divide pelo preco do dia,
 * como ja faz com o P/VP. Gravar o DY aqui congelaria o numerador e o
 * denominador em datas diferentes e criaria uma segunda fonte de verdade
 * para a mesma conta.
 *
 * Uso: node scripts/atualiza-metricas-fiis.js
 */

const fs = require('fs');
const path = require('path');

const { espera, arred, historicoProventos, calcula } = require('./lib/serie');

const RAIZ = path.join(__dirname, '..');
const CATALOGO = path.join(RAIZ, 'fiis.json');
const SAIDA = path.join(RAIZ, 'metricas-fiis.json');
const CONCORRENCIA = 6;

/* Cobertura medida contra os fundos que TEM cotacao, nao contra o catalogo
   inteiro: 112 dos 528 sao restritos a investidor qualificado e nunca
   negociaram, entao cobrar historico deles derrubaria a geracao sempre.
   Ver FIIS.md. */
const COBERTURA_MINIMA = 0.85;
const JANELA_PROVENTO = 365;

const diasEntre = (a, b) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000);

function leCatalogo(){
  if(!fs.existsSync(CATALOGO)) throw new Error('fiis.json ausente; rode node scripts/gera-fiis.js antes');
  const j = JSON.parse(fs.readFileSync(CATALOGO, 'utf8'));
  const lista = Array.isArray(j.fiis) ? j.fiis : [];
  if(!lista.length) throw new Error('catalogo de FII vazio');
  return lista;
}

/* Recorte de 12 meses a partir da ULTIMA observacao da serie, nao de hoje:
   um fundo cuja serie parou ha tres meses teria a janela deslizando para
   fora dos proprios dados e passaria a declarar menos proventos do que
   distribuiu. */
function resumoProventos(proventos, ate){
  const janela = proventos.filter(p => {
    const d = diasEntre(p.d, ate);
    return d >= 0 && d < JANELA_PROVENTO;
  });
  if(!janela.length) return { prov12: 0, provN: 0, provUlt: null, provUltEm: null, provInicio: null, provO: [], provV: [] };
  const inicio = janela[0].d;
  /* O total soma as parcelas JA ARREDONDADAS, nao os valores brutos. E a
     pagina que divide prov12 pelo preco para mostrar o rendimento, e ela
     tambem lista as parcelas: um total que nao fecha com a lista publicada
     seria um percentual errado com aparencia de exato. */
  const valores = janela.map(p => arred(p.v, 4));
  return {
    prov12: arred(valores.reduce((s, v) => s + v, 0), 4),
    provN: janela.length,
    provUlt: valores.at(-1),
    provUltEm: janela.at(-1).d,
    /* Mesma compressao da serie do grafico: offset em dias corridos sobre
       provInicio, em UTC dos dois lados. */
    provInicio: inicio,
    provO: janela.map(p => diasEntre(inicio, p.d)),
    provV: valores
  };
}

/*
 * A SERIE DESTA BASE E O PRECO DE FECHAMENTO, NAO O AJUSTADO -- ao contrario
 * das bases de BDR e de empresas. Foi medido, fundo a fundo:
 *
 *   XPML11   preco +0,3%   ajustado +713,7%   (103,67 -> 104,03 em 12 meses)
 *   HYPI11   preco  0,0%   ajustado +520,0%   (181,50 -> 181,50)
 *   PNPR11   preco -8,2%   ajustado +548,4%
 *
 * O ajustado do Yahoo desconta cada distribuicao do historico. Em acao isso
 * funciona; em FII, que distribui todo mes e ainda amortiza cota (devolucao
 * de capital) e faz emissao com frequencia, o fator retroativo se acumula e a
 * serie deixa de descrever qualquer coisa. Nos fundos normais o ajustado esta
 * certo -- HGLG11 da -4,2% de preco e +4,4% ajustado, e a diferenca e
 * exatamente o rendimento de 9% --, mas nao da para publicar uma coluna que
 * so vale para parte da base.
 *
 * Como o preco separa limpo as duas pernas do resultado de um FII (variacao
 * de cota e distribuicao), e a base ja publica a distribuicao ao lado, esta
 * troca informa mais do que o retorno total embolado.
 *
 * Por isso os campos de retorno mudam de nome: `vp21/vp63/vp252` em vez de
 * `r21/r63/r252`. Um `r252` aqui seria lido como o `r252` das outras bases, e
 * as duas coisas nao sao comparaveis.
 */
async function metricasFII(ticker, busca = historicoProventos){
  const { rows, proventos } = await busca(ticker);
  const m = calcula(rows.map(x => ({ ...x, a: x.p })), { ticker });
  if(!m) throw new Error('historico insuficiente');
  const { r21, r63, r252, ...resto } = m;
  return { ...resto, vp21: r21, vp63: r63, vp252: r252, ...resumoProventos(proventos, m.dt) };
}

function confereCobertura(novos, elegiveis){
  if(!elegiveis || novos / elegiveis < COBERTURA_MINIMA){
    throw new Error('cobertura nova abaixo de ' + (COBERTURA_MINIMA * 100) + '% (' + novos + '/' + elegiveis + ')');
  }
}

async function atualiza(){
  const catalogo = leCatalogo();
  /* Quem o catalogo ja sabe que nao negocia nao entra na fila: sao 112
     requisicoes certas de falhar, e elas contaminariam a cobertura. */
  const elegiveis = catalogo.filter(f => f.tickerVerificado !== false);
  const anterior = fs.existsSync(SAIDA) ? JSON.parse(fs.readFileSync(SAIDA, 'utf8')).metricas || {} : {};
  const metricas = {}, falhas = [];
  let prox = 0, novos = 0;

  async function trabalha(){
    while(true){
      const i = prox++;
      if(i >= elegiveis.length) return;
      const f = elegiveis[i];
      try{ metricas[f.ticker] = await metricasFII(f.ticker); novos++; }
      catch(err){
        /* Preserva o ultimo retrato valido em vez de apagar, como as outras
           bases -- e marca, para o cliente nao apresentar dado velho como novo. */
        if(anterior[f.ticker]){
          metricas[f.ticker] = { ...anterior[f.ticker], stale: true };
          if(metricas[f.ticker].n < 60){ metricas[f.ticker].g60 = null; metricas[f.ticker].d60 = null; }
        }
        falhas.push(f.ticker + ': ' + err.message);
      }
      if((i + 1) % 40 === 0) console.log('  ' + (i + 1) + '/' + elegiveis.length);
      await espera(80);
    }
  }

  console.log('Consultando ' + elegiveis.length + ' fundos com ticker confirmado (de ' + catalogo.length + ' no catálogo)...');
  await Promise.all(Array.from({ length: CONCORRENCIA }, trabalha));
  confereCobertura(novos, elegiveis.length);

  const comProvento = Object.values(metricas).filter(m => m.provN > 0).length;
  const mensais = Object.values(metricas).filter(m => m.provN >= 10).length;
  const out = {
    versao: 1,
    atualizadoEm: new Date().toISOString(),
    fonte: 'Yahoo Finance (nao oficial), serie diaria de preco de fechamento e eventos de provento',
    totalFIIs: catalogo.length,
    elegiveis: elegiveis.length,
    metodologia: 'Serie calculada sobre o PRECO DE FECHAMENTO, nao sobre o ajustado: em FII o ajuste retroativo do Yahoo se acumula com distribuicoes mensais, amortizacoes e emissoes e distorce a serie (XPML11 marca +713,7% ajustado contra +0,3% de preco no mesmo ano). Por isso os retornos se chamam vp21/vp63/vp252, variacao de preco, e nao sao comparaveis aos r21/r63/r252 das bases de BDR e empresas. prov12 e a soma distribuida nos 365 dias anteriores a ultima observacao da propria serie; o dividend yield NAO e publicado aqui, e derivado no cliente sobre o preco do dia.',
    comHistoricoNovo: novos,
    comProvento,
    comProventoMensal: mensais,
    preservados: Object.values(metricas).filter(m => m.stale).length,
    falhas,
    semHistorico: elegiveis.filter(f => !metricas[f.ticker]).map(f => f.ticker),
    metricas
  };
  require('./valida-metricas-fiis').valida(out, catalogo);
  fs.writeFileSync(SAIDA, JSON.stringify(out, null, 1) + '\n');
  console.log('gravado: ' + Object.keys(metricas).length + '/' + elegiveis.length + ' (' + comProvento + ' com provento, ' + mensais + ' com 10 ou mais no ano)');
  if(falhas.length) console.log('falhas: ' + falhas.length);
}

module.exports = { leCatalogo, resumoProventos, metricasFII, confereCobertura, JANELA_PROVENTO };
if(require.main === module) atualiza().catch(e => { console.error('ERRO:', e.message); process.exit(1); });
