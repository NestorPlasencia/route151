'use client';
// Panel de "Como llegar" sobre el mapa: desde donde, los pasos en palabras
// (sal de, ve al norte, entra en, toma el barco) y que MO usar en cada tramo.
import {useState} from 'react';
import {Check,ChevronDown,Footprints,MapPin,X} from 'lucide-react';
import type {Key,T} from './i18n';
import type {How,Leg} from './pathfind';

// Un paso por lugar: los mapas seguidos de una misma zona y area se juntan.
export type TripItem={area:string;zone:string;enter:How;side?:string;uses:How[];pts:[number,number][];acts:Leg['acts'];prev?:string};
export function tripItems(legs:Leg[]):TripItem[]{
 const out:TripItem[]=[];
 for(const leg of legs){
  const last=out[out.length-1];
  if(last&&last.area===leg.area&&last.zone===leg.zone&&leg.enter!=='door'&&leg.enter!=='ferry'){
   for(const u of leg.uses)if(!last.uses.includes(u))last.uses.push(u);
   last.pts.push(...leg.pts);last.acts.push(...leg.acts);continue;
  }
  out.push({area:leg.area,zone:leg.zone,enter:leg.enter,side:leg.side,uses:[...leg.uses],pts:[...leg.pts],acts:[...leg.acts],prev:last?.area});
 }
 return out;
}

// Las casetas de paso (entre la ruta y el bosque) no son un paso: un interior en
// el que se entra y se sale por puertas se quita si es de la zona de la que
// vienes, o de la del exterior al que sales. Una cueva de su propia zona (la
// Cueva Diglett) se queda. Si al quitarla quedan dos pasos del mismo sitio
// seguidos, se juntan.
export function withoutGates(items:TripItem[],isInterior:(area:string)=>boolean){
 const out:TripItem[]=[];
 items.forEach((it,i)=>{
  const prev=out[out.length-1],next=items[i+1];
  if(prev&&next&&isInterior(it.area)&&it.enter==='door'&&next.enter==='door'&&!it.uses.length
   &&(it.zone===prev.zone||(it.zone===next.zone&&!isInterior(next.area))))return;
  if(prev&&prev.area===it.area&&prev.zone===it.zone){
   for(const u of it.uses)if(!prev.uses.includes(u))prev.uses.push(u);
   prev.pts.push(...it.pts);prev.acts.push(...it.acts);return;
  }
  out.push({...it,pts:[...it.pts],acts:[...it.acts],uses:[...it.uses],prev:prev?.area});
 });
 return out;
}

const USE:Partial<Record<How,Key>>={surf:'moveSurf',cut:'moveCut',strength:'moveStrength',smash:'moveSmash',waterfall:'moveWaterfall',jump:'moveJump'};

export function RoutePanel({target,done,next,onNext,from,fromRoom,zones,onFrom,onHere,picking,onCancelPick,items,partial,status,onStep,onClose,labelOf,isInterior,tr}:{
 target:string;done:boolean;next:string|null;onNext:()=>void;from:string;fromRoom:boolean;zones:string[];onFrom:(zone:string)=>void;onHere:()=>void;picking:boolean;onCancelPick:()=>void;items:TripItem[];partial:boolean;status:'loading'|'none'|'ok';
 onStep:(item:TripItem)=>void;onClose:()=>void;labelOf:(item:TripItem)=>string;isInterior:(area:string)=>boolean;tr:T}){
 const {t,place}=tr;
 // Plegado de inicio: una linea, para que se vea el mapa y el camino dibujado.
 const [open,setOpen]=useState(false);
 const say=(item:TripItem,i:number)=>{
  const where=labelOf(item);
  if(i===0)return fromRoom?t('routeRoom'):t('routeStart',{place:where});
  if(item.enter==='ferry')return t('routeFerry',{place:where});
  if(item.enter==='edge')return t('routeEdge',{dir:t(`dir_${item.side??'up'}` as Key),place:where});
  if(item.enter==='door'){
   const inside=isInterior(item.area),before=item.prev?isInterior(item.prev):false;
   return t(inside?(before?'routeFloor':'routeEnter'):'routeExit',{place:where});
  }
  return where;
 };
 return <section className={`trip ${open?'open':''}`} aria-label={t('routeHow')}>
  <div className="trip-head">
   <button className="trip-toggle" onClick={()=>setOpen(v=>!v)} aria-expanded={open}><Footprints/><span><small>{t('routeHow')}</small><b>{target}</b>{!open&&!done&&status==='ok'&&<em>{t(items.length+1===1?'routeStepsOne':'routeSteps',{n:items.length+1})}</em>}{!open&&!done&&status==='none'&&<em className="trip-none">{t('routeNoneShort')}</em>}</span><ChevronDown/></button>
   <button className="trip-close" onClick={onClose} aria-label={t('routeClose')}><X/></button>
  </div>
  {/* Eligiendo donde estas: el panel se encoge para dejar ver el mapa. */}
  {picking&&<div className="trip-pick"><MapPin/><span>{t('routePick')}</span><button onClick={onCancelPick}>{t('cancel')}</button></div>}
  {/* Llegaste y lo marcaste: de aqui mismo, al siguiente objetivo. */}
  {done&&<div className="trip-done"><b><Check/>{t('routeDone')}</b>
   {next&&<button onClick={onNext}><Footprints/><span>{t('routeNext',{name:next})}</span></button>}</div>}
  {open&&!picking&&!done&&<div className="trip-body">
   <div className="trip-from">
    <label><span>{t('routeFromLabel')}</span><select value={from} onChange={e=>onFrom(e.target.value)}>{zones.map(z=><option key={z} value={z}>{place(z)}</option>)}</select><ChevronDown/></label>
    <button onClick={onHere}><MapPin/>{t('routeHere')}</button>
   </div>
   {status==='loading'&&<p className="trip-note">{t('routeLoading')}</p>}
   {status==='none'&&<p className="trip-note trip-none">{t('routeNone')}</p>}
   {status==='ok'&&<ol className="trip-steps">
    {items.map((item,i)=><li key={i}><button onClick={()=>onStep(item)}>
     <b>{say(item,i)}</b>
     {item.uses.length>0&&<small>{t('routeUses',{list:item.uses.flatMap(u=>USE[u]?[t(USE[u]!)]:[]).join(' · ')})}</small>}
    </button></li>)}
    <li className="trip-end"><b>{t('routeArrive',{name:target})}</b>{partial&&<small>{t('routePartial')}</small>}</li>
   </ol>}
  </div>}
 </section>;
}
