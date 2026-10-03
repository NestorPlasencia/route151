import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {loadTypeScript} from './load-typescript.mjs';
import {blocks,fixture,writeSlot} from './save-fixture.mjs';
const {parseGameSave,SaveFileError,experienceAt}=await loadTypeScript(new URL('../app/save-file.ts',import.meta.url));
const catalog=JSON.parse(await readFile(new URL('../public/frlg/data/save-catalog.json',import.meta.url),'utf8'));
const rejects=(bytes,code)=>assert.throws(()=>parseGameSave(bytes,catalog),e=>e instanceof SaveFileError&&e.code===code);
await test('rotated sectors reconstruct latest complete save, Spanish names, real stats and encrypted inventory',()=>{
 const s=parseGameSave(fixture(),catalog);
 assert.equal(s.counter,21);assert.equal(s.trainer,'ÁÑ');assert.equal(s.playTime,'12:34');assert.deepEqual(s.badges,['Leader Brock']);assert.deepEqual(s.owned,[25]);
 assert.equal(s.party[0].name,'Pikachu');assert.deepEqual(s.party[0].moves,['THUNDERBOLT','TACKLE',null,null]);assert.deepEqual(s.party[0].ivs,[31,30,29,28,27,26]);assert.deepEqual(s.party[0].evs,[252,0,0,0,0,252]);assert.deepEqual(s.party[0].stats,[142,75,49,69,58,139]);
 assert.deepEqual(s.boxes[0].stats,[142,75,49,69,58,139]);assert.equal(s.boxes[0].box,1);assert.equal(s.keyItems[0].name,'Old Rod');assert.equal(s.keyItems[0].quantity,1);
});
await test('all 24 Pokémon encryption orders preserve species, moves and IVs',()=>{
 for(let i=0;i<24;i++){const s=parseGameSave(fixture({pid:2400+i}),catalog);assert.equal(s.party[0].n,25);assert.deepEqual(s.party[0].moves,['THUNDERBOLT','TACKLE',null,null]);assert.deepEqual(s.party[0].ivs,[31,30,29,28,27,26]);}
});
await test('a damaged or interrupted newer save falls back to the older complete copy',()=>{
 const bytes=fixture();bytes[0xE000]^=1;const s=parseGameSave(bytes,catalog);assert.equal(s.counter,20);assert.equal(s.recovered,true);
 const mixed=fixture();new DataView(mixed.buffer).setUint32(0xE000+0xFFC,99,true);assert.equal(parseGameSave(mixed,catalog).counter,20);
});
await test('save counter wraparound chooses zero after uint32 maximum',()=>{
 assert.equal(parseGameSave(fixture({first:0xFFFFFFFF,second:0}),catalog).counter,0);
 assert.equal(parseGameSave(fixture({first:0,second:0xFFFFFFFF}),catalog).counter,0);
});
await test('a save before choosing the starter can have an empty party',()=>{
 const data=blocks();data[1][0x34]=0;const bytes=fixture();writeSlot(bytes,0,20,data);writeSlot(bytes,0xE000,21,data);
 const save=parseGameSave(bytes,catalog);assert.equal(save.party.length,0);assert.equal(save.boxes.length,1);
});
await test('rejects truncated saves, quick states, duplicate sectors, corrupt Pokémon and other generation layouts',()=>{
 rejects(new Uint8Array(32768),'size');rejects(new Uint8Array(131072),'integrity');
 const duplicates=fixture();for(const start of [0,0xE000])new DataView(duplicates.buffer).setUint16(start+0xFF4,12,true);rejects(duplicates,'integrity');
 const data=blocks();data[1][0x38+32]^=1;const bad=fixture();writeSlot(bad,0,20,data);writeSlot(bad,0xE000,21,data);rejects(bad,'pokemon');
 const gen=blocks();gen[1][0x34]=7;writeSlot(bad,0,20,gen);writeSlot(bad,0xE000,21,gen);rejects(bad,'format');
});
await test('growth curves include correct level 100 experience',()=>{
 for(const [g,n] of [['FAST',800000],['MEDIUM_FAST',1000000],['MEDIUM_SLOW',1059860],['SLOW',1250000],['ERRATIC',600000],['FLUCTUATING',1640000]]){assert.equal(experienceAt(100,g),n);assert.equal(experienceAt(1,g),0)}
});
await test('public RoCs-PC samples decode six party Pokémon, 414 boxes and eight badges',{skip:!process.env.ROUTE151_SAV_SAMPLES},async()=>{
 for(const [file,time,lead] of [['Pokemon Fire Red.sav','34:34',6],['Pokemon Leaf Green.sav','8:27',3]]){
  const s=parseGameSave(await readFile(`${process.env.ROUTE151_SAV_SAMPLES}/${file}`),catalog);
  assert.equal(s.trainer,'RoC');assert.equal(s.playTime,time);assert.equal(s.party.length,6);assert.equal(s.boxes.length,414);assert.equal(s.badges.length,8);assert.equal(s.owned.length,386);assert.equal(s.party[0].n,lead);assert.equal(s.recovered,false);
 }
});
