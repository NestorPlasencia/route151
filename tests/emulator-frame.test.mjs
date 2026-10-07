import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
const code=await readFile(new URL('../public/emulator/frame.js',import.meta.url),'utf8');
function setup(){
 const events={},messages=[],calls=[],requests=[],source={postMessage:m=>messages.push(m)},window={fetch:(input,init)=>{requests.push({input,init});return Promise.resolve()}},engineEvents={};let tick;
 let bytes=new Uint8Array(0x20000);bytes[0]=1;
 const gm={getState:()=>{throw new Error('no state')},FS:{writeFile:(p,b)=>{calls.push('write');bytes=new Uint8Array(b)}},getSaveFilePath:()=>'/data/saves/test.srm',getSaveFile:()=>bytes,loadSaveFiles:()=>calls.push('load'),restart:()=>calls.push('restart')};
 window.EJS_emulator={gameManager:gm,on:(k,f)=>engineEvents[k]=f,pause:()=>calls.push('pause')};
 const context={File,Uint8Array,window,parent:source,location:{origin:'http://localhost'},document:{getElementById:()=>({hidden:false}),createElement:()=>({}),body:{appendChild:()=>{}}},addEventListener:(k,f)=>events[k]=f,setInterval:f=>{tick=f;return 1},clearInterval:()=>{tick=null}};
 vm.runInNewContext(code,context);
 const send=(data,origin='http://localhost',sender=source)=>events.message({origin,source:sender,data:{route151Emulator:true,...data}});
 return {messages,calls,requests,send,window,engineEvents,gm,get tick(){return tick},ticks:()=>{tick();tick();tick()},set bytes(value){bytes=value},context};
}
await test('the bridge accepts only its parent, loads the initial SAV before capture and ignores state snapshots',()=>{
 const e=setup(),boot={type:'boot',session:'abc',rom:new File([new Uint8Array(192)],'test.gba'),save:new Uint8Array(0x20000),name:'test',lang:'es'};
 e.send(boot,'https://other.example');assert.equal(e.window.EJS_onGameStart,undefined);
 e.send(boot,'http://localhost',{});assert.equal(e.window.EJS_onGameStart,undefined);
 e.send(boot);e.window.EJS_ready();assert.equal(e.messages.at(-1).type,'readyToStart');
 e.engineEvents['start-clicked']();assert.equal(e.messages.at(-1).type,'starting');
 e.window.EJS_onGameStart();assert.deepEqual(e.calls,['write','load','restart']);
 assert.equal(e.messages.at(-1).type,'save');assert.equal(e.window.EJS_onSaveState,undefined);assert.equal(e.window.EJS_onLoadState,undefined);
 const count=e.messages.length;e.ticks();assert.equal(e.messages.length,count);
 const changed=new Uint8Array(0x20000);changed[2]=3;e.bytes=changed;e.ticks();assert.equal(e.messages.length,count+1);
 changed[2]=7;assert.equal(e.messages.at(-1).bytes[2],3);
 e.send({type:'sync',session:'abc'});assert.equal(e.messages.at(-1).manual,true);
 e.ticks();assert.equal(e.messages.at(-1).manual,true);
 e.send({type:'export',session:'abc'});assert.equal(e.messages.at(-1).type,'export');assert.equal(e.messages.at(-1).bytes.length,0x20000);
 e.send({type:'stop',session:'wrong'});assert.ok(e.tick);
 e.send({type:'stop',session:'abc'});assert.equal(e.tick,null);assert.equal(e.messages.at(-1).type,'stopped');assert.ok(e.calls.includes('pause'));
});
await test('the core version check stays local without redirecting unrelated fetches',async()=>{
 const e=setup();e.send({type:'boot',session:'abc',rom:new File([new Uint8Array(192)],'test.gba'),name:'test',lang:'en'});
 await e.window.fetch('https://cdn.emulatorjs.org/stable/data/version.json');
 await e.window.fetch('/vendor/emulatorjs/cores/mgba-wasm.data',{method:'GET'});
 assert.deepEqual(e.requests,[{input:'/vendor/emulatorjs/version.json',init:undefined},{input:'/vendor/emulatorjs/cores/mgba-wasm.data',init:{method:'GET'}}]);
});
await test('every second the bridge sends live IWRAM and EWRAM from the mGBA state, unless live reading is off',async()=>{
 const e=setup(),rom=new Uint8Array(0xC0);rom.set(new TextEncoder().encode('POKEMON FIREBPRE'),0xA0);
 e.send({type:'boot',session:'abc',rom:new File([rom],'test.gba'),name:'test',lang:'en'});await new Promise(r=>setTimeout(r,0));
 const state=new Uint8Array(7+0x61000+64);state.set([0x0B,0,0,1],7);state.set(rom.subarray(0xA0,0xB0),7+0x10);state[7+0x19000]=0xAA;state[7+0x21000]=0xBB;state[7+0x60FFF]=0xCC;
 e.gm.getState=()=>state;e.window.EJS_onGameStart();
 const ram=e.messages.filter(m=>m.type==='ram').at(-1);
 assert.equal(ram.iwram.length,0x8000);assert.equal(ram.ewram.length,0x40000);assert.equal(ram.iwram[0],0xAA);assert.equal(ram.ewram[0],0xBB);assert.equal(ram.ewram[0x3FFFF],0xCC);
 e.send({type:'live',session:'abc',on:false});const count=e.messages.length;e.tick();assert.equal(e.messages.length,count);
 e.gm.getState=()=>new Uint8Array(0x70000);e.send({type:'live',session:'abc',on:true});assert.equal(e.messages.at(-1).type,'ramUnavailable');
});
