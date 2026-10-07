'use client';
import {useEffect,useRef,useState} from 'react';
import {Download,Gamepad,ListChecks,Play,RefreshCw,X} from 'lucide-react';
import {GAMES,battleUrl,type Game,type World} from './games';
import type {Battle} from './battle';
import type {T} from './i18n';
import {loadJson} from './load-json';
import {parseGameSave,SaveFileError,type SaveCatalog} from './save-file';
import {identifyRom,LiveSaveSync,RomError,saveFingerprint} from './emulator-sync';
import {LiveRam} from './live-ram';
import {rememberRom,savedRom} from './rom-store';
type Run={id:string;rom:File;name:string;save:Uint8Array|null;sync:LiveSaveSync;ram:LiveRam;lang:string;tracked:boolean};
type Synced=Awaited<ReturnType<LiveSaveSync['sync']>>;
export function EmulatorPanel({game,world,tr,onClose}:{game:Game;world:World;tr:T;onClose:()=>void}){
 const {t}=tr,frame=useRef<HTMLIFrameElement>(null),generation=useRef(0);
 const [rom,setRom]=useState<File|null>(null),[sav,setSav]=useState<File|null>(null),[team,setTeam]=useState(true),[auto,setAuto]=useState(true);
 const [run,setRun]=useState<Run|null>(null),[busy,setBusy]=useState(false),[started,setStarted]=useState(false),[closing,setClosing]=useState(false);
 const [note,setNote]=useState(''),[error,setError]=useState('');
 const [exportUrl,setExportUrl]=useState(''),[live,setLive]=useState<boolean|null>(null),[found,setFound]=useState<string[]>([]);
 // En el teléfono se alterna entre el juego a pantalla completa y la lista.
 const [view,setView]=useState<'game'|'list'>('game'),[stored,setStored]=useState<File|null>(null),[choosing,setChoosing]=useState(false);
 useEffect(()=>{let live=true;void savedRom(game.id).then(file=>{if(live)setStored(file)});return()=>{live=false}},[game.id]);
 useEffect(()=>()=>{if(exportUrl)URL.revokeObjectURL(exportUrl)},[exportUrl]);
 useEffect(()=>{if(!found.length)return;const id=setTimeout(()=>setFound([]),8000);return()=>clearTimeout(id)},[found]);
 const autoRef=useRef(auto);useEffect(()=>{autoRef.current=auto},[auto]);
 useEffect(()=>()=>{generation.current++},[]);
 const start=async(rom:File|null)=>{
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
   if(rom!==stored)void rememberRom(game.id,rom);
   setRun({id:crypto.randomUUID(),rom:new File([bytes],`${name}.gba`),name,save,sync:new LiveSaveSync(localStorage,game,GAMES,catalog,world,battle,team),ram:new LiveRam(catalog),lang:tr.lang,tracked:info.tracked});
   setNote(t(info.tracked?'emuLoading':'emuUntracked'));
  }catch(e){if(request===generation.current)setError(e instanceof RomError?t(`emu_${e.code}`):e instanceof SaveFileError?t(`sav_${e.code}`):t('emuFailed'))}
  finally{if(request===generation.current)setBusy(false)}
 };
 useEffect(()=>{
  if(!run)return;
  let disposed=false,booted=false,reading=false,shown='',pending:Promise<unknown>=Promise.resolve();
  let bootTimer:ReturnType<typeof setTimeout>;
  const loading=()=>{clearTimeout(bootTimer);bootTimer=setTimeout(()=>{if(!disposed)setError(t('emuFailed'))},60000)};
  loading();
  const download=(bytes:Uint8Array)=>{
   const url=URL.createObjectURL(new Blob([new Uint8Array(bytes).buffer],{type:'application/octet-stream'}));
   setExportUrl(url);setError('');setNote(t('emuExportReady'));
   const link=document.createElement('a');link.href=url;link.download=`${game.short}.sav`;document.body.append(link);link.click();link.remove();
  };
  const report=(result:Synced)=>{
   if(disposed||!result)return;
   // Al empezar a registrar una partida, la web muestra su lista (una vez por sesión).
   if(result.profile!==shown){shown=result.profile;dispatchEvent(new CustomEvent('route151-profile',{detail:{game:game.id,id:result.profile}}))}
   dispatchEvent(new CustomEvent('route151-progress-changed',{detail:game.id}));
   if(result.teamUpdated)dispatchEvent(new CustomEvent('route151-team-changed',{detail:result.teamKey}));
   const names=result.newMarkers.map(uid=>world.markers.find(m=>m.uid===uid)?.name).filter((name):name is string=>!!name);
   if(names.length)setFound(names.slice(0,5));
   setError('');setNote(t('emuSynced',{n:result.added,time:new Date().toLocaleTimeString(run.lang,{hour:'2-digit',minute:'2-digit',second:'2-digit'})})+(!result.teamUpdated&&team?` ${t('emuTeamUnavailable')}`:''));
  };
  const changed=(event:MessageEvent)=>{
   if(event.origin!==location.origin||event.source!==frame.current?.contentWindow||event.data?.route151Emulator!==true)return;
   const data=event.data;
   if(data.type==='ready'&&!booted){booted=true;frame.current?.contentWindow?.postMessage({route151Emulator:true,type:'boot',session:run.id,rom:run.rom,save:run.save,name:run.name,lang:run.lang,live:run.tracked},location.origin);return}
   if(data.session!==run.id)return;
   if(data.type==='readyToStart'){clearTimeout(bootTimer);setError('');setNote(t('emuReadyToStart'))}
   if(data.type==='starting'){loading();setNote(t('emuLoading'))}
   if(data.type==='started'){clearTimeout(bootTimer);setStarted(true);setError('');setNote(t(run.tracked?'emuAwaitSave':'emuUntracked'))}
   if(data.type==='ram'&&run.tracked&&autoRef.current&&!reading&&data.iwram instanceof Uint8Array&&data.ewram instanceof Uint8Array){
    const save=run.ram.read(data.iwram,data.ewram);if(!save)return;
    if(!disposed)setLive(true);
    reading=true;pending=run.sync.syncLive(save).then(report).catch(()=>{if(!disposed)setError(t('emuSyncFailed'))}).finally(()=>{reading=false});
   }
   if(data.type==='ramUnavailable')setLive(value=>value??false);
   if(data.type==='save'&&run.tracked&&(autoRef.current||data.manual===true)&&data.bytes instanceof Uint8Array&&data.bytes.length===0x20000){
    pending=run.sync.sync(data.bytes).then(report).catch(e=>{if(!disposed){if(e instanceof SaveFileError&&!run.save)setNote(t('emuAwaitSave'));else setError(e instanceof SaveFileError?t(`sav_${e.code}`):t('emuSyncFailed'))}});
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
 const send=(type:string,extra:object={})=>{if(run)frame.current?.contentWindow?.postMessage({route151Emulator:true,session:run.id,type,...extra},location.origin)};
 const stop=()=>{if(!started){onClose();return}setClosing(true);send('stop')};
 const tracked=run?.tracked!==false;
 return <section className={`emulator-panel ${run&&view==='list'?'list-view':'game-view'}`} aria-label={t('emuTitle')}>
  <div className="emulator-heading"><h2>{t('emuTitle')} · {game.short}</h2>
   {run&&<button className="emulator-view-toggle" onClick={()=>setView(view==='game'?'list':'game')}>{view==='game'?<><ListChecks/>{t('emuShowList')}</>:<><Gamepad/>{t('emuShowGame')}</>}</button>}
   <button onClick={stop} disabled={closing} aria-label={t('emuStop')} title={t('emuStop')}><X/></button></div>
  {!run?<div className="emulator-setup">
   {stored&&!choosing?<>
    <button className="emulator-start emulator-continue" onClick={()=>void start(stored)} disabled={busy}><Play/>{busy?t('emuLoading'):t('emuContinue')}</button>
    <button className="emulator-link" onClick={()=>setChoosing(true)} disabled={busy}>{t('emuOtherRom')}</button>
   </>:<>
    <p>{t('emuIntro')}</p>
    <label>{t('emuRom')}<input type="file" accept=".gba" disabled={busy} onChange={e=>setRom(e.target.files?.[0]??null)}/></label>
    <label>{t('emuSav')}<input type="file" accept=".sav,.srm" disabled={busy} onChange={e=>setSav(e.target.files?.[0]??null)}/></label>
    <button className="emulator-start" onClick={()=>void start(rom)} disabled={!rom||busy}>{busy?t('emuLoading'):t('emuStart')}</button>
   </>}
   <label className="emulator-check"><input type="checkbox" checked={team} disabled={busy} onChange={e=>setTeam(e.target.checked)}/>{t('emuTeam')}</label>
  </div>:<>
   <iframe ref={frame} src="/emulator/index.html" title={t('emuTitle')} allow="autoplay; gamepad; fullscreen; screen-wake-lock" allowFullScreen className="emulator-screen"/>
   <div className="emulator-actions">{tracked&&<label className="emulator-check"><input type="checkbox" checked={auto} onChange={e=>{autoRef.current=e.target.checked;setAuto(e.target.checked);send('live',{on:e.target.checked})}}/>{t('emuAuto')}</label>}
    {tracked&&<button disabled={!started||closing} onClick={()=>send('sync')} aria-label={t('emuSync')} title={t('emuSync')}><RefreshCw/></button>}
    <button disabled={!started||closing} onClick={()=>send('export')}><Download/>{t('emuDownload')}</button>
   </div><p className="emulator-controls">{t('emuControls')}</p>
  </>}
  {run&&started&&tracked&&live!==null&&<p className={`emulator-live ${live?'on':''}`}>{t(live?'emuLiveOn':'emuLiveOff')}</p>}
  {found.length>0&&<p className="emulator-found" aria-live="polite">{t('emuFound',{names:found.join(' · ')})}</p>}
  <p className="emulator-note">{t('emuSaveNote')}</p>
  {note&&<output aria-live="polite">{note}</output>}{error&&<p role="alert">{error}</p>}
  {exportUrl&&<a href={exportUrl} download={`${game.short}.sav`}>{t('emuSaveFile')}</a>}
  <small><a href="https://github.com/EmulatorJS/EmulatorJS/tree/v4.2.3" target="_blank" rel="noreferrer">EmulatorJS 4.2.3</a> · <a href="https://mgba.io" target="_blank" rel="noreferrer">mGBA</a> · <a href="/emulator/LICENSE-EmulatorJS.txt" target="_blank" rel="noreferrer">GPL-3.0</a></small>
 </section>;
}
