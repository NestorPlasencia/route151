'use client';
// Guia para quien empieza: que hacer ahora y, si toca un lider, como prepararse.
import {useMemo,useState} from 'react';
import {ChevronDown,Footprints,Info,KeyRound,List,Lock,LockOpen,MapPin,Target,X} from 'lucide-react';
import {Help} from './learn';
import {Figure,type Gate,type Marker} from './shared';
import type {T} from './i18n';
import type {Checklist,Dex} from './lists';
import {BattleAdvice,effectiveness,opponentName,trainerOpponents,useSavedTeam,type Battle} from './team';

export const LEADER=/^(Leader|Elite Four|Champion)\b/;
const RIVAL=/^Rival\b/,HM=/^HM0\d$/;

// Marcadores en el orden de la checklist (zonas en orden de juego y, dentro,
// sus pisos en orden de visita): el orden en que se hace la historia.
export function storyOrder(markers:Marker[],checklist:Checklist){
 const at=new Map<string,Marker[]>();
 for(const m of markers){const c=checklist.markers[m.id];if(!c)continue;const k=`${c.zone}\n${c.floor??''}`;(at.get(k)??at.set(k,[]).get(k)!).push(m)}
 return checklist.zones.flatMap(z=>['',...z.floors].flatMap(f=>at.get(`${z.name}\n${f}`)??[]));
}

// Hitos de la historia: lo que piden los bloqueos (el Paquete de Oak, la MO01,
// el Te...), los pasos de la historia (goals.json), los lideres, el Alto Mando y
// el Campeon, y en el pueblo de salida
// el primer Pokemon y el combate con el rival.
// Tambien los combates con el rival y todas las MO (Destello no abre nada, pero
// sin ella el Tunel Roca esta a oscuras).
const milestone=(m:Marker,needed:Set<string>,home:boolean)=>m.category==='Story'||needed.has(m.name)||(m.category==='Battle'&&(LEADER.test(m.name)||RIVAL.test(m.name)))||HM.test(m.name)
 ||(home&&(m.category==='In-Game Gift Pokémon'||(m.category==='Battle'&&m.name==='Rival')));

// El siguiente objetivo de goals.json: el primero sin hacer (ni descartado por
// otra eleccion). Lo usan la tarjeta de la checklist y la barra del mapa.
export const nextGoalOf=(markers:Marker[],goals:string[],settled:(m:Marker)=>boolean)=>{
 const byId=new Map(markers.map(m=>[m.id,m]));return goals.map(id=>byId.get(id)).find(m=>!!m&&!settled(m))??null;
};
// Como se dice un objetivo: un paso con su nombre; el primer Pokemon y el rival a
// su manera; un combate, "Vence a"; lo demas, "Consigue".
export function goalTitle(goal:Marker,markers:Marker[],checklist:Checklist,tr:T){
 const {t,name}=tr,home=checklist.zones[0]?.name??'',inHome=checklist.markers[goal.id]?.zone===home;
 if(goal.category==='Story')return name(goal.name);
 if(inHome&&goal.category==='In-Game Gift Pokémon'){
  const n=markers.filter(m=>checklist.markers[m.id]?.zone===home&&m.category==='In-Game Gift Pokémon').length;
  return t(n>1?'goalStarter':'goalReceive',{name:name(goal.name)});
 }
 if(goal.category==='Battle'&&RIVAL.test(goal.name))return t('goalRival');
 return t(goal.category==='Battle'?'goalBeat':'goalGet',{name:name(goal.name)});
}

export function NextGoal({markers,checklist,gates,goals,goalNotes,settled,done,unavailable,battle,dex,teamKey,onList,onMap,onRoute,tr}:{markers:Marker[];checklist:Checklist;gates:Gate[];goals:string[];goalNotes:Record<string,{en:string;es:string}>;settled:(m:Marker)=>boolean;done:number[];unavailable:(m:Marker)=>string|null;battle:Battle|null;dex:Dex;teamKey:string;onList:(m:Marker)=>void;onMap:(m:Marker)=>void;onRoute:(m:Marker)=>void;tr:T}){
 const {t,name,place}=tr;
 const order=useMemo(()=>storyOrder(markers,checklist),[markers,checklist]);
 const story=useMemo(()=>gates.filter(g=>!g.id.startsWith('hm-')),[gates]);
 // El primer hito sin hacer que ya se puede hacer. Si ninguno se puede, el
 // primero sin hacer, con lo que le falta.
 const goal=useMemo(()=>{
  // Con goals.json manda la lista: el primero sin hacer (o sin elegir otro en
  // su lugar, como el inicial de FRLG). Si aun no se puede, sale con lo que pide.
  if(goals.length)return nextGoalOf(markers,goals,settled);
  const needed=new Set(story.flatMap(g=>g.needs)),home=checklist.zones[0]?.name;
  const atHome=(m:Marker)=>checklist.markers[m.id]?.zone===home;
  // Se elige un Pokemon inicial entre varios (FRLG): con uno marcado, los otros sobran.
  const chose=order.some(m=>atHome(m)&&m.category==='In-Game Gift Pokémon'&&done.includes(m.uid));
  const left=order.filter(m=>milestone(m,needed,atHome(m))&&!done.includes(m.uid)&&!(chose&&atHome(m)&&m.category==='In-Game Gift Pokémon'));
  return left.find(m=>!unavailable(m))??left[0]??null;
 },[order,story,done,unavailable,checklist,goals,markers,settled]);
 if(!goal)return <section className="goal goal-done"><Target/><p>{t('goalDone')}</p></section>;
 const blockedBy=unavailable(goal);
 // Para que sirve: la zona que abre (un bloqueo de zona o mapa que lo pide) o,
 // si solo lleva a otro paso, ese paso. El requisito del paso siguiente ("antes
 // recoge el paquete") no se ensena aqui: parecia pedir ya ese paso.
 const opens=story.find(g=>g.needs.includes(goal.name)&&(!!g.zones||!!g.maps));
 const then=story.find(g=>g.needs.includes(goal.name)&&!!g.markers);
 const thenName=then&&markers.find(m=>then.markers!.includes(m.id))?.name;
 const where=checklist.markers[goal.id];
 const leader=goal.category==='Battle',step=goal.category==='Story',home=checklist.zones[0]?.name??'';
 // El primer Pokemon y el rival del pueblo de salida se cuentan a su manera.
 const inHome=where?.zone===home,starter=inHome&&goal.category==='In-Game Gift Pokémon',rival=leader&&RIVAL.test(goal.name);
 return <section className="goal">
  <small className="goal-kicker"><Target/>{t('goalTitle')}</small>
  <div className="goal-main">
   <Figure m={goal}/>
   <div>
    <b>{goalTitle(goal,markers,checklist,tr)}</b>
    <small>{place(where?.zone??goal.location)}{where?.floor&&where.floor!==where.zone?` · ${place(where.floor.startsWith(where.zone+' ')?where.floor.slice(where.zone.length+1):where.floor)}`:''}</small>
   </div>
  </div>
  {blockedBy?<p className="goal-why goal-blocked"><Lock/>{t('goalFirst',{why:blockedBy})}</p>
   :goalNotes[goal.id]?<p className="goal-why"><Info/>{goalNotes[goal.id][tr.lang==='es'?'es':'en']}</p>
   :step&&goal.detail?<p className="goal-why">{tr.detail(goal.detail)}</p>
   :starter?<p className="goal-why">{t('goalStarterNote')}</p>
   :rival&&inHome?<p className="goal-why">{t('goalRivalNote')}</p>
   :opens?<p className="goal-why"><KeyRound/>{opens.why[tr.lang==='es'?'es':'en']}</p>
   :thenName&&<p className="goal-why"><KeyRound/>{t('goalThen',{name:name(thenName)})}</p>}
  <div className="goal-actions">
   <button onClick={()=>onList(goal)}><List/>{t('goalList')}</button>
   {/* Como llegar ensena ademas el sitio en el mapa; si aun no se puede, solo el sitio. */}
   {goal.area&&(blockedBy?<button onClick={()=>onMap(goal)}><MapPin/>{t('goalMap')}</button>:<button className="goal-go" onClick={()=>onRoute(goal)}><Footprints/>{t('routeHow')}</button>)}
  </div>
  {leader&&!blockedBy&&<Prepare goal={goal} order={order} unavailable={unavailable} battle={battle} dex={dex} teamKey={teamKey} onMap={onMap} tr={tr}/>}
 </section>;
}

// Preparar un combate de lider: su equipo y tipos, si tu equipo llega de
// nivel, a quien usar, y que Pokemon puedes atrapar ya que le ganan por tipo.
function Prepare({goal,order,unavailable,battle,dex,teamKey,onMap,tr}:{goal:Marker;order:Marker[];unavailable:(m:Marker)=>string|null;battle:Battle|null;dex:Dex;teamKey:string;onMap:(m:Marker)=>void;tr:T}){
 const {t,name,type,place}=tr;
 const [open,setOpen]=useState(false);
 const team=useSavedTeam(teamKey).filter(mon=>!mon.bench&&!mon.out);
 const foes=useMemo(()=>trainerOpponents(goal.detail),[goal]);
 const byName=useMemo(()=>new Map(dex.species.map(s=>[opponentName(s.name),s])),[dex]);
 const foeTypes=useMemo(()=>foes.map(f=>byName.get(opponentName(f.name))?.types??[]).filter(ts=>ts.length),[foes,byName]);
 const types=[...new Set(foeTypes.flat())];
 const ace=Math.max(0,...foes.map(f=>f.level));
 const mine=team.length?Math.max(...team.map(mon=>mon.level)):0;
 // Salvajes que ya puedes atrapar, de aqui hacia atras en la historia, que
 // pegan fuerte a la mayoria de su equipo y aguantan sus golpes. Por tipo: el
 // Pokemon tiene que saber (o aprender) un ataque de ese tipo.
 const catchable=useMemo(()=>{
  if(!battle||!foeTypes.length)return [];
  const upTo=order.indexOf(goal),seen=new Set<string>();
  const avg=(xs:number[])=>xs.reduce((a,b)=>a+b,0)/xs.length;
  return order.slice(0,upTo).flatMap(m=>{
   if(m.category!=='Pokémon'||!m.encounter||unavailable(m)||seen.has(m.name))return [];
   seen.add(m.name);
   const s=byName.get(opponentName(m.name));if(!s)return [];
   const off=avg(foeTypes.map(ft=>Math.max(...s.types.map(own=>effectiveness(battle.chart,own,ft)))));
   const def=avg(foeTypes.map(ft=>Math.max(...ft.map(foe=>effectiveness(battle.chart,foe,s.types)))));
   return off>=2?[{m,s,off,def}]:[];
  }).sort((a,b)=>b.off-a.off||a.def-b.def).slice(0,3);
 },[battle,foeTypes,order,goal,unavailable,byName]);
 return <div className="prep">
  <button className="prep-head" onClick={()=>setOpen(v=>!v)} aria-expanded={open}><b>{t('prepTitle')}</b><span>{types.map(type).join(' · ')}</span><ChevronDown/></button>
  {open&&<div className="prep-body">
   <p>{t('prepTeam',{list:foes.map(f=>`${name(f.name)} ${t('levelShort',{n:f.level})}`).join(', ')})}</p>
   {!team.length?<p className="prep-note">{t('prepNoTeam')}</p>
    :<p className={mine<ace-2?'prep-warn':'prep-ok'}>{t(mine<ace-2?'prepLow':'prepOk',{mine,theirs:ace})}</p>}
   {catchable.length>0&&<>
    <p className="prep-sub">{t('prepCatch')}<Help term="effective" gen={battle?.gen??3} tr={tr}/></p>
    <ul className="prep-catch">{catchable.map(({m,s})=><li key={m.id}>
     <Figure m={{icon:s.icon,category:'Pokémon'}}/><span><b>{name(s.name)}</b><small>{s.types.map(type).join(' · ')} · {place(m.encounter!.zone)}</small></span>
     {m.area&&<button onClick={()=>onMap(m)} aria-label={t('showOnMap',{name:name(s.name)})}><MapPin/></button>}
    </li>)}</ul>
    <p className="prep-note">{t('prepCatchNote')}</p>
   </>}
   {team.length>0&&<><p className="prep-sub">{t('prepAdvice')}</p><BattleAdvice opponents={foes} dex={dex} battle={battle} storageKey={teamKey} tr={tr}/></>}
  </div>}
 </div>;
}

// Lo que acaba de abrir un marcador (la MO01 abre lo que hay tras los arboles,
// una medalla el siguiente gimnasio): por zonas, en orden de historia, para
// volver a por ello. Se queda hasta que se cierra.
export type Unlock={by:string;items:Marker[]};
export function Unlocked({unlock,checklist,onZone,onDismiss,tr}:{unlock:Unlock;checklist:Checklist;onZone:(zone:string)=>void;onDismiss:()=>void;tr:T}){
 const {t,name,place}=tr;
 const zones=checklist.zones.map(z=>[z.name,unlock.items.filter(m=>checklist.markers[m.id]?.zone===z.name).length] as const).filter(([,n])=>n>0);
 const n=unlock.items.length;
 return <section className="unlock">
  <div className="unlock-head"><LockOpen/><b>{t(n===1?'unlockTitleOne':'unlockTitle',{name:name(unlock.by),n})}</b>
   <button className="unlock-close" onClick={onDismiss} aria-label={t('dismiss')}><X/></button></div>
  <div className="unlock-zones">{zones.map(([z,count])=><button key={z} onClick={()=>onZone(z)}>{t('unlockZone',{zone:place(z),n:count})}</button>)}</div>
 </section>;
}
