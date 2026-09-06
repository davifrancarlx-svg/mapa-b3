/*
 * Baixa as fontes do Google e grava em fontes/, com os @font-face prontos para
 * colar no index.html. Roda a mao, so quando a tipografia mudar.
 *
 * Por que auto-hospedar: era a unica dependencia externa de um projeto cuja
 * regra numero um e nao ter nenhuma. Tira o IP do visitante do gstatic.com,
 * tira um round-trip bloqueante e tira um ponto unico de falha de terceiro.
 *
 * So o subset `latin`: o portugues cabe inteiro em U+0000-00FF, e uma varredura
 * de index.html, bdrs.json, etfs.json, etfs-detalhes.json, eventos.json e
 * analise.json nao achou UM caractere que o latin-ext resolveria. O que sobra
 * fora do latin sao simbolos (▲ ★ → ≥), que nenhum subset latino cobre e que ja
 * vinham da fonte de sistema. Metade dos arquivos, metade do peso.
 *
 * Uso: node scripts/baixa-fontes.js
 */

const fs = require('fs');
const crypto = require('crypto');
const path = require('path');

const RAIZ = path.join(__dirname, '..');
const DESTINO = path.join(RAIZ, 'fontes');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36';
const CSS = 'https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,800&family=Inter+Tight:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap';

const base = familia => familia.toLowerCase().replace(/\s+/g,'-');

(async () => {
  const css = await (await fetch(CSS, { headers:{ 'User-Agent':UA } })).text();
  const blocos = css.split('/*').slice(1).map(b => ({
    subset: b.slice(0, b.indexOf('*/')).trim(),
    familia: (b.match(/font-family:\s*'([^']+)'/) || [,''])[1],
    estilo: (b.match(/font-style:\s*([^;]+);/) || [,'normal'])[1].trim(),
    peso: (b.match(/font-weight:\s*([^;]+);/) || [,'400'])[1].trim(),
    faixa: (b.match(/unicode-range:\s*([^;]+);/) || [,''])[1].trim(),
    url: (b.match(/url\((https:[^)]+\.woff2)\)/) || [])[1]
  })).filter(x => x.url && x.subset === 'latin');

  if(!blocos.length) throw new Error('nenhum @font-face latin devolvido; confira a consulta');
  fs.mkdirSync(DESTINO, { recursive:true });

  /* Inter Tight e Bricolage sao fontes variaveis: o Google devolve um
     @font-face por peso, mas todos apontam para O MESMO arquivo, que cobre a
     faixa inteira. Gravar um por peso fazia o navegador baixar quatro copias
     identicas de 44 KB. Agrupamos por conteudo (hash) e declaramos a faixa de
     pesos numa regra so -- o navegador instancia o eixo wght sozinho. */
  const porHash = new Map();
  for(const b of blocos){
    const r = await fetch(b.url, { headers:{ 'User-Agent':UA } });
    if(!r.ok) throw new Error('falha ao baixar ' + b.familia + ' ' + b.peso + ': HTTP ' + r.status);
    const buf = Buffer.from(await r.arrayBuffer());
    const chave = crypto.createHash('sha256').update(buf).digest('hex');
    if(!porHash.has(chave)) porHash.set(chave, { buf, familia:b.familia, estilo:b.estilo, faixa:b.faixa, pesos:[] });
    porHash.get(chave).pesos.push(Number(b.peso));
  }

  /* Nome sem peso quando o arquivo cobre varios: dizer 400 num arquivo que vai
     de 400 a 700 seria mentira, e a proxima pessoa duplicaria de novo. */
  const usados = new Map();
  let soma = 0;
  const regras = [];
  for(const g of porHash.values()){
    const min = Math.min(...g.pesos), max = Math.max(...g.pesos), variavel = min !== max;
    const raiz = base(g.familia), n = (usados.get(raiz) || 0);
    usados.set(raiz, n + 1);
    const nome = raiz + (variavel ? '' : '-' + min) + '.woff2';
    fs.writeFileSync(path.join(DESTINO, nome), g.buf);
    soma += g.buf.length;
    regras.push(`@font-face{font-family:'${g.familia}';font-style:${g.estilo};font-weight:${variavel ? min + ' ' + max : min};font-display:swap;`
      + `src:url(fontes/${nome}) format('woff2');unicode-range:${g.faixa}}`);
    console.log('  ' + nome.padEnd(30) + (g.buf.length/1024).toFixed(0).padStart(3) + ' KB   pesos ' + g.pesos.sort((a,b)=>a-b).join(', ') + (variavel ? '  (variavel)' : ''));
  }
  const bloco = '/* Fontes auto-hospedadas: subset latin, baixadas por scripts/baixa-fontes.js.\n'
    + '   O projeto nao tem dependencia externa, e isto era a ultima.\n'
    + '   Um arquivo por conteudo, nao por peso: as familias variaveis cobrem a\n'
    + '   faixa inteira e seriam baixadas em duplicata se declaradas uma a uma. */\n' + regras.join('\n');
  fs.writeFileSync(path.join(DESTINO, 'font-face.css'), bloco + '\n');
  console.log('\n' + porHash.size + ' arquivos (de ' + blocos.length + ' @font-face), ' + (soma/1024).toFixed(0) + ' KB no total');
  console.log('Regras gravadas em fontes/font-face.css — cole no <style> do index.html.');
})().catch(e => { console.error('ERRO:', e.message); process.exit(1); });
