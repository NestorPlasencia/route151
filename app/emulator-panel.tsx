'use client';
import {useEffect,useRef,useState} from 'react';
import {Download,RefreshCw,X} from 'lucide-react';
import {GAMES,battleUrl,type Game,type World} from './games';
import type {Battle} from './battle';
import type {T} from './i18n';
import {loadJson} from './load-json';
import {parseGameSave,SaveFileError,type SaveCatalog} from './save-file';
import {identifyRom,LiveSaveSync,RomError,saveFingerprint} from './emulator-sync';
type Run={id:string;rom:File;name:string;save:Uint8Array|null;sync:LiveSaveSync;lang:string};
export function EmulatorPanel({game,world,tr,onClose}:{game:Game;world:World;tr:T;onClose:()=>void}){
 const {t}=tr,frame=useRef<HTMLIFrameElement>(null),generation=useRef(0);
 const [rom,setRom]=useState<File|null>(null),[sav,setSav]=useState<File|null>(null),[team,setTeam]=useState(true),[auto,setAuto]=useState(true);
 const [run,setRun]=useState<Run|null>(null),[busy,setBusy]=useState(false),[started,setStarted]=useState(false),[closing,setClosing]=useState(false);
 const [note,setNote]=useState(''),[error,setError]=useState('');
 const [exportUrl,setExportUrl]=useState('');
 useEffect(()=>()=>{if(exportUrl)URL.revokeObjectURL(exportUrl)},[exportUrl]);
 const autoRef=useRef(auto);useEffect(()=>{autoRef.current=auto},[auto]);
 useEffect(()=>()=>{generation.current++},[]);
 const start=async()=>{
  if(!rom)return;
  const request=++generation.current;setBusy(true);setError('');
  try{
   if(rom.size<0xC0||rom.size>32*1024*1024)throw new RomError('rom');
   if(sav&&sav.size!==0x20000)throw new SaveFileError('size');
   const bytes=new Uint8Array(await rom.arrayBuffer()),info=identifyRom(bytes);
   if(info.game!==game.id)throw new RomError('romGame');
   const [catalog,battle,hash]=await Promise.all([loadJson<SaveCatalog>(`${game.data}/save-catalog.json`),loadJson<Battle>(battleUrl(game)),saveFingerprint(bytes)]);
   const save=sav?new Uint8Array(await sav.arrayBuffer()):null;if(save)parseGameSave(save,catalog);
   if(request!==generation.current)return;
   const name=`route151-${game.id}-${hash}`;
   setRun({id:crypto.randomUUID(),rom:new File([bytes],`${name}.gba`),name,save,sync:new LiveSaveSync(localStorage,game,GAMES,catalog,world,battle,team),lang:tr.lang});
   setNote(t('emuLoading'));
  }catch(e){if(request===generation.current)setError(e instanceof RomError?t(`emu_${e.code}`):e instanceof SaveFileError?t(`sav_${e.code}`):t('emuFailed'))}
  finally{if(request===generation.current)setBusy(false)}
 };
 useEffect(()=>{
  if(!run)return;
  let disposed=false,booted=false,pending:Promise<unknown>=Promise.resolve();
  let bootTimer:ReturnType<typeof setTimeout>;
  const loading=()=>{clearTimeout(bootTimer);bootTimer=setTimeout(()=>{if(!disposed)setError(t('emuFailed'))},60000)};
  loading();
  const download=(bytes:Uint8Array)=>{
   const url=URL.createObjectURL(new Blob([new Uint8Array(bytes).buffer],{type:'application/octet-stream'}));
   setExportUrl(url);setError('');setNote(t('emuExportReady'));
   const link=document.createElement('a');link.href=url;link.download=`${game.short}.sav`;document.body.append(link);link.click();link.remove();
  };
  const changed=(event:MessageEvent)=>{
   if(event.origin!==location.origin||event.source!==frame.current?.contentWindow||event.data?.route151Emulator!==true)return;
   const data=event.data;
   if(data.type==='ready'&&!booted){booted=true;frame.current?.contentWindow?.postMessage({route151Emulator:true,type:'boot',session:run.id,rom:run.rom,save:run.save,name:run.name,lang:run.lang},location.origin);return}
   if(data.session!==run.id)return;
   if(data.type==='readyToStart'){clearTimeout(bootTimer);setError('');setNote(t('emuReadyToStart'))}
   if(data.type==='starting'){loading();setNote(t('emuLoading'))}
   if(data.type==='started'){clearTimeout(bootTimer);setStarted(true);setError('');setNote(t('emuAwaitSave'))}
   if(data.type==='save'&&(autoRef.current||data.manual===true)&&data.bytes instanceof Uint8Array&&data.bytes.length===0x20000){
    pending=run.sync.sync(data.bytes).then(result=>{
     if(disposed||!result)return;
     dispatchEvent(new CustomEvent('route151-progress-changed',{detail:game.id}));
     if(result.teamUpdated)dispatchEvent(new CustomEvent('route151-team-changed',{detail:`${game.storage.done}-team`}));
     setError('');setNote(t('emuSynced',{n:result.added,time:new Date().toLocaleTimeString(run.lang,{hour:'2-digit',minute:'2-digit',second:'2-digit'})})+(!result.teamUpdated&&team?` ${t('emuTeamUnavailable')}`:''));
    }).catch(e=>{if(!disposed){if(e instanceof SaveFileError&&!run.save)setNote(t('emuAwaitSave'));else setError(e instanceof SaveFileError?t(`sav_${e.code}`):t('emuSyncFailed'))}});
   }
   if(data.type==='export'){
    if(data.bytes instanceof Uint8Array&&data.bytes.length===0x20000)download(data.bytes);
    else setError(t('sav_size'));
   }
   if(data.type==='captureError'||data.type==='error')setError(t('emuFailed'));
   if(data.type==='exit'||data.type==='stopped')void pending.finally(()=>{if(!disposed){setClosing(false);setRun(null);setStarted(false);onClose()}});
  };
  addEventListener('message',changed);
  return()=>{disposed=true;clearTimeout(bootTimer);run.sync.stop();removeEventListener('message',changed)};
 // Una sesión conserva su contexto al cambiar de pestaña o idioma.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[run]);
 const send=(type:string)=>{if(run)frame.current?.contentWindow?.postMessage({route151Emulator:true,session:run.id,type},location.origin)};
 const stop=()=>{if(!started){onClose();return}setClosing(true);send('stop')};
 return <section className="emulator-panel" aria-label={t('emuTitle')}>
  <div className="emulator-heading"><h2>{t('emuTitle')} · {game.short}</h2><button onClick={stop} disabled={closing} aria-label={t('emuStop')}><X/></button></div>
  {!run?<div className="emulator-setup"><p>{t('emuIntro')}</p>
   <label>{t('emuRom')}<input type="file" accept=".gba" disabled={busy} onChange={e=>setRom(e.target.files?.[0]??null)}/></label>
   <label>{t('emuSav')}<input type="file" accept=".sav,.srm" disabled={busy} onChange={e=>setSav(e.target.files?.[0]??null)}/></label>
   <label className="emulator-check"><input type="checkbox" checked={team} disabled={busy} onChange={e=>setTeam(e.target.checked)}/>{t('emuTeam')}</label>
   <button className="emulator-start" onClick={()=>void start()} disabled={!rom||busy}>{busy?t('emuLoading'):t('emuStart')}</button>
  </div>:<>
   <iframe ref={frame} src="/emulator/index.html" title={t('emuTitle')} allow="autoplay; gamepad; fullscreen" allowFullScreen className="emulator-screen"/>
   <div className="emulator-actions"><label className="emulator-check"><input type="checkbox" checked={auto} onChange={e=>{autoRef.current=e.target.checked;setAuto(e.target.checked);if(e.target.checked)send('sync')}}/>{t('emuAuto')}</label>
    <button disabled={!started||closing} onClick={()=>send('sync')} aria-label={t('emuSync')} title={t('emuSync')}><RefreshCw/></button>
    <button disabled={!started||closing} onClick={()=>send('export')}><Download/>{t('emuDownload')}</button>
   </div><p className="emulator-controls">{t('emuControls')}</p>
  </>}
  <p className="emulator-note">{t('emuSaveNote')}</p>
  {note&&<output aria-live="polite">{note}</output>}{error&&<p role="alert">{error}</p>}
  {exportUrl&&<a href={exportUrl} download={`${game.short}.sav`}>{t('emuSaveFile')}</a>}
  <small><a href="https://github.com/EmulatorJS/EmulatorJS/tree/v4.2.3" target="_blank" rel="noreferrer">EmulatorJS 4.2.3</a> · <a href="https://mgba.io" target="_blank" rel="noreferrer">mGBA</a> · <a href="/emulator/LICENSE-EmulatorJS.txt" target="_blank" rel="noreferrer">GPL-3.0</a></small>
 </section>;
}
