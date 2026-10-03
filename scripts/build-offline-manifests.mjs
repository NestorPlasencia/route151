// Se ejecuta despues de next build: incluye tambien los chunks de vistas que
// todavia no se han abierto. Ninguna lista depende de la navegacion del usuario.
import {readdir,readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {join,relative} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../',import.meta.url));
export async function files(dir){
 const out=[];
 for(const entry of await readdir(dir,{withFileTypes:true})){
  const path=join(dir,entry.name);
  if(entry.isDirectory())out.push(...await files(path));else out.push(path);
 }
 return out;
}
export async function buildManifests(){
 const publicRoot=join(root,'public'),catalog=JSON.parse(await readFile(join(root,'app/games.json'),'utf8'));
 const staticFiles=await files(join(root,'.next/static'));
 const common=[...await files(join(publicRoot,'icons')),...await files(join(publicRoot,'data')),...await files(join(publicRoot,'vendor'))];
 await mkdir(join(publicRoot,'offline'),{recursive:true});
 for(const game of catalog){
  const prefix=game.data.split('/')[1],local=[...common,...await files(join(publicRoot,prefix))];
  const assets=new Set(['/','/manifest.webmanifest','/favicon.svg']);
  const hash=createHash('sha256');
  for(const file of [...staticFiles,...local].sort((a,b)=>a.localeCompare(b))){
   const url=file.startsWith(publicRoot)?'/'+relative(publicRoot,file).replaceAll('\\','/'):'/_next/static/'+relative(join(root,'.next/static'),file).replaceAll('\\','/');
   // Las dos versiones comparten mapas, pero el catalogo de sprites externos
   // solo necesita los encuentros correspondientes a este juego.
   if(/(?:encounters|pokedex)-(?:yellow|firered|leafgreen)\.json$/.test(url)&&!url.endsWith(`-${game.version}.json`))continue;
   const bytes=await readFile(file);hash.update(url).update(bytes);assets.add(url);
   if(file.endsWith('.json')){
    const walk=value=>{
     if(typeof value==='string'&&value.startsWith('https://raw.githubusercontent.com/'))assets.add(value);
     else if(Array.isArray(value))value.forEach(walk);
     else if(value&&typeof value==='object'&&(!value.version||value.version===game.version))Object.values(value).forEach(walk);
    };
    walk(JSON.parse(bytes));
   }
  }
  const manifest={game:game.id,revision:hash.digest('hex'),assets:[...assets].sort()};
  await writeFile(join(publicRoot,'offline',`${game.id}.json`),JSON.stringify(manifest));
  console.log(`offline ${game.id}: ${assets.size} archivos, ${manifest.assets.filter(x=>x.startsWith('https:')).length} sprites externos`);
 }
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1])await buildManifests();
