'use client';
// Copia de seguridad: todo lo que la app guarda en el navegador (la checklist y
// el equipo de cada juego, el idioma, los filtros) en un archivo para bajarlo y
// volver a cargarlo en otro movil o si se borran los datos del navegador.
import {useEffect,useRef,useState} from 'react';
import {Download,Upload} from 'lucide-react';
import type {T} from './i18n';

const PREFIX='ruta151-';
const STAMP='ruta151-backup-date';
type Backup={app:'ruta151';version:1;date:string;data:Record<string,string>};

const collect=():Backup=>{
 const data:Record<string,string>={};
 for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);if(k?.startsWith(PREFIX)&&k!==STAMP)data[k]=localStorage.getItem(k)??''}
 return {app:'ruta151',version:1,date:new Date().toISOString(),data};
};
const valid=(b:unknown):b is Backup=>!!b&&typeof b==='object'&&(b as Backup).app==='ruta151'&&typeof (b as Backup).data==='object'
 &&Object.entries((b as Backup).data).every(([k,v])=>k.startsWith(PREFIX)&&typeof v==='string');

export function BackupBox({tr,compact=false}:{tr:T;compact?:boolean}){
 const {t}=tr;
 const [last,setLast]=useState<string|null>(null),[note,setNote]=useState<string|null>(null);
 const file=useRef<HTMLInputElement>(null);
 useEffect(()=>{try{setLast(localStorage.getItem(STAMP))}catch{}},[]);
 const save=()=>{
  try{
   const b=collect(),blob=new Blob([JSON.stringify(b,null,1)],{type:'application/json'}),url=URL.createObjectURL(blob);
   const a=document.createElement('a');a.href=url;a.download=`ruta151-${b.date.slice(0,10)}.json`;document.body.append(a);a.click();a.remove();
   setTimeout(()=>URL.revokeObjectURL(url),1000);
   localStorage.setItem(STAMP,b.date);setLast(b.date);setNote(t('backupSaved'));
  }catch{setNote(t('backupFailed'))}
 };
 // Cargar sustituye lo que hay: se pregunta antes, y se recarga la app para
 // que todo lea el progreso nuevo.
 const load=async(f:File)=>{
  try{
   const b:unknown=JSON.parse(await f.text());
   if(!valid(b)){setNote(t('backupInvalid'));return}
   if(!confirm(t('backupConfirm',{date:new Date(b.date).toLocaleDateString(tr.lang)})))return;
   for(const k of Object.keys(localStorage))if(k.startsWith(PREFIX)&&k!==STAMP)localStorage.removeItem(k);
   for(const [k,v] of Object.entries(b.data))localStorage.setItem(k,v);
   location.reload();
  }catch{setNote(t('backupInvalid'))}
 };
 const days=last?Math.floor((Date.now()-new Date(last).getTime())/86400000):null;
 return <div className={`backup ${compact?'backup-compact':''}`}>
  <div className="backup-text"><b>{t('backupTitle')}</b><small>{days===null?t('backupNever'):days===0?t('backupToday'):days===1?t('backupYesterday'):t('backupDays',{n:days})}</small></div>
  <div className="backup-actions">
   <button onClick={save}><Download/>{t('backupSave')}</button>
   <button onClick={()=>file.current?.click()}><Upload/>{t('backupLoad')}</button>
   <input ref={file} type="file" accept="application/json,.json" hidden onChange={e=>{const f=e.target.files?.[0];e.target.value='';if(f)void load(f)}}/>
  </div>
  {note&&<output className="backup-note">{note}</output>}
 </div>;
}
