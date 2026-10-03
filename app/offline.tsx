'use client';
import {useEffect,useState} from 'react';
import {Download} from 'lucide-react';
import type {T} from './i18n';

type Status={state:'idle'|'downloading'|'ready'|'error'|'busy';completed:number;total:number};
async function request(game:string,type:string,onStatus:(s:Status)=>void){
 const registration=await navigator.serviceWorker.getRegistration();
 const worker=registration?.active;if(!worker)throw new Error('No worker');
 await new Promise<void>((resolve,reject)=>{
  const channel=new MessageChannel();let timer:ReturnType<typeof setTimeout>;
  const finish=(error?:Error)=>{clearTimeout(timer);channel.port1.close();if(error)reject(error);else resolve()};
  const timeout=()=>{clearTimeout(timer);timer=setTimeout(()=>finish(new Error('Timeout')),60000)};
  channel.port1.onmessage=event=>{timeout();const status=event.data as Status;onStatus(status);if(status.state!=='downloading')finish()};
  timeout();worker.postMessage({type,game},[channel.port2]);
 });
}
export function OfflineDownload({game,tr}:{game:string;tr:T}){
 const [status,setStatus]=useState<Status>({state:'idle',completed:0,total:0});
 const [available,setAvailable]=useState(false);
 useEffect(()=>setAvailable(process.env.NODE_ENV==='production'&&'serviceWorker' in navigator),[]);
 useEffect(()=>{let live=true;setStatus({state:'idle',completed:0,total:0});if(available)void request(game,'OFFLINE_STATUS',s=>{if(live)setStatus(s)}).catch(()=>{});return()=>{live=false}},[game,available]);
 const download=async()=>{setStatus({state:'downloading',completed:0,total:0});try{await request(game,'OFFLINE_DOWNLOAD',setStatus)}catch{setStatus({state:'error',completed:0,total:0})}};
 const busy=status.state==='downloading',ready=status.state==='ready';
 return <section className="offline-download" aria-label={tr.t('offlineTitle')}>
  <button disabled={!available||busy||ready} onClick={()=>void download()}><Download/>{tr.t(ready?'offlineReady':status.state==='error'?'retryLoad':'offlineDownload')}</button>
  {busy&&<progress max={status.total||1} value={status.completed}/>}
  <small role={status.state==='error'?'alert':'status'}>{tr.t(!available?'offlineUnavailable':busy?'offlineProgress':ready?'offlineVerified':status.state==='error'||status.state==='busy'?'offlineFailed':'offlineHint',{n:status.completed,total:status.total})}</small>
 </section>;
}
