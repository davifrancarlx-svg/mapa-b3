const fs=require('fs'),path=require('path');
const raiz=path.join(__dirname,'..'),raw=fs.readFileSync(path.join(raiz,'index.html'),'utf8'),marca='const D = ',ini=raw.indexOf(marca)+marca.length;
let nivel=0,texto=false,escape=false,fim=-1;for(let i=ini;i<raw.length;i++){const c=raw[i];if(texto){if(escape)escape=false;else if(c==='\\')escape=true;else if(c==='"')texto=false;continue;}if(c==='"'){texto=true;continue;}if(c==='{')nivel++;else if(c==='}'&&--nivel===0){fim=i+1;break;}}
const empresas=JSON.parse(raw.slice(ini,fim)).empresas,m=JSON.parse(fs.readFileSync(path.join(raiz,'metricas-empresas.json'),'utf8')),n=Object.keys(m.metricas||{}).length;
const negociaveis=empresas.filter(e=>e.tickers).length;if(n/negociaveis<.85)throw new Error('cobertura abaixo de 85%');
Object.entries(m.metricas).forEach(([k,v])=>{if(!empresas.some(e=>e.cod===k))throw new Error(k+' fora da base');if(v.d20<0||v.d20>20||v.g20<0)throw new Error(k+' metricas invalidas');});
console.log('OK: '+n+'/'+empresas.length+' empresas com metricas historicas');
