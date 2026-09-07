/*
 * Testa a carteira cifrada que atravessa desktops, rodando as funcoes reais do
 * index.html num contexto isolado.
 *
 * Este e o unico ponto do projeto onde um erro publica dado pessoal: o arquivo
 * vai para um repositorio PUBLICO. As garantias que precisam continuar valendo
 * sao tres, e nenhuma delas e obvia ao ler o codigo:
 *
 *  1. nada do conteudo aparece em claro no arquivo -- nem ticker, nem numero;
 *  2. senha errada nao devolve carteira, devolve erro;
 *  3. arquivo adulterado nao passa (AES-GCM autentica, e e por isso que ele
 *     foi escolhido em vez de AES-CBC).
 *
 * Uso: node scripts/testa-carteira-sync.js
 */

const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

/* O vm tem realm proprio: objetos criados la dentro sao estruturalmente
   iguais mas nao compartilham prototipo, e o deepEqual estrito reprova por
   isso. `meu()` traz o valor de volta para este realm antes de comparar. */
const meu = v => JSON.parse(JSON.stringify(v));

const codigo = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8').match(/<script>([\s\S]*?)<\/script>/)[1];

/* O WebCrypto do Node e a mesma API do navegador, entao as funcoes rodam sem
   adaptacao -- se um dia precisarem de duble, o teste deixou de testar o que
   a pagina faz. */
const ctx = vm.createContext({
  crypto: require('crypto').webcrypto,
  TextEncoder, TextDecoder, btoa, atob, JSON, Uint8Array, Number, Array, Error, Date, console
});

function trecho(de, ate){
  const i = codigo.indexOf(de), j = codigo.indexOf(ate, i);
  assert.ok(i >= 0 && j > i, 'trecho ausente: ' + de);
  return codigo.slice(i, j);
}
vm.runInContext(trecho('function leCarteira(', 'function numeroCarteira('), ctx);
vm.runInContext(trecho('const SYNC_ITERACOES', 'function ativoCarteira('), ctx);

const carteira = [
  { ticker: 'PETR4', qtd: 100, pm: 28.5 },
  { ticker: 'HGLG11', qtd: 10, pm: 150 },
  { ticker: 'AAPL34', qtd: 5, pm: 60.25 }
];
const SENHA = 'senha-de-teste-123';

(async () => {
  const arq = await ctx.cifraCarteira(SENHA, carteira);

  /* Formato: o que o repositorio vai guardar precisa se identificar, para
     quem abrir o arquivo daqui a um ano saber o que e. */
  assert.equal(arq.versao, 1);
  assert.equal(arq.cifrado, true);
  assert.match(arq.algoritmo, /AES-GCM/);
  assert.ok(arq.iteracoes >= 100000, 'PBKDF2 fraco demais para arquivo publico');
  assert.ok(arq.salt && arq.iv && arq.dados, 'salt, iv ou dados ausentes');
  assert.ok(Number.isFinite(Date.parse(arq.geradoEm)));

  /* 1. nada em claro. Inclui o teste obvio (ticker) e o que passa despercebido
     (quantidade e preco medio soltos no JSON). */
  const bruto = JSON.stringify(arq);
  for(const t of ['PETR4', 'HGLG11', 'AAPL34']) assert.ok(!bruto.includes(t), 'ticker ' + t + ' vazou em claro');
  const semCifra = bruto.replace(/"dados":"[^"]*"/, '');
  for(const n of ['28.5', '60.25', '"qtd"', '"pm"']) assert.ok(!semCifra.includes(n), 'valor ' + n + ' vazou em claro');

  /* Sal e vetor diferentes a cada geracao: reusar qualquer um dos dois com a
     mesma senha entrega o conteudo. */
  const outro = await ctx.cifraCarteira(SENHA, carteira);
  assert.notEqual(arq.salt, outro.salt, 'salt repetido entre geracoes');
  assert.notEqual(arq.iv, outro.iv, 'iv repetido entre geracoes');
  assert.notEqual(arq.dados, outro.dados, 'cifra deterministica');

  /* Ida e volta. */
  assert.deepEqual(meu(await ctx.decifraCarteira(SENHA, arq)), carteira);

  /* 2. senha errada. */
  await assert.rejects(() => ctx.decifraCarteira('senha-errada', arq), 'senha errada devolveu carteira');
  await assert.rejects(() => ctx.decifraCarteira('', arq), 'senha vazia devolveu carteira');

  /* 3. adulteracao: cada campo, um de cada vez. */
  const mexe = (campo, valor) => ({ ...arq, [campo]: valor });
  const virarUltimo = t => t.slice(0, -4) + (t.slice(-4) === 'AAAA' ? 'BBBB' : 'AAAA');
  for(const campo of ['dados', 'salt', 'iv']){
    await assert.rejects(() => ctx.decifraCarteira(SENHA, mexe(campo, virarUltimo(arq[campo]))), campo + ' adulterado passou');
  }
  await assert.rejects(() => ctx.decifraCarteira(SENHA, mexe('iteracoes', 1000)), 'contagem de iteracoes trocada passou');

  /* Arquivo que nao e carteira cifrada nao pode ser confundido com uma vazia. */
  for(const ruim of [null, {}, { cifrado: false }, { cifrado: true, salt: 'x' }]){
    await assert.rejects(() => ctx.decifraCarteira(SENHA, ruim), 'arquivo invalido aceito: ' + JSON.stringify(ruim));
  }

  /* O que sai da cifra passa por leCarteira() de novo: o arquivo publicado nao
     e mais confiavel que o localStorage, e pode ter sido editado a mao. */
  const sujo = await ctx.cifraCarteira(SENHA, [
    { ticker: 'PETR4', qtd: 100, pm: 28.5 },
    { ticker: 'petr4', qtd: 1, pm: 1 },
    { ticker: '<script>', qtd: 1, pm: 1 },
    { ticker: 'VALE3', qtd: -5, pm: 10 },
    { ticker: 'VALE3', qtd: 5, pm: 0 }
  ]);
  const limpo = await ctx.decifraCarteira(SENHA, sujo);
  assert.deepEqual(meu(limpo).map(x => x.ticker), ['PETR4'], 'entrada invalida sobreviveu a decifra');

  /* A previa do que muda: substituir sem mostrar apagaria trabalho, porque a
     carteira local pode ser a mais recente. */
  const d = meu(ctx.comparaCarteiras(carteira, [{ ticker: 'PETR4', qtd: 200, pm: 30 }, { ticker: 'VALE3', qtd: 50, pm: 60 }]));
  assert.deepEqual(d.entram, ['VALE3']);
  assert.deepEqual(d.saem.sort(), ['AAPL34', 'HGLG11']);
  assert.deepEqual(d.mudam, ['PETR4']);
  const igual = meu(ctx.comparaCarteiras(carteira, carteira));
  assert.deepEqual([igual.entram, igual.saem, igual.mudam], [[], [], []]);

  /* A senha nao pode ser guardada em lugar nenhum: ao lado do arquivo cifrado,
     no mesmo navegador, ela anularia a cifra. */
  assert.ok(!/localStorage\.setItem\(\s*['"][^'"]*[Ss]enha/.test(codigo), 'a senha da carteira esta sendo guardada');
  assert.ok(!/mapaB3Senha|mapaB3Sync/.test(codigo), 'chave de armazenamento de senha encontrada');

  console.log('OK: carteira cifrada — formato, sigilo, senha errada, adulteração, entrada suja e prévia da substituição');
})().catch(e => { console.error('ERRO:', e.message); process.exit(1); });
