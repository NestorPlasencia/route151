import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {loadTypeScript} from './load-typescript.mjs';
import {blocks,fixture,writeSlot} from './save-fixture.mjs';
const {LiveSaveSync,identifyRom}=await loadTypeScript(new URL('../app/emulator-sync.ts',import.meta.url));
const {undoSaveImport,PREVIOUS_SAVE}=await loadTypeScript(new URL('../app/save-import.ts',import.meta.url));
const json=async path=>JSON.parse(await readFile(new URL(path,import.meta.url),'utf8'));
const catalog=await json('../public/frlg/data/save-catalog.json'),battle=await json('../public/frlg/data/battle.json'),games=await json('../app/games.json'),game=games.find(g=>g.id==='firered');
const world={markers:[{id:'MAP_PEWTER_CITY_GYM:Battle:3,8',name:'Camper Liam',uid:10},{id:'brock',name:'Leader Brock',uid:11}]};
// La partida del fixture (entrenador 1234) tiene su propia lista; la manual es ruta151-firered.
const P='ruta151-firered~p000004d2';
class Store{
 constructor(){this.map=new Map([['ruta151-firered','[999]'],['ruta151-yellow','[888]']]);this.fail=false;this.writes=0}
 get length(){return this.map.size}key(i){return [...this.map.keys()][i]??null}getItem(k){return this.map.get(k)??null}
 setItem(k,v){if(this.fail&&k===`${P}-sav`){this.fail=false;throw new Error('quota')}this.map.set(k,v);this.writes++}removeItem(k){this.map.delete(k)}
}
const session=store=>new LiveSaveSync(store,game,games,catalog,world,battle,true);
function nextSave(counter){const bytes=fixture(),b=blocks();b[1][0xEE0+(0x58E>>3)]|=1<<(0x58E&7);writeSlot(bytes,0,counter,b);writeSlot(bytes,0xE000,counter+1,b);return bytes}
function rom(code='BPRE'){
 const bytes=new Uint8Array(0xC0);bytes[0xB2]=0x96;bytes.set(new TextEncoder().encode(code),0xAC);
 let sum=0x19;for(let i=0xA0;i<=0xBC;i++)sum+=bytes[i];bytes[0xBD]=(-sum)&255;return bytes;
}
await test('ROM header identifies FRLG and rejects other games, languages and corruption',()=>{
 assert.equal(identifyRom(rom()).game,'firered');assert.equal(identifyRom(rom('BPGS')).game,'leafgreen');
 assert.throws(()=>identifyRom(rom('AXVE')),/romGame/);assert.equal(identifyRom(rom('BPRJ')).tracked,false);assert.equal(identifyRom(rom('BPRS')).tracked,true);
 const broken=rom();broken[0xBD]^=1;assert.throws(()=>identifyRom(broken),/rom/);assert.throws(()=>identifyRom(new Uint8Array(4)),/rom/);
});
await test('sync merges verified progress and preserves one pre-session undo across multiple saves',async()=>{
 const store=new Store(),live=session(store);assert.equal((await live.sync(fixture())).added,1);
 const undo=store.getItem(PREVIOUS_SAVE);assert.equal((await live.sync(nextSave(22))).added,1);
 assert.equal(store.getItem(PREVIOUS_SAVE),undo);assert.deepEqual(JSON.parse(store.getItem(P)),[11,10]);
 assert.equal(store.getItem('ruta151-firered'),'[999]');assert.equal(store.getItem('ruta151-profile-firered'),'p000004d2');
 assert.equal(JSON.parse(store.getItem(`${P}-sav`)).snapshot.counter,23);
 store.setItem('ruta151-yellow','[888,889]');store.setItem('ruta151-firered','[999,5]');undoSaveImport(store,games);
 assert.equal(store.getItem(P),null);assert.equal(store.getItem('ruta151-firered'),'[999,5]');assert.equal(store.getItem('ruta151-yellow'),'[888,889]');
});
await test('identical frames do not write again and queued buffers are copied before the core reuses them',async()=>{
 const store=new Store(),live=session(store),bytes=fixture(),first=live.sync(bytes);bytes.fill(0);
 await first;const writes=store.writes;assert.equal(await live.sync(fixture()),null);assert.equal(store.writes,writes);
});
await test('a corrupt or failed save cannot damage progress and the same valid bytes can be retried',async()=>{
 const store=new Store(),live=session(store);await assert.rejects(live.sync(new Uint8Array(0x20000)));assert.equal(store.writes,0);
 await live.sync(fixture());const prior=store.getItem(P),undo=store.getItem(PREVIOUS_SAVE);
 store.fail=true;await assert.rejects(live.sync(nextSave(22)));assert.equal(store.getItem(P),prior);assert.equal(store.getItem(PREVIOUS_SAVE),undo);
 assert.equal((await live.sync(nextSave(22))).added,1);
});
await test('stopping a session prevents pending and later snapshots from changing storage',async()=>{
 const store=new Store(),live=session(store),job=live.sync(fixture());live.stop();assert.equal(await job,null);assert.equal(await live.sync(nextSave(30)),null);assert.equal(store.writes,0);
});
