import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {loadTypeScript} from './load-typescript.mjs';
import {fixture} from './save-fixture.mjs';
const {profileGame,profileIdFor,profileOf,listProfiles,activeProfile,withProfiles}=await loadTypeScript(new URL('../app/profiles.ts',import.meta.url));
const {parseGameSave}=await loadTypeScript(new URL('../app/save-file.ts',import.meta.url));
const {prepareSaveImport,applySaveImport,undoSaveImport}=await loadTypeScript(new URL('../app/save-import.ts',import.meta.url));
const {collectBackup,parseBackup}=await loadTypeScript(new URL('../app/backup-store.ts',import.meta.url));
const json=async name=>JSON.parse(await readFile(new URL(name,import.meta.url),'utf8'));
const catalog=await json('../public/frlg/data/save-catalog.json'),battle=await json('../public/frlg/data/battle.json'),games=await json('../app/games.json'),game=games.find(g=>g.id==='firered');
const save=parseGameSave(fixture(),catalog),id=profileIdFor(save),target=profileGame(game,id);
const record={version:1,game:'firered',filename:'test.sav',fingerprint:'a'.repeat(64),importedAt:'2026-10-03T12:00:00.000Z',snapshot:{...save,flags:[...save.flags]}};
const world={markers:[{id:'brock',uid:10,name:'Leader Brock',category:'Battle'}]};
class Store{
 constructor(data={}){this.map=new Map(Object.entries(data))}
 get length(){return this.map.size}key(i){return [...this.map.keys()][i]??null}getItem(k){return this.map.get(k)??null}setItem(k,v){this.map.set(k,v)}removeItem(k){this.map.delete(k)}
}
await test('each trainer gets its own keys next to the hand-marked list',()=>{
 assert.equal(id,'p000004d2');assert.deepEqual(target.storage,{done:'ruta151-firered~p000004d2',dex:'ruta151-firered~p000004d2-dex'});
 assert.equal(profileGame(game,null),game);assert.throws(()=>profileGame(game,'../x'));
 assert.deepEqual(profileOf('ruta151-firered~p000004d2-team'),{base:'ruta151-firered',id:'p000004d2'});assert.equal(profileOf('ruta151-firered-team'),null);
});
await test('importing a save fills its own list and leaves the manual list, Pokédex and team untouched',()=>{
 const manual={'ruta151-firered':'[999]','ruta151-firered-dex':'[3]','ruta151-firered-team':'[]','ruta151-yellow':'[777]'},store=new Store(manual);
 applySaveImport(store,prepareSaveImport(store,target,games,record,catalog,world,battle,{team:true,boxes:false,merge:true}),target);
 for(const [k,v] of Object.entries(manual))assert.equal(store.getItem(k),v);
 assert.deepEqual(JSON.parse(store.getItem('ruta151-firered~p000004d2')),[10]);assert.equal(JSON.parse(store.getItem('ruta151-firered~p000004d2-team')).length,1);
 assert.deepEqual(listProfiles(store,game).map(p=>[p.id,p.trainer]),[['p000004d2',save.trainer]]);assert.equal(activeProfile(store,game),'p000004d2');
 assert.deepEqual(listProfiles(store,games.find(g=>g.id==='leafgreen')),[]);
 store.setItem('ruta151-firered','[999,1]');undoSaveImport(store,games);
 assert.equal(store.getItem('ruta151-firered~p000004d2'),null);assert.equal(store.getItem('ruta151-firered'),'[999,1]');assert.equal(activeProfile(store,game),null);
});
await test('backups keep save lists and reject malformed ones',()=>{
 const store=new Store({'ruta151-firered':'[1]'});
 applySaveImport(store,prepareSaveImport(store,target,games,record,catalog,world,battle,{team:true,boxes:false,merge:true}),target);
 const backup=collectBackup(store);assert.doesNotThrow(()=>parseBackup(backup,games));
 assert.equal(withProfiles(games,Object.keys(backup.data)).length,games.length+1);
 assert.throws(()=>parseBackup({...backup,data:{...backup.data,'ruta151-firered~p000004d2':'["x"]'}},games));
 assert.throws(()=>parseBackup({...backup,data:{...backup.data,'ruta151-profile-firered':'nope'}},games));
 assert.throws(()=>parseBackup({...backup,data:{...backup.data,'ruta151-profile-zelda':'p000004d2'}},games));
});
