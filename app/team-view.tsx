'use client';
import {useEffect,useMemo,useState} from 'react';
import {ArrowDown,ArrowUp,ChevronDown,HeartCrack,Plus,Search,X} from 'lucide-react';
import {Figure,Num} from './shared';
import {ScanCard} from './scan';
import type {T} from './i18n';
import type {Gen} from './rules';
import type {Dex} from './lists';
import {Help} from './learn';
import {PROFILE_TARGET,profileMoveFit} from './battle';
import {type Move,type Battle,type Guess,type TeamMon,STATS,statsOf,genes,damageVs,movePool,assumedMoves,categorySymbol,moveKind,EFFECT_SUMMARIES,effectStat,buildProfile,rulesOf,trainingValue,ivsOf,finalForms,trainingBand,adviseMoveReplacement} from './battle';
export function TeamView({dex,battle,moveText,storageKey,suggestedLevel,tr}:{dex:Dex;battle:Battle|null;moveText:Record<string,{en:string;es:string}>|null;storageKey:string;suggestedLevel:number;tr:T}){
 const {t,lang,type:typeName,move:moveName,ability:abilityName,nature:natureName}=tr;
 // Lo que se muestra depende de las reglas del juego (rules.ts), no del juego:
 // Especial unica o separada, genes DV o IV, naturalezas, habilidades, juez...
 const rules=rulesOf(battle),single=rules.special==='single',dv=rules.genes.name==='DV',gen:Gen=battle?.gen??3;
 const statLabel=(stat?:string|null)=>t((single&&stat==='spa'?'stat_spc':'stat_'+stat) as never);
 const describe=(key:string)=>moveText?.[key]?.[lang==='es'?'es':'en']??null;
 const statusSummary=(key:string,move:Move)=>{
  const stat=effectStat(move.effect);
  if(stat){
   const statName=stat[1]==='ACCURACY'?t('stat_accuracy'):stat[1]==='EVASION'?t('stat_evasion'):statLabel(({ATTACK:'atk',DEFENSE:'def',SPEED:'spe',SPECIAL_ATTACK:'spa',SPECIAL_DEFENSE:'spd',SPECIAL:'spa'}[stat[1]]));
   const summaryKey=stat[2]==='UP'?(stat[3]?'effectRaiseMuch':'effectRaise'):(stat[3]?'effectLowerMuch':'effectLower');
   return t(summaryKey,{stat:statName});
  }
  const summary=EFFECT_SUMMARIES[move.effect??''];
  return summary?t(summary):describe(key)??t('status');
 };
 const [candidate,setCandidate]=useState<Record<string,string>>({});
 const [team,setTeam]=useState<TeamMon[]>([]),[query,setQuery]=useState('');
 // Que fichas estan abiertas. Antes era un <details> y se abria al tocar
 // cualquier parte de la fila, que es justo lo que estorba cuando solo
 // quieres mirar los ataques o cambiar el nivel.
 const [open,setOpen]=useState<string[]>([]);
 const toggle=(id:string)=>setOpen(ids=>ids.includes(id)?ids.filter(x=>x!==id):[...ids,id]);
 useEffect(()=>{try{setTeam(JSON.parse(localStorage.getItem(storageKey)||'[]'))}catch{setTeam([])}},[storageKey]);
 const save=(next:TeamMon[])=>{setTeam(next);try{localStorage.setItem(storageKey,JSON.stringify(next));dispatchEvent(new CustomEvent('route151-team-changed',{detail:storageKey}))}catch{}};
 const species=useMemo(()=>new Map(dex.species.map(s=>[s.n,s])),[dex]);
 const q=query.trim().toLowerCase();
 const results=useMemo(()=>!q?[]:dex.species.filter(s=>battle?.species[s.n]&&s.name.toLowerCase().includes(q)).slice(0,8),[dex,battle,q]);

 if(!battle)return <div className="listview loading-list">{t('loadingTeam')}</div>;
 // Un toque y ya esta en el equipo: el nivel sale de tu progreso, los ataques
 // son los ultimos que aprende a ese nivel, la naturaleza es neutra (no toca
 // ninguna estadistica) y la habilidad, la primera de la especie. Todo queda
 // marcado como supuesto hasta que lo cambies.
 const add=(n:number)=>{
  const s=battle.species[n];if(!s)return;
  // Si ya corregiste el nivel de alguno, tu propio equipo es mejor dato que
  // los gimnasios: se toma el del medio de los que confirmaste.
  const mine=team.filter(mon=>!mon.guess?.includes('level')).map(mon=>mon.level).sort((a,b)=>a-b);
  const level=Math.max(1,Math.min(100,mine.length?mine[Math.floor(mine.length/2)]:suggestedLevel));
  const guess:Guess[]=['level','nature','moves',...(s.abilities.length>1?['ability' as const]:[])];
  save([...team,{id:`${n}-${Date.now()}`,n,level,nature:'Hardy',ability:s.abilities[0]??'',
   moves:[...assumedMoves(battle,n,level),null,null,null,null].slice(0,4),bench:party.length>=6,guess}]);
  setQuery('');
 };
 const update=(id:string,change:Partial<TeamMon>)=>save(team.map(mon=>{
  if(mon.id!==id)return mon;
  // Lo que acabas de escribir ya no es un supuesto. Las estadisticas escritas
  // fijan tambien el nivel, porque de ellas sale.
  const touched=Object.keys(change).flatMap(field=>field==='stats'?['level' as Guess]:
   (['level','nature','ability','moves'] as Guess[]).includes(field as Guess)?[field as Guess]:[]);
  const guess=mon.guess?.filter(field=>!touched.includes(field));
  const next={...mon,...change,guess:guess?.length?guess:undefined};
  // Si los ataques siguen siendo supuestos y cambias el nivel, se rehacen: a
  // otro nivel el juego le habria ensenado otra cosa.
  if(change.level!==undefined&&change.moves===undefined&&guess?.includes('moves'))
   next.moves=[...assumedMoves(battle,next.n,next.level),null,null,null,null].slice(0,4);
  return next;
 }));
 const party=team.filter(m=>!m.bench),bench=team.filter(m=>m.bench);

 // Grafico de juez: hexagono con la valoracion de cada IV, como en los juegos.
 const judgeLabel=(iv:number)=>t((iv>=31?'rate5':iv>=30?'rate4':iv>=21?'rate3':iv>=11?'rate2':iv>=1?'rate1':'rate0') as never);
 const judge=(mon:TeamMon)=>ivsOf(battle,mon);
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
  // DVs: entran dobles en las cuentas (`scale`), y lo que pase del tope es Stat Exp.
  if(dv){
   const {max,scale}=rules.genes,top=max*scale;
   if(fit.min>top)return t('dvWithExp');
   const lo=Math.ceil(fit.min/scale),hi=Math.floor(Math.min(top,fit.max)/scale);
   return t('dv',{range:lo>=hi?`${Math.min(lo,max)}`:`${lo}–${hi}`})+(fit.max>top?'+':'');
  }
  if(fit.min>31)return t('ivWithEv',{n:fit.min});
  const max=Math.min(31,fit.max);
  return t('iv',{range:fit.min===max?`${fit.min}`:`${fit.min}–${max}`})+(fit.max>31?'+':'');
 };
 const moveLabel=(key:string)=>{const m=battle.moves[key];
  const kind=m.power?t(m.category==='physical'?'physicalShort':'specialShort'):t('statusShort');
  return `${moveName(m.name)} · ${typeName(m.type)} · ${categorySymbol(moveKind(m))} ${kind}${m.power?` ${m.power}`:''}`};
 // La Pokedex guarda de quien viene cada especie y como; para saber en que
 // evoluciona una se mira esa relacion al reves.
 // Solo las que se consiguen en el juego: en Yellow, Pikachu no ofrece Raichu.
 const evolutionsOf=(n:number)=>dex.species.filter(other=>other.from?.n===n&&other.get!=='none'&&battle.species[other.n]);
 // Nivel al que evoluciona, si es por nivel: sirve para avisar de que ya toca.
 const atLevel=(method:string|null)=>{const found=/^level (\d+)$/.exec(method??'');return found?+found[1]:null};
 const valueOf=(mon:TeamMon)=>trainingValue(battle,finalForms(dex,battle,mon.n),mon.nature,judge(mon));
 const signed=(n:number)=>n>0?`+${n}`:n<0?`−${-n}`:'±0';

 // Evolucionar conserva lo que el juego conserva: nivel, naturaleza y ataques.
 // La habilidad cambia solo si la que tenia no existe en la nueva especie, y
 // las estadisticas escritas se borran porque eran las del anterior: las bases
 // son otras y el nivel que se dedujo de ellas ya no cuadraria.
 const evolve=(mon:TeamMon,into:number)=>{
  const next=battle.species[into];if(!next)return;
  const ability=next.abilities.includes(mon.ability)?mon.ability:next.abilities[0]??'';
  // Si los ataques eran supuestos siguen siendolo, pero los del que ahora es.
  const moves=mon.guess?.includes('moves')
   ?[...assumedMoves(battle,into,mon.level),null,null,null,null].slice(0,4)
   :mon.moves;
  save(team.map(other=>other.id===mon.id?{...other,n:into,ability,moves,stats:undefined}:other));
 };

 // Un supuesto se marca junto al campo, para saber de un vistazo que viene de
 // tu partida y que lo puso la app.
 const guessed=(mon:TeamMon,field:Guess)=>mon.guess?.includes(field)
  ?<i className="team-guess" title={t('assumedHelp')}>{t('assumed')}</i>:null;
 const card=(mon:TeamMon)=>{
  const s=battle.species[mon.n],info=species.get(mon.n),pool=movePool(battle,mon);
  const estimate=statsOf(s.base,mon.level,battle.natures[mon.nature]??[null,null]);
  const stats=mon.stats??estimate,own=!!mon.stats,profile=buildProfile(battle,mon);
  const known=mon.moves.filter(Boolean).length;
  // La ficha nace plegada: anadir un Pokemon no deberia abrir un formulario.
  const shown=open.includes(mon.id),evolutions=evolutionsOf(mon.n);
  // Le toca cuando alguna de sus evoluciones es por nivel y ya lo alcanzo.
  const ready=evolutions.some(evo=>(atLevel(evo.from?.method??null)??101)<=mon.level);
  const value=valueOf(mon),band=value?trainingBand(value.score):null;
  const mainStat=value?statLabel(value.main):'';
  return <article key={mon.id} className={`team-mon ${mon.out?'out':''}`}>
   <div className="team-row">
    <Figure m={{icon:info?.icon,category:'Pokémon'}}/>
    <div className="team-title">
     <span className="team-name"><b>{info?.name??mon.n}</b>
      <span className="types">{s.types.map(ty=><i key={ty} className={`type t-${ty}`}>{typeName(ty)}</i>)}</span>
      {mon.out&&<i className="team-ko">{t('out')}</i>}
      {ready&&<i className="team-ready">{t('canEvolve')}</i>}
      {!mon.out&&mon.guess?.length?<i className="team-guess">{t('assumed')}</i>:null}</span>
    </div>
    {value&&band&&<span className={`team-score ${band}`} title={`${t('training')}: ${t(band)}`}>{value.score}</span>}
    <span className="team-level">
     <small>{t('levelShort',{n:''}).trim()}</small>
     <Num value={mon.level} min={1} max={100} label={t('level')} onChange={n=>update(mon.id,{level:n})}/>
    </span>
    <button className={`team-out ${mon.out?'on':''}`} title={mon.out?t('outBack'):t('outMark')} aria-label={mon.out?t('outBack'):t('outMark')}
     onClick={()=>update(mon.id,{out:!mon.out})}><HeartCrack/></button>
    <button className="team-remove" aria-label={t('remove')} title={t('remove')}
     onClick={()=>save(team.filter(x=>x.id!==mon.id))}><X/></button>
    {/* Se abre solo con este boton: la fila entera ya no es un interruptor. */}
    <button className={`team-open-toggle ${shown?'on':''}`} aria-expanded={shown} aria-label={t(shown?'collapse':'expand')} title={t(shown?'collapse':'expand')}
     onClick={()=>toggle(mon.id)}><ChevronDown/></button>
   </div>
   {/* Los ataques a la vista, con su tipo y si pegan de fisico, de especial o
       son de estado: es lo que se consulta en mitad de un combate. */}
   <div className="team-set">{known===0?<small>{t('movesNone')}</small>:mon.moves.flatMap((key,i)=>{
      const move=key?battle.moves[key]:null;
      return move?[<i key={i} className={`type shot t-${move.type}`} title={`${typeName(move.type)} · ${t(move.power?(move.category==='physical'?'physical':'special'):'status')}`}>
       <b>{categorySymbol(moveKind(move))}</b>{moveName(move.name)}</i>]:[];
    })}</div>

   {shown&&<div className="team-open">
   <div className="team-actions">
    <button className="team-move" title={mon.bench?t('toParty'):t('toBench')} aria-label={mon.bench?t('toParty'):t('toBench')}
     disabled={!!mon.bench&&party.length>=6} onClick={()=>update(mon.id,{bench:!mon.bench})}>{mon.bench?<ArrowUp/>:<ArrowDown/>}{mon.bench?t('toParty'):t('toBench')}</button>
    <button className={`team-move ${mon.out?'on':''}`} onClick={()=>update(mon.id,{out:!mon.out})}><HeartCrack/>{mon.out?t('outBack'):t('outMark')}</button>
   </div>
   <div className="team-fields">
    <label>{t('level')}{guessed(mon,'level')}<Num value={mon.level} min={1} max={100} label={t('level')} onChange={n=>update(mon.id,{level:n})}/></label>
    {rules.natures&&<label>{t('nature')}<Help term="nature" gen={gen} tr={tr}/>{guessed(mon,'nature')}<select value={mon.nature} onChange={e=>update(mon.id,{nature:e.target.value})}>{Object.entries(battle.natures).map(([n,[up,down]])=><option key={n} value={n}>{natureName(n)}{up?` (+${statLabel(up)} −${statLabel(down)})`:''}</option>)}</select></label>}
    {rules.abilities&&<label>{t('ability')}<Help term="ability" gen={gen} tr={tr}/>{guessed(mon,'ability')}<select value={mon.ability} onChange={e=>update(mon.id,{ability:e.target.value})}>{[...new Set([...s.abilities,mon.ability].filter(Boolean))].map(a=><option key={a} value={a}>{abilityName(battle.abilities[a]??a)}</option>)}</select></label>}
   </div>
   {/* Con Especial unica se muestra una vez y se escribe en las dos casillas. */}
   <dl className={`team-stats ${own?'own':''}`}>{STATS.flatMap((stat,i)=>single&&stat==='spd'?[]:[<div key={stat}>
    <dt>{statLabel(stat)}</dt>
    <dd><Num value={stats[i]} min={1} max={999} label={statLabel(stat)}
     onChange={n=>update(mon.id,{stats:stats.map((v,j)=>j===i||(single&&i===3&&j===4)?n:v)})}/></dd>
    <small>{t('baseStat',{n:s.base[i]})}{own&&' · '}{own&&(fit=>fit?ivLabel(fit):<span title={t('ivNoFitHelp')}>{t('ivNoFit')}</span>)(genes(s.base[i],mon.level,stats[i],stat,battle.natures[mon.nature]??[null,null]))}</small>
   </div>])}</dl>
   <p className="team-note"><Help term="stats" gen={gen} tr={tr}/><Help term={dv?'dv':'iv'} gen={gen} tr={tr}/>{own&&<span className="team-iv">{t(dv?'dvNote':'ivNote')} </span>}{own?<button className="team-reset" onClick={()=>update(mon.id,{stats:undefined})}>{t('useEstimate')}</button>:t('statsEditable')}</p>
   {value&&band&&<div className="training">
    <h4>{t('training')}<Help term="training" gen={gen} tr={tr}/></h4>
    <div className="training-head">
     <b className={`team-score ${band}`}>{value.score}</b>
     <span><strong>{t(band)}</strong>
      <small>{value.into!==mon.n?t('trainingAs',{name:species.get(value.into)?.name??''}):t('trainingFinal')}</small></span>
    </div>
    {/* La barra marca la media de la especie y el maximo: el tuyo cae entre las dos o por debajo. */}
    <i className="training-bar"><em className={band} style={{width:`${value.score}%`}}/>
     <b className="training-mark" style={{left:`${value.base}%`}}/><b className="training-mark top" style={{left:`${value.top}%`}}/></i>
    <dl className="training-compare">
     <div title={t('trainingBaseHelp')}><dt>{t('trainingBase')}</dt><dd>{value.base}</dd></div>
     <div className="yours"><dt>{t('trainingYours')}</dt><dd>{value.score}{value.score!==value.base&&<small> ({signed(value.score-value.base)})</small>}</dd></div>
     <div><dt>{t('trainingBest')}</dt><dd>{value.top}</dd></div>
    </dl>
    <ul>
     <li>{t('trainingSpecies',{n:value.species,name:species.get(value.into)?.name??'',stat:mainStat})}</li>
     <li>{t('trainingSpecimen',{n:value.specimen})}
      <ul>
       <li>{value.mainIv!==null?t(dv?'trainingDvs':'trainingIvs',{stat:mainStat,n:Math.round(value.mainIv/rules.genes.scale),spe:Math.round((value.speedIv??0)/rules.genes.scale)})
        :t(dv?'trainingDvsAssumed':'trainingIvsAssumed')}</li>
       {rules.natures&&<li>{t(value.lowersMain?'trainingNatureDown':value.raisesMain?'trainingNatureUp':'trainingNature',{nature:natureName(mon.nature),stat:mainStat,n:signed(value.nature)})}</li>}
      </ul></li>
    </ul>
   </div>}
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
      ?{...value,up:typeof value.up==='string'?statLabel(value.up):value.up,down:typeof value.down==='string'?statLabel(value.down):value.down}
      :reason.key==='profileAbilityReason'
       ?{...value,ability:abilityName(battle.abilities[mon.ability]??mon.ability),effect:t(('profileAbility_'+String(value.kind)) as never)}
       :value;
     return <li key={`${reason.key}-${i}`}>{t(reason.key,vars)}</li>;
    })}</ul>
    <p className="team-note">{t('profileNote')}</p>
    {own&&rules.natures&&(fits=>fits.length&&!fits.includes(mon.nature)?<p className="team-note team-natures">{t('natureFits')} {fits.map(n=>
     <button key={n} className="team-reset" onClick={()=>update(mon.id,{nature:n})}>{natureName(n)}</button>)}</p>:null)(fittingNatures(mon))}
   </div>}
   {own&&rules.judge&&(ivs=>ivs?<div className="judge">
    <h4>{t('judge')}<Help term="judge" gen={gen} tr={tr}/><small>{t('judgeTotal',{n:ivs.reduce((a,b)=>a+b,0)})}</small></h4>
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
       <tspan className="judge-stat" x={Number(x)}>{statLabel(STATS[Number(stat)])}</tspan>
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
       <span>{move.power?`${t('basePower',{n:move.power})} · ${impact?t('powerWithStats',{min:impact.min,max:impact.max,stat:statLabel((move.category==='physical'?'atk':'spa')),n:stats[statIndex]}):''}`:statusSummary(moveKey,move)}</span>
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
   {evolutions.length>0&&<div className="team-evo">
    <h4>{t('evolve')}</h4>
    <div className="evo-options">{evolutions.map(evo=>{
     const level=atLevel(evo.from?.method??null);
     return <button key={evo.n} className={level!==null&&level<=mon.level?'ready':''} onClick={()=>evolve(mon,evo.n)}>
      <Figure m={{icon:evo.icon,category:'Pokémon'}}/>
      <span><b>{evo.name}</b><small>{evo.from?.method?tr.evo(evo.from.method):t('evolveHow')}</small></span>
     </button>;
    })}</div>
    <p className="team-note">{t('evolveNote')}</p>
   </div>}
   {/* El lector vive dentro de cada Pokemon: sirve para enriquecer el que ya
       tienes, y sabiendo de que especie es acierta mucho mas. */}
   {/* El lector de fichas conoce la pantalla de Gen 3. */}
   {rules.scan&&<ScanCard battle={battle} dex={dex} mon={mon} tr={tr} onFill={change=>update(mon.id,change)}/>}
   <h4 className="team-moves-head">{t('scanMoves')}{guessed(mon,'moves')}</h4>
   <div className="team-moves">{[0,1,2,3].map(i=>{
    const move=mon.moves[i]?battle.moves[mon.moves[i]!]:null;
    const impact=move&&move.power?damageVs(battle,mon,move,PROFILE_TARGET,mon.level):null;
    return <div key={i} className="move-slot" data-type={move?.type}>
     <select value={mon.moves[i]??''} onChange={e=>update(mon.id,{moves:mon.moves.map((m,j)=>j===i?(e.target.value||null):m)})}>
      <option value="">{t('noMove')}</option>
      {pool.map(key=><option key={key} value={key}>{moveLabel(key)}</option>)}
     </select>
     {move&&<small>
      {move.power?impact&&<span>{t('powerWithStats',{min:impact.min,max:impact.max,stat:statLabel((move.category==='physical'?'atk':'spa')),n:stats[move.category==='physical'?1:3]})}</span>:<span>{t('status')}</span>}
      <span>PP {move.pp}</span></small>}
     {move&&describe(mon.moves[i]!)&&<p className="move-desc">{describe(mon.moves[i]!)}</p>}
    </div>;
   })}
   </div>
   </div>}
  </article>;
 };
 return <div className="listview">
  <div className="list-head">
   <div className="list-title"><h2>{t('tabTeam')}</h2><span className="progress"><b>{party.length}/6</b>{bench.length>0&&<small> +{bench.length}</small>}{team.some(mon=>mon.out)&&(n=><small> · {n===1?t('outCountOne'):t('outCount',{n})}</small>)(team.filter(mon=>mon.out).length)}</span></div>
   <label className="list-search"><Search/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder={t('addPokemon')}/></label>
   {results.length>0&&<div className="team-results">{results.map(s=><button key={s.n} onClick={()=>add(s.n)}><Figure m={{icon:s.icon,category:'Pokémon'}}/><b>{s.name}</b><Plus/></button>)}</div>}
   {party.length>=6&&query&&<p className="team-note">{t('partyFull')}</p>}
  </div>
  <div className="list-body team">
   {party.map(card)}
   {!party.length&&<p className="list-empty">{t('teamEmpty')}</p>}
   {!team.length&&<p className="team-note team-hint">{t('quickAdd')}</p>}

   <h3 className="team-section">{t('bench')}{bench.length>0&&<b>{bench.length}</b>}</h3>
   {bench.map(card)}
   {!bench.length&&<p className="list-empty">{t('benchEmpty')}</p>}

   <p className="list-source">{t('statsNote')}</p>
  </div>
 </div>;
}
