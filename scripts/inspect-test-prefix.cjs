const fs=require('fs');const base=fs.readFileSync('scripts/test-generation-access.cjs','utf8');const head=base.slice(0,base.indexOf('(async () =>'));console.log(base.includes('(async () =>'));
