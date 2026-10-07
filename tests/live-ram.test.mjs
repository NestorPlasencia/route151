import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {loadTypeScript} from './load-typescript.mjs';
import {blocks,mon} from './save-fixture.mjs';
const {LiveRam}=await loadTypeScript(new URL('../app/live-ram.ts',import.meta.url));
const {LiveSaveSync}=await loadTypeScript(new URL('../app/emulator-sync.ts',import.meta.url));
const json=async path=>JSON.parse(await readFile(new URL(path,import.meta.url),'utf8'));
const catalog=await json('../public/frlg/data/save-catalog.json'),battle=await json('../public/frlg/data/battle.json'),games=await json('../app/games.json'),game=games.find(g=>g.id==='firered');
// RAM sintética con la disposición de pret: punteros en IWRAM y bloques reubicados en EWRAM.
function ram({pointers=0x5008,count=0x24029,party=0x24284,members=[mon()]}={}){
 const [info,world,pc]=blocks(),iwram=new Uint8Array(0x8000),ewram=new Uint8Array(0x40000),iv=new DataView(iwram.buffer);
 world[0x34]=0;world.fill(0,0x38,0x38+600); // La copia de SaveBlock1 solo se actualiza al guardar.
 const at={world:0x27004,info:0x26000,pc:0x2B004};
 ewram.set(world,at.world);ewram.set(info,at.info);ewram.set(pc,at.pc);
 iv.setUint32(pointers,0x02000000+at.world,true);iv.setUint32(pointers+4,0x02000000+at.info,true);iv.setUint32(pointers+8,0x02000000+at.pc,true);
 ewram[count]=members.length;members.forEach((m,i)=>ewram.set(m,party+i*100));
 const flag=(n,on=true)=>{const i=at.world+0xEE0+(n>>3);ewram[i]=on?ewram[i]|1<<(n&7):ewram[i]&~(1<<(n&7))};
 return {iwram,ewram,flag,at};
}
await test('reads the live party, Pokédex, items and flags before the game is saved',()=>{
 const r=ram({members:[mon(),mon({pid:2401,n:1})]}),save=new LiveRam(catalog).read(r.iwram,r.ewram);
 assert.deepEqual(save.party.map(m=>m.n),[25,1]);assert.equal(save.trainerId,1234);assert.deepEqual(save.owned,[25]);
 assert.equal(save.boxes.length,1);assert.ok(save.keyItems.some(i=>i.id===262));
 const live=new LiveRam(catalog);r.flag(0x821);assert.ok(live.read(r.iwram,r.ewram).flags.has(0x821));
});
await test('an empty party, a broken pointer or a corrupt Pokémon is ignored instead of syncing',()=>{
 const empty=ram({members:[]});assert.equal(new LiveRam(catalog).read(empty.iwram,empty.ewram),null);
 const broken=ram();new DataView(broken.iwram.buffer).setUint32(0x500C,0x08000000,true);broken.ewram.fill(0,0x24284,0x24284+100);
 assert.equal(new LiveRam(catalog).read(broken.iwram,broken.ewram),null);
 const corrupt=ram();corrupt.ewram[0x24284+40]^=0xFF;assert.equal(new LiveRam(catalog).read(corrupt.iwram,corrupt.ewram),null);
 assert.equal(new LiveRam(catalog).read(new Uint8Array(4),new Uint8Array(4)),null);
});
await test('other ROM layouts are found by the shape of the save blocks and the player party',()=>{
 const r=ram({pointers:0x4100,count:0x38000,party:0x38100,members:[mon(),mon({pid:2402,n:4})]});r.ewram[0x38000]=0;
 const live=new LiveRam(catalog);assert.deepEqual(live.read(r.iwram,r.ewram).party.map(m=>m.n),[25,4]);
 r.flag(0x822);assert.ok(live.read(r.iwram,r.ewram).flags.has(0x822));
});
await test('live snapshots write only when progress changes, not when the clock ticks',async()=>{
 const map=new Map([['ruta151-firered','[]']]);let writes=0;
 const store={get length(){return map.size},key:i=>[...map.keys()][i]??null,getItem:k=>map.get(k)??null,setItem:(k,v)=>{writes++;map.set(k,v)},removeItem:k=>map.delete(k)};
 const world={markers:[{id:'brock',name:'Leader Brock',uid:11}]},sync=new LiveSaveSync(store,game,games,catalog,world,battle,true),live=new LiveRam(catalog),r=ram();r.flag(catalog.badges[0].flag,false);
 assert.ok(await sync.syncLive(live.read(r.iwram,r.ewram)));const after=writes;
 r.ewram[r.at.info+17]=40;assert.equal(await sync.syncLive(live.read(r.iwram,r.ewram)),null);assert.equal(writes,after);
 r.flag(catalog.badges[0].flag);const result=await sync.syncLive(live.read(r.iwram,r.ewram));
 assert.deepEqual(result.newMarkers,[11]);assert.equal(result.profile,'p000004d2');
 assert.deepEqual(JSON.parse(map.get('ruta151-firered~p000004d2')),[11]);assert.equal(map.get('ruta151-firered'),'[]');
 assert.equal(JSON.parse(map.get('ruta151-firered~p000004d2-team')).length,1);
});
