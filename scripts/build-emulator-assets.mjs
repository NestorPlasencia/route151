// Recursos oficiales fijados por versión y SHA-256; nunca descarga ROMs ni SAVs.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
const assets=JSON.parse(await readFile(new URL('./emulator-assets.json',import.meta.url),'utf8'));
for(const {path,sha256} of assets){
 const file=new URL(`../public/vendor/emulatorjs/${path}`,import.meta.url);
 const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
 let bytes;try{bytes=await readFile(file)}catch{}
 if(bytes&&hash(bytes)===sha256)continue;
 const response=await fetch(`https://cdn.emulatorjs.org/4.2.3/data/${path}`,{signal:AbortSignal.timeout(45000)});
 if(!response.ok)throw new Error(`EmulatorJS ${path}: HTTP ${response.status}`);
 bytes=Buffer.from(await response.arrayBuffer());
 if(hash(bytes)!==sha256)throw new Error(`EmulatorJS ${path}: SHA-256 mismatch`);
 await mkdir(dirname(fileURLToPath(file)),{recursive:true});await writeFile(file,bytes);
}
console.log(`EmulatorJS 4.2.3 / mGBA: ${assets.length} recursos verificados`);
