'use client';
import {useEffect,useMemo,useState} from 'react';
import {Figure} from './shared';
import type {T} from './i18n';
import type {Dex} from './lists';
import {type Battle,type TeamMon,damage,type Opponent,opponentName,effortText} from './battle';
export * from './battle';
// Recomendación junto a un entrenador o encuentro: solo mira el equipo activo.
// Sin equipo sigue enseñando a los rivales (figurita, nivel y lo que dan), que es
// lo que sirve para prepararse; la flecha y el ataque aparecen al tener equipo.
// El equipo guardado, al dia: se vuelve a leer cuando la pestana Equipo lo cambia.
export function useSavedTeam(storageKey:string){
 const [team,setTeam]=useState<TeamMon[]>([]);
 useEffect(()=>{
  const load=()=>{try{const saved=JSON.parse(localStorage.getItem(storageKey)||'[]');setTeam(Array.isArray(saved)?saved:[])}catch{setTeam([])}};
  const changed=(event:Event)=>{if((event as CustomEvent<string>).detail===storageKey)load()};
  load();addEventListener('route151-team-changed',changed);return()=>removeEventListener('route151-team-changed',changed);
 },[storageKey]);
 return team;
}

export function BattleAdvice({opponents,dex,battle,storageKey,tr,showOpponent=true,inline=false,foeDetail,foeLevel}:{opponents:Opponent[];dex:Dex;battle:Battle|null;storageKey:string;tr:T;showOpponent?:boolean;inline?:boolean;foeDetail?:string|null;foeLevel?:string|null}){
 const team=useSavedTeam(storageKey);
 const rows=useMemo(()=>{
  if(!battle)return [];
  const byName=new Map(dex.species.map(s=>[opponentName(s.name),s]));
  // Un entrenador repite Pokemon ("Machoke Lv38, Machop Lv38, Machoke Lv38"):
  // el consejo es el mismo, asi que cada pareja especie+nivel sale una vez.
  const unique=[...new Map(opponents.map(foe=>[`${opponentName(foe.name)}-${foe.level}`,foe])).values()];
  return unique.flatMap(foe=>{
   const target=byName.get(opponentName(foe.name));if(!target||!battle.species[target.n])return [];
   const best=team.filter(mon=>!mon.bench&&!mon.out).flatMap(mon=>mon.moves.flatMap(key=>{
    const move=key?battle.moves[key]:null,d=move?damage(battle,mon,move,target.n,foe.level):null;
    return move&&d?[{mon,move,d}]:[];
   })).sort((a,b)=>b.d.max-a.d.max)[0];
   const attacker=best?dex.species.find(s=>s.n===best.mon.n):null;
   // Una opción favorable aprovecha debilidad de tipo o deja al rival a un
   // máximo de cuatro golpes incluso con la tirada baja de daño.
   const good=!team.length||(!!best&&!!attacker&&(best.d.eff>1||best.d.min>=25));
   return [{foe,target,best,attacker,good}];
  });
 },[battle,dex,opponents,team]);
 const evsOf=(n:number)=>battle?effortText(battle,[n],tr):null;
 // Lo que suma todo el equipo del entrenador, repetidos incluidos: sale aunque
 // aun no tengas equipo, porque sirve para decidir si merece la pena.
 const total=useMemo(()=>{
  if(!battle||inline||!showOpponent||opponents.length<2)return null;
  const byName=new Map(dex.species.map(s=>[opponentName(s.name),s.n]));
  return effortText(battle,opponents.flatMap(foe=>{const n=byName.get(opponentName(foe.name));return n?[n]:[]}),tr,true);
 },[battle,dex,opponents,inline,showOpponent,tr]);
 const fallbackTarget=useMemo(()=>{
  const foe=opponents[0];return foe?dex.species.find(s=>opponentName(s.name)===opponentName(foe.name))??null:null;
 },[dex,opponents]);
 // En el mapa un encuentro sigue siendo útil aunque aún no haya equipo: se
 // enseña su ficha normal, pero no se inventa una recomendación ni una flecha.
 if(!rows.length)return inline&&fallbackTarget?<div className="battle-advice inline"><div className="battle-match inline battle-match-empty">
  <div className="battle-mon battle-foe"><Figure m={{icon:fallbackTarget.icon,category:'Pokémon'}}/><span><b>{tr.name(fallbackTarget.name)} <em className="battle-lv">{foeLevel??tr.t('battleLevel',{level:opponents[0].level})}</em></b>{foeDetail&&<small>{foeDetail}</small>}{(ev=>ev&&<small className="battle-ev">{ev}</small>)(evsOf(fallbackTarget.n))}</span></div>
 </div></div>:total?<div className="battle-advice"><p className="battle-ev-total">{total}</p></div>:null;
 return <div className={`battle-advice ${inline?'inline':showOpponent?'':'compact'}`}>{rows.map(({foe,target,best,attacker,good})=><div key={`${foe.name}-${foe.level}`}>
  {(()=>{const foeCard=<div className="battle-mon battle-foe"><Figure m={{icon:target.icon,category:'Pokémon'}}/><span><b>{tr.name(target.name)} <em className="battle-lv">{inline&&foeLevel?foeLevel:tr.t('battleLevel',{level:foe.level})}</em></b>{inline&&foeDetail&&<small>{foeDetail}</small>}{(ev=>ev&&<small className="battle-ev">{ev}</small>)(evsOf(target.n))}</span></div>;
   // Sin ataque que recomendar (aun no hay equipo): solo el rival.
   if(!(best&&attacker))return showOpponent?<div className={`battle-match ${inline?'inline battle-match-empty':''} battle-foe-only`}>{foeCard}</div>:null;
   return <div className={`battle-match ${inline?'inline':showOpponent?'':'compact'}`}>
   {showOpponent&&<>{foeCard}
    <i className="battle-arrow" aria-hidden="true">→</i>
   </>}
   {!showOpponent&&<><b className={`battle-context ${good?'good':'poor'}`}>{tr.t(good?'battleGoodAgainst':'battlePoorAgainst',{pokemon:tr.name(target.name)})}</b><i className="battle-arrow" aria-hidden="true">→</i></>}
   <div className="battle-mon"><Figure m={{icon:attacker.icon,category:'Pokémon'}}/><span><b>{tr.name(attacker.name)} <em className="battle-lv">{tr.t('levelShort',{n:best.mon.level})}</em></b><small>{tr.t('battleUse',{move:tr.move(best.move.name)})}</small><small>{tr.t('battleHit',{range:best.d.min===best.d.max?`${best.d.max}`:`${best.d.min}–${best.d.max}`})}</small></span></div>
  </div>})()}
  {!good&&<p className="battle-warning">{tr.t('battleNoGood')}</p>}
 </div>)}{total&&<p className="battle-ev-total">{total}</p>}</div>;
}
