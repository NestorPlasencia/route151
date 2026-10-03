// Lector de SRAM/flash de FRLG. Solo interpreta bytes; nunca modifica el SAV.
import type {TeamMon} from './battle';

export type SaveCatalog={version:number;source:string;species:Record<number,{n:number;name:string;base:number[];growth:string;abilities:string[]}>;moves:Record<number,string>;items:Record<number,{key:string;name:string}>;natures:Record<number,string>;characters:Record<number,string>;badges:{name:string;flag:number}[];progress:{name?:string;id?:string;flag:number}[]};
export type SavedPokemon={id:string;n:number;name:string;nickname:string;level:number;nature:string;ability:string;moves:(string|null)[];ivs:number[];evs:number[];stats:number[];hp:number|null;egg:boolean;shiny:boolean;heldItem:number;box:number|null};
export type GameSave={trainer:string;trainerId:number;playTime:string;counter:number;recovered:boolean;party:SavedPokemon[];boxes:SavedPokemon[];owned:number[];seen:number[];badges:string[];flags:Set<number>;keyItems:{id:number;name:string;key:string;quantity:number}[];location:{group:number;map:number;x:number;y:number}};
export type SaveErrorCode='size'|'integrity'|'format'|'pokemon'|'language';
export class SaveFileError extends Error {constructor(public code:SaveErrorCode){super(`SAV: ${code}`)}}
const fail=(code:SaveErrorCode):never=>{throw new SaveFileError(code)};
const SIZES=[0xF24,0xF80,0xF80,0xF80,0xEE8,...Array<number>(8).fill(0xF80),0x7D0];
const bytesView=(bytes:Uint8Array)=>new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
const text=(bytes:Uint8Array,table:SaveCatalog['characters'])=>{let out='';for(const b of bytes){if(b===0xFF)break;out+=table[b]??'?'}return out.trim()};
const bits=(bytes:Uint8Array,max:number)=>Array.from({length:max},(_,i)=>i+1).filter(n=>(bytes[(n-1)>>3]&(1<<((n-1)&7)))!==0);
// Los cuatro bloques de un Pokemon se ordenan segun personalidad % 24.
function permutations(values:number[]):number[][] {return values.length?values.flatMap(v=>permutations(values.filter(x=>x!==v)).map(row=>[v,...row])):[[]]}
const ORDERS=permutations([0,1,2,3]);
export function experienceAt(level:number,growth:string){
 const l=level,cube=l*l*l;if(l<=1)return 0;
 switch(growth){
  case 'FAST':return Math.floor(4*cube/5);
  case 'SLOW':return Math.floor(5*cube/4);
  case 'MEDIUM_SLOW':return Math.floor(6*cube/5)-15*l*l+100*l-140;
  case 'ERRATIC':return l<=50?Math.floor(cube*(100-l)/50):l<=68?Math.floor(cube*(150-l)/100):l<=98?Math.floor(cube*Math.floor((1911-10*l)/3)/500):Math.floor(cube*(160-l)/100);
  case 'FLUCTUATING':return l<=15?Math.floor(cube*(Math.floor((l+1)/3)+24)/50):l<=36?Math.floor(cube*(l+14)/50):Math.floor(cube*(Math.floor(l/2)+32)/50);
  case 'MEDIUM_FAST':return cube;
  default:return fail('format');
 }
}
const levelOf=(experience:number,growth:string)=>{let level=1;while(level<100&&experience>=experienceAt(level+1,growth))level++;return level};
// Orden del juego: PS, ataque, defensa, velocidad, ataque especial, defensa especial.
const statOrder=[0,1,2,4,5,3];
function boxStats(species:SaveCatalog['species'][number],level:number,ivs:number[],evs:number[],nature:number){
 const raised=Math.floor(nature/5),lowered=nature%5;
 return species.base.map((base,i)=>{const raw=Math.floor((2*base+ivs[i]+Math.floor(evs[i]/4))*level/100);if(i===0)return species.n===292?1:raw+level+10;const gameStat=statOrder[i]-1,mod=raised===lowered?1:gameStat===raised?1.1:gameStat===lowered?.9:1;return Math.floor((raw+5)*mod)});
}
function pokemon(bytes:Uint8Array,catalog:SaveCatalog,box:number|null):SavedPokemon|null{
 const view=bytesView(bytes),pid=view.getUint32(0,true),ot=view.getUint32(4,true);
 if(!(bytes[19]&2)){if(bytes.every(b=>b===0||b===0xFF))return null;return fail('pokemon')}
 if(bytes[19]&1)return fail('pokemon'); // Bad Egg: no importar datos corruptos.
 if(bytes[18]===1)return fail('language'); // Los nombres japoneses requieren otra tabla.
 const secure=new Uint8Array(48),data=bytesView(secure),key=(pid^ot)>>>0;
 for(let at=0;at<48;at+=4)data.setUint32(at,(view.getUint32(32+at,true)^key)>>>0,true);
 let checksum=0;for(let at=0;at<48;at+=2)checksum=(checksum+data.getUint16(at,true))&0xFFFF;
 if(checksum!==view.getUint16(28,true))return fail('pokemon');
 const order=ORDERS[pid%24],block=(type:number)=>order.indexOf(type)*12;
 const g=block(0),a=block(1),e=block(2),m=block(3),species=catalog.species[data.getUint16(g,true)];
 if(!species)return fail('pokemon');
 const ivBits=data.getUint32(m+4,true),ivs=statOrder.map(i=>(ivBits>>>(i*5))&31),evs=statOrder.map(i=>secure[e+i]);
 const nature=pid%25,egg=!!(ivBits&0x40000000),level=box===null?bytes[84]:levelOf(data.getUint32(g+4,true),species.growth);
 if(level<1||level>100||evs.reduce((sum,n)=>sum+n,0)>510)return fail('pokemon');
 const moves=Array.from({length:4},(_,i)=>{const id=data.getUint16(a+i*2,true);if(id>354)return fail('pokemon');return id?catalog.moves[id]??fail('pokemon'):null});
 const stats=box===null?[88,90,92,96,98,94].map(at=>view.getUint16(at,true)):boxStats(species,level,ivs,evs,nature);
 const hp=box===null?view.getUint16(86,true):null;
 if(stats.some(s=>s<1||s>999)||(hp!==null&&hp>stats[0]))return fail('pokemon');
 const shiny=((ot&0xFFFF)^(ot>>>16)^(pid&0xFFFF)^(pid>>>16))<8;
 return {id:`sav-${ot.toString(16)}-${pid.toString(16)}`,n:species.n,name:species.name,nickname:text(bytes.subarray(8,18),catalog.characters),level,nature:catalog.natures[nature],ability:species.abilities[ivBits>>>31]??species.abilities[0],moves,ivs,evs,stats,hp,egg,shiny,heldItem:data.getUint16(g+2,true),box};
}
type Slot={counter:number;sections:Uint8Array[]};
function slot(bytes:Uint8Array,start:number):Slot|null{
 const sections:Uint8Array[]=[],counters=new Set<number>();
 for(let sector=0;sector<14;sector++){
  const chunk=bytes.subarray(start+sector*0x1000,start+(sector+1)*0x1000),v=bytesView(chunk),id=v.getUint16(0xFF4,true);
  if(v.getUint32(0xFF8,true)!==0x08012025||id>13||sections[id])return null;
  let sum=0;for(let i=0;i<SIZES[id];i+=4)sum=(sum+v.getUint32(i,true))>>>0;
  if((((sum>>>16)+(sum&0xFFFF))&0xFFFF)!==v.getUint16(0xFF6,true))return null;
  counters.add(v.getUint32(0xFFC,true));sections[id]=chunk.slice(0,SIZES[id]);
 }
 return counters.size===1?{counter:[...counters][0],sections}:null;
}
const concat=(parts:Uint8Array[])=>{const out=new Uint8Array(parts.reduce((sum,p)=>sum+p.length,0));let at=0;for(const part of parts){out.set(part,at);at+=part.length}return out};
export function parseGameSave(input:ArrayBuffer|Uint8Array,catalog:SaveCatalog):GameSave{
 const bytes=input instanceof Uint8Array?input:new Uint8Array(input);
 if(bytes.length!==0x20000)return fail('size');
 if(catalog.version!==1||Object.keys(catalog.species).length!==386)return fail('format');
 const first=slot(bytes,0),second=slot(bytes,0xE000);
 if(!first&&!second)return fail('integrity');
 const chosen=first&&second?(((second.counter-first.counter)>>>0)<0x80000000?second:first):first??second!;
 const info=chosen.sections[0],world=concat(chosen.sections.slice(1,5)),pc=concat(chosen.sections.slice(5)),iv=bytesView(info),wv=bytesView(world);
 if(world.length!==0x3D68||pc.length!==0x83D0||world[0x34]>6||info[8]>1||info[16]>59||info[17]>59||pc[0]>13)return fail('format');
 const party:SavedPokemon[]=[],boxes:SavedPokemon[]=[];
 for(let i=0;i<world[0x34];i++){const mon=pokemon(world.subarray(0x38+i*100,0x38+(i+1)*100),catalog,null);if(!mon)return fail('pokemon');party.push(mon)}
 for(let i=0;i<420;i++){const mon=pokemon(pc.subarray(4+i*80,4+(i+1)*80),catalog,Math.floor(i/30)+1);if(mon)boxes.push(mon)}
 const flags=new Set<number>();for(let n=0;n<0x900;n++)if(world[0xEE0+(n>>3)]&(1<<(n&7)))flags.add(n);
 const bagKey=iv.getUint32(0xF20,true)&0xFFFF,keyItems:GameSave['keyItems']=[];
 for(const [start,count] of [[0x3B8,30],[0x464,58]])for(let i=0;i<count;i++){
  const at=start+i*4,id=wv.getUint16(at,true);if(!id)continue;
  const item=catalog.items[id],quantity=wv.getUint16(at+2,true)^bagKey;
  if(!item||quantity<1||quantity>999)return fail('format');
  if(start===0x3B8||item.key.startsWith('ITEM_HM'))keyItems.push({id,...item,quantity});
 }
 const unused=first?bytes.subarray(0xE000,0x1C000):bytes.subarray(0,0xE000);
 return {trainer:text(info.subarray(0,8),catalog.characters),trainerId:iv.getUint32(10,true),playTime:`${iv.getUint16(14,true)}:${String(info[16]).padStart(2,'0')}`,counter:chosen.counter,recovered:(!first||!second)&&unused.some(b=>b!==0&&b!==0xFF),party,boxes,owned:bits(info.subarray(0x28,0x5C),386),seen:bits(info.subarray(0x5C,0x90),386),badges:catalog.badges.filter(b=>flags.has(b.flag)).map(b=>b.name),flags,keyItems,location:{x:wv.getInt16(0,true),y:wv.getInt16(2,true),group:world[4],map:world[5]}};
}
export function savedTeam(mon:SavedPokemon,bench=false):TeamMon{return {id:mon.id,n:mon.n,level:mon.level,nature:mon.nature,ability:mon.ability,moves:mon.moves,stats:mon.stats,out:mon.hp===0,bench,guess:[],nickname:mon.nickname,speciesName:mon.name,ivs:mon.ivs,evs:mon.evs}}
