const fs=require('fs'),path=require('path'),s=JSON.parse(fs.readFileSync(path.join(__dirname,'..','saude.json'),'utf8'));
if(!s.geradoEm||!s.fontes)throw new Error('saude.json incompleto');if(s.estado!=='ok'){console.error(s.avisos.join('\n'));process.exit(1);}console.log('OK: saude dos dados sem alertas');
