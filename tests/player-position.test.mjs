import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {loadTypeScript} from './load-typescript.mjs';
const {playerSpot}=await loadTypeScript(new URL('../app/player-position.ts',import.meta.url));
const json=async path=>JSON.parse(await readFile(new URL(path,import.meta.url),'utf8'));
const table=await json('../public/frlg/data/map-positions.json'),markers=await json('../public/frlg/data/markers.json');
const byId=new Map(Object.entries(table.maps).map(([key,entry])=>[entry.id,key]));
await test('a map and tile from the game land exactly on the marker drawn for that tile',()=>{
 let checked=0;
 for(const marker of markers){
  const tile=/:(\d+),(\d+)(?::|$)/.exec(marker.id),key=byId.get(marker.map);
  if(!tile||!key||!marker.at)continue;
  const [group,map]=key.split('.').map(Number),spot=playerSpot(table,{group,map,x:+tile[1],y:+tile[2]});
  assert.deepEqual([spot.area,...spot.at],[marker.area,...marker.at],marker.id);checked++;
 }
 assert.ok(checked>1000,`${checked} markers`);
});
await test('outdoor maps share their region, rooms are their own area, unknown places do not move the marker',()=>{
 const pallet=byId.get('MAP_PALLET_TOWN'),lab=byId.get('MAP_PALLET_TOWN_PROFESSOR_OAKS_LAB');
 const [g,m]=pallet.split('.').map(Number),[lg,lm]=lab.split('.').map(Number);
 assert.equal(playerSpot(table,{group:g,map:m,x:5,y:5}).area,'kanto');
 assert.deepEqual(playerSpot(table,{group:lg,map:lm,x:6,y:12}),{area:'MAP_PALLET_TOWN_PROFESSOR_OAKS_LAB',map:'MAP_PALLET_TOWN_PROFESSOR_OAKS_LAB',at:[104,200]});
 assert.equal(playerSpot(table,{group:99,map:0,x:1,y:1}),null);assert.equal(playerSpot(table,{group:g,map:m,x:-1,y:3}),null);
});
