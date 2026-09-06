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
const path = require('path');

const RAIZ = path.join(__dirname, '..');
const DESTINO = path.join(RAIZ, 'fontes');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36';
const CSS = 'https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,800&family=Inter+Tight:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap';

const arquivo = (familia, peso) => familia.toLowerCase().replace(/\s+/g,'-') + '-' + peso.replace(/\s+/g,'') + '.woff2';

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

  let soma = 0;
  const regras = [];
  for(const b of blocos){
    const r = await fetch(b.url, { headers:{ 'User-Agent':UA } });
    if(!r.ok) throw new Error('falha ao baixar ' + b.familia + ' ' + b.peso + ': HTTP ' + r.status);
    const buf = Buffer.from(await r.arrayBuffer());
    const nome = arquivo(b.familia, b.peso);
    fs.writeFileSync(path.join(DESTINO, nome), buf);
    soma += buf.length;
    /* Caminho relativo, como todo fetch do projeto: o Lovable serve a pagina
       dentro de um iframe em subcaminho, e a barra inicial quebraria la. */
    regras.push(`@font-face{font-family:'${b.familia}';font-style:${b.estilo};font-weight:${b.peso};font-display:swap;`
      + `src:url(fontes/${nome}) format('woff2');unicode-range:${b.faixa}}`);
    console.log('  ' + nome.padEnd(34) + (buf.length/1024).toFixed(0) + ' KB');
  }
  const bloco = '/* Fontes auto-hospedadas: subset latin, baixadas por scripts/baixa-fontes.js.\n'
    + '   O projeto nao tem dependencia externa, e isto era a ultima. */\n' + regras.join('\n');
  fs.writeFileSync(path.join(DESTINO, 'font-face.css'), bloco + '\n');
  console.log('\n' + blocos.length + ' arquivos, ' + (soma/1024).toFixed(0) + ' KB no total');
  console.log('Regras gravadas em fontes/font-face.css — cole no <style> do index.html.');
})().catch(e => { console.error('ERRO:', e.message); process.exit(1); });
