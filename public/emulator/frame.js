// Adaptador de EmulatorJS 4.2.3. ROM/SAV solo viajan entre marcos del mismo origen.
let session=null,interval=null,lastBytes=null,started=false;
const tell=(type,data={})=>parent.postMessage({route151Emulator:true,session,type,...data},location.origin);
const equal=(a,b)=>a&&a.length===b.length&&a.every((v,i)=>v===b[i]);
function capture(force=false,manual=false){
 if(!started)return;
 try{
  const bytes=window.EJS_emulator.gameManager.getSaveFile();
  if(!bytes||!bytes.length)return;
  if(force||!equal(lastBytes,bytes)){lastBytes=new Uint8Array(bytes);tell('save',{bytes:new Uint8Array(bytes),manual})}
 }catch{tell('captureError')}
}
addEventListener('message',event=>{
 if(event.origin!==location.origin||event.source!==parent||!event.data?.route151Emulator)return;
 const data=event.data;
 if(data.type==='boot'&&!session){
  session=data.session;
  if(!(data.rom instanceof File))return tell('error');
  window.EJS_player='#game';window.EJS_core='mgba';
  window.EJS_gameUrl=data.rom;window.EJS_gameName=data.name;window.EJS_gameID=data.name;
  window.EJS_pathtodata='/vendor/emulatorjs/';
  window.EJS_language=data.lang==='es'?'es-ES':'en-US';window.EJS_disableAutoLang=false;
  window.EJS_threads=false;window.EJS_noAutoFocus=false;window.EJS_disableLocalStorage=true;
  window.EJS_Buttons={netplay:false,cheat:false,screenRecord:false};
  window.EJS_startButtonName=data.lang==='es'?'Iniciar juego':'Start game';
  // El core consulta esta URL fija incluso en localhost. Usar la versión local
  // evita una petición externa y mantiene operativa la misma versión sin red.
  const fetchLocal=window.fetch.bind(window);
  window.fetch=(input,init)=>fetchLocal(input==='https://cdn.emulatorjs.org/stable/data/version.json'?'/vendor/emulatorjs/version.json':input,init);
  window.EJS_ready=()=>{
   tell('readyToStart');
   window.EJS_emulator.on('start-clicked',()=>tell('starting'));
   window.EJS_emulator.on('exit',()=>{started=false;clearInterval(interval);tell('exit')});
  };
  window.EJS_onGameStart=()=>{
   try{
    const gm=window.EJS_emulator.gameManager;
    if(data.save){gm.FS.writeFile(gm.getSaveFilePath(),new Uint8Array(data.save));gm.loadSaveFiles();gm.restart()}
    started=true;document.getElementById('notice').hidden=true;tell('started');capture(true);
    interval=setInterval(()=>capture(),3000);
   }catch{tell('error')}
  };
  // Los estados rápidos no disparan sincronización: el contrato es el SAV del juego.
  window.EJS_onSaveSave=({save})=>{if(save)tell('export',{bytes:new Uint8Array(save)})};
  const script=document.createElement('script');script.src='/vendor/emulatorjs/loader.js';script.onerror=()=>tell('error');document.body.appendChild(script);
  document.getElementById('notice').hidden=true;
 }else if(data.session===session){
  if(data.type==='sync')capture(true,true);
  if(data.type==='export'&&started){const bytes=window.EJS_emulator.gameManager.getSaveFile();if(bytes)tell('export',{bytes:new Uint8Array(bytes)})}
  if(data.type==='stop'){capture(true);started=false;clearInterval(interval);window.EJS_emulator?.pause();tell('stopped')}
 }
});
addEventListener('error',()=>tell('error'));
addEventListener('unhandledrejection',()=>tell('error'));
parent.postMessage({route151Emulator:true,type:'ready'},location.origin);
