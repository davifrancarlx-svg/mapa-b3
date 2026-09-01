const fs=require('fs'),path=require('path'),r=path.join(__dirname,'..'),p=JSON.parse(fs.readFileSync(path.join(r,'precos.json'),'utf8'));
const a=Object.entries(p.precos||{}),erros=[];
if(!p.atualizadoEm||!p.fonte)erros.push('metadados ausentes');
if(p.tickersConsultados&&a.length/p.tickersConsultados<.8)erros.push('cobertura abaixo de 80%');
a.forEach(([t,x])=>{if(!(x.p>0))erros.push(t+' preco invalido');if(x.vol<0||x.giro<0)erros.push(t+' volume ou giro invalido');if(x.t!==null&&!Number.isFinite(x.t))erros.push(t+' horario invalido');});
if(erros.length){console.error(erros.slice(0,20).join('\n'));process.exit(1);}console.log('OK: '+a.length+'/'+p.tickersConsultados+' tickers com preco valido');
