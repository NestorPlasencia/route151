// Importado por sw.js. Solo anuncia listo tras comprobar TODOS los archivos.
const GAME_CACHE = `route151-game-${VERSION}-`;
const offlineJobs = new Map();
const manifestPath = (id) => `/offline/${id}.json`;
async function offlineManifest(id, cache) {
 const url=manifestPath(id);
 let response;
 try { response=await fetch(url,{cache:'no-store',signal:AbortSignal.timeout(25000)});if(!response.ok)throw new Error('manifest'); }
 catch(error) { response=await cache.match(url);if(!response)throw error; }
 const m=await response.json();
 if(m.game!==id||typeof m.revision!=='string'||!Array.isArray(m.assets)||!m.assets.length||m.assets.some(x=>typeof x!=='string'||!(x.startsWith('/')&&!x.startsWith('//')||x.startsWith('https://raw.githubusercontent.com/'))))throw new Error('manifest');
 return m;
}
async function offlineCount(cache, manifest) {
 let completed=0;
 for(const url of manifest.assets)if(await cache.match(url))completed++;
 return completed;
}
async function offlineDownload(id,send) {
 const cache=await caches.open(GAME_CACHE+id),manifest=await offlineManifest(id,cache);
 const saved=await cache.match(manifestPath(id)),old=saved?await saved.json():null;
 if(old?.revision!==manifest.revision){
  for(const request of await cache.keys())await cache.delete(request);
 }
 await cache.put(manifestPath(id),Response.json(manifest));
 let completed=await offlineCount(cache,manifest),cursor=0,failure=null;
 send({state:'downloading',completed,total:manifest.assets.length});
 // Cuatro descargas simultaneas, limitadas incluso para los mapas grandes.
 await Promise.all(Array.from({length:4},async()=>{
  while(!failure&&cursor<manifest.assets.length){
   const url=manifest.assets[cursor++];if(await cache.match(url))continue;
   try{
    const response=await fetch(url,{cache:'reload',signal:AbortSignal.timeout(25000)});
    if(!response.ok||response.type==='opaque')throw new Error(url);
    // Consumir el cuerpo detecta respuestas truncadas antes de guardar.
    const bytes=await response.clone().arrayBuffer();if(!bytes.byteLength)throw new Error(url);
    await cache.put(url,response);
    send({state:'downloading',completed:++completed,total:manifest.assets.length});
   }catch(error){failure=error;}
  }
 }));
 if(failure)throw failure;
 completed=await offlineCount(cache,manifest);
 if(completed!==manifest.assets.length)throw new Error('incomplete');
 send({state:'ready',completed,total:manifest.assets.length});
}
self.addEventListener('message',event=>{
 const {type,game}=event.data??{},port=event.ports?.[0];
 if(!port||!/^([a-z][a-z0-9-]*)$/.test(game??'')||!['OFFLINE_STATUS','OFFLINE_DOWNLOAD'].includes(type))return;
 const send=value=>port.postMessage(value);
 event.waitUntil((async()=>{
  try{
   if(type==='OFFLINE_DOWNLOAD'){
    if(offlineJobs.has(game)){send({state:'busy'});return;}
    const job=offlineDownload(game,send);offlineJobs.set(game,job);
    try{await job;}finally{offlineJobs.delete(game);}
   }else{
    const cache=await caches.open(GAME_CACHE+game),manifest=await offlineManifest(game,cache);
    const saved=await cache.match(manifestPath(game)),old=saved?await saved.json():null;
    const completed=old?.revision===manifest.revision?await offlineCount(cache,manifest):0;
    send({state:completed===manifest.assets.length?'ready':'idle',completed,total:manifest.assets.length});
   }
  }catch{send({state:'error'});}
 })());
});
