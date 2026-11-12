import {mkdir,copyFile,cp,rm} from 'node:fs/promises';
await rm('dist',{recursive:true,force:true}); await mkdir('dist');
for(const file of ['index.html','style.css','_headers']) await copyFile(file,`dist/${file}`);
await cp('src','dist/src',{recursive:true});
console.log('Cloudflare Pages output: dist');
