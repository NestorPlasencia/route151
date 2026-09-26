'use client';
// Ranking (solo FireRed/LeafGreen, dentro de la pestana de la Pokedex): que
// Pokemon merece mas la pena entrenar, de mayor a menor. Es el valor para
// entrenar del equipo con todo supuesto (IVs medios y naturaleza neutra), asi
// que solo depende de la especie. Cada fila es una forma final con su familia:
// se entrena Magikarp por el Gyarados que sera, y Eevee sale una vez por cada
// evolucion.
import {useEffect,useMemo,useState,type ReactNode} from 'react';
import {Search} from 'lucide-react';
import {Figure,type Marker} from './shared';
import {finalForms,trainingBand,trainingValue,type Battle,type TeamMon} from './team';
import type {T} from './i18n';
import {caughtSpecies,type Dex} from './lists';

// Legendarios de Kanto y Johto: uno de cada por partida, asi que se pueden
// quitar de la lista para ver lo que si se elige entrenar.
const LEGENDARY=new Set([144,145,146,150,151,243,244,245,249,250,251]);

type Filter='caught'|'noLegendary'|'noTrade';

export function RankingView({dex,battle,byId,done,dexKey,storageKey,switcher,tr}:{dex:Dex;battle:Battle|null;byId:Map<string,Marker>;done:number[];dexKey:string;storageKey:string;switcher?:ReactNode;tr:T}){
 const {t,type}=tr;
 const [query,setQuery]=useState(''),[team,setTeam]=useState<number[]>([]),[manual,setManual]=useState<number[]>([]),[on,setOn]=useState<Filter[]>([]);
 // Las familias que ya llevas se marcan, para ver de un vistazo donde quedan.
 useEffect(()=>{try{const saved:TeamMon[]=JSON.parse(localStorage.getItem(storageKey)||'[]');setTeam(Array.isArray(saved)?saved.map(mon=>mon.n):[])}catch{setTeam([])}},[storageKey]);
 // Lo registrado a mano en la Pokedex (las especies sin entradas en la checklist).
 useEffect(()=>{try{const saved=JSON.parse(localStorage.getItem(dexKey)||'[]');setManual(Array.isArray(saved)?saved:[])}catch{setManual([])}},[dexKey]);
 const caught=useMemo(()=>caughtSpecies(dex,byId,done,manual),[dex,byId,done,manual]);
 const rows=useMemo(()=>{
  if(!battle)return [];
  const byN=new Map(dex.species.map(s=>[s.n,s]));
  // La familia, de la primera forma a la final, siguiendo de quien evoluciona.
  const family=(n:number)=>{const chain=[];for(let at:number|undefined=n;at&&byN.has(at);at=byN.get(at)!.from?.n)chain.unshift(at);return chain};
  // Sin intercambiar con otra consola: se encuentra en el juego (los cambios con
  // gente del juego valen) o sale de uno que si, sin evolucionar por intercambio.
  const alone=(n:number):boolean=>{const s=byN.get(n);if(!s)return false;
   return s.get==='found'||(!!s.from&&s.from.method!=='trade'&&alone(s.from.n))};
  const finals=new Set(dex.species.filter(s=>battle.species[s.n]).flatMap(s=>finalForms(dex,battle,s.n)));
  return [...finals].flatMap(n=>{
   const value=trainingValue(battle,[n],'Hardy',null),species=byN.get(n);
   return value&&species?[{...value,species,family:family(n),trade:!alone(n)}]:[];
  }).sort((a,b)=>b.score-a.score||b.top-a.top||a.into-b.into);
 },[dex,battle]);
 const q=query.trim().toLowerCase(),names=new Map(dex.species.map(s=>[s.n,s.name]));
 // "Atrapados" cuenta la familia entera: con un Abra registrado sale Alakazam.
 const shown=rows.filter(row=>(!on.includes('caught')||row.family.some(n=>caught.has(n)))
  &&(!on.includes('noLegendary')||!LEGENDARY.has(row.into))
  &&(!on.includes('noTrade')||!row.trade)
  // Se busca por cualquier miembro de la familia: "Magikarp" encuentra a Gyarados.
  &&(!q||row.family.some(n=>names.get(n)?.toLowerCase().includes(q))));
 const toggle=(f:Filter)=>setOn(list=>list.includes(f)?list.filter(x=>x!==f):[...list,f]);
 return <div className="listview">
  <div className="list-head">
   <div className="list-title"><h2>{t('tabRanking')}</h2></div>
   {switcher}
   <label className="list-search"><Search/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder={t('searchDex')}/></label>
   <div className="list-filters">{([['caught',t('rankingCaught')],['noLegendary',t('rankingNoLegendary')],['noTrade',t('rankingNoTrade')]] as const).map(([k,label])=>
    <button key={k} className={`chip ${on.includes(k)?'on':''}`} aria-pressed={on.includes(k)} onClick={()=>toggle(k)}>{label}</button>)}</div>
  </div>
  <div className="list-body rank">
   {/* Mientras cargan los datos de combate el selector sigue arriba, para poder volver. */}
   {!battle&&<p className="list-empty">{t('loadingTeam')}</p>}
   {battle&&<p className="list-source rank-note">{t('rankingNote')}</p>}
   {/* El puesto es el de la lista que ves: con filtros, el mejor de lo que queda es el 1. */}
   {shown.map((row,i)=>{
    const mine=row.family.some(n=>team.includes(n));
    return <div key={row.into} className={`rank-row ${mine?'mine':''}`}>
     <b className="rank-n">{i+1}</b>
     <Figure m={{icon:row.species.icon,category:'Pokémon'}}/>
     <span className="rank-text">
      <b>{row.species.name}{mine&&<i className="rank-mine">{t('rankingMine')}</i>}{row.trade&&<i className="rank-trade">{t('rankingTrade')}</i>}</b>
      <span className="types">{row.species.types.map(ty=><i key={ty} className={`type t-${ty}`}>{type(ty)}</i>)}</span>
      {row.family.length>1&&<small>{row.family.map(n=>names.get(n)).join(' → ')}</small>}
     </span>
     <span className="rank-score">
      <span className={`team-score ${trainingBand(row.score)}`}>{row.score}</span>
      <small>{t('rankingTop',{n:row.top})}</small>
     </span>
    </div>;
   })}
   {battle&&!shown.length&&<p className="list-empty">{t('emptyFilter')}</p>}
  </div>
 </div>;
}
