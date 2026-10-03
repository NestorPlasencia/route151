import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {loadTypeScript} from './load-typescript.mjs';
const {assumedMoves,statsOf,rulesOf,effortText,damage}=await loadTypeScript(new URL('../app/battle.ts',import.meta.url));
const {translator}=await loadTypeScript(new URL('../app/i18n.ts',import.meta.url));
const data=async game=>JSON.parse(await readFile(new URL(`../public/${game}/data/battle.json`,import.meta.url),'utf8'));
await test('actual battle data preserves generation-specific stats and effort descriptions',async()=>{
 const yellow=await data('yellow'),frlg=await data('frlg'),tr=translator('es');
 assert.equal(rulesOf(yellow).natures,false);assert.equal(rulesOf(frlg).natures,true);
 assert.equal(yellow.species[25].base[3],yellow.species[25].base[4]);
 assert.notEqual(frlg.species[25].base[3],frlg.species[25].base[4]);
 assert.notEqual(effortText(yellow,[25],tr),effortText(frlg,[25],tr));
 for(const battle of [yellow,frlg]){
  const moves=assumedMoves(battle,25,20);assert.equal(moves.length,4);
  for(const key of moves.filter(Boolean))assert.ok(battle.moves[key]);
  const key=moves.find(key=>key&&battle.moves[key].power>0);
  const result=damage(battle,{id:'test',n:25,level:20,nature:'Hardy',ability:'',moves},battle.moves[key],16,20);
  assert.ok(result&&result.max>=result.min&&result.max<=100);
 }
});
await test('confirmed stats and nature apply to the corresponding attack stat',()=>{
 const base=[35,55,40,50,50,90],neutral=statsOf(base,50),nature=statsOf(base,50,['atk','spa']);
 assert.ok(nature[1]>neutral[1]);assert.ok(nature[3]<neutral[3]);assert.equal(nature[0],neutral[0]);
});
