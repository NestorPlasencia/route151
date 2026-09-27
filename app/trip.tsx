'use client';
// Panel de "Como llegar" sobre el mapa: desde donde, los pasos en palabras
// (sal de, ve al norte, entra en, toma el barco) y que MO usar en cada tramo.
import type {Key,T} from './i18n';
import type {How,Leg} from './pathfind';
import {Bird,Footprints} from 'lucide-react';

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
// Los pisos de un mismo edificio (Guarida Rocket B1F, B2F...) si se dicen: en
// una mazmorra hace falta saber por que pisos se baja. `building` da el edificio
// de un piso (null si no es un piso).
export function withoutGates(items:TripItem[],isInterior:(area:string)=>boolean,building:(area:string)=>string|null=()=>null){
 const out:TripItem[]=[];
 items.forEach((it,i)=>{
  const prev=out[out.length-1],next=items[i+1],b=building(it.area);
  const floor=!!b&&((!!next&&building(next.area)===b)||(!!prev&&building(prev.area)===b));
  if(prev&&next&&!floor&&isInterior(it.area)&&it.enter==='door'&&next.enter==='door'&&!it.uses.length
   &&(it.zone===prev.zone||(it.zone===next.zone&&!isInterior(next.area))))return;
  if(prev&&prev.area===it.area&&prev.zone===it.zone){
   for(const u of it.uses)if(!prev.uses.includes(u))prev.uses.push(u);
   prev.pts.push(...it.pts);prev.acts.push(...it.acts);return;
  }
  out.push({...it,pts:[...it.pts],acts:[...it.acts],uses:[...it.uses],prev:prev?.area});
 });
 return out;
}

const USE:Partial<Record<How,Key>>={surf:'moveSurf',cut:'moveCut',strength:'moveStrength',smash:'moveSmash',waterfall:'moveWaterfall',flute:'moveFlute',switch:'moveSwitch',jump:'moveJump'};

// Los pasos de la ruta, desplegados debajo de la barra del objetivo, como parte
// de ella. La ruta sale siempre del ultimo objetivo marcado (o de tu cuarto al
// empezar): se va de objetivo en objetivo.
export function RoutePanel({target,fromRoom,fly,items,partial,status,onStep,labelOf,isInterior,tr}:{
 target:string;fromRoom:boolean;fly:{on:boolean;set:(on:boolean)=>void}|null;items:TripItem[];partial:boolean;status:'loading'|'none'|'ok';
 onStep:(item:TripItem)=>void;labelOf:(item:TripItem)=>string;isInterior:(area:string)=>boolean;tr:T}){
 const {t}=tr;
 const say=(item:TripItem,i:number)=>{
  const where=labelOf(item);
  if(i===0)return item.enter==='fly'?t('routeFly',{place:where}):fromRoom?t('routeRoom'):t('routeStart',{place:where});
  if(item.enter==='ferry')return t('routeFerry',{place:where});
  if(item.enter==='edge')return t('routeEdge',{dir:t(`dir_${item.side??'up'}` as Key),place:where});
  if(item.enter==='door'){
   const inside=isInterior(item.area),before=item.prev?isInterior(item.prev):false;
   return t(inside?(before?'routeFloor':'routeEnter'):'routeExit',{place:where});
  }
  return where;
 };
 return <section className="trip" aria-label={t('routeHow')}>
  <div className="trip-body">
   {/* Con Vuelo: a pie (lo de siempre) o volando a un pueblo que ya visitaste. */}
   {fly&&<div className="trip-mode">
    <button className={fly.on?'':'on'} aria-pressed={!fly.on} onClick={()=>fly.set(false)}><Footprints/>{t('routeWalk')}</button>
    <button className={fly.on?'on':''} aria-pressed={fly.on} onClick={()=>fly.set(true)}><Bird/>{t('routeFlyMode')}</button>
   </div>}
   {status==='loading'&&<p className="trip-note">{t('routeLoading')}</p>}
   {status==='none'&&<p className="trip-note trip-none">{t('routeNone')}</p>}
   {status==='ok'&&<ol className="trip-steps">
    {items.map((item,i)=><li key={i}><button onClick={()=>onStep(item)}>
     <b>{say(item,i)}</b>
     {item.uses.length>0&&<small>{t('routeUses',{list:item.uses.flatMap(u=>USE[u]?[t(USE[u]!)]:[]).join(' · ')})}</small>}
    </button></li>)}
    <li className="trip-end"><b>{t('routeArrive',{name:target})}</b>{partial&&<small>{t('routePartial')}</small>}</li>
   </ol>}
  </div>
 </section>;
}
