// Medida reproducible del JavaScript que sirve el HTML inicial de produccion.
import {readFile} from 'node:fs/promises';
import {gzipSync} from 'node:zlib';
const html=await readFile('.next/server/app/index.html','utf8');
const scripts=[...new Set([...html.matchAll(/<script[^>]*src="([^"]+)"/g)].map(x=>x[1]).filter(x=>x.startsWith('/_next/static/')))];
let bytes=0,gzip=0;
for(const url of scripts){const b=await readFile('.next/'+url.slice(7));bytes+=b.length;gzip+=gzipSync(b).length;}
console.log(JSON.stringify({scripts:scripts.length,bytes,gzipBytes:gzip},null,2));
