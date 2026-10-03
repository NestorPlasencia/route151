import type {Battle} from './battle';
import {importBackup} from './backup-store';
import type {Game,World} from './games';
import {applySaveImport,prepareSaveImport,saveProgress,supportedPokemon} from './save-import';
import {parseGameSave,type SaveCatalog} from './save-file';
import type {SaveRecord} from './save-record';

export class RomError extends Error {constructor(public code:'rom'|'romGame'|'romLanguage'){super(code)}}
export function identifyRom(bytes:Uint8Array){
 if(bytes.length<0xC0||bytes.length>32*1024*1024||bytes[0xB2]!==0x96)throw new RomError('rom');
 let check=0x19;for(let i=0xA0;i<=0xBC;i++)check+=bytes[i];
 if(((-check)&255)!==bytes[0xBD])throw new RomError('rom');
 const code=new TextDecoder().decode(bytes.subarray(0xAC,0xB0));
 const game=code.startsWith('BPR')?'firered':code.startsWith('BPG')?'leafgreen':null;
 if(!game)throw new RomError('romGame');
 if(!['E','S'].includes(code[3]))throw new RomError('romLanguage');
 return {game,code,revision:bytes[0xBC]};
}
export async function saveFingerprint(bytes:Uint8Array){
 const hash=await crypto.subtle.digest('SHA-256',new Uint8Array(bytes).buffer);
 return Array.from(new Uint8Array(hash),b=>b.toString(16).padStart(2,'0')).join('');
}
type Store=Pick<Storage,'length'|'key'|'getItem'|'setItem'|'removeItem'>;
export class LiveSaveSync {
 private tail:Promise<unknown>=Promise.resolve();
 private stopped=false;
 private fingerprint:string|null=null;
 private first=true;
 constructor(private storage:Store,private game:Game,private games:readonly Game[],private catalog:SaveCatalog,private world:World,private battle:Battle,private team:boolean){}
 stop(){this.stopped=true}
 sync(input:Uint8Array){
  // Copiar antes de encolar: el core puede reutilizar su buffer mientras esperamos.
  const bytes=new Uint8Array(input);
  const job=this.tail.then(async()=>{
   if(this.stopped)return null;
   const save=parseGameSave(bytes,this.catalog),fingerprint=await saveFingerprint(bytes);
   if(this.stopped||fingerprint===this.fingerprint)return null;
   const record:SaveRecord={version:1,game:this.game.id,filename:`${this.game.short}.sav`,importedAt:new Date().toISOString(),fingerprint,snapshot:{...save,flags:[...save.flags]}};
   const teamUpdated=this.team&&save.party.filter(m=>!m.egg).every(m=>supportedPokemon(save,this.battle).includes(m));
   const before=new Set(JSON.parse(this.storage.getItem(this.game.storage.done)??'[]') as number[]);
   const next=prepareSaveImport(this.storage,this.game,this.games,record,this.catalog,this.world,this.battle,{team:teamUpdated,boxes:false,merge:true});
   // La copia para deshacer pertenece a toda la sesión, no al último intervalo.
   if(this.first)applySaveImport(this.storage,next,this.game.id);else importBackup(this.storage,next);
   this.first=false;this.fingerprint=fingerprint;
   return {record,teamUpdated,added:saveProgress(save,this.catalog,this.world.markers).filter(uid=>!before.has(uid)).length};
  });
  this.tail=job.catch(()=>{}); // Un error no impide reintentar el mismo guardado.
  return job;
 }
}
