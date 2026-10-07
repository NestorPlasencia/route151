import assert from 'node:assert/strict';
import test from 'node:test';
import {loadTypeScript} from './load-typescript.mjs';
const {statParts,statsOf,STATS}=await loadTypeScript(new URL('../app/battle.ts',import.meta.url));
const value=(stat,b,level,iv,ev,nature=[null,null])=>{const i=STATS.indexOf(stat),base=STATS.map(()=>1),ivs=STATS.map(()=>0),evs=STATS.map(()=>0);base[i]=b;ivs[i]=iv;evs[i]=ev;return statsOf(base,level,nature,ivs,evs)[i]};
await test('each stat splits into base, genes, effort, level and nature that add up to the real value',()=>{
 for(const [stat,b,level,iv,ev,nature] of [['hp',81,100,15,0,[null,null]],['atk',92,100,10,252,['atk','spa']],['spa',85,100,21,252,['atk','spa']],['spe',100,50,31,252,[null,null]],['def',45,5,0,0,[null,null]]]){
  const v=value(stat,b,level,iv,ev,nature),p=statParts(b,level,stat,v,nature,iv,ev);
  assert.equal(p.base+p.genes+p.effort+p.level+p.nature,v);assert.ok(Object.values(p).slice(0,4).every(n=>Number.isInteger(n)&&n>=0));
 }
 assert.deepEqual(statParts(81,100,'hp',287,[null,null],15,0),{base:162,genes:15,effort:0,level:110,nature:0});
 const up=statParts(92,100,'atk',value('atk',92,100,10,252,['atk','spa']),['atk','spa'],10,252),down=statParts(85,100,'spa',value('spa',85,100,21,252,['atk','spa']),['atk','spa'],21,252);
 assert.ok(up.nature>0);assert.ok(down.nature<0);assert.equal(up.effort,63);
});
