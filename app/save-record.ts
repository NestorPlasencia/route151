import type {GameSave} from './save-file';
export type SaveRecord={version:1;game:string;filename:string;importedAt:string;fingerprint:string;snapshot:Omit<GameSave,'flags'>&{flags:number[]}};
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const int=(v:unknown,min:number,max:number)=>Number.isInteger(v)&&Number(v)>=min&&Number(v)<=max;
const numbers=(v:unknown,min:number,max:number,length?:number)=>Array.isArray(v)&&(length===undefined?v.length<=max-min+1&&new Set(v).size===v.length:v.length===length)&&v.every(n=>int(n,min,max));
const str=(v:unknown,max=200)=>typeof v==='string'&&v.length<=max;
const mons=(v:unknown,max:number)=>Array.isArray(v)&&v.length<=max&&v.every(m=>object(m)&&str(m.id)&&int(m.n,1,386)&&str(m.name)&&str(m.nickname)&&int(m.level,1,100)&&str(m.nature)&&str(m.ability)&&Array.isArray(m.moves)&&m.moves.length===4&&m.moves.every((s:unknown)=>s===null||str(s))&&numbers(m.ivs,0,31,6)&&numbers(m.evs,0,255,6)&&(m.evs as number[]).reduce((a,b)=>a+b,0)<=510&&numbers(m.stats,1,999,6)&&(m.hp===null||int(m.hp,0,(m.stats as number[])[0]))&&typeof m.egg==='boolean'&&typeof m.shiny==='boolean'&&int(m.heldItem,0,376)&&(m.box===null||int(m.box,1,14)));
export function validSaveRecord(value:unknown):value is SaveRecord{
 if(!object(value)||value.version!==1||!['firered','leafgreen'].includes(String(value.game))||!str(value.filename)||!str(value.importedAt)||!Number.isFinite(Date.parse(String(value.importedAt)))||typeof value.fingerprint!=='string'||! /^[a-f0-9]{64}$/.test(value.fingerprint)||!object(value.snapshot))return false;
 const s=value.snapshot;
 return str(s.trainer)&&int(s.trainerId,0,0xFFFFFFFF)&&str(s.playTime)&&int(s.counter,0,0xFFFFFFFF)&&typeof s.recovered==='boolean'&&mons(s.party,6)&&mons(s.boxes,420)&&numbers(s.owned,1,386)&&numbers(s.seen,1,386)&&numbers(s.flags,0,0x8FF)&&Array.isArray(s.badges)&&s.badges.length<=8&&s.badges.every(b=>str(b))&&Array.isArray(s.keyItems)&&s.keyItems.length<=88&&s.keyItems.every(i=>object(i)&&int(i.id,1,376)&&str(i.name)&&str(i.key)&&int(i.quantity,1,999))&&object(s.location)&&int(s.location.group,0,255)&&int(s.location.map,0,255)&&int(s.location.x,-32768,32767)&&int(s.location.y,-32768,32767);
}
