import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const source=await readFile(new URL('../public/offline-worker.js',import.meta.url),'utf8');
const manifest={game:'firered',revision:'one',assets:['/','/frlg/map.png','https://raw.githubusercontent.com/sprite.png','/_next/static/lazy-team.js']};
function worker(){
 const stored=new Map(),handlers=new Map();let fail=null;
 const cache={match:async url=>stored.get(typeof url==='string'?url:url.url)?.clone(),put:async(url,response)=>stored.set(typeof url==='string'?url:url.url,response.clone()),keys:async()=>[...stored.keys()],delete:async key=>stored.delete(key)};
 const calls=[];
 vm.runInNewContext(source,{VERSION:'test',URL,Response,AbortSignal,Map,caches:{open:async()=>cache},fetch:async url=>{calls.push(url);if(url===fail)throw new Error('offline');return url==='/offline/firered.json'?Response.json(manifest):new Response('file')},self:{addEventListener:(name,fn)=>handlers.set(name,fn)}});
 return {stored,calls,fail:url=>{fail=url},async message(type){const messages=[];let pending=Promise.resolve();handlers.get('message')({data:{type,game:'firered'},ports:[{postMessage:value=>messages.push(value)}],waitUntil:promise=>{pending=promise}});await pending;return messages}};
}
await test('downloads unvisited maps, external sprites and lazy chunks, then verifies completeness',async()=>{
 const sw=worker(),messages=await sw.message('OFFLINE_DOWNLOAD');
 assert.equal(messages.at(-1).state,'ready');assert.equal(messages.at(-1).completed,manifest.assets.length);
 for(const url of manifest.assets)assert.ok(sw.stored.has(url),url);
 assert.equal((await sw.message('OFFLINE_STATUS')).at(-1).state,'ready');
 // Una expulsion parcial de la cache deja de anunciar disponible.
 sw.stored.delete('/frlg/map.png');assert.equal((await sw.message('OFFLINE_STATUS')).at(-1).state,'idle');
});
await test('failed downloads never claim ready and retry resumes missing resources',async()=>{
 const sw=worker();sw.fail('/frlg/map.png');
 assert.equal((await sw.message('OFFLINE_DOWNLOAD')).at(-1).state,'error');
 assert.equal((await sw.message('OFFLINE_STATUS')).at(-1).state,'idle');
 sw.fail(null);sw.calls.length=0;
 assert.equal((await sw.message('OFFLINE_DOWNLOAD')).at(-1).state,'ready');
 assert.ok(sw.calls.includes('/frlg/map.png'));assert.ok(!sw.calls.includes('/_next/static/lazy-team.js'));
});
