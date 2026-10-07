// Lectura en vivo de FRLG desde la RAM del emulador. Usa los mismos bloques que el SAV:
// en RAM, SaveBlock1/2 y las cajas ya contienen flags, Pokédex y mochila al momento.
// El equipo vivo está en gPlayerParty; SaveBlock1 solo lo copia al guardar.
import {parseSaveBlocks,type GameSave,type SaveCatalog} from './save-file';

const EWRAM=0x02000000,EWRAM_SIZE=0x40000,IWRAM_SIZE=0x8000;
const INFO=0xF24,WORLD=0x3D68,PC=0x83D0,PARTY_COUNT=0x34,PARTY=0x38,MON=100;
// Símbolos de pret: iguales en FireRed y LeafGreen, rev0 y rev1 (gSaveBlock1Ptr,
// gSaveBlock2Ptr y gPokemonStoragePtr van seguidos). Otras ediciones se buscan por su forma.
export const FRLG_RAM={pointers:0x5008,partyCount:0x24029,party:0x24284};
type Layout={pointers:number;partyCount:number|null;party:number};
const view=(b:Uint8Array)=>new DataView(b.buffer,b.byteOffset,b.byteLength);

function blocks(iwram:Uint8Array,ewram:Uint8Array,at:number){
 if(at<0||at+12>IWRAM_SIZE)return null;
 const v=view(iwram),[world,info,pc]=[0,4,8].map(i=>v.getUint32(at+i,true)-EWRAM),sizes=[WORLD,INFO,PC];
 if(![world,info,pc].every((p,i)=>p>=0&&p%4===0&&p+sizes[i]<=EWRAM_SIZE))return null;
 return {world,info,pc};
}
// Un Pokémon de equipo válido: descifrado con checksum correcto y nivel posible.
function validMon(ewram:Uint8Array,at:number,ot?:number){
 if(at<0||at+MON>EWRAM_SIZE||!(ewram[at+19]&2)||ewram[at+19]&1)return false;
 const v=view(ewram),pid=v.getUint32(at,true),owner=v.getUint32(at+4,true);
 if(ot!==undefined&&owner!==ot)return false;
 const key=(pid^owner)>>>0;let sum=0;
 for(let i=32;i<80;i+=4){const w=(v.getUint32(at+i,true)^key)>>>0;sum=(sum+(w&0xFFFF)+(w>>>16))&0xFFFF}
 return sum===v.getUint16(at+28,true)&&ewram[at+84]>=1&&ewram[at+84]<=100;
}
export class LiveRam{
 private layout:Layout|null=null;
 constructor(private catalog:SaveCatalog){}
 read(iwram:Uint8Array,ewram:Uint8Array):GameSave|null{
  if(iwram.length!==IWRAM_SIZE||ewram.length!==EWRAM_SIZE)return null;
  for(const layout of this.layout?[this.layout]:[FRLG_RAM,...this.discover(iwram,ewram)]){
   const save=this.parse(iwram,ewram,layout);
   if(save){this.layout=layout;return save}
  }
  return null;
 }
 private parse(iwram:Uint8Array,ewram:Uint8Array,layout:Layout):GameSave|null{
  const at=blocks(iwram,ewram,layout.pointers);if(!at)return null;
  const world=ewram.slice(at.world,at.world+WORLD),info=ewram.subarray(at.info,at.info+INFO),pc=ewram.subarray(at.pc,at.pc+PC);
  let count=layout.partyCount===null?0:ewram[layout.partyCount];
  if(layout.partyCount===null)while(count<6&&validMon(ewram,layout.party+count*MON))count++;
  if(count<1||count>6)return null; // Sin equipo aún (intro o pantalla de título): nada que registrar.
  world[PARTY_COUNT]=count;world.fill(0,PARTY,PARTY+6*MON);world.set(ewram.subarray(layout.party,layout.party+count*MON),PARTY);
  try{
   const save=parseSaveBlocks(info,world,pc,this.catalog);
   return save.trainer&&save.party.length===count?save:null;
  }catch{return null} // Un fotograma a medias o un menú intermedio: se reintenta en la siguiente lectura.
 }
 // Otras revisiones o idiomas: punteros seguidos a bloques válidos y un equipo cuyo
 // primer Pokémon pertenece al entrenador, fuera de la copia guardada en SaveBlock1.
 private discover(iwram:Uint8Array,ewram:Uint8Array):Layout[]{
  const found:Layout[]=[];
  for(let p=0;p+12<=IWRAM_SIZE&&found.length<4;p+=4){
   const at=blocks(iwram,ewram,p);if(!at||ewram[at.info+8]>1||ewram[at.info+16]>59)continue;
   const ot=view(ewram).getUint32(at.info+10,true);
   for(let q=0;q+MON<=EWRAM_SIZE;q+=4){
    if(q>=at.world&&q<at.world+WORLD)continue;
    if(validMon(ewram,q,ot)){found.push({pointers:p,partyCount:null,party:q});break}
   }
  }
  return found;
 }
}
// Huella del avance (no del tiempo ni la posición): evita escribir cada segundo.
export function progressKey(save:GameSave,progress:number[]){
 return JSON.stringify([progress,save.owned,save.seen,save.badges,save.keyItems.map(i=>[i.id,i.quantity]),save.party.map(m=>[m.id,m.n,m.level,m.moves,m.hp===0,m.nickname]),save.boxes.map(m=>[m.id,m.n,m.level,m.box])]);
}
