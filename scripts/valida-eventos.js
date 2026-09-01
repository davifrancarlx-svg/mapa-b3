const fs=require('fs'),path=require('path'),r=path.join(__dirname,'..'),e=JSON.parse(fs.readFileSync(path.join(r,'eventos.json'),'utf8'));
if(!e.atualizadoEm||!e.fonte||!e.eventos)throw new Error('metadados ausentes');
Object.entries(e.eventos).forEach(([cod,itens])=>itens.forEach(x=>{if(!/^https:\/\/.*cvm\.gov\.br\//.test(x.url||''))throw new Error(cod+' sem link oficial da CVM');if(!/^\d{4}-\d{2}-\d{2}$/.test(x.dt))throw new Error(cod+' data invalida');}));
console.log('OK: '+Object.values(e.eventos).flat().length+' documentos recentes da CVM');
