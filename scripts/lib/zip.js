/*
 * Leitor minimo de ZIP, so o necessario para os pacotes de dados abertos da
 * CVM: le o diretorio central e inflaciona cada entrada com o zlib nativo.
 *
 * Por que existe: o projeto nao tem dependencia, e o Node nao traz leitor de
 * zip. O `atualiza-eventos.py` resolve o mesmo problema com o `zipfile` do
 * Python, mas o informe mensal de FII e consumido por script Node -- manter a
 * geracao toda em Node evita um segundo runtime no caminho critico de uma
 * base que entra na pagina.
 *
 * Suporta o que a CVM publica: deflate (metodo 8) e armazenado (metodo 0),
 * sem cifra e sem Zip64. Qualquer coisa fora disso levanta erro em vez de
 * devolver dado pela metade -- um CSV truncado viraria cobertura falsa.
 */

const zlib = require('zlib');

const ASSINATURA_EOCD = 0x06054b50;
const ASSINATURA_CENTRAL = 0x02014b50;
const ASSINATURA_LOCAL = 0x04034b50;

/* O EOCD fica no fim, depois de um comentario de ate 65535 bytes. Varremos de
   tras para frente porque a assinatura pode aparecer dentro do conteudo. */
function achaEOCD(buf){
  const minimo = Math.max(0, buf.length - 22 - 65535);
  for(let i = buf.length - 22; i >= minimo; i--) if(buf.readUInt32LE(i) === ASSINATURA_EOCD) return i;
  throw new Error('zip invalido: fim do diretorio central nao encontrado');
}

function lista(buf){
  if(!Buffer.isBuffer(buf) || buf.length < 22) throw new Error('zip invalido: arquivo curto demais');
  const eocd = achaEOCD(buf);
  const total = buf.readUInt16LE(eocd + 10);
  if(total === 0xffff) throw new Error('zip invalido: Zip64 nao suportado');
  let p = buf.readUInt32LE(eocd + 16);
  const entradas = [];
  for(let i = 0; i < total; i++){
    if(p + 46 > buf.length || buf.readUInt32LE(p) !== ASSINATURA_CENTRAL) throw new Error('zip invalido: entrada ' + i + ' corrompida');
    const metodo = buf.readUInt16LE(p + 10);
    const sinalizador = buf.readUInt16LE(p + 8);
    if(sinalizador & 0x1) throw new Error('zip invalido: entrada cifrada');
    const comprimido = buf.readUInt32LE(p + 20), original = buf.readUInt32LE(p + 24);
    if(comprimido === 0xffffffff || original === 0xffffffff) throw new Error('zip invalido: Zip64 nao suportado');
    const nomeLen = buf.readUInt16LE(p + 28), extraLen = buf.readUInt16LE(p + 30), comentLen = buf.readUInt16LE(p + 32);
    entradas.push({
      nome: buf.toString('latin1', p + 46, p + 46 + nomeLen),
      metodo, comprimido, original,
      deslocamento: buf.readUInt32LE(p + 42)
    });
    p += 46 + nomeLen + extraLen + comentLen;
  }
  return entradas;
}

/* O cabecalho local repete nome e extra com tamanhos proprios: os do
   diretorio central nao servem para achar onde os dados comecam. */
function extrai(buf, e){
  const d = e.deslocamento;
  if(d + 30 > buf.length || buf.readUInt32LE(d) !== ASSINATURA_LOCAL) throw new Error('zip invalido: cabecalho local de ' + e.nome);
  const inicio = d + 30 + buf.readUInt16LE(d + 26) + buf.readUInt16LE(d + 28);
  const dados = buf.subarray(inicio, inicio + e.comprimido);
  const saida = e.metodo === 0 ? Buffer.from(dados)
    : e.metodo === 8 ? zlib.inflateRawSync(dados)
    : (() => { throw new Error('zip invalido: metodo ' + e.metodo + ' em ' + e.nome); })();
  if(saida.length !== e.original) throw new Error('zip invalido: ' + e.nome + ' saiu com ' + saida.length + ' de ' + e.original + ' bytes');
  return saida;
}

/* A CVM publica em latin-1 e separa por ponto e virgula. Campo vazio vira
   string vazia, nunca undefined, para o chamador nao confundir ausencia de
   coluna com ausencia de valor. */
function csv(texto){
  const linhas = texto.split(/\r?\n/).filter(l => l.trim());
  if(!linhas.length) return [];
  const cab = linhas[0].split(';').map(s => s.trim());
  return linhas.slice(1).map(l => {
    const cel = l.split(';');
    const o = {};
    cab.forEach((k, i) => o[k] = (cel[i] ?? '').trim());
    return o;
  });
}

module.exports = { lista, extrai, csv };
