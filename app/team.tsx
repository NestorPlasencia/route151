'use client';
// Pestana de equipo (solo FireRed/LeafGreen): se anota que Pokemon llevas, con
// su nivel, naturaleza, habilidad y ataques, y se calcula con que ataque le
// haces mas dano a un Pokemon concreto. Las cuentas son las del juego (tercera
// generacion), suponiendo IVs de 15 y sin EVs, que es lo normal en una partida.
import {useEffect,useMemo,useState} from 'react';
import {ArrowDown,ArrowUp,Plus,Search,Swords,X} from 'lucide-react';
import {Figure} from './shared';
import type {T} from './i18n';
import type {Dex} from './lists';

export type Move={name:string;type:string;power:number;accuracy:number;pp:number;category:'physical'|'special'};
export type Battle={
 species:Record<string,{base:number[];types:string[];abilities:string[];learn:[number,string][];tms:string[]}>;
 moves:Record<string,Move>;abilities:Record<string,string>;natures:Record<string,[string|null,string|null]>;
 chart:Record<string,Record<string,number>>;
};
// `bench`: suplente. El equipo lleva como mucho seis; los demas esperan abajo.
// `stats`: las que pone el juego, si se escriben; si no, se estiman.
export type TeamMon={id:string;n:number;level:number;nature:string;ability:string;moves:(string|null)[];bench?:boolean;stats?:number[]};

const STATS=['hp','atk','def','spa','spd','spe'] as const;
const IV=15;
// Gen 3: PS y las demas estadisticas con sus formulas, y la naturaleza al final.
export function statsOf(base:number[],level:number,nature:[string|null,string|null]=[null,null]){
 return STATS.map((key,i)=>{
  const raw=Math.floor((2*base[i]+IV)*level/100);
  if(key==='hp')return base[i]===1?1:raw+level+10; // Shedinja no existe aqui, pero por si acaso
  const mod=nature[0]===key?1.1:nature[1]===key?0.9:1;
  return Math.floor((raw+5)*mod);
 });
}
// De una estadistica escrita se puede despejar IV + EV/4, no cada uno por
// separado. Se prueban los 95 valores posibles y se devuelve el rango que
// encaja; cuanto mas alto es el nivel, mas estrecho sale.
export function genes(base:number,level:number,value:number,stat:typeof STATS[number],nature:[string|null,string|null]){
 const mod=stat==='hp'?1:nature[0]===stat?1.1:nature[1]===stat?0.9:1;
 const fit=[];
 for(let x=0;x<=31+63;x++){
  const raw=Math.floor((2*base+x)*level/100);
  const got=stat==='hp'?raw+level+10:Math.floor((raw+5)*mod);
  if(got===value)fit.push(x);
 }
 return fit.length?{min:fit[0],max:fit[fit.length-1]}:null;
}

export const effectiveness=(chart:Battle['chart'],type:string,against:string[])=>
 against.reduce((m,t)=>m*(chart[type]?.[t]??1),1);

// Dano de un ataque, en porcentaje de los PS del rival (tirada media y maxima).
export function damage(battle:Battle,attacker:TeamMon,move:Move,target:number,targetLevel:number){
 const me=battle.species[attacker.n],foe=battle.species[target];
 if(!me||!foe||!move.power)return null;
 const mine=attacker.stats??statsOf(me.base,attacker.level,battle.natures[attacker.nature]??[null,null]);
 const theirs=statsOf(foe.base,targetLevel);
 const physical=move.category==='physical';
 const a=mine[physical?1:3],d=theirs[physical?2:4];
 const stab=me.types.includes(move.type)?1.5:1;
 const eff=effectiveness(battle.chart,move.type,foe.types);
 const base=Math.floor(Math.floor(Math.floor(2*attacker.level/5+2)*move.power*a/d)/50)+2;
 const top=Math.floor(base*stab*eff);
 return {eff,max:Math.min(100,Math.round(top/theirs[0]*100)),min:Math.min(100,Math.round(top*.85/theirs[0]*100))};
}

// Ataques que puede llevar a su nivel: los que aprende subiendo y los de MT/MO.
export const movePool=(battle:Battle,mon:TeamMon)=>{
 const s=battle.species[mon.n];if(!s)return [];
 const byLevel=s.learn.filter(([lvl])=>lvl<=mon.level).map(([,m])=>m);
 return [...new Set([...byLevel,...s.tms])].filter(m=>battle.moves[m]);
};

export function TeamView({dex,battle,storageKey,tr}:{dex:Dex;battle:Battle|null;storageKey:string;tr:T}){
 const {t,type:typeName,move:moveName,ability:abilityName,nature:natureName}=tr;
 const [team,setTeam]=useState<TeamMon[]>([]),[query,setQuery]=useState(''),[target,setTarget]=useState<number|null>(null),[targetLevel,setTargetLevel]=useState(20);
 useEffect(()=>{try{setTeam(JSON.parse(localStorage.getItem(storageKey)||'[]'))}catch{setTeam([])}},[storageKey]);
 const save=(next:TeamMon[])=>{setTeam(next);try{localStorage.setItem(storageKey,JSON.stringify(next))}catch{}};
 const species=useMemo(()=>new Map(dex.species.map(s=>[s.n,s])),[dex]);
 const q=query.trim().toLowerCase();
 const results=useMemo(()=>!q?[]:dex.species.filter(s=>battle?.species[s.n]&&s.name.toLowerCase().includes(q)).slice(0,8),[dex,battle,q]);

 if(!battle)return <div className="listview loading-list">{t('loadingTeam')}</div>;
 const add=(n:number)=>{
  const s=battle.species[n];if(!s)return;
  const level=5,learn=s.learn.filter(([lvl])=>lvl<=level).map(([,m])=>m);
  save([...team,{id:`${n}-${Date.now()}`,n,level,nature:'Hardy',ability:s.abilities[0]??'',moves:[...learn.slice(-4),null,null,null,null].slice(0,4),bench:party.length>=6}]);
  setQuery('');
 };
 const update=(id:string,change:Partial<TeamMon>)=>save(team.map(m=>m.id===id?{...m,...change}:m));
 const party=team.filter(m=>!m.bench),bench=team.filter(m=>m.bench);
 const foe=target?battle.species[target]:null;
 // Mejor ataque de cada miembro contra el Pokemon elegido, de mas a menos dano.
 const advice=!foe||!target?[]:team.flatMap(mon=>{
  const best=mon.moves.flatMap(key=>{const move=key?battle.moves[key]:null;if(!move)return [];
   const d=damage(battle,mon,move,target,targetLevel);return d?[{mon,move,...d}]:[]})
   .sort((a,b)=>b.max-a.max)[0];
  return best?[best]:[];
 }).sort((a,b)=>b.max-a.max);

 // Grafico de juez: hexagono con la valoracion de cada IV, como en los juegos.
 const judgeLabel=(iv:number)=>t((iv>=31?'rate5':iv>=30?'rate4':iv>=21?'rate3':iv>=11?'rate2':iv>=1?'rate1':'rate0') as never);
 const judge=(mon:TeamMon)=>{
  const s=battle.species[mon.n],stats=mon.stats;if(!stats)return null;
  const mods=battle.natures[mon.nature]??[null,null];
  const fits=STATS.map((stat,i)=>genes(s.base[i],mon.level,stats[i],stat,mods));
  if(fits.some(f=>!f))return null;
  // De un rango se toma su punto medio, sin pasar de 31 (lo de mas son EVs).
  return fits.map(f=>Math.min(31,Math.round((f!.min+Math.min(31,f!.max))/2)));
 };
 // Ejes como en el juego: PS arriba y, girando a la derecha, Ataque, Defensa,
 // Velocidad, Def. Esp. y At. Esp.
 const AXES=[0,1,2,5,4,3];
 const hexagon=(values:number[],radius:number)=>AXES.map((stat,i)=>{
  const angle=Math.PI/2-i*Math.PI/3,r=radius*Math.max(.08,values[stat]/31);
  return `${(60+r*Math.cos(angle)).toFixed(1)},${(60-r*Math.sin(angle)).toFixed(1)}`;
 }).join(' ');

 // Naturalezas con las que cuadran todas las cifras escritas: si la elegida no
 // encaja, casi siempre es que la naturaleza es otra (sube una y baja otra).
 const fittingNatures=(mon:TeamMon)=>{
  const s=battle.species[mon.n],stats=mon.stats;if(!stats)return [];
  const fit=Object.entries(battle.natures).flatMap(([n,mods])=>{
   const each=STATS.map((stat,i)=>genes(s.base[i],mon.level,stats[i],stat,mods));
   // Sin EVs si a cada cifra le basta un IV de 0 a 31.
   return each.every(Boolean)?[{n,clean:each.every(g=>g!.min<=31)}]:[];
  });
  return fit.sort((a,b)=>Number(b.clean)-Number(a.clean)).map(x=>x.n);
 };
 // Texto del IV deducido: exacto, un rango, o con EVs si pasa de 31.
 const ivLabel=(fit:{min:number;max:number}|null)=>{
  if(!fit)return t('ivNoFit');
  if(fit.min>31)return t('ivWithEv',{n:fit.min});
  const max=Math.min(31,fit.max);
  return t('iv',{range:fit.min===max?`${fit.min}`:`${fit.min}–${max}`})+(fit.max>31?'+':'');
 };
 const moveLabel=(key:string)=>{const m=battle.moves[key];
  const kind=m.power?t(m.category==='physical'?'physicalShort':'specialShort'):t('statusShort');
  return `${moveName(m.name)} · ${typeName(m.type)} · ${kind}${m.power?` ${m.power}`:''}`};
 const card=(mon:TeamMon)=>{
  const s=battle.species[mon.n],info=species.get(mon.n),pool=movePool(battle,mon);
  const guess=statsOf(s.base,mon.level,battle.natures[mon.nature]??[null,null]);
  const stats=mon.stats??guess,own=!!mon.stats;
  return <article key={mon.id} className="team-mon">
   <header>
    <Figure m={{icon:info?.icon,category:'Pokémon'}}/>
    <b>{info?.name??mon.n}</b>
    <span className="types">{s.types.map(ty=><i key={ty} className={`type t-${ty}`}>{typeName(ty)}</i>)}</span>
    <button className="team-move" title={mon.bench?t('toParty'):t('toBench')} aria-label={mon.bench?t('toParty'):t('toBench')}
     disabled={!!mon.bench&&party.length>=6} onClick={()=>update(mon.id,{bench:!mon.bench})}>{mon.bench?<ArrowUp/>:<ArrowDown/>}</button>
    <button className="team-remove" aria-label={t('remove')} onClick={()=>save(team.filter(x=>x.id!==mon.id))}><X/></button>
   </header>
   <div className="team-fields">
    <label>{t('level')}<input type="number" min={1} max={100} value={mon.level} onChange={e=>update(mon.id,{level:Math.max(1,Math.min(100,+e.target.value||1))})}/></label>
    <label>{t('nature')}<select value={mon.nature} onChange={e=>update(mon.id,{nature:e.target.value})}>{Object.entries(battle.natures).map(([n,[up,down]])=><option key={n} value={n}>{natureName(n)}{up?` (+${t(('stat_'+up) as never)} −${t(('stat_'+down) as never)})`:''}</option>)}</select></label>
    <label>{t('ability')}<select value={mon.ability} onChange={e=>update(mon.id,{ability:e.target.value})}>{s.abilities.map(a=><option key={a} value={a}>{abilityName(battle.abilities[a]??a)}</option>)}</select></label>
   </div>
   <dl className={`team-stats ${own?'own':''}`}>{STATS.map((stat,i)=><div key={stat}>
    <dt>{t(('stat_'+stat) as never)}</dt>
    <dd><input type="number" min={1} max={999} value={stats[i]} aria-label={t(('stat_'+stat) as never)}
     onChange={e=>update(mon.id,{stats:stats.map((v,j)=>j===i?Math.max(1,Math.min(999,+e.target.value||1)):v)})}/></dd>
    {own&&(fit=>fit?<small>{ivLabel(fit)}</small>:<small title={t('ivNoFitHelp')}>{t('ivNoFit')}</small>)(genes(s.base[i],mon.level,stats[i],stat,battle.natures[mon.nature]??[null,null]))}
   </div>)}</dl>
   <p className="team-note">{own&&<span className="team-iv">{t('ivNote')} </span>}{own?<button className="team-reset" onClick={()=>update(mon.id,{stats:undefined})}>{t('useEstimate')}</button>:t('statsEditable')}</p>
   {own&&(ivs=>ivs?<div className="judge">
    <h4>{t('judge')}<small>{t('judgeTotal',{n:ivs.reduce((a,b)=>a+b,0)})}</small></h4>
    <div className="judge-chart">
     <svg viewBox="0 0 120 120" aria-hidden="true">
      {[1,.66,.33].map(k=><polygon key={k} className="judge-grid" points={hexagon([31,31,31,31,31,31],48*k)}/>)}
      {AXES.map((stat,i)=>{const angle=Math.PI/2-i*Math.PI/3;
       return <line key={stat} className="judge-grid" x1="60" y1="60" x2={(60+48*Math.cos(angle)).toFixed(1)} y2={(60-48*Math.sin(angle)).toFixed(1)}/>})}
      <polygon className="judge-shape" points={hexagon(ivs,48)}/>
     </svg>
     <ul>{AXES.map(i=><li key={STATS[i]}><b>{t(('stat_'+STATS[i]) as never)}</b><span>{judgeLabel(ivs[i])}</span></li>)}</ul>
    </div>
    <p className="team-note">{t('judgeNote')}</p>
   </div>:null)(judge(mon))}
   {own&&(fits=>fits.length&&!fits.includes(mon.nature)?<p className="team-note team-natures">{t('natureFits')} {fits.map(n=>
    <button key={n} className="team-reset" onClick={()=>update(mon.id,{nature:n})}>{natureName(n)}</button>)}</p>:null)(fittingNatures(mon))}
   <div className="team-moves">{[0,1,2,3].map(i=>{
    const move=mon.moves[i]?battle.moves[mon.moves[i]!]:null;
    return <div key={i} className="move-slot" data-type={move?.type}>
     <select value={mon.moves[i]??''} onChange={e=>update(mon.id,{moves:mon.moves.map((m,j)=>j===i?(e.target.value||null):m)})}>
      <option value="">{t('noMove')}</option>
      {pool.map(key=><option key={key} value={key}>{moveLabel(key)}</option>)}
     </select>
     {move&&<small><i className={`type t-${move.type}`}>{typeName(move.type)}</i>
      <b>{move.power?t(move.category==='physical'?'physical':'special'):t('status')}</b>
      {move.power>0&&<span>{t('power')} {move.power}</span>}
      <span>PP {move.pp}</span></small>}
    </div>;
   })}
   </div>
  </article>;
 };
 return <div className="listview">
  <div className="list-head">
   <div className="list-title"><h2>{t('tabTeam')}</h2><span className="progress"><b>{party.length}/6</b>{bench.length>0&&<small> +{bench.length}</small>}</span></div>
   <label className="list-search"><Search/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder={t('addPokemon')}/></label>
   {results.length>0&&<div className="team-results">{results.map(s=><button key={s.n} onClick={()=>add(s.n)}><Figure m={{icon:s.icon,category:'Pokémon'}}/><b>{s.name}</b><Plus/></button>)}</div>}
   {party.length>=6&&query&&<p className="team-note">{t('partyFull')}</p>}
  </div>
  <div className="list-body team">
   {party.map(card)}
   {!party.length&&<p className="list-empty">{t('teamEmpty')}</p>}

   <h3 className="team-section">{t('bench')}{bench.length>0&&<b>{bench.length}</b>}</h3>
   {bench.map(card)}
   {!bench.length&&<p className="list-empty">{t('benchEmpty')}</p>}

   <section className="team-vs">
    <h3><Swords/>{t('bestAgainst')}</h3>
    <div className="team-fields">
     <label>{t('pokemon')}<select value={target??''} onChange={e=>setTarget(+e.target.value||null)}>
      <option value="">—</option>
      {dex.species.filter(s=>battle.species[s.n]).map(s=><option key={s.n} value={s.n}>{s.name}</option>)}
     </select></label>
     <label>{t('level')}<input type="number" min={1} max={100} value={targetLevel} onChange={e=>setTargetLevel(Math.max(1,Math.min(100,+e.target.value||1)))}/></label>
    </div>
    {foe&&<p className="team-foe"><span className="types">{foe.types.map(ty=><i key={ty} className={`type t-${ty}`}>{typeName(ty)}</i>)}</span></p>}
    {advice.length>0&&<div className="team-advice">{advice.map(({mon,move,eff,min,max})=>{
     const info=species.get(mon.n);
     const label=info?.name+(mon.bench?` · ${t('bench')}`:'');
     return <div key={mon.id} className={`advice-row ${eff===0?'none':eff>1?'good':eff<1?'bad':''}`}>
      <Figure m={{icon:info?.icon,category:'Pokémon'}}/>
      <span><b>{moveName(move.name)}</b><small>{label} · {typeName(move.type)} · {t(move.category==='physical'?'physicalShort':'specialShort')}{eff!==1&&` · ×${eff}`}</small></span>
      <em>{eff===0?t('noEffect'):`${min}–${max}%`}</em>
     </div>})}</div>}
    {foe&&!advice.length&&<p className="list-empty">{t('noDamage')}</p>}
   
   </section>
   <p className="list-source">{t('statsNote')}</p>
  </div>
 </div>;
}
