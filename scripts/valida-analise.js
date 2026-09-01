const fs=require('fs'),path=require('path'),r=path.join(__dirname,'..');
const b=JSON.parse(fs.readFileSync(path.join(r,'bdrs.json'),'utf8')).bdrs,a=JSON.parse(fs.readFileSync(path.join(r,'analise.json'),'utf8')),m=a.analise||{};
if((a.atualizados??Object.keys(m).length)/b.length<.7)throw new Error('cobertura analitica atualizada abaixo de 70%');
Object.entries(m).forEach(([t,x])=>{if(!b.some(v=>v.ticker===t))throw new Error(t+' fora da base');if(x.fator<=0)throw new Error(t+' fator invalido');if(x.paridade!==null&&x.paridade!==undefined&&x.paridade<=0)throw new Error(t+' paridade invalida');});
console.log('OK: '+(a.atualizados??Object.keys(m).length)+'/'+b.length+' BDRs com ativo lastro atualizado');
