/*
 * Guarda o nucleo compartilhado dos dois geradores de metricas.
 *
 * Antes existiam duas implementacoes de calcula(), e elas divergiram em
 * silencio: o gerador de BDR tratava volume ausente como zero e calculava
 * "giro medio de 60 pregoes" com menos de 60 sessoes. As duas bases publicam
 * os mesmos campos e a pagina mostra os dois lado a lado, entao a conta
 * precisa ser a mesma. Este teste cobre as regras e tambem checa que nenhum
 * gerador voltou a ter copia propria.
 */
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { arred, media, mediana, retorno, desvio, dia, offsetDias, extraiHistorico, extraiProventos, calcula } = require('./lib/serie');

const linhas = (n, vol = 10, preco = 100) =>
  Array.from({length:n}, (_,i) => ({ ts: 1700000000 + i*86400, p: preco, a: preco, vol }));

/* ---------- helpers numericos ---------- */
assert.equal(arred(1.23456), 1.23);
assert.equal(arred(1.23456, 4), 1.2346);
assert.equal(arred(NaN), null);
assert.equal(arred(Infinity), null);
assert.equal(media([]), null);
assert.equal(media([1,2,3]), 2);
assert.equal(mediana([]), null);
assert.equal(mediana([3,1,2]), 2);
assert.equal(mediana([4,1,3,2]), 2.5);
assert.equal(retorno([100,110], 1), 10.000000000000009);
assert.equal(retorno([100,110], 5), null, 'janela maior que a serie nao tem retorno');
assert.equal(retorno([0,110], 1), null, 'base zero nao vira retorno infinito');
assert.equal(desvio([1]), null);
assert.equal(arred(desvio([2,4,4,4,5,5,7,9])), 2.14);

/* ---------- datas em UTC ---------- */
assert.equal(dia(1700000000), '2023-11-14');
assert.equal(offsetDias('2026-01-01', '2026-01-08'), 7);
assert.equal(offsetDias('2026-02-28', '2026-03-01'), 1, '2026 nao e bissexto');
assert.equal(offsetDias('2026-10-17', '2026-10-19'), 2, 'sem horario de verao o offset nao pula');
/* As duas bordas do dia pegam qualquer implementacao que use fuso local: a de
   00:30 recua um dia em offset negativo, a de 23:30 avanca um dia em offset
   positivo. Numa maquina em UTC as duas passam de qualquer jeito -- e la a
   conta local realmente daria o mesmo resultado, entao nao ha o que pegar. */
assert.equal(dia(Date.parse('2026-03-10T00:30:00Z')/1000), '2026-03-10', 'inicio do dia UTC nao pode recuar para o dia anterior');
assert.equal(dia(Date.parse('2026-03-10T23:30:00Z')/1000), '2026-03-10', 'fim do dia UTC nao pode avancar para o dia seguinte');

/* ---------- volume ausente nao e zero ---------- */
const h = { timestamp:[1,2,3], indicators:{ quote:[{ close:[10,0,8], volume:[0,3,null] }], adjclose:[{ adjclose:[5,5,5] }] } };
const extraido = extraiHistorico(h);
assert.equal(extraido.length, 2, 'preco zero sai da serie');
assert.equal(extraido[0].vol, 0, 'volume zero e negocio nenhum, e um numero');
assert.equal(extraido[1].vol, null, 'volume ausente vira null, nao zero');
assert.throws(() => extraiHistorico({ timestamp:[1], indicators:{ quote:[{ close:[1] }] } }), /ajustada/);
assert.deepEqual(extraiHistorico({ timestamp:[3,1], indicators:{ quote:[{ close:[1,2], volume:[1,1] }], adjclose:[{ adjclose:[1,2] }] } }).map(x=>x.ts), [1,3], 'serie sai ordenada por data');

/* ---------- calcula: janela incompleta nao vira numero ---------- */
assert.equal(calcula(linhas(21)), null, 'menos de 22 pregoes nao rende metrica');
const curto = calcula(linhas(22));
assert.equal(curto.n, 22);
assert.equal(curto.d20, 20, 'a janela de 20 cabe em 22 pregoes');
assert.equal(curto.g60, null, 'giro de 60 nao existe com 22 sessoes');
assert.equal(curto.d60, null, 'pregoes de 60 nao existem com 22 sessoes');
assert.equal(curto.mm50, null);
assert.equal(curto.mm200, null);

const longo = calcula(linhas(60));
assert.equal(longo.g60, 1000, 'com 60 sessoes o giro de 60 existe');
assert.equal(longo.d60, 60);

const semVolume = linhas(22); semVolume.at(-1).vol = null;
const parcial = calcula(semVolume);
assert.equal(parcial.g20, null, 'um volume desconhecido derruba o giro da janela');
assert.equal(parcial.d20, null, 'e tambem a contagem de pregoes com negocio');
assert.equal(parcial.r21, 0, 'o retorno nao depende de volume e continua');

const parado = calcula(linhas(22, 0));
assert.equal(parado.g20, 0, 'volume zero e informacao: giro zero, nao ausente');
assert.equal(parado.d20, 0);

/* ---------- extras preservam a ordem dos campos publicados ---------- */
const comTicker = calcula(linhas(22), { ticker:'TEST3' });
assert.equal(comTicker.ticker, 'TEST3');
assert.equal(Object.keys(comTicker)[0], 'ticker');
assert.equal(Object.keys(calcula(linhas(22)))[0], 'dt', 'sem extras a base de BDR comeca por dt');

/* ---------- dd252 e dm252 sao espelhos ---------- */
const oscila = linhas(252);
oscila[100].a = 200; oscila[150].a = 50; oscila.at(-1).a = 100;
const m = calcula(oscila);
assert.ok(m.dd252 <= 0, 'distancia da maxima nunca e positiva');
assert.ok(m.dm252 >= 0, 'distancia da minima nunca e negativa');
assert.equal(m.max252, 200);
assert.equal(m.min252, 50);

/* ---------- serie comprimida ---------- */
assert.equal(m.sp, undefined, 'sp e derivado de spP no cliente');
assert.equal(m.spD, undefined, 'spD virou offset');
assert.equal(m.spO.length, m.spP.length);
assert.equal(m.spO[0], 0);
assert.ok(m.spO.every((o,i) => Number.isInteger(o) && (!i || o > m.spO[i-1])), 'offsets crescentes');
assert.equal(dia(oscila.at(-1).ts), m.spFim);

/* ---------- proventos ---------- */
/* O chart do Yahoo devolve os dividendos num objeto com chave arbitraria, nao
   num array: iterar por Object.values e ordenar por data e o contrato. E a
   data vem em epoch, entao vale a mesma regra de UTC do resto da serie. */
{
  const bruto = {events:{dividends:{
    '1767225600':{amount:1.1,date:1767225600},   // 2026-01-01 00:00Z
    '1759276800':{amount:0.9,date:1759276800},   // 2025-10-01, fora de ordem
    '1764547200':{amount:0,date:1764547200},     // zero nao e provento
    'lixo':{amount:'1,20',date:1762128000},      // valor nao numerico
    'semData':{amount:1.3}
  }}};
  const p = extraiProventos(bruto);
  assert.deepEqual(p, [{d:'2025-10-01',v:0.9},{d:'2026-01-01',v:1.1}], 'proventos ordenados, sem zero nem lixo');
  assert.deepEqual(extraiProventos({}), [], 'sem eventos devolve lista vazia');
  assert.deepEqual(extraiProventos({events:{}}), [], 'events sem dividends devolve lista vazia');
  /* Fronteira de dia em UTC: 23:30Z continua no mesmo dia, nao no seguinte. */
  assert.equal(extraiProventos({events:{dividends:{a:{amount:1,date:Date.parse('2026-03-10T23:30:00Z')/1000}}}})[0].d, '2026-03-10');
  assert.equal(extraiProventos({events:{dividends:{a:{amount:1,date:Date.parse('2026-03-10T00:30:00Z')/1000}}}})[0].d, '2026-03-10');
}

/* ---------- nenhum gerador pode ter copia propria ---------- */
const geradores = ['atualiza-metricas.js', 'atualiza-metricas-empresas.js', 'atualiza-metricas-fiis.js', 'atualiza-metricas-etfs.js'];
for(const g of geradores){
  const src = fs.readFileSync(path.join(__dirname, g), 'utf8');
  assert.ok(/require\('\.\/lib\/serie'\)/.test(src), g + ' deve usar o nucleo compartilhado');
  for(const nome of ['function calcula(', 'function extraiHistorico(', 'function desvio(', 'async function historico(', 'function extraiProventos(', 'async function historicoProventos(']){
    assert.ok(!src.includes(nome), g + ' redefine ' + nome.replace(/^(async )?function /,'') + ' em vez de importar');
  }
  for(const nome of ['const arred =', 'const arred=', 'const media =', 'const media=', 'const mediana =', 'const mediana=', 'const retorno =', 'const retorno=', 'const espera =', 'const espera=']){
    assert.ok(!src.includes(nome), g + ' redefine ' + nome + ' em vez de importar');
  }
}

console.log('OK: nucleo de serie compartilhado, janelas incompletas, volume ausente e datas em UTC');
