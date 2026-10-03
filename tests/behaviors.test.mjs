import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {loadTypeScript} from './load-typescript.mjs';
const {prepare,findRoute,movesYouHave,reachTiles,reached,legsOf}=await loadTypeScript(new URL('../app/pathfind.ts',import.meta.url));
const {choicesTaken,unmetGate,haveNames,missingTool,nextGoalOf}=await loadTypeScript(new URL('../app/progress.ts',import.meta.url));
const {rulesFor}=await loadTypeScript(new URL('../app/rules.ts',import.meta.url));
const json=async path=>JSON.parse(await readFile(new URL(`../public/${path}`,import.meta.url),'utf8'));
const map=(zone,k,extra={})=>({zone,area:zone,x:0,y:0,w:k.length,h:1,k:Buffer.from(k).toString('base64'),dr:[[0,0],[0,0]],...extra});
const route=(maps,moves={surf:['HM03','Leader Koga']})=>prepare({maps,moves,starts:[['start',0,0]],ferry:[]});
const goal={map:'start',x:2,y:0,far:false};
await test('routes require both Surf and its badge and report the water crossing',()=>{
 const world=route({start:map('Home',[1,2,1])});
 const can=movesYouHave(world.nav,new Set(['HM03']));assert.equal(can.size,0);
 assert.equal(findRoute(world,'Home',goal,can,()=>false,{map:'start',x:0,y:0}),null);
 const unlocked=movesYouHave(world.nav,new Set(['HM03','Leader Koga']));
 const found=findRoute(world,'Home',goal,unlocked,()=>false,{map:'start',x:0,y:0});
 assert.ok(found&&!found.partial);assert.ok(found.path.some(x=>x.how==='surf'));
 assert.equal(reached(world,reachTiles(world,can,()=>false),goal),false);
 assert.equal(reached(world,reachTiles(world,unlocked,()=>false),goal),true);
 assert.ok(legsOf(world,found.path).some(x=>x.uses.includes('surf')));
});
await test('Cut obstacles block a route until the move is unlocked',()=>{
 const world=route({start:map('Home',[1,1,1],{ob:[[1,0,'cut']]})},{cut:['HM01','Leader Misty']});
 assert.equal(findRoute(world,'Home',goal,new Set(),()=>false,{map:'start',x:0,y:0}),null);
 const found=findRoute(world,'Home',goal,new Set(['cut']),()=>false,{map:'start',x:0,y:0});
 assert.ok(found.path.some(x=>x.how==='cut'));
});
await test('story closures prevent traversal through an intermediate map',()=>{
 const world=route({start:map('Home',[1],{wp:[[0,0,'middle',0]]}),middle:map('Road',[1],{wp:[[0,0,'start',0],[0,0,'end',0]]}),end:map('Goal',[1],{wp:[[0,0,'middle',1]]})},{});
 const target={map:'end',x:0,y:0,far:false};
 assert.equal(findRoute(world,'Home',target,new Set(),id=>id==='middle'),null);
 assert.ok(findRoute(world,'Home',target,new Set(),()=>false)?.path.some(x=>x.map==='middle'));
});
await test('unlocking requires every prerequisite and never consumes a skipped objective',()=>{
 const markers=[{id:'hm',uid:1,name:'HM01'},{id:'badge',uid:2,name:'Leader Misty'},{id:'item',uid:3,name:'Potion',map:'forest',zone:'Forest'}];
 const gates=[{id:'cut',maps:['forest'],needs:['HM01','Leader Misty']}];
 assert.ok(unmetGate(markers[2],gates,haveNames(markers,[1])));
 assert.equal(unmetGate(markers[2],gates,haveNames(markers,[1,2])),null);
 assert.equal(nextGoalOf(markers,['hm','badge','item'],m=>m.uid===1)?.id,'badge');
 assert.equal(nextGoalOf(markers,['hm','badge','item'],()=>true),null);
 assert.equal(missingTool({category:'Pokémon',encounter:{methods:['Grass','Surf']}},new Set()),null);
 assert.equal(missingTool({category:'Pokémon',encounter:{methods:['Surf']}},new Set()),'HM03');
});
await test('choices exclude alternatives but keep the selected fossil and its revival linked',()=>{
 const choice=[{id:'fossil',options:[['helix','omanyte'],['dome','kabuto']]}];
 const taken=choicesTaken(choice,id=>id==='helix');
 assert.equal(taken.get('dome'),'helix');assert.equal(taken.get('kabuto'),'helix');assert.equal(taken.has('omanyte'),false);
 assert.equal(choicesTaken(choice,()=>false).size,0);
});
await test('actual generation data unlocks the corresponding field moves and capabilities',async()=>{
 const yellow=await json('yellow/data/nav.json'),frlg=await json('frlg/data/nav.json');
 for(const nav of [yellow,frlg]){
  assert.equal(movesYouHave(nav,new Set(['HM03'])).has('surf'),false);
  assert.equal(movesYouHave(nav,new Set(['HM03','Leader Koga'])).has('surf'),true);
 }
 assert.equal('smash' in yellow.moves,false);assert.equal('smash' in frlg.moves,true);
 const gen1=rulesFor(1),gen3=rulesFor(3);
 assert.equal(gen1.special,'single');assert.equal(gen3.special,'split');
 assert.equal(gen1.genes.max*gen1.genes.scale,30);assert.equal(gen3.genes.max*gen3.genes.scale,31);
 assert.equal(gen1.scan,false);assert.equal(gen3.scan,true);
 assert.equal(gen1.effort,'statexp');assert.equal(gen3.effort,'ev');
});
