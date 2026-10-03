// Guardados publicos de prueba. No se incorporan al repositorio ni al sitio.
import {mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const base='https://raw.githubusercontent.com/ReignOfComputer/RoCs-PC/master/06%20-%20Gen%20III%20-%20FRLG%20Collection/Save%20Data/';
const samples=[['Pokemon Fire Red.sav','44ce64a4fefa9d9b2661a09d34055bf77249fcd9524f04be8f317688e999cd8b'],['Pokemon Leaf Green.sav','d6a0aac28fea111d96e4a7d0a3c1d8c82bbcddb8e6a622784df92aca0aa9a753']];
await mkdir('outputs/sav',{recursive:true});
for(const [name,hash] of samples){
 const response=await fetch(base+encodeURIComponent(name));if(!response.ok)throw new Error(`HTTP ${response.status}: ${name}`);
 const bytes=Buffer.from(await response.arrayBuffer());if(bytes.length!==131072||createHash('sha256').update(bytes).digest('hex')!==hash)throw new Error(`Sample changed: ${name}`);
 await writeFile(`outputs/sav/${name}`,bytes);console.log(`outputs/sav/${name} (${bytes.length} bytes, SHA-256 comprobado)`);
}
