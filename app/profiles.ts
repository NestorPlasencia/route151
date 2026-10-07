// Cada partida real (emulador o SAV) tiene su propia lista, separada de la que se marca
// a mano. Se identifica por el ID del entrenador y usa las mismas claves que un juego,
// con otro prefijo: ruta151-firered~p0a1b2c3d, ruta151-firered~p0a1b2c3d-dex, -team, -sav…
import type {Game} from './games';
import type {GameSave} from './save-file';
import {validSaveRecord} from './save-record';

type Store=Pick<Storage,'length'|'key'|'getItem'>;
type ProfileGame=Pick<Game,'id'|'storage'>;
export type Profile={id:string;trainer:string;playTime:string;updated:string};
const PROFILE=/^p[0-9a-f]{8}$/;
export const validProfileId=(id:unknown):id is string=>typeof id==='string'&&PROFILE.test(id);
export const profileIdFor=(save:Pick<GameSave,'trainerId'>)=>`p${(save.trainerId>>>0).toString(16).padStart(8,'0')}`;
// La partida elegida para cada juego. Fuera del prefijo del juego: no se borra al reiniciar la lista manual.
export const activeProfileKey=(game:Pick<Game,'id'>)=>`ruta151-profile-${game.id}`;
export function profileGame<G extends ProfileGame>(game:G,id:string|null):G{
 if(!id)return game;
 if(!validProfileId(id))throw new Error('Invalid profile');
 const done=`${game.storage.done}~${id}`;
 return {...game,storage:{done,dex:`${done}-dex`}};
}
// La clave base del juego para una clave de partida, o null si no lo es.
export function profileOf(key:string):{base:string;id:string}|null{
 const match=/^(ruta151-[a-z0-9-]+?)~(p[0-9a-f]{8})(?:-.*)?$/.exec(key);
 return match?{base:match[1],id:match[2]}:null;
}
export function listProfiles(storage:Store,game:ProfileGame):Profile[]{
 const out:Profile[]=[];
 for(let i=0;i<storage.length;i++){
  const key=storage.key(i),found=key?profileOf(key):null;
  if(!key||!found||found.base!==game.storage.done||key!==`${found.base}~${found.id}-sav`)continue;
  try{
   const record:unknown=JSON.parse(storage.getItem(key)??'null');
   if(validSaveRecord(record)&&record.game===game.id)out.push({id:found.id,trainer:record.snapshot.trainer,playTime:record.snapshot.playTime,updated:record.importedAt});
  }catch{/* Una partida dañada no impide ver las demás. */}
 }
 return out.sort((a,b)=>b.updated.localeCompare(a.updated));
}
export function activeProfile(storage:Store,game:ProfileGame):string|null{
 try{const id=storage.getItem(activeProfileKey(game));return id&&listProfiles(storage,game).some(p=>p.id===id)?id:null}catch{return null}
}
// Para copias de seguridad: los juegos más una variante por cada partida presente.
export function withProfiles<G extends ProfileGame>(games:readonly G[],keys:Iterable<string>):G[]{
 const out=[...games],seen=new Set<string>();
 for(const key of keys){
  const found=profileOf(key),game=found&&games.find(g=>g.storage.done===found.base);
  if(!found||!game||seen.has(`${found.base}~${found.id}`))continue;
  seen.add(`${found.base}~${found.id}`);out.push(profileGame(game,found.id));
 }
 return out;
}
