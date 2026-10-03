import type {Battle,TeamMon} from './battle';
import type {Game,World} from './games';
import {collectBackup,importBackup,parseBackup,type Backup} from './backup-store';
import {savedTeam,type GameSave,type SaveCatalog} from './save-file';
import {validSaveRecord,type SaveRecord} from './save-record';
export const PREVIOUS_SAVE='route151-sav-previous';
type Store=Pick<Storage,'length'|'key'|'getItem'|'setItem'|'removeItem'>;
export function saveProgress(save:GameSave,catalog:SaveCatalog,markers:World['markers']){
 const proven=[...catalog.badges,...catalog.progress].filter(entry=>save.flags.has(entry.flag));
 return [...new Set(markers.filter(m=>proven.some(p=>('id' in p&&p.id===m.id)||('name' in p&&p.name===m.name))).map(m=>m.uid))];
}
export function supportedPokemon(save:GameSave,battle:Battle){return [...save.party,...save.boxes].filter(m=>!m.egg&&!!battle.species[m.n]&&m.moves.every(move=>!move||!!battle.moves[move]))}
export function prepareSaveImport(storage:Store,game:Game,games:readonly Game[],record:SaveRecord,catalog:SaveCatalog,world:World,battle:Battle,options:{team:boolean;boxes:boolean;merge:boolean}):Backup{
 if(game.gen!==3||record.game!==game.id||!validSaveRecord(record))throw new Error('Invalid save import');
 const previous=parseBackup(collectBackup(storage),games),data={...previous.data},s=record.snapshot,save={...s,flags:new Set(s.flags)};
 const doneKey=game.storage.done,dexKey=game.storage.dex,teamKey=`${doneKey}-team`;
 const array=(key:string)=>JSON.parse(data[key]??'[]') as number[];
 data[doneKey]=JSON.stringify([...new Set([...(options.merge?array(doneKey):[]),...saveProgress(save,catalog,world.markers)])]);
 // Guardar especies conocidas sin inventar la ruta ni el regalo de procedencia.
 data[dexKey]=JSON.stringify(options.merge?array(dexKey):[]);
 if(!options.merge){data[`${doneKey}-skip`]='[]';delete data[`${doneKey}-last`]}
 if(options.team){
  const compatible=supportedPokemon(save,battle),party=s.party.filter(m=>compatible.includes(m));
  if(party.length!==s.party.filter(m=>!m.egg).length)throw new Error('Unsupported party');
  const imported=[...party.map(m=>savedTeam(m)),...(options.boxes?s.boxes.filter(m=>compatible.includes(m)).map(m=>savedTeam(m,true)):[])];
  // Los clones pueden compartir personalidad y entrenador: el slot los distingue.
  const ids=new Set<string>();for(const mon of imported){const base=mon.id;let n=1;while(ids.has(mon.id))mon.id=`${base}-${n++}`;ids.add(mon.id)}
  const old=JSON.parse(data[teamKey]??'[]') as TeamMon[];
  data[teamKey]=JSON.stringify([...imported,...old.filter(m=>!ids.has(m.id)).map(m=>({...m,bench:true}))]);
 }
 data[`${doneKey}-sav`]=JSON.stringify(record);
 data['ruta151-game']=game.id;
 return parseBackup({...previous,date:new Date().toISOString(),data},games);
}
export function applySaveImport(storage:Store,next:Backup,gameId:string){
 const oldUndo=storage.getItem(PREVIOUS_SAVE),previous=collectBackup(storage);
 storage.setItem(PREVIOUS_SAVE,JSON.stringify({game:gameId,backup:previous})); // Antes de modificar el progreso.
 try{importBackup(storage,next)}catch(error){try{if(oldUndo===null)storage.removeItem(PREVIOUS_SAVE);else storage.setItem(PREVIOUS_SAVE,oldUndo)}catch{/* Conservar el error y el diario de recuperacion. */}throw error}
}
export function undoSaveImport(storage:Store,games:readonly Game[]){
 const previous=storage.getItem(PREVIOUS_SAVE);if(!previous)throw new Error('No previous save');
 const value=JSON.parse(previous) as {game:string;backup:Backup},game=games.find(g=>g.id===value.game);if(!game)throw new Error('Invalid previous game');
 const old=parseBackup(value.backup,games),current=collectBackup(storage),data={...current.data};
 for(const key of Object.keys(data))if(key===game.storage.done||key.startsWith(`${game.storage.done}-`))delete data[key];
 for(const [key,entry] of Object.entries(old.data))if(key===game.storage.done||key.startsWith(`${game.storage.done}-`))data[key]=entry;
 data['ruta151-game']=game.id;
 importBackup(storage,parseBackup({...current,data},games));storage.removeItem(PREVIOUS_SAVE);
}
