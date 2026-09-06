/*
 * Gera social.png (1200x630), a imagem que aparece quando alguem compartilha o
 * link. O estado inteiro da tela vai na URL, entao o link e a unidade de
 * compartilhamento do projeto -- sem imagem, a previa fica so texto.
 *
 * Desenha o mosaico real, com o mesmo squarify() da pagina (extraido do
 * index.html, nao reescrito: duas implementacoes ja divergiram uma vez neste
 * projeto). Nao escreve numero nenhum: a imagem e decorativa e nao pode
 * envelhecer junto com a base.
 *
 * PNG e zlib de mao, sem dependencia. A fonte e um bitmap 5x7 embutido, porque
 * rasterizar tipografia de verdade exigiria biblioteca.
 *
 * Uso: node scripts/gera-social.js
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const zlib = require('zlib');

const RAIZ = path.join(__dirname, '..');
const L = 1200, A = 630;

/* ---------- base e algoritmo, vindos do proprio index.html ---------- */
const html = fs.readFileSync(path.join(RAIZ, 'index.html'), 'utf8');

function leD(raw){
  const marca = 'const D = ', ini = raw.indexOf(marca), start = ini + marca.length;
  if(ini < 0) throw new Error('bloco const D ausente');
  let nivel = 0, texto = false, escape = false, fim = -1;
  for(let i = start; i < raw.length; i++){
    const c = raw[i];
    if(texto){ if(escape) escape = false; else if(c === '\\') escape = true; else if(c === '"') texto = false; continue; }
    if(c === '"'){ texto = true; continue; }
    if(c === '{') nivel++; else if(c === '}' && --nivel === 0){ fim = i + 1; break; }
  }
  if(fim < 0) throw new Error('bloco const D incompleto');
  return JSON.parse(raw.slice(start, fim));
}
const D = leD(html);
const codigo = html.match(/<script>([\s\S]*?)<\/script>/)[1];
const ctx = vm.createContext({});
vm.runInContext(codigo.slice(codigo.indexOf('function squarify('), codigo.indexOf('/* ---------- visao geral')), ctx);
const { squarify } = ctx;
if(typeof squarify !== 'function') throw new Error('squarify nao pode ser extraido do index.html');

/* Mesmo peso do mosaico: raiz comprime a escala e o piso impede blocos de um
   pixel. Repetido aqui porque peso() depende de st.area, que so existe na pagina. */
const peso = e => Math.pow(Math.max(e.vm, 1.5e9), .42);

/* ---------- tela ---------- */
const px = Buffer.alloc(L * A * 3);
const hex = c => [1,3,5].map(i => parseInt(c.slice(i, i+2), 16));
function pinta(x, y, [r,g,b], alfa = 1){
  x = Math.round(x); y = Math.round(y);
  if(x < 0 || y < 0 || x >= L || y >= A) return;
  const i = (y * L + x) * 3;
  px[i]   = Math.round(px[i]   * (1-alfa) + r * alfa);
  px[i+1] = Math.round(px[i+1] * (1-alfa) + g * alfa);
  px[i+2] = Math.round(px[i+2] * (1-alfa) + b * alfa);
}
function retangulo(x, y, w, h, cor, alfa = 1){
  for(let j = Math.max(0,Math.round(y)); j < Math.min(A, Math.round(y+h)); j++)
    for(let i = Math.max(0,Math.round(x)); i < Math.min(L, Math.round(x+w)); i++) pinta(i, j, cor, alfa);
}

const FUNDO = hex('#101216'), AMBAR = hex('#F2B441'), CLARO = hex('#E9EBEE');
retangulo(0, 0, L, A, FUNDO);

/* ---------- mosaico ---------- */
const porCat = {};
D.empresas.forEach(e => (porCat[e.macro] ||= []).push(e));
const grupos = Object.keys(porCat).map(c => ({
  c, v: porCat[c].reduce((a,e) => a + peso(e), 0), itens: porCat[c]
})).sort((a,b) => b.v - a.v);

squarify(grupos, 0, 0, L, A).forEach(g => {
  const cor = hex(D.cores[g.c] || '#4A5568');
  retangulo(g.x, g.y, g.w, g.h, cor, .16);
  squarify(g.itens.map(e => ({ v: peso(e), e })).sort((a,b) => b.v - a.v), g.x + 2, g.y + 2, g.w - 4, g.h - 4)
    .forEach(t => retangulo(t.x, t.y, Math.max(t.w - 2, 1), Math.max(t.h - 2, 1), cor, .9));
});

/* Painel solido a esquerda, e nao um degrade largo: com degrade o fim da
   palavra caia sobre bloco claro e o contraste do texto dependia de qual
   categoria calhasse ali. O fade curto so tira o corte reto. */
const PAINEL = 560, FADE = 300;
for(let x = 0; x < PAINEL + FADE; x++){
  const a = x < PAINEL ? .955 : .955 * (1 - (x - PAINEL) / FADE) ** 1.6;
  for(let y = 0; y < A; y++) pinta(x, y, FUNDO, a);
}
retangulo(0, A - 6, L, 6, AMBAR);

/* ---------- tipografia 5x7 embutida ---------- */
const GLIFOS = {
  M:['10001','11011','10101','10001','10001','10001','10001'],
  A:['01110','10001','10001','11111','10001','10001','10001'],
  P:['11110','10001','10001','11110','10000','10000','10000'],
  D:['11110','10001','10001','10001','10001','10001','11110'],
  B:['11110','10001','10001','11110','10001','10001','11110'],
  3:['11110','00001','00001','01110','00001','00001','11110'],
  ' ':['00000','00000','00000','00000','00000','00000','00000']
};
function escreve(texto, x, y, escala, cor){
  let cx = x;
  for(const ch of texto){
    const g = GLIFOS[ch];
    if(!g) throw new Error('glifo ausente para "' + ch + '"');
    g.forEach((linha, j) => [...linha].forEach((v, i) => { if(v === '1') retangulo(cx + i*escala, y + j*escala, escala, escala, cor); }));
    cx += 6 * escala;
  }
  return cx - x - escala;
}

const ESCALA = 13, X = 80, Y = 214;
retangulo(X, Y - 62, 30, 30, AMBAR);
escreve('MAPA', X, Y, ESCALA, CLARO);
escreve('DA B3', X, Y + 9*ESCALA, ESCALA, CLARO);
retangulo(X, Y + 18*ESCALA + 10, 150, 5, AMBAR);

/* ---------- PNG ---------- */
const TABELA = (() => {
  const t = new Int32Array(256);
  for(let n = 0; n < 256; n++){ let c = n; for(let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c; }
  return t;
})();
const crc = buf => { let c = -1; for(const b of buf) c = TABELA[(c ^ b) & 0xFF] ^ (c >>> 8); return (c ^ -1) >>> 0; };
function pedaco(tipo, dados){
  const t = Buffer.from(tipo, 'ascii'), tam = Buffer.alloc(4), soma = Buffer.alloc(4);
  tam.writeUInt32BE(dados.length); soma.writeUInt32BE(crc(Buffer.concat([t, dados])));
  return Buffer.concat([tam, t, dados, soma]);
}
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(L, 0); ihdr.writeUInt32BE(A, 4);
ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0; // 8 bits, RGB

const linhas = Buffer.alloc(A * (L * 3 + 1));
for(let y = 0; y < A; y++){
  linhas[y * (L*3 + 1)] = 0; // filtro nenhum
  px.copy(linhas, y * (L*3 + 1) + 1, y * L * 3, (y+1) * L * 3);
}
const png = Buffer.concat([
  Buffer.from([0x89,0x50,0x4E,0x47,0x0D,0x0A,0x1A,0x0A]),
  pedaco('IHDR', ihdr),
  pedaco('IDAT', zlib.deflateSync(linhas, { level: 9 })),
  pedaco('IEND', Buffer.alloc(0))
]);
const destino = path.join(RAIZ, 'social.png');
fs.writeFileSync(destino, png);
console.log('gravado ' + destino + ': ' + L + 'x' + A + ', ' + (png.length/1024).toFixed(0) + ' KB, ' + D.empresas.length + ' blocos');
