import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {loadTypeScript} from './load-typescript.mjs';
import {fixture} from './save-fixture.mjs';
const {parseGameSave}=await loadTypeScript(new URL('../app/save-file.ts',import.meta.url));
const {saveProgress,prepareSaveImport,applySaveImport,undoSaveImport,PREVIOUS_SAVE}=await loadTypeScript(new URL('../app/save-import.ts',import.meta.url));
const {collectBackup,parseBackup}=await loadTypeScript(new URL('../app/backup-store.ts',import.meta.url));
const {caughtSpecies}=await loadTypeScript(new URL('../app/dex-progress.ts',import.meta.url));
const {ivsOf,statsOf}=await loadTypeScript(new URL('../app/battle.ts',import.meta.url));
const json=async name=>JSON.parse(await readFile(new URL(name,import.meta.url),'utf8'));
const catalog=await json('../public/frlg/data/save-catalog.json'),battle=await json('../public/frlg/data/battle.json'),games=await json('../app/games.json'),game=games.find(g=>g.id==='firered');
const save=parseGameSave(fixture(),catalog);
const record={version:1,game:'firered',filename:'test.sav',fingerprint:'a'.repeat(64),importedAt:'2026-10-03T12:00:00.000Z',snapshot:{...save,flags:[...save.flags]}};
const world={markers:[{id:'brock',uid:10,name:'Leader Brock',category:'Battle'},{id:'rod',uid:11,name:'Old Rod',category:'In-Game Gift'},{id:'wild',uid:12,name:'Pikachu',category:'Pokémon'}]};
const oldMon={id:'manual',n:1,level:5,nature:'Hardy',ability:'overgrow',moves:['TACKLE',null,null,null]};
class Store {
 constructor(data={}){this.map=new Map(Object.entries(data));this.fail=null}
 get length(){return this.map.size}key(i){return [...this.map.keys()][i]??null}getItem(key){return this.map.get(key)??null}
 setItem(key,value){if(this.fail===key){this.fail=null;throw new Error('simulated write failure')}this.map.set(key,value)}removeItem(key){this.map.delete(key)}
}
const initial=()=>new Store({'ruta151-firered':'[999]','ruta151-firered-skip':'[1000]','ruta151-firered-dex':'[3]','ruta151-firered-team':JSON.stringify([oldMon]),'ruta151-yellow':'[777]','ruta151-lang':'es'});
const options={team:true,boxes:false,merge:true};
await test('preview is read-only and imported species never mark all wild/gift locations',()=>{
 const store=initial(),before=collectBackup(store),next=prepareSaveImport(store,game,games,record,catalog,world,battle,options);
 assert.deepEqual(collectBackup(store).data,before.data);assert.deepEqual(JSON.parse(next.data['ruta151-firered']),[999,10]);assert.deepEqual(JSON.parse(next.data['ruta151-firered-dex']),[3]);assert.deepEqual(saveProgress(save,catalog,world.markers),[10]);
 const dex={species:[{n:25,found:[{ids:['wild']}]},{n:26,found:[]}]};
 assert.deepEqual([...caughtSpecies(dex,new Map([['wild',world.markers[2]]]),[],[],save.owned)],[25]);
});
await test('apply imports real team and backs up the previous state; undo preserves changes to other games',()=>{
 const store=initial(),before=collectBackup(store).data,next=prepareSaveImport(store,game,games,record,catalog,world,battle,options);
 applySaveImport(store,next,game.id);const team=JSON.parse(store.getItem('ruta151-firered-team'));
 assert.equal(team[0].n,25);assert.equal(team[0].bench,false);assert.equal(team[1].id,'manual');assert.equal(team[1].bench,true);assert.deepEqual(team[0].ivs,[31,30,29,28,27,26]);assert.equal(team[0].guess.length,0);
 assert.deepEqual(ivsOf(battle,team[0]),team[0].ivs);assert.deepEqual(statsOf(battle.species[25].base,50,[null,null],team[0].ivs,team[0].evs),team[0].stats);
 assert.ok(store.getItem(PREVIOUS_SAVE));assert.ok(parseBackup(collectBackup(store),games));
 store.setItem('ruta151-yellow','[777,778]');undoSaveImport(store,games);
 assert.equal(store.getItem('ruta151-firered'),before['ruta151-firered']);assert.equal(store.getItem('ruta151-firered-team'),before['ruta151-firered-team']);assert.equal(store.getItem('ruta151-firered-sav'),null);assert.equal(store.getItem('ruta151-yellow'),'[777,778]');
});
await test('failed writes recover previous progress and do not lose the older undo copy',()=>{
 const store=initial();store.setItem(PREVIOUS_SAVE,'old undo');const before=collectBackup(store).data;
 const next=prepareSaveImport(store,game,games,record,catalog,world,battle,options);store.fail='ruta151-firered-sav';
 assert.throws(()=>applySaveImport(store,next,game.id));assert.deepEqual(collectBackup(store).data,before);assert.equal(store.getItem(PREVIOUS_SAVE),'old undo');
});
await test('cannot import if the previous-state copy cannot be written',()=>{
 const store=initial(),before=collectBackup(store).data,next=prepareSaveImport(store,game,games,record,catalog,world,battle,options);store.fail=PREVIOUS_SAVE;
 assert.throws(()=>applySaveImport(store,next,game.id));assert.deepEqual(collectBackup(store).data,before);
});
await test('replace affects only the selected game and removes old route origin and skips',()=>{
 const store=initial();store.setItem('ruta151-firered-last','Pallet Town');const next=prepareSaveImport(store,game,games,record,catalog,world,battle,{...options,merge:false});
 assert.equal(next.data['ruta151-firered'],'[10]');assert.equal(next.data['ruta151-firered-skip'],'[]');assert.equal(next.data['ruta151-firered-dex'],'[]');assert.equal(next.data['ruta151-firered-last'],undefined);assert.equal(next.data['ruta151-yellow'],'[777]');
});
await test('unsupported party cannot be silently discarded; progress can still import',()=>{
 const unsupported=structuredClone(record);unsupported.snapshot.party[0].n=384;
 assert.throws(()=>prepareSaveImport(initial(),game,games,unsupported,catalog,world,battle,options));
 assert.ok(prepareSaveImport(initial(),game,games,unsupported,catalog,world,battle,{...options,team:false}));
 assert.throws(()=>prepareSaveImport(initial(),games[0],games,record,catalog,world,battle,options));
});
await test('boxed clones get separate ids and all backup fields survive a round trip',()=>{
 const clones=structuredClone(record);clones.snapshot.boxes.push(clones.snapshot.boxes[0]);
 const next=prepareSaveImport(initial(),game,games,clones,catalog,world,battle,{...options,boxes:true});
 const team=JSON.parse(next.data['ruta151-firered-team']);assert.equal(new Set(team.map(m=>m.id)).size,team.length);assert.equal(team.filter(m=>!m.bench).length,1);assert.ok(parseBackup(next,games));
 const broken=structuredClone(next);const mons=JSON.parse(broken.data['ruta151-firered-team']);mons[0].ivs[0]=32;broken.data['ruta151-firered-team']=JSON.stringify(mons);assert.throws(()=>parseBackup(broken,games));
});
await test('backup validation rejects incompatible snapshot versions and malformed records',()=>{
 const next=prepareSaveImport(initial(),game,games,record,catalog,world,battle,options);
 for(const change of [r=>r.version=99,r=>r.snapshot.party[0].n=999,r=>r.fingerprint='bad',r=>r.snapshot.party[0].evs.fill(255),r=>r.snapshot.party[0].hp=999,r=>r.snapshot.owned.push(r.snapshot.owned[0]),r=>r.snapshot.vars.pop(),r=>r.snapshot.vars[0]=-1]){const broken=structuredClone(next),r=JSON.parse(broken.data['ruta151-firered-sav']);change(r);broken.data['ruta151-firered-sav']=JSON.stringify(r);assert.throws(()=>parseBackup(broken,games))}
 const legacy=structuredClone(next),r=JSON.parse(legacy.data['ruta151-firered-sav']);delete r.snapshot.vars;legacy.data['ruta151-firered-sav']=JSON.stringify(r);assert.ok(parseBackup(legacy,games));
});
