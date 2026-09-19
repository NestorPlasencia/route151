'use client';
// Pestanas de lista: la checklist por zonas (en orden de juego) y la Pokedex.
import {useEffect,useMemo,useState} from 'react';
import {Check,MapPin,Search} from 'lucide-react';
import {Figure,colorOf,type Marker} from './shared';
import type {T} from './i18n';

type Zone={name:string;part:number;count:number;floors:string[]};
export type Checklist={source:string;note?:string;parts:{n:number;title:string}[];zones:Zone[];markers:Record<string,{zone:string;floor?:string}>};
type Species={n:number;name:string;icon:string;types:string[];get:'found'|'evo'|'none';found:{zone:string;how:string;ids:string[]}[];from:{n:number;method:string|null}|null;note?:string};
export type Dex={species:Species[]};

const pad=(n:number)=>String(n).padStart(3,'0');
function Progress({done,total}:{done:number;total:number}){const pct=total?Math.round(done/total*100):0;return <span className={`progress ${done===total&&total?'full':''}`}><i><em style={{width:`${pct}%`}}/></i><b>{done}/{total}</b></span>}

export function ChecklistView({markers,checklist,done,toggleDone,onShow,detail,tr}:{markers:Marker[];checklist:Checklist;done:number[];toggleDone:(uid:number)=>void;onShow:(m:Marker)=>void;detail:(m:Marker)=>string|null;tr:T}){
 const {t,category}=tr;
 const [query,setQuery]=useState(''),[hideDone,setHideDone]=useState(false),[off,setOff]=useState<string[]>([]),[open,setOpen]=useState<string[]>([]);
 const isDone=(m:Marker)=>done.includes(m.uid);
 const categories=useMemo(()=>{const c=new Map<string,number>();markers.forEach(m=>c.set(m.category,(c.get(m.category)??0)+1));return [...c]},[markers]);
 // Zona -> (lista suelta de Kanto, pisos en orden de visita).
 const byZone=useMemo(()=>{const out=new Map<string,Map<string,Marker[]>>();for(const m of markers){const z=checklist.markers[m.id];if(!z)continue;const floors=out.get(z.zone)??out.set(z.zone,new Map()).get(z.zone)!;const k=z.floor??'';(floors.get(k)??floors.set(k,[]).get(k)!).push(m)}return out},[markers,checklist]);
 const q=query.trim().toLowerCase();
 const keep=(m:Marker)=>!off.includes(m.category)&&(!hideDone||!isDone(m))&&(!q||`${m.name} ${m.location}`.toLowerCase().includes(q));
 const total=markers.length,completed=markers.filter(isDone).length;
 const toggle=(z:string)=>setOpen(o=>o.includes(z)?o.filter(x=>x!==z):[...o,z]);
 return <div className="listview">
  <div className="list-head">
   <div className="list-title"><h2>{t('tabChecklist')}</h2><Progress done={completed} total={total}/></div>
   <label className="list-search"><Search/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder={t('searchChecklist')}/></label>
   <div className="list-filters">
    <button className={`chip ${hideDone?'on':''}`} onClick={()=>setHideDone(v=>!v)}><Check/>{t('hideCompleted')}</button>
    {categories.map(([c,n])=><button key={c} className={`chip ${off.includes(c)?'':'on'}`} style={{'--c':colorOf(c)} as React.CSSProperties} onClick={()=>setOff(o=>o.includes(c)?o.filter(x=>x!==c):[...o,c])}><i/>{category(c)}<b>{n}</b></button>)}
   </div>
  </div>
  <div className="list-body">
   {checklist.parts.map(part=>{
    const zones=checklist.zones.filter(z=>z.part===part.n&&byZone.has(z.name));
    const all=zones.flatMap(z=>[...byZone.get(z.name)!.values()].flat());
    if(!all.some(keep))return null;
    return <section key={part.n} className="part">
     <h3><span className="part-n">{t('part',{n:part.n})}</span>{part.title}<Progress done={all.filter(isDone).length} total={all.length}/></h3>
     {zones.map(z=>{
      const floors=byZone.get(z.name)!,items=[...floors.values()].flat();
      if(!items.some(keep))return null;
      const expanded=!!q||open.includes(z.name);
      const order=['',...z.floors].filter(f=>floors.has(f));
      return <div key={z.name} className={`zone ${expanded?'open':''}`}>
       <button className="zone-head" onClick={()=>toggle(z.name)} aria-expanded={expanded}><b>{z.name}</b><Progress done={items.filter(isDone).length} total={items.length}/></button>
       {expanded&&order.map(f=>{const rows=floors.get(f)!.filter(keep);if(!rows.length)return null;return <div key={f||'_'} className="floor">
        {f&&<h4>{f.startsWith(z.name+' ')?f.slice(z.name.length+1):f}</h4>}
        {rows.map(m=>{const d=detail(m);return <div key={m.id} className={`row ${isDone(m)?'done':''}`}>
         <button className={`tick ${isDone(m)?'on':''}`} aria-label={t('markDone')} onClick={()=>toggleDone(m.uid)}>{isDone(m)&&<Check/>}</button>
         <Figure m={m}/>
         <span className="row-text"><b>{m.name}</b><small>{d??category(m.category)}</small></span>
         <button className="show" onClick={()=>onShow(m)} aria-label={t('showOnMap',{name:m.name})}><MapPin/></button>
        </div>})}
       </div>})}
      </div>})}
    </section>})}
   <p className="list-source">{checklist.note?<a href={checklist.source} target="_blank" rel="noreferrer">{t('orderStory')}</a>:<>{t('orderSource')}<a href={checklist.source} target="_blank" rel="noreferrer">{t('orderLink')}</a>.</>}</p>
  </div>
 </div>;
}


// uid de las entradas de la checklist de una especie (salvaje, regalo, intercambio).
const uidsOf=(byId:Map<string,Marker>,s:Species)=>[...new Set(s.found.flatMap(f=>f.ids.flatMap(id=>{const m=byId.get(id);return m?[m.uid]:[]})))];

export function PokedexView({dex,byId,done,setMany,onShow,game,storageKey,tr}:{dex:Dex;byId:Map<string,Marker>;done:number[];setMany:(uids:number[],on:boolean)=>void;onShow:(m:Marker)=>void;game:string;storageKey:string;tr:T}){
 const {t,how,type,note,evo}=tr;
 // Sincronizada con la checklist: una especie con entradas alli esta registrada
 // si alguna esta completa, y marcarla aqui marca (o desmarca) todas. Las que no
 // tienen entradas (solo se consiguen evolucionando) se registran a mano.
 const [manual,setManual]=useState<number[]>([]),[query,setQuery]=useState(''),[filter,setFilter]=useState<'all'|'missing'|'caught'>('all'),[openN,setOpenN]=useState<number|null>(null);
 const saveManual=(next:number[])=>{setManual(next);try{localStorage.setItem(storageKey,JSON.stringify(next))}catch{}};
 useEffect(()=>{
  let list:number[]=[];try{list=JSON.parse(localStorage.getItem(storageKey)||'[]')}catch{}
  // Registros manuales de antes de sincronizar: si la especie tiene entradas, pasan a la checklist.
  const linked=dex.species.filter(s=>list.includes(s.n)&&uidsOf(byId,s).length);
  if(linked.length){setMany(linked.flatMap(s=>uidsOf(byId,s)),true);list=list.filter(n=>!linked.some(s=>s.n===n));try{localStorage.setItem(storageKey,JSON.stringify(list))}catch{}}
  setManual(list);
 },[storageKey,dex,byId,setMany]);
 const viaList=(s:Species)=>uidsOf(byId,s).some(uid=>done.includes(uid));
 const caught=(s:Species)=>uidsOf(byId,s).length?viaList(s):manual.includes(s.n);
 const toggle=(s:Species)=>{const uids=uidsOf(byId,s);if(uids.length)setMany(uids,!caught(s));else saveManual(manual.includes(s.n)?manual.filter(x=>x!==s.n):[...manual,s.n])};
 const names=useMemo(()=>new Map(dex.species.map(s=>[s.n,s.name])),[dex]);
 const q=query.trim().toLowerCase();
 const shown=dex.species.filter(s=>(filter==='all'||(filter==='caught')===caught(s))&&(!q||s.name.toLowerCase().includes(q)||pad(s.n).includes(q)));
 const count=dex.species.filter(caught).length;
 return <div className="listview">
  <div className="list-head">
   <div className="list-title"><h2>{t('tabDex')}</h2><Progress done={count} total={dex.species.length}/></div>
   <label className="list-search"><Search/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder={t('searchDex')}/></label>
   <div className="list-filters">{([['all',t('filterAll')],['missing',t('filterMissing')],['caught',t('filterCaught')]] as const).map(([k,t])=><button key={k} className={`chip ${filter===k?'on':''}`} onClick={()=>setFilter(k)}>{t}</button>)}</div>
  </div>
  <div className="list-body dex">
   {shown.map(s=>{const c=caught(s),isOpen=openN===s.n;
    const where=s.get==='found'?s.found.slice(0,2).map(f=>`${f.zone} · ${how(f.how)}`).join(' / ')+(s.found.length>2?t('andMore',{n:s.found.length-2}):'')
     :s.get==='evo'&&s.from?t(s.from.method?'evolvesFromHow':'evolvesFrom',{name:names.get(s.from.n)??'',how:evo(s.from.method??'')})
     :t('notAvailable',{game});
    return <div key={s.n} className={`dex-row ${c?'done':''} ${s.get==='none'?'unavailable':''}`}>
     <button className={`tick ${c?'on':''}`} aria-label={t('registered')} onClick={()=>toggle(s)} title={uidsOf(byId,s).length?t('syncedChecklist'):undefined}>{c&&<Check/>}</button>
     <Figure m={{icon:s.icon,category:'Pokémon'}}/>
     <button className="dex-text" onClick={()=>setOpenN(isOpen?null:s.n)} aria-expanded={isOpen}>
      <b><em>#{pad(s.n)}</em>{s.name}</b>
      <span className="types">{s.types.map(ty=><i key={ty} className={`type t-${ty}`}>{type(ty)}</i>)}</span>
      <small>{where}</small>
     </button>
     {isOpen&&<div className="dex-more">
      {s.note&&<p>{note(s.note)}</p>}
      {s.found.map(f=>{const m=f.ids.map(id=>byId.get(id)).find(Boolean);return <div key={f.zone+f.how}><span>{f.zone}<small>{how(f.how)}</small></span>{m&&<button className="show" onClick={()=>onShow(m)} aria-label={t('showOnMap',{name:f.zone})}><MapPin/></button>}</div>})}
      {s.get==='evo'&&s.from&&<p>{t(s.from.method?'getAndEvolveHow':'getAndEvolve',{name:names.get(s.from.n)??'',how:evo(s.from.method??'')})}</p>}
      {s.get==='none'&&!s.note&&<p>{t('tradeOver',{game})}</p>}
     </div>}
    </div>})}
   {!shown.length&&<p className="list-empty">{t('emptyFilter')}</p>}
  </div>
 </div>;
}
