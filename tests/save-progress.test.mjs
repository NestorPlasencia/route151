import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {loadTypeScript} from './load-typescript.mjs';
import {blocks,fixture,writeSlot} from './save-fixture.mjs';
const {parseGameSave}=await loadTypeScript(new URL('../app/save-file.ts',import.meta.url));
const {saveEvidence,saveProgress}=await loadTypeScript(new URL('../app/save-import.ts',import.meta.url));
const {GAMES,loadGame}=await loadTypeScript(new URL('../app/games.ts',import.meta.url));
const catalog=JSON.parse(await readFile(new URL('../public/frlg/data/save-catalog.json',import.meta.url),'utf8'));
const nativeFetch=globalThis.fetch;
globalThis.fetch=async input=>{
 const path=typeof input==='string'?input:input instanceof URL?input.pathname:input.url;
 return new Response(await readFile(new URL(`../public${path}`,import.meta.url)));
};
const worlds={};
try{for(const game of GAMES.filter(g=>g.gen===3))worlds[game.id]=await loadGame(game)}finally{globalThis.fetch=nativeFetch}
const world=worlds.firered;
const empty=()=>({...parseGameSave(fixture(),catalog),flags:new Set(),vars:Array(256).fill(0)});
const ids=save=>saveEvidence(save,catalog,world.markers).map(m=>m.id);

await test('trainer completion is specific to the individual opponent, not its class or gym badge',()=>{
 const s=empty();s.flags.add(0x500+142);const detected=saveEvidence(s,catalog,world.markers);
 assert.deepEqual(detected.map(m=>m.name),['Camper Liam']);
 s.flags=new Set([0x820]);assert.ok(!ids(s).includes('MAP_PEWTER_CITY_GYM:Battle:3,8'));
});
await test('collected objects are distinguished from identical items elsewhere and absent inventory',()=>{
 const s=empty();s.flags=new Set([0x158,1000]);s.keyItems=[];
 assert.deepEqual(ids(s).sort(),['MAP_VIRIDIAN_FOREST:Item In Map:21,34','MAP_VIRIDIAN_FOREST:Hidden Item:3,22'].sort());
 assert.ok(!ids(s).includes('MAP_VIRIDIAN_FOREST:Item In Map:49,60'));
});
await test('beating Brock does not imply receiving TM39; the award has its own flag',()=>{
 const s=empty();s.flags.add(0x820);assert.ok(!saveEvidence(s,catalog,world.markers).some(m=>m.name==='TM39'));
 s.flags.add(0x254);assert.ok(saveEvidence(s,catalog,world.markers).some(m=>m.name==='TM39'));
});
await test('the parcel remains received after delivery and old snapshots can prove it through the Pokédex event',()=>{
 const parcel='MAP_VIRIDIAN_CITY_MART:scene:gift:ITEM_OAKS_PARCEL:2,3',s=empty();
 assert.ok(!ids(s).includes(parcel));
 s.vars[0x57]=1;assert.ok(ids(s).includes(parcel));
 s.vars[0x57]=2;s.keyItems=[];assert.ok(ids(s).includes(parcel));
 delete s.vars;s.flags.add(0x829);assert.ok(ids(s).includes(parcel));
});
await test('persistent variables are read from checked save sectors and select only the obtained starter',()=>{
 const b=blocks(),view=new DataView(b[1].buffer);view.setUint16(0x1000+(0x4031-0x4000)*2,2,true);b[1][0xEE0+(0x828>>3)]|=1<<(0x828&7);
 const bytes=fixture();writeSlot(bytes,0,20,b);writeSlot(bytes,0xE000,21,b);
 const s=parseGameSave(bytes,catalog);assert.equal(s.vars[0x31],2);
 const gifts=saveEvidence(s,catalog,world.markers).filter(m=>m.map==='MAP_PALLET_TOWN_PROFESSOR_OAKS_LAB'&&m.category==='In-Game Gift Pokémon');
 assert.deepEqual(gifts.map(m=>m.name),['Charmander']);
 s.flags.delete(0x828);assert.ok(!saveEvidence(s,catalog,world.markers).some(m=>m.id.includes('gift:SPECIES_CHARMANDER')));
});
await test('both fossil objects disappearing does not select both fossils; ambiguous choice flags stay manual',()=>{
 const s=empty();s.flags=new Set([0x2F,0x30]);assert.ok(!ids(s).some(id=>id.includes('gift:ITEM_')&&id.includes('FOSSIL')));
 s.flags.add(0x272);assert.ok(ids(s).some(id=>id.includes('gift:ITEM_DOME_FOSSIL')));assert.ok(!ids(s).some(id=>id.includes('gift:ITEM_HELIX_FOSSIL')));
 s.flags.add(0x273);assert.ok(!ids(s).some(id=>id.includes('gift:ITEM_')&&id.includes('FOSSIL')));
});
await test('the dojo gift needs the chosen ball and does not register both alternatives',()=>{
 const s=empty();s.flags=new Set([0x278,0x60]);
 assert.deepEqual(saveEvidence(s,catalog,world.markers).filter(m=>m.map==='MAP_SAFFRON_CITY_DOJO'&&m.category==='In-Game Gift Pokémon').map(m=>m.name),['Hitmonlee']);
 s.flags.add(0x61);assert.ok(!saveEvidence(s,catalog,world.markers).some(m=>m.map==='MAP_SAFFRON_CITY_DOJO'&&m.category==='In-Game Gift Pokémon'));
});
await test('a full Pokédex and a disappeared static encounter do not prove captures, gifts or trades',()=>{
 const s=empty();s.owned=Array.from({length:386},(_,i)=>i+1);s.flags=new Set([0x54,0x57]);
 assert.ok(!saveEvidence(s,catalog,world.markers).some(m=>['Pokémon','In-Game Gift Pokémon','In-Game Trade'].includes(m.category)));
 s.flags.add(0x248);const trades=saveEvidence(s,catalog,world.markers).filter(m=>m.category==='In-Game Trade');assert.equal(trades.length,1);assert.equal(trades[0].name,'Mr. Mime');
});
await test('rival flags apply only to their encounter and adapt to its starter variant',()=>{
 const s=empty();s.flags.add(0x500+334);const battles=saveEvidence(s,catalog,world.markers).filter(m=>m.category==='Battle');
 assert.equal(battles.length,1);assert.equal(battles[0].map,'MAP_CERULEAN_CITY');
 s.flags=new Set([0x500+435]);assert.ok(!ids(s).some(id=>id.includes('MAP_ROUTE22:scene:Rival')));
});
await test('older imported records without variables still recognize flags and never assume starter zero',()=>{
 const s=empty();delete s.vars;s.flags=new Set([0x828,0x500+142]);assert.ok(ids(s).some(id=>id==='MAP_PEWTER_CITY_GYM:Battle:3,8'));assert.ok(!ids(s).some(id=>id.includes('gift:SPECIES_BULBASAUR')));
});
await test('every current trainer entry is mapped, rules have evidence, and no rule targets a wild capture',()=>{
 for(const world of Object.values(worlds)){
  const rules=new Map(catalog.checks.map(r=>[r.id,r]));
  for(const m of world.markers.filter(m=>m.category==='Battle'))assert.ok(rules.has(m.id),m.id);
  for(const r of catalog.checks){assert.ok(r.sources.length);assert.ok(r.any.length);for(const group of r.any){assert.ok(group.length);for(const c of group){if('flag' in c)assert.ok(c.flag>=0x20&&c.flag<0x900);else assert.ok(c.var>=0x4030&&c.var<=0x40FF)}}}
  assert.ok(!world.markers.some(m=>m.category==='Pokémon'&&rules.has(m.id)));
 }
});
await test('public saves mark Liam, specific items and gifts without completing every capture',{skip:!process.env.ROUTE151_SAV_SAMPLES},async()=>{
 for(const [game,file,total,starter] of [['firered','Pokemon Fire Red.sav',655,'Charmander'],['leafgreen','Pokemon Leaf Green.sav',285,'Bulbasaur']]){
  const s=parseGameSave(await readFile(`${process.env.ROUTE151_SAV_SAMPLES}/${file}`),catalog),e=saveEvidence(s,catalog,worlds[game].markers);
  assert.ok(e.some(m=>m.name==='Camper Liam'));assert.ok(e.some(m=>m.name==='TM39'));assert.ok(e.some(m=>m.name===starter&&m.category==='In-Game Gift Pokémon'));
  assert.equal(e.some(m=>m.name==='Eevee'&&m.category==='In-Game Gift Pokémon'),game==='firered');
  assert.equal(saveProgress(s,catalog,worlds[game].markers).length,total);assert.ok(!e.some(m=>m.category==='Pokémon'));assert.equal(new Set(e.map(m=>m.uid)).size,saveProgress(s,catalog,worlds[game].markers).length);
 }
});
