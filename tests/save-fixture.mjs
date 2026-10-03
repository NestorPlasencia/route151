// Datos sinteticos con el formato publicado por pret; no contienen ROM ni partidas.
export const sizes=[0xF24,0xF80,0xF80,0xF80,0xEE8,...Array(8).fill(0xF80),0x7D0];
const locations=[[0,1,2,3],[0,1,3,2],[0,2,1,3],[0,3,1,2],[0,2,3,1],[0,3,2,1],[1,0,2,3],[1,0,3,2],[2,0,1,3],[3,0,1,2],[2,0,3,1],[3,0,2,1],[1,2,0,3],[1,3,0,2],[2,1,0,3],[3,1,0,2],[2,3,0,1],[3,2,0,1],[1,2,3,0],[1,3,2,0],[2,1,3,0],[3,1,2,0],[2,3,1,0],[3,2,1,0]];
export function mon({pid=2400,n=25,party=true,language=2}={}){
 const bytes=new Uint8Array(party?100:80),v=new DataView(bytes.buffer),secure=new Uint8Array(48),s=new DataView(secure.buffer);
 v.setUint32(0,pid,true);v.setUint32(4,1234,true);bytes.fill(0xFF,8,18);bytes[8]=0xCA;bytes[9]=0xDD;bytes[18]=language;bytes[19]=2;
 const [g,a,e,m]=locations[pid%24].map(x=>x*12);s.setUint16(g,n,true);s.setUint32(g+4,125000,true);s.setUint16(a,85,true);s.setUint16(a+2,33,true);
 // Orden SRAM: hp, atk, def, speed, spa, spd.
 secure[e]=252;secure[e+3]=252;
 let iv=0;for(const [i,value] of [31,30,29,26,28,27].entries())iv=(iv|(value<<(5*i)))>>>0;s.setUint32(m+4,iv,true);
 let sum=0;for(let i=0;i<48;i+=2)sum=(sum+s.getUint16(i,true))&0xFFFF;v.setUint16(28,sum,true);
 for(let i=0;i<48;i+=4)v.setUint32(32+i,(s.getUint32(i,true)^pid^1234)>>>0,true);
 if(party){bytes[84]=50;for(const [i,value] of [100,142,75,49,139,69,58].entries())v.setUint16(86+i*2,value,true)}
 return bytes;
}
export function blocks(pid=2400){
 const info=new Uint8Array(0xF24),world=new Uint8Array(0x3D68),pc=new Uint8Array(0x83D0),iv=new DataView(info.buffer),wv=new DataView(world.buffer);
 info.fill(0xFF,0,8);info[0]=2;info[1]=0x14;iv.setUint32(10,1234,true);iv.setUint16(14,12,true);info[16]=34;iv.setUint32(0xF20,0xAABB1122,true);
 info[0x28+3]=1;info[0x5C+3]=1; // Pikachu obtenido/visto.
 world[0x34]=1;world.set(mon({pid}),0x38);world[0xEE0+(0x820>>3)]|=1<<(0x820&7);
 wv.setUint16(0x3B8,262,true);wv.setUint16(0x3BA,1^0x1122,true); // Old Rod.
 pc.set(mon({party:false}),4);
 return [info,world,pc];
}
export function writeSlot(bytes,start,counter,data=blocks(),rotation=0){
 const sections=[data[0],...Array.from({length:4},(_,i)=>data[1].slice(i*0xF80,(i+1)*0xF80)),...Array.from({length:9},(_,i)=>data[2].slice(i*0xF80,(i+1)*0xF80))];
 for(let id=0;id<14;id++){
  const at=start+((id+rotation)%14)*0x1000,v=new DataView(bytes.buffer,at,0x1000);bytes.set(sections[id],at);
  let sum=0;for(let i=0;i<sizes[id];i+=4)sum=(sum+v.getUint32(i,true))>>>0;
  v.setUint16(0xFF4,id,true);v.setUint16(0xFF6,((sum>>>16)+(sum&0xFFFF))&0xFFFF,true);v.setUint32(0xFF8,0x08012025,true);v.setUint32(0xFFC,counter,true);
 }
}
export function fixture({first=20,second=21,pid=2400}={}){const bytes=new Uint8Array(0x20000);bytes.fill(0xFF);writeSlot(bytes,0,first,blocks(pid),3);writeSlot(bytes,0xE000,second,blocks(pid),9);return bytes}
