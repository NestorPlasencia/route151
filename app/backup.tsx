'use client';
// Copia de seguridad: todo lo que la app guarda en el navegador (la checklist y
// el equipo de cada juego, el idioma, los filtros) en un archivo para bajarlo y
// volver a cargarlo en otro movil o si se borran los datos del navegador.
import {useEffect,useRef,useState} from 'react';
import {Download,Upload} from 'lucide-react';
import type {T} from './i18n';
import {GAMES} from './games';
import {BACKUP_STAMP as STAMP,BackupImportError,collectBackup,importBackup,parseBackup,readRecovery,recoverBackup,type Backup} from './backup-store';

const download=(b:Backup,recovery=false)=>{
 const blob=new Blob([JSON.stringify(b,null,1)],{type:'application/json'}),url=URL.createObjectURL(blob);
 const a=document.createElement('a');a.href=url;a.download=`ruta151-${recovery?'recovery-':''}${b.date.slice(0,10)}.json`;document.body.append(a);a.click();a.remove();
 setTimeout(()=>URL.revokeObjectURL(url),1000);
};

export function BackupBox({tr,compact=false}:{tr:T;compact?:boolean}){
 const {t}=tr;
 const [last,setLast]=useState<string|null>(null),[note,setNote]=useState<string|null>(null);
 const [recovery,setRecovery]=useState<Backup|null>(null);
 const file=useRef<HTMLInputElement>(null);
 useEffect(()=>{try{setLast(localStorage.getItem(STAMP));const copy=readRecovery(localStorage);if(copy){setRecovery(copy);setNote(t('backupRecoveryNeeded'))}}catch{setNote(t('backupFailed'))}},[t]);
 const save=()=>{
  try{
   const b=collectBackup(localStorage);download(b);
   localStorage.setItem(STAMP,b.date);setLast(b.date);setNote(t('backupSaved'));
  }catch{setNote(t('backupFailed'))}
 };
 // Cargar sustituye lo que hay: se pregunta antes, y se recarga la app para
 // que todo lea el progreso nuevo.
 const load=async(f:File)=>{
  let b:Backup;
  try{b=parseBackup(JSON.parse(await f.text()),GAMES)}catch{setNote(t('backupInvalid'));return}
  if(!confirm(t('backupConfirm',{date:new Date(b.date).toLocaleDateString(tr.lang)})))return;
  try{
   importBackup(localStorage,b);
   location.reload();
  }catch(e){
   if(e instanceof BackupImportError){setNote(t(e.restored?'backupImportFailed':'backupRecoveryNeeded'));if(!e.restored)setRecovery(e.previous)}
   else setNote(t('backupImportFailed'));
  }
 };
 const restore=()=>{if(!recovery)return;try{recoverBackup(localStorage,recovery);location.reload()}catch{setNote(t('backupRecoveryNeeded'))}};
 const days=last?Math.floor((Date.now()-new Date(last).getTime())/86400000):null;
 return <div className={`backup ${compact?'backup-compact':''}`}>
  <div className="backup-text"><b>{t('backupTitle')}</b><small>{days===null?t('backupNever'):days===0?t('backupToday'):days===1?t('backupYesterday'):t('backupDays',{n:days})}</small></div>
  <div className="backup-actions">
   <button onClick={save}><Download/>{t('backupSave')}</button>
   <button disabled={!!recovery} onClick={()=>file.current?.click()}><Upload/>{t('backupLoad')}</button>
   <input ref={file} type="file" accept="application/json,.json" hidden onChange={e=>{const f=e.target.files?.[0];e.target.value='';if(f)void load(f)}}/>
  </div>
  {recovery&&<div className="backup-actions"><button onClick={()=>download(recovery,true)}><Download/>{t('backupRecoverySave')}</button><button onClick={restore}>{t('backupRecoveryRestore')}</button></div>}
  {note&&<output className="backup-note">{note}</output>}
 </div>;
}
