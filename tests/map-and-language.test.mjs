import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {loadTypeScript} from './load-typescript.mjs';
const {clusterPoints}=await loadTypeScript(new URL('../app/map-clusters.ts',import.meta.url));
const {translator,PLACES}=await loadTypeScript(new URL('../app/i18n.ts',import.meta.url));
await test('nearby screen pins and doors group together without losing any member',()=>{
 const entries=[{at:[0,0],kind:'pin'},{at:[4,2],kind:'door'},{at:[100,100],kind:'pin'}],project=([x,y])=>({x,y});
 const groups=clusterPoints(entries,project,42);
 assert.equal(groups.length,2);assert.equal(groups[0].entries.length,2);
 assert.deepEqual(groups.flatMap(g=>g.entries),entries);
 assert.deepEqual(groups[0].at,[2,1]);
 assert.equal(clusterPoints(entries,project,0).length,3);
 assert.equal(clusterPoints(entries,([x,y])=>({x:x*20,y:y*20}),42).length,3);
});
await test('every actual checklist zone has a full Spanish translation or a numbered route',async()=>{
 for(const prefix of ['yellow','frlg']){
  const checklist=JSON.parse(await readFile(new URL(`../public/${prefix}/data/checklist.json`,import.meta.url),'utf8'));
  for(const zone of checklist.zones)assert.ok(PLACES[zone.name]||/^Route \d+$/.test(zone.name),zone.name);
 }
});
await test('Sevii names and their interiors no longer mix translated fragments',()=>{
 const es=translator('es'),en=translator('en');
 assert.equal(es.place('Water Path'),'Vía Acuática');
 assert.equal(es.place('Altering Cave'),'Cueva Cambiante');
 assert.equal(es.place('Altering Cave B1F'),'Cueva Cambiante B1F');
 assert.equal(es.place('One Island Pokémon Center 1F'),'Isla Prima Centro Pokémon 1F');
 assert.equal(en.place('Water Path'),'Water Path');
 assert.equal(es.place('Route 25'),'Ruta 25');
 assert.equal(es.place('Route 2 Viridian Forest South Entrance'),'Ruta 2 Bosque Verde Sur Entrada');
 assert.equal(es.place('Fuchsia City Safari Zone Entrance'),'Ciudad Fucsia Zona Safari Entrada');
});
