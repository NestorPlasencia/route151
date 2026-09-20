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

export type Move={name:string;type:string;power:number;accuracy:number;pp:number;effect?:string;category:'physical'|'special'};
type MoveKind=Move['category']|'status';
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
export type Species=Battle['species'][string];
// Rival medio con el que comparar ataques entre si, sin pensar en tipos.
export const DUMMY:Species={base:[70,70,70,70,70,70],types:['normal'],abilities:[],learn:[],tms:[]};
// Objetivo sin tipos: sirve para comparar el potencial de los ataques sin que
// un tipo concreto (por ejemplo, Fantasma contra Normal) decida el perfil.
const PROFILE_TARGET:Species={base:[70,70,70,70,70,70],types:[],abilities:[],learn:[],tms:[]};

export function damage(battle:Battle,attacker:TeamMon,move:Move,target:number,targetLevel:number){
 const foe=battle.species[target];
 return foe?damageVs(battle,attacker,move,foe,targetLevel):null;
}
export function damageVs(battle:Battle,attacker:TeamMon,move:Move,foe:Species,targetLevel:number){
 const me=battle.species[attacker.n];
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

// Símbolos visuales inspirados en los iconos de categoría de los juegos:
// ráfaga = físico, círculos = especial y yin-yang = estado.
const categorySymbol=(kind:MoveKind)=>kind==='physical'?'✹':kind==='special'?'◎':'☯';
const moveKind=(move:Move):MoveKind=>move.power?move.category:'status';

const EFFECT_SUMMARIES:Record<string,'effectLightScreen'|'effectReflect'|'effectParalyze'|'effectSleep'|'effectPoison'|'effectBadPoison'|'effectBurn'|'effectConfuse'|'effectProtect'|'effectRestoreHp'|'effectRest'|'effectWeatherRain'|'effectWeatherSun'|'effectWeatherSand'|'effectWeatherHail'|'effectHazards'>={
 LIGHT_SCREEN:'effectLightScreen',REFLECT:'effectReflect',PARALYZE:'effectParalyze',SLEEP:'effectSleep',POISON:'effectPoison',TOXIC:'effectBadPoison',WILL_O_WISP:'effectBurn',CONFUSE:'effectConfuse',PROTECT:'effectProtect',RESTORE_HP:'effectRestoreHp',SOFTBOILED:'effectRestoreHp',SYNTHESIS:'effectRestoreHp',MORNING_SUN:'effectRestoreHp',MOONLIGHT:'effectRestoreHp',REST:'effectRest',RAIN_DANCE:'effectWeatherRain',SUNNY_DAY:'effectWeatherSun',SANDSTORM:'effectWeatherSand',HAIL:'effectWeatherHail',SPIKES:'effectHazards',
};
const effectStat=(effect:string|undefined)=>effect?.match(/^(ATTACK|DEFENSE|SPEED|SPECIAL_ATTACK|SPECIAL_DEFENSE|ACCURACY|EVASION)_(UP|DOWN)(?:_(2))?$/);

type ProfileFocus='physical'|'special'|'mixed'|'support';
type ProfileAbility='contact'|'physical'|'special'|'speed'|'accuracy'|'survival'|'none';
export type BuildProfile={focus:ProfileFocus;fast:boolean;bulky:boolean;utility:boolean;ability:ProfileAbility;
 physical:number;special:number;status:number;
 titleKey:'profilePhysical'|'profileSpecial'|'profileMixed'|'profileSupport';
 focusKey:'profilePhysicalTag'|'profileSpecialTag'|'profileMixedTag'|'profileSupportTag';
 reasons:{key:'profileAttackReason'|'profileNatureReason'|'profileSpeedReason'|'profileUtilityReason'|'profileBulkReason'|'profileAbilityReason';value:Record<string,string|number>}[];
};

// Señales de habilidad que cambian el papel del Pokemon. No se intenta
// modelar cada habilidad: solo las interacciones generales que son estables y
// que se pueden explicar en la ficha sin simular un combate entero.
const PROFILE_ABILITIES:Record<string,ProfileAbility>={
 static:'contact',poison_point:'contact',flame_body:'contact',rough_skin:'contact',iron_barbs:'contact',
 huge_power:'physical',pure_power:'physical',guts:'physical',hustle:'physical',
 plus:'special',minus:'special',solar_power:'special',
 chlorophyll:'speed',swift_swim:'speed',sand_rush:'speed',
 compound_eyes:'accuracy',keen_eye:'accuracy',no_guard:'accuracy',
 sturdy:'survival',wonder_guard:'survival',levitate:'survival',
};

const profileAbility=(ability:string):ProfileAbility=>PROFILE_ABILITIES[ability]??'none';

const profileMovePotential=(battle:Battle,mon:TeamMon,move:Move)=>{
 if(!move.power)return 0;
 const damage=damageVs(battle,mon,move,PROFILE_TARGET,mon.level);
 return damage?Math.round((damage.min+damage.max)/2*(move.accuracy||100)/100):0;
};

// Convierte la ficha en un perfil breve usando reglas fijas. Los valores de
// daño se comparan contra un objetivo neutro, así que esta función describe la
// orientación del set y no la eficacia contra un rival concreto.
export function buildProfile(battle:Battle,mon:TeamMon):BuildProfile|null{
 const species=battle.species[mon.n];if(!species)return null;
 const nature=battle.natures[mon.nature]??[null,null];
 const moves=mon.moves.map(key=>key?battle.moves[key]:null).filter((move):move is Move=>!!move);
 const attacks=moves.filter(move=>move.power>0);
 const status=moves.length-attacks.length;
 const scores=(category:Move['category'])=>attacks.filter(move=>move.category===category).map(move=>{
  return profileMovePotential(battle,mon,move);
 }).sort((a,b)=>b-a);
 const categoryScore=(values:number[])=>
  (values[0]??0)+(values[1]??0)*.35+(values[2]??0)*.15;
 const physical=categoryScore(scores('physical')),special=categoryScore(scores('special'));
 const best=Math.max(physical,special),ratio=Math.max(physical,special)/Math.max(1,Math.min(physical||1,special||1));
 const focus:ProfileFocus=best===0?'support':physical===0?'special':special===0?'physical':ratio>=1.18?(special>physical?'special':'physical'):'mixed';
 const fast=species.base[5]>=75&&species.base[5]>=Math.max(...species.base.filter((_,i)=>i!==5))-5;
 const bulky=species.base[0]+species.base[2]+species.base[4]>=220;
 const utility=status>=2;
 const ability=profileAbility(mon.ability);
 const titleKey=focus==='physical'?'profilePhysical':focus==='special'?'profileSpecial':focus==='mixed'?'profileMixed':'profileSupport';
 const focusKey=focus==='physical'?'profilePhysicalTag':focus==='special'?'profileSpecialTag':focus==='mixed'?'profileMixedTag':'profileSupportTag';
 const reasons:BuildProfile['reasons']=[];
 reasons.push({key:'profileAttackReason',value:{physical:Math.round(physical),special:Math.round(special),attacks:attacks.length}});
 if(nature[0]||nature[1])reasons.push({key:'profileNatureReason',value:{up:nature[0]??'',down:nature[1]??''}});
 if(fast)reasons.push({key:'profileSpeedReason',value:{n:species.base[5]}});
 if(utility)reasons.push({key:'profileUtilityReason',value:{n:status}});
 if(bulky)reasons.push({key:'profileBulkReason',value:{n:species.base[0]+species.base[2]+species.base[4]}});
 if(ability!=='none')reasons.push({key:'profileAbilityReason',value:{ability:mon.ability,kind:ability}});
 return {focus,fast,bulky,utility,ability,physical,special,status,titleKey,focusKey,reasons};
}

export type MoveAdvice={kind:'replace'|'keep'|'manual';old:string|null;delta:number};

export type Opponent={name:string;level:number};
const opponentName=(value:string)=>value.toLowerCase().replace(/♀/g,'f').replace(/♂/g,'m').replace(/[^a-z0-9]/g,'');
// Los equipos de entrenadores llegan como texto del mapa: "Clefairy Lv14, ...".
// Se transforma aquí para que el mapa y la ficha usen la misma fórmula de daño.
export const trainerOpponents=(detail?:string|null):Opponent[]=>(detail??'').split(', ').flatMap(part=>{
 const found=/^(.+?)\s+Lv\.?\s*(\d+)$/i.exec(part.trim());
 return found?[{name:found[1],level:+found[2]}]:[];
});

// Recomendación junto a un entrenador o encuentro: solo mira el equipo activo.
export function BattleAdvice({opponents,dex,battle,storageKey,tr,showOpponent=true,inline=false,foeDetail}:{opponents:Opponent[];dex:Dex;battle:Battle|null;storageKey:string;tr:T;showOpponent?:boolean;inline?:boolean;foeDetail?:string|null}){
 const [team,setTeam]=useState<TeamMon[]>([]);
 useEffect(()=>{
  const load=()=>{try{const saved=JSON.parse(localStorage.getItem(storageKey)||'[]');setTeam(Array.isArray(saved)?saved:[])}catch{setTeam([])}};
  const changed=(event:Event)=>{if((event as CustomEvent<string>).detail===storageKey)load()};
  load();addEventListener('route151-team-changed',changed);return()=>removeEventListener('route151-team-changed',changed);
 },[storageKey]);
 const rows=useMemo(()=>{
  if(!battle||!team.length)return [];
  const byName=new Map(dex.species.map(s=>[opponentName(s.name),s]));
  // Un entrenador repite Pokemon ("Machoke Lv38, Machop Lv38, Machoke Lv38"):
  // el consejo es el mismo, asi que cada pareja especie+nivel sale una vez.
  const unique=[...new Map(opponents.map(foe=>[`${opponentName(foe.name)}-${foe.level}`,foe])).values()];
  return unique.flatMap(foe=>{
   const target=byName.get(opponentName(foe.name));if(!target||!battle.species[target.n])return [];
   const best=team.filter(mon=>!mon.bench).flatMap(mon=>mon.moves.flatMap(key=>{
    const move=key?battle.moves[key]:null,d=move?damage(battle,mon,move,target.n,foe.level):null;
    return move&&d?[{mon,move,d}]:[];
   })).sort((a,b)=>b.d.max-a.d.max)[0];
   const attacker=best?dex.species.find(s=>s.n===best.mon.n):null;
   // Una opción favorable aprovecha debilidad de tipo o deja al rival a un
   // máximo de cuatro golpes incluso con la tirada baja de daño.
   const good=!!best&&!!attacker&&(best.d.eff>1||best.d.min>=25);
   return [{foe,target,best,attacker,good}];
  });
 },[battle,dex,opponents,team]);
 const fallbackTarget=useMemo(()=>{
  const foe=opponents[0];return foe?dex.species.find(s=>opponentName(s.name)===opponentName(foe.name))??null:null;
 },[dex,opponents]);
 // En el mapa un encuentro sigue siendo útil aunque aún no haya equipo: se
 // enseña su ficha normal, pero no se inventa una recomendación ni una flecha.
 if(!rows.length)return inline&&fallbackTarget?<div className="battle-advice inline"><div className="battle-match inline battle-match-empty">
  <div className="battle-mon battle-foe"><Figure m={{icon:fallbackTarget.icon,category:'Pokémon'}}/><span><b>{tr.name(fallbackTarget.name)}</b><small>{foeDetail??tr.t('battleLevel',{level:opponents[0].level})}</small></span></div>
 </div></div>:null;
 return <div className={`battle-advice ${inline?'inline':showOpponent?'':'compact'}`}>{rows.map(({foe,target,best,attacker,good})=><div key={`${foe.name}-${foe.level}`}>
  {best&&attacker&&<div className={`battle-match ${inline?'inline':showOpponent?'':'compact'}`}>
   {showOpponent&&<><div className="battle-mon battle-foe"><Figure m={{icon:target.icon,category:'Pokémon'}}/><span><b>{tr.name(target.name)}</b><small>{inline&&foeDetail?foeDetail:tr.t('battleLevel',{level:foe.level})}</small></span></div>
    <i className="battle-arrow" aria-hidden="true">→</i>
   </>}
   {!showOpponent&&<><b className={`battle-context ${good?'good':'poor'}`}>{tr.t(good?'battleGoodAgainst':'battlePoorAgainst',{pokemon:tr.name(target.name)})}</b><i className="battle-arrow" aria-hidden="true">→</i></>}
   <div className="battle-mon"><Figure m={{icon:attacker.icon,category:'Pokémon'}}/><span><b>{tr.name(attacker.name)}</b><small>{tr.t('battleUse',{move:tr.move(best.move.name),min:best.d.min,max:best.d.max})}</small></span></div>
  </div>}
  {!good&&<p className="battle-warning">{tr.t('battleNoGood')}</p>}
 </div>)}</div>;
}

// Cuanto aporta un ataque al perfil actual. Sirve tanto para ordenar la tabla
// de decision como para decidir si el movimiento nuevo merece un hueco.
const profileMoveFit=(battle:Battle,mon:TeamMon,move:Move,profile:BuildProfile)=>{
 if(!move.power)return profile.focus==='support'?12:profile.utility?10:4;
 const multiplier=profile.focus==='support'||profile.focus==='mixed'?1:move.category===profile.focus?1.25:.75;
 const nature=battle.natures[mon.nature]??[null,null];
 const stat=move.category==='physical'?'atk':'spa';
 const natureMultiplier=nature[0]===stat ? 1.08 : (nature[1]===stat ? .92 : 1);
 return profileMovePotential(battle,mon,move)*multiplier*natureMultiplier;
};

// Puntuacion del conjunto al probar un ataque nuevo. El segundo y el tercer
// ataque pesan menos que el mejor (no se premian dos veces ataques
// equivalentes) pero cuentan: si solo contase el mejor, quitar cualquier otro
// hueco daria la misma nota y el consejo saldria por orden de hueco, no por
// calidad. Se reserva valor para conservar al menos un movimiento de estado.
const profileSetScore=(battle:Battle,mon:TeamMon,keys:(string|null)[],profile:BuildProfile)=>{
 const moves=keys.map(key=>key?battle.moves[key]:null).filter((move):move is Move=>!!move);
 const attacks=moves.filter(move=>move.power>0);
 const fits=attacks.map(move=>profileMoveFit(battle,mon,move,profile)).sort((a,b)=>b-a);
 const offence=(fits[0]??0)+(fits[1]??0)*.35+(fits[2]??0)*.15;
 const statuses=moves.filter(move=>!move.power).length;
 return offence+(statuses>0?10:0);
};

// Decide si el ataque nuevo mejora el set actual. Las decisiones sobre
// movimientos de estado se dejan manuales porque su efecto no se reduce a
// potencia y precision.
export function adviseMoveReplacement(battle:Battle,mon:TeamMon,newKey:string):MoveAdvice{
 const profile=buildProfile(battle,mon),newMove=battle.moves[newKey];
 if(!profile||!newMove||!newMove.power)return {kind:'manual',old:null,delta:0};
 const current=profileSetScore(battle,mon,mon.moves,profile);
 const options=mon.moves.map((old,index)=>{
  const next=mon.moves.map((key,i)=>i===index?newKey:key);
  return {old,index,delta:profileSetScore(battle,mon,next,profile)-current};
 });
 const empty=mon.moves.findIndex(key=>!key);
 if(empty>=0){
  const next=mon.moves.map((key,i)=>i===empty?newKey:key);
  options.push({old:null,index:empty,delta:profileSetScore(battle,mon,next,profile)-current});
 }
 // Si dos huecos empatan, se suelta el que menos encaja con el perfil (el
 // hueco vacio, con `old` nulo, va primero).
 const fitOf=(key:string|null)=>{const move=key?battle.moves[key]:null;return move?profileMoveFit(battle,mon,move,profile):-1};
 const best=options.sort((a,b)=>b.delta-a.delta||fitOf(a.old)-fitOf(b.old))[0];
 return best&&best.delta>=4?{kind:'replace',old:best.old,delta:Math.round(best.delta)}:{kind:'keep',old:null,delta:best?.delta??0};
}

export function TeamView({dex,battle,moveText,storageKey,tr}:{dex:Dex;battle:Battle|null;moveText:Record<string,{en:string;es:string}>|null;storageKey:string;tr:T}){
 const {t,lang,type:typeName,move:moveName,ability:abilityName,nature:natureName}=tr;
 const describe=(key:string)=>moveText?.[key]?.[lang==='es'?'es':'en']??null;
 const statusSummary=(key:string,move:Move)=>{
  const stat=effectStat(move.effect);
  if(stat){
   const statName=stat[1]==='ACCURACY'?t('stat_accuracy'):stat[1]==='EVASION'?t('stat_evasion'):t(('stat_'+({ATTACK:'atk',DEFENSE:'def',SPEED:'spe',SPECIAL_ATTACK:'spa',SPECIAL_DEFENSE:'spd'}[stat[1]])) as never);
   const summaryKey=stat[2]==='UP'?(stat[3]?'effectRaiseMuch':'effectRaise'):(stat[3]?'effectLowerMuch':'effectLower');
   return t(summaryKey,{stat:statName});
  }
  const summary=EFFECT_SUMMARIES[move.effect??''];
  return summary?t(summary):describe(key)??t('status');
 };
 const [candidate,setCandidate]=useState<Record<string,string>>({});
 const [team,setTeam]=useState<TeamMon[]>([]),[query,setQuery]=useState(''),[target,setTarget]=useState<number|null>(null),[targetLevel,setTargetLevel]=useState(20);
 useEffect(()=>{try{setTeam(JSON.parse(localStorage.getItem(storageKey)||'[]'))}catch{setTeam([])}},[storageKey]);
 const save=(next:TeamMon[])=>{setTeam(next);try{localStorage.setItem(storageKey,JSON.stringify(next));dispatchEvent(new CustomEvent('route151-team-changed',{detail:storageKey}))}catch{}};
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
 const hexagon=(values:number[],radius:number,cx=60,cy=60)=>AXES.map((stat,i)=>{
  const angle=Math.PI/2-i*Math.PI/3,r=radius*Math.max(.08,values[stat]/31);
  return `${(cx+r*Math.cos(angle)).toFixed(1)},${(cy-r*Math.sin(angle)).toFixed(1)}`;
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
  return `${moveName(m.name)} · ${typeName(m.type)} · ${categorySymbol(moveKind(m))} ${kind}${m.power?` ${m.power}`:''}`};
 const card=(mon:TeamMon)=>{
 const s=battle.species[mon.n],info=species.get(mon.n),pool=movePool(battle,mon);
 const guess=statsOf(s.base,mon.level,battle.natures[mon.nature]??[null,null]);
  const stats=mon.stats??guess,own=!!mon.stats,profile=buildProfile(battle,mon);
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
    <small>{t('baseStat',{n:s.base[i]})}{own&&' · '}{own&&(fit=>fit?ivLabel(fit):<span title={t('ivNoFitHelp')}>{t('ivNoFit')}</span>)(genes(s.base[i],mon.level,stats[i],stat,battle.natures[mon.nature]??[null,null]))}</small>
   </div>)}</dl>
   <p className="team-note">{own&&<span className="team-iv">{t('ivNote')} </span>}{own?<button className="team-reset" onClick={()=>update(mon.id,{stats:undefined})}>{t('useEstimate')}</button>:t('statsEditable')}</p>
   <div className={`team-analysis ${own?'':'solo'}`}>
   {profile&&<div className="profile">
    <h4>{t('profile')}<small>{t('profileDeterministic')}</small></h4>
    <strong>{t(profile.titleKey)}</strong>
    <div className="profile-tags">
     <span>{t(profile.focusKey)}</span>
     {profile.fast&&<span>{t('profileFastTag')}</span>}
     {profile.bulky&&<span>{t('profileBulkTag')}</span>}
     {profile.utility&&<span>{t('profileUtilityTag')}</span>}
     {profile.ability!=='none'&&<span>{abilityName(battle.abilities[mon.ability]??mon.ability)}</span>}
    </div>
    <ul>{profile.reasons.map((reason,i)=>{
     const value=reason.value;
     const vars=reason.key==='profileNatureReason'
      ?{...value,up:typeof value.up==='string'?t(('stat_'+value.up) as never):value.up,down:typeof value.down==='string'?t(('stat_'+value.down) as never):value.down}
      :reason.key==='profileAbilityReason'
       ?{...value,ability:abilityName(battle.abilities[mon.ability]??mon.ability),effect:t(('profileAbility_'+String(value.kind)) as never)}
       :value;
     return <li key={`${reason.key}-${i}`}>{t(reason.key,vars)}</li>;
    })}</ul>
    <p className="team-note">{t('profileNote')}</p>
    {own&&(fits=>fits.length&&!fits.includes(mon.nature)?<p className="team-note team-natures">{t('natureFits')} {fits.map(n=>
     <button key={n} className="team-reset" onClick={()=>update(mon.id,{nature:n})}>{natureName(n)}</button>)}</p>:null)(fittingNatures(mon))}
   </div>}
   {own&&(ivs=>ivs?<div className="judge">
    <h4>{t('judge')}<small>{t('judgeTotal',{n:ivs.reduce((a,b)=>a+b,0)})}</small></h4>
    <div className="judge-chart">
     <svg viewBox="0 0 340 250" aria-labelledby={`judge-radar-${mon.id}`}>
      <title id={`judge-radar-${mon.id}`}>{t('judge')}</title>
      {[1,.66,.33].map(k=><polygon key={k} className="judge-grid" points={hexagon([31,31,31,31,31,31],60*k,170,125)}/>)}
      {AXES.map((stat,i)=>{const angle=Math.PI/2-i*Math.PI/3;
       return <line key={stat} className="judge-grid" x1="170" y1="125" x2={(170+60*Math.cos(angle)).toFixed(1)} y2={(125-60*Math.sin(angle)).toFixed(1)}/>})}
      <polygon className="judge-shape" points={hexagon(ivs,60,170,125)}/>
      {[
       [0,170,20],[1,286,63],[2,290,166],
       [5,170,232],[4,50,166],[3,54,63],
      ].map(([stat,x,y])=><text key={String(stat)} className="judge-label" x={x} y={y} textAnchor="middle">
       <tspan className="judge-stat" x={Number(x)}>{t(('stat_'+STATS[Number(stat)]) as never)}</tspan>
       <tspan className="judge-rate" x={Number(x)} dy="17">{judgeLabel(ivs[Number(stat)])}</tspan>
      </text>)}
     </svg>
    </div>
    <p className="team-note">{t('judgeNote')}</p>
   </div>:null)(judge(mon))}
   </div>
   {(()=>{
    // Esta es la tabla de decision: mantiene los cuatro ataques actuales y
    // anade el nuevo para que se pueda comparar antes de mirar las descripciones.
    const pick=candidate[mon.id],newMove=pick?battle.moves[pick]:null;
    const impactOf=(move:Move)=>move.power?damageVs(battle,mon,move,PROFILE_TARGET,mon.level):null;
    const rows:{rowKey:string;moveKey:string;move:Move;isNew:boolean}[]=mon.moves.flatMap((key,index)=>{
     const move=key?battle.moves[key]:null;
     return move?[{rowKey:`slot-${index}`,moveKey:key!,move,isNew:false}]:[];
    });
    if(newMove)rows.push({rowKey:`new-${pick}`,moveKey:pick!,move:newMove,isNew:true});
    // El mejor encaje con el perfil va primero: especial para un atacante
    // especial, físico para uno físico y utilidad cuando el set la necesita.
    if(profile)rows.sort((a,b)=>profileMoveFit(battle,mon,b.move,profile)-profileMoveFit(battle,mon,a.move,profile)||Number(b.isNew)-Number(a.isNew));
    const advice=pick?adviseMoveReplacement(battle,mon,pick):null;
    return <details className="team-compare">
     <summary>{t('whichToDrop')}</summary>
     <label>{t('newMove')}<select value={pick??''} onChange={e=>setCandidate({...candidate,[mon.id]:e.target.value})}>
      <option value="">—</option>
      {[...s.learn.map(([lvl,m])=>[m,lvl] as const),...s.tms.map(m=>[m,0] as const)]
       .filter(([m],i,all)=>battle.moves[m]&&all.findIndex(([x])=>x===m)===i)
       .map(([m,lvl])=><option key={m} value={m}>{lvl?`${t('level')} ${lvl} · `:'MT/MO · '}{moveLabel(m)}</option>)}
     </select></label>
     {rows.length>0&&<ul className="compare-list">{rows.map(({rowKey,moveKey,move,isNew})=>{
      const impact=impactOf(move),statIndex=move.category==='physical'?1:3;
      return <li key={rowKey} className={isNew?'new':''}>
       <i className={`type t-${move.type}`}>{typeName(move.type)}</i>
       <b><span className={`category-symbol category-${moveKind(move)}`} aria-hidden="true">{categorySymbol(moveKind(move))}</span>{moveName(move.name)}</b>
       <span>{move.power?`${t('basePower',{n:move.power})} · ${impact?t('powerWithStats',{min:impact.min,max:impact.max,stat:t(('stat_'+(move.category==='physical'?'atk':'spa')) as never),n:stats[statIndex]}):''}`:statusSummary(moveKey,move)}</span>
      </li>;
     })}</ul>}
     {newMove&&<p className="team-note">{newMove.power?advice?.kind==='replace'
       ?advice.old?t('profileReplace',{move:moveName(battle.moves[advice.old].name),focus:t(profile?.focusKey??'profileMixedTag')})
       :t('profileAdd',{move:moveName(newMove.name)})
       :t('profileKeep',{move:moveName(newMove.name),focus:t(profile?.focusKey??'profileMixedTag')})
       :t('dropYouDecide')}</p>}
     <p className="team-note">{t('compareNote')}</p>
    </details>;
   })()}
   <div className="team-moves">{[0,1,2,3].map(i=>{
    const move=mon.moves[i]?battle.moves[mon.moves[i]!]:null;
    const impact=move&&move.power?damageVs(battle,mon,move,PROFILE_TARGET,mon.level):null;
    return <div key={i} className="move-slot" data-type={move?.type}>
     <select value={mon.moves[i]??''} onChange={e=>update(mon.id,{moves:mon.moves.map((m,j)=>j===i?(e.target.value||null):m)})}>
      <option value="">{t('noMove')}</option>
      {pool.map(key=><option key={key} value={key}>{moveLabel(key)}</option>)}
     </select>
     {move&&<small>
      {move.power?impact&&<span>{t('powerWithStats',{min:impact.min,max:impact.max,stat:t(('stat_'+(move.category==='physical'?'atk':'spa')) as never),n:stats[move.category==='physical'?1:3]})}</span>:<span>{t('status')}</span>}
      <span>PP {move.pp}</span></small>}
     {move&&describe(mon.moves[i]!)&&<p className="move-desc">{describe(mon.moves[i]!)}</p>}
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
