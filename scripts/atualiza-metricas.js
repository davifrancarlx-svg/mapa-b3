/*
 * Calcula metricas historicas dos BDRs a partir de cotacoes diarias ajustadas.
 * O navegador recebe so os indicadores prontos; o historico bruto nao vai para
 * metricas.json, para manter a pagina leve. A serie do grafico vai comprimida:
 * so spP (preco ajustado) e spO (offset em dias sobre spInicio). A curva
 * normalizada e derivada de spP no cliente, e nao trafega.
 *
 * Uso: node scripts/atualiza-metricas.js
 */

const fs = require('fs');
const path = require('path');

const { espera, arred, mediana, historico, calcula } = require('./lib/serie');

const RAIZ = path.join(__dirname, '..');
const BDRS = path.join(RAIZ, 'bdrs.json');
const SAIDA = path.join(RAIZ, 'metricas.json');
const CONCORRENCIA = 6;
const COBERTURA_MINIMA = .9;

function relativos(metricas, bdrs, chave, destino, grupo){
  const valores = {};
  bdrs.forEach(b => {
    const v = metricas[b.ticker]?.[chave];
    if(typeof v !== 'number') return;
    const g = b[grupo];
    (valores[g] ||= []).push(v);
  });
  const bases = Object.fromEntries(Object.entries(valores).map(([g,a]) => [g, mediana(a)]));
  bdrs.forEach(b => {
    const m = metricas[b.ticker], base = bases[b[grupo]];
    if(m && typeof m[chave] === 'number' && typeof base === 'number') m[destino] = arred(m[chave] - base);
  });
}

(async () => {
  const base = JSON.parse(fs.readFileSync(BDRS, 'utf8'));
  const bdrs = base.bdrs || [];
  const anterior = fs.existsSync(SAIDA) ? JSON.parse(fs.readFileSync(SAIDA, 'utf8')).metricas || {} : {};
  const metricas = {};
  const falhas = [];
  let proximo = 0, novos = 0;

  async function trabalha(){
    while(true){
      const i = proximo++;
      if(i >= bdrs.length) return;
      const b = bdrs[i];
      try{
        const m = calcula(await historico(b.ticker));
        if(!m) throw new Error('menos de 22 pregoes');
        metricas[b.ticker] = m;
        novos++;
      } catch(err){
        if(anterior[b.ticker]) metricas[b.ticker] = { ...anterior[b.ticker], stale:true };
        falhas.push(b.ticker + ': ' + err.message);
      }
      if((i + 1) % 50 === 0) console.log('  ' + (i + 1) + '/' + bdrs.length);
      await espera(90);
    }
  }

  console.log('buscando dois anos de historico para ' + bdrs.length + ' BDRs...');
  await Promise.all(Array.from({length:CONCORRENCIA}, trabalha));

  const cobertura = novos / bdrs.length;
  if(cobertura < COBERTURA_MINIMA){
    throw new Error('cobertura nova de ' + (cobertura*100).toFixed(1) + '% abaixo do minimo de ' + (COBERTURA_MINIMA*100) + '%');
  }

  ['21','63','252'].forEach(n => {
    relativos(metricas, bdrs, 'r' + n, 'ri' + n, 'industria');
    relativos(metricas, bdrs, 'r' + n, 'rs' + n, 'setor');
  });

  const saida = {
    atualizadoEm: new Date().toISOString(),
    fonte: 'Yahoo Finance (nao oficial), serie diaria ajustada',
    metodologia: 'Retornos em pregoes; forca relativa em pontos percentuais contra a mediana da industria e do setor; giro medio inclui sessoes sem negocio, e fica ausente quando a janela nao esta completa ou algum volume e desconhecido',
    totalBDRs: bdrs.length,
    comHistoricoNovo: novos,
    preservados: Object.values(metricas).filter(m => m.stale).length,
    semHistorico: bdrs.filter(b => !metricas[b.ticker]).map(b => b.ticker),
    metricas
  };
  fs.writeFileSync(SAIDA, JSON.stringify(saida, null, 1) + '\n', 'utf8');
  console.log('gravado em ' + SAIDA + ': ' + Object.keys(metricas).length + '/' + bdrs.length + ' BDRs com metricas');
  if(falhas.length) console.log('falhas: ' + falhas.join(', '));
})().catch(err => { console.error('ERRO:', err.message); process.exit(1); });
