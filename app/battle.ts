// Calculos del equipo y combate, independientes de React.
import {rulesFor,type Gen} from './rules';
import type {Dex} from './lists';
import type {T} from './i18n';
export type Move={name:string;type:string;power:number;accuracy:number;pp:number;effect?:string;category:'physical'|'special'};
type MoveKind=Move['category']|'status';
// `gen`: 1 en Yellow (reglas de la primera generacion), sin nada en FRLG.
export type Battle={gen?:Gen;
 species:Record<string,{base:number[];ev?:number[];types:string[];abilities:string[];learn:[number,string][];tms:string[]}>;
 moves:Record<string,Move>;abilities:Record<string,string>;natures:Record<string,[string|null,string|null]>;
 chart:Record<string,Record<string,number>>;
};
// `bench`: suplente. El equipo lleva como mucho seis; los demas esperan abajo.
// `stats`: las que pone el juego, si se escriben; si no, se estiman.
// `guess`: lo que puso la app por ti y tu no has confirmado. Anadir un Pokemon
// es un toque, y lo que no digas se supone; al tocar un campo deja de serlo.
export type Guess='level'|'nature'|'ability'|'moves';
// `out`: debilitado o fuera de combate por lo que sea. Sigue en el equipo,
// pero no se propone para pelear hasta que lo cures.
export type TeamMon={id:string;n:number;level:number;nature:string;ability:string;moves:(string|null)[];bench?:boolean;out?:boolean;stats?:number[];guess?:Guess[];nickname?:string;speciesName?:string;ivs?:number[];evs?:number[]};

export const STATS=['hp','atk','def','spa','spd','spe'] as const;
export const IV=15;
// Gen 3: PS y las demas estadisticas con sus formulas, y la naturaleza al final.
export function statsOf(base:number[],level:number,nature:[string|null,string|null]=[null,null],ivs:number[]=STATS.map(()=>IV),evs:number[]=STATS.map(()=>0)){
 return STATS.map((key,i)=>{
  const raw=Math.floor((2*base[i]+ivs[i]+Math.floor(evs[i]/4))*level/100);
  if(key==='hp')return base[i]===1?1:raw+level+10; // Shedinja no existe aqui, pero por si acaso
  const mod=nature[0]===key?1.1:nature[1]===key?0.9:1;
  return Math.floor((raw+5)*mod);
 });
}
// Reparte una estadistica en lo que aporta cada parte de la formula: la base de la
// especie, los genes (IV/DV), el esfuerzo (EV/Stat Exp.), el nivel (+nivel+10 en PS,
// +5 en el resto) y la naturaleza (+10 % o -10 %). Las partes suman `value` antes de la
// naturaleza; `nature` es lo que suma o resta despues. Enteros que cuadran con `value`.
export type StatParts={base:number;genes:number;effort:number;level:number;nature:number};
export function statParts(base:number,level:number,stat:typeof STATS[number],value:number,nature:[string|null,string|null],iv:number,ev:number):StatParts{
 const hp=stat==='hp',mod=hp?1:nature[0]===stat?1.1:nature[1]===stat?0.9:1;
 const raw=[2*base*level/100,iv*level/100,Math.floor(ev/4)*level/100,hp?level+10:5];
 const total=raw.reduce((a,b)=>a+b,0),before=Math.round(value/mod),scaled=raw.map(x=>total>0?x*before/total:0);
 // Redondeo por restos mayores: las partes enteras suman exactamente `before`.
 const parts=scaled.map(Math.floor);let left=before-parts.reduce((a,b)=>a+b,0);
 for(const i of scaled.map((x,i)=>i).sort((a,b)=>(scaled[b]-parts[b])-(scaled[a]-parts[a])))if(left-->0)parts[i]++;
 return {base:parts[0],genes:parts[1],effort:parts[2],level:parts[3],nature:value-before};
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
export const PROFILE_TARGET:Species={base:[70,70,70,70,70,70],types:[],abilities:[],learn:[],tms:[]};

export function damage(battle:Battle,attacker:TeamMon,move:Move,target:number,targetLevel:number){
 const foe=battle.species[target];
 return foe?damageVs(battle,attacker,move,foe,targetLevel):null;
}
export function damageVs(battle:Battle,attacker:TeamMon,move:Move,foe:Species,targetLevel:number){
 const me=battle.species[attacker.n];
 if(!me||!foe||!move.power)return null;
 const mine=attacker.stats??statsOf(me.base,attacker.level,battle.natures[attacker.nature]??[null,null],attacker.ivs,attacker.evs);
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

// Los cuatro ataques que se le suponen a un Pokemon del que solo sabes la
// especie y el nivel. No son los ultimos que aprendio, que es lo que lleva uno
// salvaje, sino los que mas sirven: un jugador va cambiando los flojos.
//
// Se reserva un hueco para un movimiento de estado, porque un set de solo
// ataques es peor set: dormir, paralizar o bajarle el Ataque al rival gana
// combates que la potencia bruta no gana. Asi el supuesto tambien ensena como
// suele armarse un equipo.
//
// Solo se miran los que aprende subiendo de nivel, nunca las MT: no hay forma
// de saber cuales le ensenaste. Los ataques se puntuan por dano esperado
// contra el rival neutro, contando la precision, y se prefiere variedad de
// tipos antes que dos que hacen lo mismo.
const STATUS_FIRST=new Set(['SLEEP','PARALYZE','TOXIC','POISON','CONFUSE','WILL_O_WISP','LEECH_SEED']);
export function assumedMoves(battle:Battle,n:number,level:number){
 const species=battle.species[n];if(!species)return [];
 const known=[...new Set(species.learn.filter(([lvl])=>lvl<=level).map(([,move])=>move).filter(move=>battle.moves[move]))];
 const mon:TeamMon={id:'',n,level,nature:'Hardy',ability:'',moves:[]};
 const attacks=known.filter(key=>battle.moves[key].power>0).map(key=>{
  const move=battle.moves[key],hit=damageVs(battle,mon,move,PROFILE_TARGET,level);
  return {key,type:move.type,score:hit?(hit.min+hit.max)/2*(move.accuracy||100)/100:0};
 }).sort((a,b)=>b.score-a.score);
 // El mejor de estado: primero los que dejan al rival tocado (dormido,
 // paralizado, envenenado), luego los que cambian estadisticas, y entre
 // iguales el mas reciente, que suele ser el mas fuerte.
 const best=known.filter(key=>!battle.moves[key].power).map((key,i)=>{
  const effect=battle.moves[key].effect??'';
  return {key,rank:STATUS_FIRST.has(effect)?2:/^(ATTACK|DEFENSE|SPEED|SPECIAL_ATTACK|SPECIAL_DEFENSE|ACCURACY|EVASION)_/.test(effect)?1:0,order:i};
 }).sort((a,b)=>b.rank-a.rank||b.order-a.order)[0]?.key;
 // Tres ataques con cobertura y un hueco de estado; si no hay de estado, el
 // hueco lo ocupa otro ataque.
 const room=best?3:4,picked:string[]=[],types=new Set<string>();
 for(const attack of attacks){
  if(picked.length===room||types.has(attack.type))continue;
  picked.push(attack.key);types.add(attack.type);
 }
 for(const attack of attacks){
  if(picked.length===room)break;
  if(!picked.includes(attack.key))picked.push(attack.key);
 }
 const rest=known.filter(key=>!battle.moves[key].power&&key!==best);
 return [...picked,...(best?[best]:[]),...rest.slice(-(4-picked.length-(best?1:0)))].slice(0,4);
}

// Símbolos visuales inspirados en los iconos de categoría de los juegos:
// ráfaga = físico, círculos = especial y yin-yang = estado.
export const categorySymbol=(kind:MoveKind)=>kind==='physical'?'✹':kind==='special'?'◎':'☯';
export const moveKind=(move:Move):MoveKind=>move.power?move.category:'status';

export const EFFECT_SUMMARIES:Record<string,'effectLightScreen'|'effectReflect'|'effectParalyze'|'effectSleep'|'effectPoison'|'effectBadPoison'|'effectBurn'|'effectConfuse'|'effectProtect'|'effectRestoreHp'|'effectRest'|'effectWeatherRain'|'effectWeatherSun'|'effectWeatherSand'|'effectWeatherHail'|'effectHazards'>={
 LIGHT_SCREEN:'effectLightScreen',REFLECT:'effectReflect',PARALYZE:'effectParalyze',SLEEP:'effectSleep',POISON:'effectPoison',TOXIC:'effectBadPoison',WILL_O_WISP:'effectBurn',CONFUSE:'effectConfuse',PROTECT:'effectProtect',RESTORE_HP:'effectRestoreHp',SOFTBOILED:'effectRestoreHp',SYNTHESIS:'effectRestoreHp',MORNING_SUN:'effectRestoreHp',MOONLIGHT:'effectRestoreHp',REST:'effectRest',RAIN_DANCE:'effectWeatherRain',SUNNY_DAY:'effectWeatherSun',SANDSTORM:'effectWeatherSand',HAIL:'effectWeatherHail',SPIKES:'effectHazards',
};
// SPECIAL: la Especial de Gen 1 (sube o baja a la vez el ataque y la defensa especial).
export const effectStat=(effect:string|undefined)=>effect?.match(/^(ATTACK|DEFENSE|SPEED|SPECIAL_ATTACK|SPECIAL_DEFENSE|SPECIAL|ACCURACY|EVASION)_(UP|DOWN)(?:_(2))?$/);

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

// Valor para entrenar, de 0 a 100: que tal sale este Pokemon en concreto si lo
// subes hasta el final. Se mira a nivel 100 y en su ultima evolucion (un
// Magikarp se entrena por el Gyarados que sera), y junta dos notas:
//
// - La especie (60 %): sus bases, con IVs de 15 y naturaleza neutra. Pesos:
//   ataque principal 30 %, Velocidad 25 % y PS, Defensa y Def. Esp. 15 % cada
//   una. Escala: 120 es un Pokemon final muy flojo y 280 un Mewtwo medio, de
//   modo que la mitad de las evoluciones finales quedan por debajo de 50.
// - El ejemplar (40 %): donde cae entre el peor y el mejor de su especie por
//   IVs y naturaleza. Aqui el ataque principal pesa la mitad, porque es lo que
//   decide si pega o no: unos buenos IVs en Defensa no compensan un Ataque
//   pobre, ni la Velocidad de Timid compensa que le baje el Ataque a un
//   atacante fisico. A nivel 100 los IVs solo mueven unos 30 puntos de cada
//   cifra, y mezclados con la especie se perdian.
//
// De los dos ataques solo cuenta el mayor: a un atacante fisico no le importa
// el Ataque Especial, y una naturaleza que baja el que no usa es justo la buena.
// Se decide con las cifras del propio ejemplar y no solo con las bases, porque
// hay especies empatadas (Raichu, 90 y 90) donde la naturaleza elige.
//
// Primera generacion (Yellow): la Especial es una sola cifra (ataca y defiende),
// asi que pesa como ataque si es la principal y, ademas, un 10 % como defensa.
// La Velocidad pesa mas (30 %) porque tambien decide los golpes criticos. No
// hay naturalezas, y los genes son DVs de 0 a 15: en las cuentas van dobles
// (0 a 30), que es como entran en la formula. Escala: de 125 a 300, con la
// misma lectura (Mewtwo medio 98, la mitad de las formas finales bajo 50).
// Los pesos y la escala de cada generacion viven en rules.ts (training).
const SPECIES_SHARE=.6;
export const rulesOf=(battle:Battle|null)=>rulesFor(battle?.gen);
type Mods=[string|null,string|null];
const trainStats=(base:number[],ivs:number[],nature:Mods)=>statsOf(base,100,nature,ivs);
const mainAttack=(stats:number[])=>stats[1]>=stats[3]?1:3;
const trainWeight=(base:number[],ivs:number[],nature:Mods,weights:number[])=>{
 const stats=trainStats(base,ivs,nature),main=mainAttack(stats);
 return stats.reduce((sum,value,i)=>(i===1||i===3)&&i!==main?sum:sum+value*weights[i],0);
};
// `species` y `specimen` son las dos notas; `nature` es lo que la naturaleza
// suma o resta a la del ejemplar, y `mainIv`/`speedIv` los IVs que mas pesan
// (null si no escribiste sus estadisticas). `base` es la nota de un ejemplar
// medio de esa especie (IVs de 15 y naturaleza neutra, la del ranking) y `top`
// la del mejor posible: entre las dos se ve donde cae el tuyo.
export type TrainingValue={score:number;into:number;main:'atk'|'spa';species:number;specimen:number;nature:number;
 lowersMain:boolean;raisesMain:boolean;mainIv:number|null;speedIv:number|null;base:number;top:number};
export function trainingValue(battle:Battle,forms:number[],natureKey:string,ivs:number[]|null):TrainingValue|null{
 const shown=forms.filter(n=>battle.species[n]);if(!shown.length)return null;
 const rules=rulesOf(battle).training,{weights,specimen:specimenWeights}=rules;
 const trainScore=(weight:number)=>Math.max(0,Math.min(100,Math.round((weight-rules.floor)/(rules.top-rules.floor)*100)));
 const nature=battle.natures[natureKey]??[null,null],neutral:Mods=[null,null],natures=Object.values(battle.natures);
 const mid=STATS.map(()=>IV),own=ivs??mid,best=STATS.map(()=>rules.max),worst=STATS.map(()=>0);
 // Si puede evolucionar de varias formas (Eevee), se toma la que mejor le sale.
 const into=shown.reduce((a,b)=>trainWeight(battle.species[b].base,own,nature,weights)>trainWeight(battle.species[a].base,own,nature,weights)?b:a);
 const base=battle.species[into].base,species=trainScore(trainWeight(base,mid,neutral,weights));
 const hi=Math.max(...natures.map(mods=>trainWeight(base,best,mods,specimenWeights)));
 const lo=Math.min(...natures.map(mods=>trainWeight(base,worst,mods,specimenWeights)));
 const quality=(iv:number[],mods:Mods)=>Math.round((trainWeight(base,iv,mods,specimenWeights)-lo)/(hi-lo)*100);
 const specimen=quality(own,nature),main=mainAttack(trainStats(base,own,nature)),key=STATS[main];
 const mix=(q:number)=>Math.round(SPECIES_SHARE*species+(1-SPECIES_SHARE)*q);
 return {score:mix(specimen),into,main:key==='atk'?'atk':'spa',species,specimen,nature:specimen-quality(own,neutral),
  lowersMain:nature[1]===key,raisesMain:nature[0]===key,mainIv:ivs?ivs[main]:null,speedIv:ivs?ivs[5]:null,base:mix(quality(mid,neutral)),top:mix(100)};
}
// IVs deducidos de las estadisticas escritas (los del juez), o null si no hay
// o no cuadran. De un rango se toma su punto medio, sin pasar del maximo (31;
// en Gen 1, 30 = DV 15 doblado): lo de mas son EVs o Stat Exp.
export function ivsOf(battle:Battle,mon:TeamMon){
 if(mon.ivs)return mon.ivs;
 const s=battle.species[mon.n],stats=mon.stats;if(!s||!stats)return null;
 const mods=battle.natures[mon.nature]??[null,null],top=rulesOf(battle).training.max;
 const fits=STATS.map((stat,i)=>genes(s.base[i],mon.level,stats[i],stat,mods));
 if(fits.some(f=>!f))return null;
 return fits.map(f=>Math.min(top,Math.round((f!.min+Math.min(top,f!.max))/2)));
}
// Las formas en las que acaba: las que ya no evolucionan (varias en Eevee).
// Se sigue la Pokedex del juego, asi que solo cuentan las evoluciones que hay en
// el; las que no se consiguen alli tampoco (en Yellow, el Pikachu de Oak no
// acepta la Piedra Trueno: se queda en Pikachu).
export const finalForms=(dex:Dex,battle:Battle,n:number,seen:number[]=[]):number[]=>{
 const next=dex.species.filter(other=>other.from?.n===n&&other.get!=='none'&&battle.species[other.n]&&!seen.includes(other.n));
 return next.length?next.flatMap(evo=>finalForms(dex,battle,evo.n,[...seen,n])):[n];
};
export const trainingBand=(score:number)=>score>=85?'train5':score>=70?'train4':score>=55?'train3':score>=40?'train2':'train1';

export type MoveAdvice={kind:'replace'|'keep'|'manual';old:string|null;delta:number};

export type Opponent={name:string;level:number};
export const opponentName=(value:string)=>value.toLowerCase().replace(/♀/g,'f').replace(/♂/g,'m').replace(/[^a-z0-9]/g,'');
// Los equipos de entrenadores llegan como texto del mapa: "Clefairy Lv14, ...".
// Se transforma aquí para que el mapa y la ficha usen la misma fórmula de daño.
export const trainerOpponents=(detail?:string|null):Opponent[]=>(detail??'').split(', ').flatMap(part=>{
 const found=/^(.+?)\s+Lv\.?\s*(\d+)$/i.exec(part.trim());
 return found?[{name:found[1],level:+found[2]}]:[];
});

// EVs que da un Pokemon al derrotarlo ("+1 At. Esp."), o la suma de varios.
// En la tercera generacion no se reparten: cada Pokemon que participa en el
// combate se los lleva enteros.
export const evList=(evs:(number[]|undefined)[],tr:T)=>{
 const total=STATS.map((_,i)=>evs.reduce((sum,ev)=>sum+(ev?.[i]??0),0));
 // Espacios duros: si la lista baja de linea, no parte un "+1 Def. Esp.".
 const got=total.flatMap((v,i)=>v?[`+${v} ${tr.t(('stat_'+STATS[i]) as never)}`.replace(/ /g,String.fromCharCode(160))]:[]);
 return got.length?got.join(', '):null;
};

// Lo que gana tu Pokemon al derrotar a estos, segun las reglas del juego:
// - EVs por especie (Gen 3): "EVs: +1 At. Esp.";
// - Stat Exp. (Gen 1): se gana en todas las estadisticas lo que valen las bases
//   del rival, asi que se muestran las dos que mas entrena ("Stat Exp.: +90
//   Velocidad, +55 Ataque…"). `total`: la suma de todo un equipo.
export function effortText(battle:Battle,ns:number[],tr:T,total=false){
 const rules=rulesOf(battle);
 if(rules.effort==='ev'){
  const list=evList(ns.map(n=>battle.species[n]?.ev),tr);
  return list?tr.t(total?'evTotal':'evYield',{list}):null;
 }
 const shown=STATS.flatMap((stat,i)=>rules.special==='single'&&stat==='spd'?[]:[i]);
 const sums=shown.map(i=>({i,v:ns.reduce((sum,n)=>sum+(battle.species[n]?.base[i]??0),0)})).filter(x=>x.v).sort((a,b)=>b.v-a.v);
 if(!sums.length)return null;
 const label=(i:number)=>tr.t((rules.special==='single'&&STATS[i]==='spa'?'stat_spc':'stat_'+STATS[i]) as never);
 const list=sums.slice(0,2).map(x=>`+${x.v} ${label(x.i)}`.replace(/ /g,String.fromCharCode(160))).join(', ');
 return tr.t(total?'statExpTotal':'statExpYield',{list});
}

// Cuanto aporta un ataque al perfil actual. Sirve tanto para ordenar la tabla
// de decision como para decidir si el movimiento nuevo merece un hueco.
export const profileMoveFit=(battle:Battle,mon:TeamMon,move:Move,profile:BuildProfile)=>{
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

