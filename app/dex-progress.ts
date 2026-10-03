import type {Dex} from './lists';
import type {Marker} from './shared';
export const uidsOf=(byId:Map<string,Marker>,s:Dex['species'][number])=>[...new Set(s.found.flatMap(f=>f.ids.flatMap(id=>{const m=byId.get(id);return m?[m.uid]:[]})))];
// Un SAV confirma una especie, nunca el lugar donde se obtuvo.
export const caughtSpecies=(dex:Dex,byId:Map<string,Marker>,done:number[],manual:number[],imported:number[]=[])=>new Set(dex.species.filter(s=>{
 const uids=uidsOf(byId,s);return imported.includes(s.n)||(uids.length?uids.some(uid=>done.includes(uid)):manual.includes(s.n));
}).map(s=>s.n));
