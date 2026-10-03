'use client';
import {useEffect,useRef,useState} from 'react';
import {X} from 'lucide-react';
import {Modal} from './modal';
import {BackupBox} from './backup';
import {BackupImportError,readRecovery} from './backup-store';
import {GAMES,battleUrl,type Game,type World} from './games';
import type {Battle} from './battle';
import type {T} from './i18n';
import {loadJson} from './load-json';
import {parseGameSave,SaveFileError,type SaveCatalog} from './save-file';
import type {SaveRecord} from './save-record';
import {PREVIOUS_SAVE,applySaveImport,prepareSaveImport,saveEvidence,supportedPokemon,undoSaveImport} from './save-import';
type Preview={record:SaveRecord;catalog:SaveCatalog;battle:Battle};
export function SaveImportDialog({game,world,tr,onClose}:{game:Game;world:World;tr:T;onClose:()=>void}){
 const {t}=tr;
 const [preview,setPreview]=useState<Preview|null>(null),[busy,setBusy]=useState(false),[note,setNote]=useState<string|null>(null),[team,setTeam]=useState(true),[boxes,setBoxes]=useState(false),[merge,setMerge]=useState(true),[canUndo,setCanUndo]=useState(false),[recoveryRev,setRecoveryRev]=useState(0);
 const request=useRef({version:0});
 const [recoveryPending,setRecoveryPending]=useState(false);
 useEffect(()=>{const pending=request.current;try{const old=JSON.parse(localStorage.getItem(PREVIOUS_SAVE)||'null');setCanUndo(old?.game===game.id);setRecoveryPending(!!readRecovery(localStorage))}catch{setRecoveryPending(true)}return()=>{pending.version++}},[game.id]);
 const reload=()=>{const url=new URL(location.href);url.searchParams.set('game',game.id);location.assign(url.href)};
 const load=async(file:File)=>{
  const id=++request.current.version;setPreview(null);setNote(null);setBusy(true);setBoxes(false);
  try{
   if(file.size!==0x20000)throw new SaveFileError('size');
   const [bytes,catalog,battle]=await Promise.all([file.arrayBuffer(),loadJson<SaveCatalog>(`${game.data}/save-catalog.json`),loadJson<Battle>(battleUrl(game))]);
   const save=parseGameSave(bytes,catalog),digest=await crypto.subtle.digest('SHA-256',bytes);
   const fingerprint=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
   if(id!==request.current.version)return;
   setTeam(save.party.filter(m=>!m.egg).every(m=>supportedPokemon(save,battle).includes(m)));
   setPreview({record:{version:1,game:game.id,filename:file.name,importedAt:new Date().toISOString(),fingerprint,snapshot:{...save,flags:[...save.flags]}},catalog,battle});
  }catch(error){if(id===request.current.version)setNote(error instanceof SaveFileError?t(`sav_${error.code}`):t('savReadFailed'))}
  finally{if(id===request.current.version)setBusy(false)}
 };
 const failed=(error:unknown)=>{const pending=error instanceof BackupImportError&&!error.restored;setRecoveryPending(pending);setNote(pending?t('backupRecoveryNeeded'):t('savApplyFailed'));setRecoveryRev(n=>n+1)};
 const apply=()=>{if(!preview)return;try{const next=prepareSaveImport(localStorage,game,GAMES,preview.record,preview.catalog,world,preview.battle,{team,boxes,merge});applySaveImport(localStorage,next,game.id);reload()}catch(error){failed(error)}};
 const undo=()=>{try{undoSaveImport(localStorage,GAMES);reload()}catch(error){failed(error)}};
 const s=preview?.record.snapshot,compatible=preview&&s?supportedPokemon({...s,flags:new Set(s.flags)},preview.battle):[],supportedParty=s?.party.filter(m=>!m.egg).every(m=>compatible.includes(m))??false;
 const detected=preview&&s?saveEvidence({...s,flags:new Set(s.flags)},preview.catalog,world.markers):[];
 return <Modal className="drawer sav-dialog" label={t('savTitle',{game:game.title})} onClose={onClose}>
  <button data-dialog-focus className="close" onClick={onClose} aria-label={t('close')}><X/></button>
  <h2>{t('savTitle',{game:game.title})}</h2>
  {game.gen!==3?<p>{t('savUnsupported')}</p>:<>
   <p>{t('savIntro')}</p>
   <label className="sav-file">{t('savChoose')}<input type="file" accept=".sav,.srm,application/octet-stream" disabled={busy||recoveryPending} onChange={e=>{const file=e.target.files?.[0];e.target.value='';if(file)void load(file)}}/></label>
   {busy&&<output>{t('savReading')}</output>}
   {s&&preview&&<section className="sav-preview" aria-label={preview.record.filename}>
    <b>{preview.record.filename}</b><p>{t('savTrainer',{name:s.trainer,time:s.playTime})}</p>
    <p>{t('savCounts',{owned:s.owned.length,seen:s.seen.length,badges:s.badges.length})}</p>
    {s.recovered&&<output>{t('savRecovered')}</output>}
    <h3>{t('savParty',{n:s.party.length})}</h3>
    <ul className="sav-party">{s.party.map((mon,i)=><li key={i}><b>{mon.name}{mon.nickname&&mon.nickname.toLowerCase()!==mon.name.toLowerCase()?` (${mon.nickname})`:''} · {t('levelShort',{n:mon.level})}{mon.egg?` · ${t('savEgg')}`:''}</b><span>{mon.moves.filter(Boolean).map(key=>tr.move(preview.battle.moves[key!]?.name??key!.replace(/_/g,' '))).join(' · ')}</span><details><summary>{t('savStats')}</summary><p>{['PS','Atk','Def','SpA','SpD','Spe'].map((label,n)=>`${label}: ${mon.stats[n]} · IV ${mon.ivs[n]} · EV ${mon.evs[n]}`).join(' / ')}</p></details></li>)}</ul>
    <details><summary>{t('savBoxes',{n:s.boxes.length})}</summary><ul className="sav-box-list">{s.boxes.map((mon,i)=><li key={i}>{t('savBox',{n:mon.box!})} · {mon.name} · {t('levelShort',{n:mon.level})}{mon.egg?` · ${t('savEgg')}`:''}</li>)}</ul></details>
    <details><summary>{t('savKeys')}</summary><ul>{s.keyItems.map(item=><li key={item.id}>{tr.name(item.name)} × {item.quantity}</li>)}</ul></details>
    <p>{t('savProven',{n:new Set(detected.map(m=>m.uid)).size})}</p>
    <details><summary>{t('savDetected')}</summary><ul className="sav-box-list">{detected.map(m=><li key={m.id}>{tr.category(m.category)} · {tr.name(m.name)} · {tr.place(m.location)}</li>)}</ul></details>
    <p>{t('savEvidence')}</p>
    {compatible.length<s.party.length+s.boxes.length&&<p>{t('savIncompatible',{n:s.party.length+s.boxes.length-compatible.length})}</p>}
    <label><input type="checkbox" checked={merge} onChange={e=>setMerge(e.target.checked)}/>{t('savMerge')}</label><small>{t('savReplaceNote')}</small>
    <label><input type="checkbox" checked={team} disabled={!supportedParty} onChange={e=>setTeam(e.target.checked)}/>{t('savTeam')}</label>
    {!supportedParty&&<p>{t('savPartyUnavailable')}</p>}
    <label><input type="checkbox" checked={boxes} disabled={!team} onChange={e=>setBoxes(e.target.checked)}/>{t('savReserves',{n:s.boxes.filter(m=>compatible.includes(m)).length})}</label>
    <button className="sav-apply" onClick={apply} disabled={recoveryPending}>{t('savApply')}</button>
   </section>}
   {note&&<p role="alert">{note}</p>}
   {canUndo&&<><button className="sav-undo" onClick={undo} disabled={recoveryPending}>{t('savUndo')}</button><small>{t('savUndoNote')}</small></>}
   <BackupBox key={recoveryRev} tr={tr} compact/>
  </>}
 </Modal>;
}
