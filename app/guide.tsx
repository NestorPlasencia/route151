'use client';
// Guia para quien empieza: que hacer ahora y, si toca un lider, como prepararse.
import {useMemo,useState} from 'react';
import {ChevronDown,KeyRound,List,Lock,MapPin,Target} from 'lucide-react';
import {Figure,type Gate,type Marker} from './shared';
import type {T} from './i18n';
import type {Checklist,Dex} from './lists';
import {BattleAdvice,effectiveness,opponentName,trainerOpponents,useSavedTeam,type Battle} from './team';

export const LEADER=/^(Leader|Elite Four|Champion)\b/;

// Marcadores en el orden de la checklist (zonas en orden de juego y, dentro,
// sus pisos en orden de visita): el orden en que se hace la historia.
export function storyOrder(markers:Marker[],checklist:Checklist){
 const at=new Map<string,Marker[]>();
 for(const m of markers){const c=checklist.markers[m.id];if(!c)continue;const k=`${c.zone}\n${c.floor??''}`;(at.get(k)??at.set(k,[]).get(k)!).push(m)}
 return checklist.zones.flatMap(z=>['',...z.floors].flatMap(f=>at.get(`${z.name}\n${f}`)??[]));
}

// Hitos de la historia: lo que piden los bloqueos (el Paquete de Oak, la MO01,
// el Te...) y los lideres, el Alto Mando y el Campeon.
const milestone=(m:Marker,needed:Set<string>)=>needed.has(m.name)||(m.category==='Battle'&&LEADER.test(m.name));

export function NextGoal({markers,checklist,gates,done,unavailable,battle,dex,teamKey,onList,onMap,tr}:{markers:Marker[];checklist:Checklist;gates:Gate[];done:number[];unavailable:(m:Marker)=>string|null;battle:Battle|null;dex:Dex;teamKey:string;onList:(m:Marker)=>void;onMap:(m:Marker)=>void;tr:T}){
 const {t,name,place}=tr;
 const order=useMemo(()=>storyOrder(markers,checklist),[markers,checklist]);
 const story=useMemo(()=>gates.filter(g=>!g.id.startsWith('hm-')),[gates]);
 // El primer hito sin hacer que ya se puede hacer. Si ninguno se puede, el
 // primero sin hacer, con lo que le falta.
 const goal=useMemo(()=>{
  const needed=new Set(story.flatMap(g=>g.needs));
  const left=order.filter(m=>milestone(m,needed)&&!done.includes(m.uid));
  return left.find(m=>!unavailable(m))??left[0]??null;
 },[order,story,done,unavailable]);
 if(!goal)return <section className="goal goal-done"><Target/><p>{t('goalDone')}</p></section>;
 const blockedBy=unavailable(goal);
 // Para que sirve: el primer bloqueo de la historia que lo pide.
 const opens=story.find(g=>g.needs.includes(goal.name));
 const where=checklist.markers[goal.id];
 const leader=goal.category==='Battle';
 return <section className="goal">
  <small className="goal-kicker"><Target/>{t('goalTitle')}</small>
  <div className="goal-main">
   <Figure m={goal}/>
   <div>
    <b>{t(leader?'goalBeat':'goalGet',{name:name(goal.name)})}</b>
    <small>{place(where?.zone??goal.location)}{where?.floor&&where.floor!==where.zone?` · ${place(where.floor.startsWith(where.zone+' ')?where.floor.slice(where.zone.length+1):where.floor)}`:''}</small>
   </div>
  </div>
  {blockedBy?<p className="goal-why goal-blocked"><Lock/>{t('goalFirst',{why:blockedBy})}</p>
   :opens&&<p className="goal-why"><KeyRound/>{opens.why[tr.lang==='es'?'es':'en']}</p>}
  <div className="goal-actions">
   <button onClick={()=>onList(goal)}><List/>{t('goalList')}</button>
   {goal.area&&<button onClick={()=>onMap(goal)}><MapPin/>{t('goalMap')}</button>}
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
    <p className="prep-sub">{t('prepCatch')}</p>
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
