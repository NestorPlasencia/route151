// Recuerda la ROM en este dispositivo (IndexedDB) para «Seguir jugando» sin volver a elegirla.
// Nunca sale del navegador; si el almacenamiento falla, simplemente se vuelve a pedir.
const DB='route151-roms',STORE='roms';
function open():Promise<IDBDatabase>{
 return new Promise((resolve,reject)=>{
  const request=indexedDB.open(DB,1);
  request.onupgradeneeded=()=>request.result.createObjectStore(STORE);
  request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
 });
}
async function run<T>(mode:IDBTransactionMode,action:(store:IDBObjectStore)=>IDBRequest<T>):Promise<T>{
 const db=await open();
 try{return await new Promise<T>((resolve,reject)=>{const request=action(db.transaction(STORE,mode).objectStore(STORE));request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error)})}
 finally{db.close()}
}
export async function savedRom(game:string):Promise<File|null>{
 try{const file:unknown=await run('readonly',store=>store.get(game));return file instanceof File?file:null}catch{return null}
}
export async function rememberRom(game:string,file:File){try{await run('readwrite',store=>store.put(file,game))}catch{/* Sin espacio o modo privado. */}}
