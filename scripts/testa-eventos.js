const assert=require('node:assert/strict'),fs=require('fs'),path=require('path'),vm=require('vm');
const {valida,oficial}=require('./valida-eventos');
const url='https://www.rad.cvm.gov.br/ENET/frmDownloadDocumento.aspx?numProtocolo=1',categorias=['Fato Relevante','Comunicado ao Mercado','Calendário de Eventos Corporativos','Aviso aos Acionistas'];
const item={dt:'2026-01-10',categoria:'Fato Relevante',assunto:'Mesmo assunto',url,protocolo:'1',versao:1};
const base={versao:2,atualizadoEm:'2026-01-10T12:00:00Z',fonte:[url],janela:{inicio:'2025-07-15',fim:'2026-01-10',dias:180},categorias,limitePorEmpresa:8,empresasComEventos:1,documentosExibidos:2,documentosNoRecorte:2,totaisPorEmpresa:{TEST:2},eventos:{TEST:[item,{...item,protocolo:'2',url:url+'2'}]}};
const empresas=[{cod:'TEST'}];assert.equal(valida(base,empresas),2);
for(const u of ['https://falsocvm.gov.br/x','https://cvm.gov.br.evil.test/x','https://cvm.gov.br@evil.test/x','http://cvm.gov.br/x','https://cvm.gov.br:444/x','javascript:alert(1)'])assert.equal(oficial(u),false,u);
for(const modifica of [b=>b.eventos.TEST[0].url='https://evilcvm.gov.br/x',b=>b.eventos.TEST[1]={...b.eventos.TEST[0]},b=>b.eventos.TEST[0].dt='2026-02-30',b=>b.eventos.TEST[0].dt='2026-01-11',b=>b.documentosExibidos=3,b=>b.eventos.TEST[0].categoria='Inventada']){const b=structuredClone(base);modifica(b);assert.throws(()=>valida(b,empresas));}
const codigo=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8').match(/<script>([\s\S]*?)<\/script>/)[1];
const box={innerHTML:''},ctx=vm.createContext({URL,Date,E:empresas,EVENTOS:{},EVENTOS_META:null,EVENTOS_ESTADO:'carregando',st:{ativo:'TEST'},$:()=>box,drw:{classList:{contains:()=>true}}});
vm.runInContext(codigo.slice(codigo.indexOf('const esc ='),codigo.indexOf('\n',codigo.indexOf('const esc ='))),ctx);
vm.runInContext(codigo.slice(codigo.indexOf('function urlCVM('),codigo.indexOf('function metricasEmpresaHTML(')),ctx);
assert.match(ctx.eventosEmpresaHTML('TEST'),/Carregando/);ctx.EVENTOS_ESTADO='falha';assert.match(ctx.eventosEmpresaHTML('TEST'),/Não foi possível carregar/);
ctx.recebeEventos(base);let texto=ctx.eventosEmpresaHTML('TEST');for(const s of ['Protocolo 1','Protocolo 2','Versão 1','semanal','2 encontrados','Data de entrega'])assert.ok(texto.includes(s),s);
ctx.atualizaEventosFicha();assert.match(box.innerHTML,/Protocolo 2/);
assert.match(ctx.eventosEmpresaHTML('OUTRA'),/não significa ausência/);
assert.equal(ctx.eventoHTML({...item,url:'https://evilcvm.gov.br/x'}),'');assert.ok(!ctx.eventoHTML({...item,assunto:'<img src=x onerror=alert(1)>'}).includes('<img'));
const b=structuredClone(base);b.eventos.TEST[0].url='javascript:alert(1)';assert.throws(()=>ctx.recebeEventos(b));assert.equal(ctx.EVENTOS.TEST[0].url,url);
for(const modifica of [b=>b.limitePorEmpresa='<img src=x>',b=>b.eventos.TEST[0].categoria='Inventada',b=>b.eventos.TEST=Array(9).fill(item)]){const b=structuredClone(base);modifica(b);assert.throws(()=>ctx.recebeEventos(b));}
ctx.EVENTOS.TEST=Array.from({length:8},(_,i)=>({...item,protocolo:String(i)}));assert.match(ctx.eventosEmpresaHTML('TEST'),/Ver mais 3 documentos/);
console.log('OK: eventos, dominios, protocolos, datas, contagens, estados de carga e metadados escapados');
