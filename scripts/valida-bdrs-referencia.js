const fs=require('fs'),path=require('path'),raiz=path.join(__dirname,'..');
const b=JSON.parse(fs.readFileSync(path.join(raiz,'bdrs.json'),'utf8')).bdrs;
const d=JSON.parse(fs.readFileSync(path.join(raiz,'bdrs-referencia.json'),'utf8')),r=d.referencias||{},tickers=new Set(b.map(x=>x.ticker));
if(Object.keys(r).length/b.length<.7)throw new Error('cobertura de referencias abaixo de 70%');
Object.entries(r).forEach(([t,x])=>{if(!tickers.has(t))throw new Error(t+' fora da base de BDRs');if(!(x.bdrs>0&&x.acoes>0&&x.fator>0))throw new Error(t+' relacao invalida');if(!/^https:\/\/finservices\.b3\.com\.br\//.test(x.fonte||''))throw new Error(t+' sem fonte oficial do Banco B3');});
console.log('OK: '+Object.keys(r).length+'/'+b.length+' BDRs com relacao oficial do programa');
