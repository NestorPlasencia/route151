'use client';
// Pestanas de lista: la checklist por zonas (en orden de juego) y la Pokedex.
import {useEffect,useMemo,useRef,useState,type ReactNode} from 'react';
import {Check,ChevronDown,Flag,Lock,MapPin,Search,SkipForward} from 'lucide-react';
import {Figure,checkOrder,type Gate,type Marker} from './shared';
import {BehindNote,LEADER,NextGoal,Unlocked,type Behind,type Unlock} from './guide';
import type {T} from './i18n';
import {BattleAdvice,trainerOpponents,type Battle} from './team';
import {uidsOf,caughtSpecies} from './dex-progress';
export {caughtSpecies} from './dex-progress';

type Zone={name:string;part:number;count:number;floors:string[]};
export type Checklist={source:string;note?:string;parts:{n:number;title:string}[];zones:Zone[];markers:Record<string,{zone:string;floor?:string}>};
type Species={n:number;name:string;icon:string;types:string[];get:'found'|'evo'|'none';found:{zone:string;how:string;ids:string[]}[];from:{n:number;method:string|null}|null;note?:string};
export type Dex={species:Species[]};

const pad=(n:number)=>String(n).padStart(3,'0');
function Progress({done,total}:{done:number;total:number}){const pct=total?Math.round(done/total*100):0;return <span className={`progress ${done===total&&total?'full':''}`}><i><em style={{width:`${pct}%`}}/></i><b>{done}/{total}</b></span>}

// Filtros de la checklist por lo que se busca, no por categoria interna: los
// lideres (gimnasios, Alto Mando y Campeon) aparte del resto de entrenadores.
// Los intercambios van aparte de los regalos: con ellos salen tambien los
// salvajes que hay que dar (se atrapa uno de mas).
type Focus='all'|'story'|'leaders'|'trainers'|'items'|'pokemon'|'gifts'|'trades';
const focusOf=(m:Marker):Focus[]=>m.category==='Story'?['story']:m.category==='Battle'?[LEADER.test(m.name)?'leaders':'trainers']
 :['Item In Map','Hidden Item'].includes(m.category)?['items']:m.category==='Pokémon'?['pokemon']
 :m.category==='Item Gift'?['items','gifts']:m.category==='In-Game Trade'?['pokemon','trades']:['pokemon','gifts'];
const FOCUS:[Focus,'filterAll'|'focusStory'|'focusLeaders'|'focusTrainers'|'focusItems'|'focusPokemon'|'focusGifts'|'focusTrades'][]=[
 ['all','filterAll'],['story','focusStory'],['leaders','focusLeaders'],['trainers','focusTrainers'],['items','focusItems'],['pokemon','focusPokemon'],['gifts','focusGifts'],['trades','focusTrades']];

export function ChecklistView({markers,checklist,gates,goals,goalNotes,settled,skipped,onSkip,onUnskip,canSkip,behind,onSkipBehind,onRoute,unlock,onUnlockDismiss,done,toggleDone,onShow,onShowZone,detail,unavailable,hideUnavailable,setHideUnavailable,battle,dex,teamKey,tr}:{markers:Marker[];checklist:Checklist;gates:Gate[];goals:string[];goalNotes:Record<string,{en:string;es:string}>;settled:(m:Marker)=>boolean;skipped:Set<number>;onSkip:(m:Marker)=>void;onUnskip:(m:Marker)=>void;canSkip:(m:Marker)=>boolean;behind:Behind|null;onSkipBehind:(b:Behind)=>void;onRoute:(m:Marker)=>void;unlock:Unlock|null;onUnlockDismiss:()=>void;done:number[];toggleDone:(uid:number,id?:string)=>void;onShow:(m:Marker)=>void;onShowZone:(zone:string)=>void;detail:(m:Marker)=>string|null;unavailable:(m:Marker)=>string|null;hideUnavailable:boolean;setHideUnavailable:(on:boolean)=>void;battle:Battle|null;dex:Dex;teamKey:string;tr:T}){
 const {t,category,place,name}=tr;
 const isDone=(m:Marker)=>done.includes(m.uid);
 // No disponible todavia (y sin marcar): sale en gris y no cuenta para la zona.
 // Saltado: no cuenta, sale tachado con su icono y se recupera tocandolo.
 const isSkipped=(m:Marker)=>skipped.has(m.uid);
 const blocked=(m:Marker)=>!isDone(m)&&!isSkipped(m)&&!!unavailable(m);
 const counted=(list:Marker[])=>list.filter(m=>!blocked(m)&&!isSkipped(m));
 // Se abre sola la primera zona con algo pendiente que se pueda hacer: Pueblo
 // Paleta si empiezas, o donde te quedaste. Es la ruta para quien no conoce el mapa.
 const [query,setQuery]=useState(''),[hideDone,setHideDone]=useState(false),[focus,setFocus]=useState<Focus>('all'),[open,setOpen]=useState<string[]>(()=>{
  const next=checklist.zones.find(z=>markers.some(m=>checklist.markers[m.id]?.zone===z.name&&!isDone(m)&&!skipped.has(m.uid)&&!unavailable(m)));
  return next?[next.name]:[];
 });
 // Equipos de entrenadores desplegados: plegados de inicio, se abren al tocar la fila.
 const [teams,setTeams]=useState<string[]>([]);
 const toggleTeam=(id:string)=>setTeams(list=>list.includes(id)?list.filter(x=>x!==id):[...list,id]);
 const first=useRef(open[0]);
 useEffect(()=>{if(first.current)document.getElementById(`zone-${first.current}`)?.scrollIntoView({block:'start'})},[]);
 // Lo que piden los intercambios que te faltan, y las especies de las que sale
 // (Poliwag para dar un Poliwhirl): de esas se atrapan dos, uno para cambiar.
 const tradeFor=useMemo(()=>{
  const byName=new Map(dex.species.map(s=>[s.name,s])),byN=new Map(dex.species.map(s=>[s.n,s]));
  const out=new Map<string,{give:string;get:string}>();
  for(const m of markers){const give=m.category==='In-Game Trade'&&!done.includes(m.uid)&&/^Trade your (.+)$/.exec(m.detail??'')?.[1];if(!give)continue;
   for(let s=byName.get(give);s;s=s.from?byN.get(s.from.n):undefined)if(!out.has(s.name))out.set(s.name,{give,get:m.name})}
  return out;
 },[markers,dex,done]);
 const inFocus=(m:Marker,f:Focus)=>f==='all'||focusOf(m).includes(f)||(f==='trades'&&m.category==='Pokémon'&&tradeFor.has(m.name));
 const counts=new Map(FOCUS.map(([f])=>[f,markers.filter(m=>inFocus(m,f)).length]));
 // Zona -> (lista suelta de Kanto, pisos en orden de visita).
 const byZone=useMemo(()=>{const out=new Map<string,Map<string,Marker[]>>();for(const m of markers){const z=checklist.markers[m.id];if(!z)continue;const floors=out.get(z.zone)??out.set(z.zone,new Map()).get(z.zone)!;const k=z.floor??'';(floors.get(k)??floors.set(k,[]).get(k)!).push(m)}return out},[markers,checklist]);
 const q=query.trim().toLowerCase();
 // Se busca por el nombre que se ve y por el original en ingles.
 const keep=(m:Marker)=>!(hideUnavailable&&blocked(m))&&inFocus(m,focus)&&(!hideDone||!(isDone(m)||isSkipped(m)))&&(!q||`${name(m.name)} ${place(m.location)} ${m.name} ${m.location}`.toLowerCase().includes(q));
 // La alternativa que no elegiste (el otro fosil, el otro Hitmon) no cuenta: se
 // consigue solo por intercambio.
 const total=markers.filter(m=>isDone(m)||!settled(m)).length,completed=markers.filter(isDone).length;
 const floorName=(zone:string,f:string)=>place(f.startsWith(zone+' ')?f.slice(zone.length+1):f);
 // Una fila: casilla, figura, nombre y detalle; los entrenadores despliegan su
 // equipo. `where`: el piso, cuando sale fuera de su grupo (lo no disponible).
 const row=(m:Marker,where?:string)=>{const d=detail(m),foes=m.category==='Battle'?trainerOpponents(m.detail):[],shown=teams.includes(m.id),why=blocked(m)?unavailable(m):null;return <div key={m.id} id={`row-${m.id}`} className={`row ${isDone(m)?'done':''} ${isSkipped(m)?'row-skip':''} ${foes.length?'row-battle':''} ${why?'row-locked':''} ${m.category==='Story'?'row-story':''}`}>
  {/* No disponible: no se puede marcar hasta cumplir lo que pide. Saltado: al tocarlo vuelve. */}
  {isSkipped(m)?<button className="tick skip" aria-label={t('unskip')} title={t('skipped')} onClick={()=>onUnskip(m)}><SkipForward/></button>
   :<button className={`tick ${isDone(m)?'on':''}`} aria-label={t('markDone')} disabled={!!why} title={why??undefined} onClick={()=>toggleDone(m.uid,m.id)}>{isDone(m)?<Check/>:why?<Lock/>:null}</button>}
  <Figure m={m}/>
  {/* Un entrenador muestra su equipo en una linea; tocandolo se despliega la
      ficha como en el mapa: cada Pokemon con su nivel, lo que da y con que atacarle. */}
  {foes.length?<button className={`row-text row-toggle ${shown?'on':''}`} aria-expanded={shown} onClick={()=>toggleTeam(m.id)}>
    <b>{name(m.name)}<ChevronDown/></b><small>{where?`${where} · `:''}{d}</small>{why&&<small className="row-why">{why}</small>}</button>
   :<span className="row-text"><b>{name(m.name)}</b><small>{where?`${where} · `:''}{d??category(m.category)}</small>{why&&<small className="row-why">{why}</small>}
    {/* Un salvaje que pide un intercambio: atrapa dos. */}
    {m.category==='Pokémon'&&(x=>x&&<small className="row-trade">{x.give===m.name?t('tradeCatchTwo',{get:name(x.get)}):t('tradeCatchEvolve',{give:name(x.give),get:name(x.get)})}</small>)(tradeFor.get(m.name))}</span>}
  <button className="show" onClick={()=>onShow(m)} aria-label={t('showOnMap',{name:name(m.name)})}><MapPin/></button>
  {shown&&battle&&<div className="row-team"><BattleAdvice opponents={foes} dex={dex} battle={battle} storageKey={teamKey} tr={tr}/></div>}
 </div>};
 const [goalSlot,setGoalSlot]=useState<HTMLDivElement|null>(null);
 const toggle=(z:string)=>setOpen(o=>o.includes(z)?o.filter(x=>x!==z):[...o,z]);
 // A una zona de la checklist, abierta y sin filtros que la escondan.
 const goToZone=(z:string)=>{setQuery('');setFocus('all');setHideDone(false);setOpen(o=>o.includes(z)?o:[...o,z]);
  setTimeout(()=>document.getElementById(`zone-${z}`)?.scrollIntoView({block:'start',behavior:'smooth'}),60)};
 // Del siguiente objetivo a su fila: se abre su zona, sin filtros que la escondan.
 const goToRow=(m:Marker)=>{const z=checklist.markers[m.id]?.zone;if(!z)return;
  setQuery('');setFocus('all');setHideDone(false);setOpen(o=>o.includes(z)?o:[...o,z]);
  setTimeout(()=>{const row=document.getElementById(`row-${m.id}`);row?.scrollIntoView({block:'center'});row?.classList.add('row-flash');setTimeout(()=>row?.classList.remove('row-flash'),1600)},60)};
 return <div className="listview">
  <div className="list-head">
   <div className="list-title"><h2>{t('tabChecklist')}</h2><Progress done={completed} total={total}/></div>
   <div className="list-filters">
    <button className={`chip ${hideDone?'on':''}`} onClick={()=>setHideDone(v=>!v)}><Check/>{t('hideCompleted')}</button>
    <button className={`chip ${hideUnavailable?'on':''}`} aria-pressed={hideUnavailable} title={t('hideUnavailableHelp')} onClick={()=>setHideUnavailable(!hideUnavailable)}><Lock/>{t('hideUnavailable')}</button>
    {FOCUS.filter(([f])=>counts.get(f)).map(([f,label])=><button key={f} className={`chip ${focus===f?'on':''}`} aria-pressed={focus===f} onClick={()=>setFocus(f)}>{t(label)}<b>{counts.get(f)}</b></button>)}
   </div>
   {/* Aqui se queda el objetivo compacto al desplazar la lista: la cabecera no se mueve. */}
   <div ref={setGoalSlot}/>
  </div>
  <div className="list-body">
   {unlock&&<Unlocked unlock={unlock} checklist={checklist} onZone={goToZone} onDismiss={onUnlockDismiss} tr={tr}/>}
   {!q&&focus==='all'&&behind&&<BehindNote behind={behind} onSee={()=>goToZone(behind.zone)} onSkip={()=>onSkipBehind(behind)} tr={tr}/>}
   {!q&&focus==='all'&&<NextGoal slot={goalSlot} markers={markers} checklist={checklist} gates={gates} goals={goals} goalNotes={goalNotes} settled={settled} done={done} unavailable={unavailable} canSkip={canSkip} onSkip={onSkip} onDone={m=>toggleDone(m.uid,m.id)} alert={behind?behind.warn??t('behindTitle',{zone:place(behind.zone)}):null} battle={battle} dex={dex} teamKey={teamKey} onList={goToRow} onMap={onShow} onRoute={onRoute} tr={tr}/>}
   {checklist.parts.map(part=>{
    const zones=checklist.zones.filter(z=>z.part===part.n&&byZone.has(z.name));
    const all=zones.flatMap(z=>[...byZone.get(z.name)!.values()].flat());
    if(!all.some(keep))return null;
    return <section key={part.n} className="part">
     <h3><span className="part-n">{t('part',{n:part.n})}</span>{part.title.split('→').map(x=>place(x.trim())).join(' → ')}<Progress done={all.filter(isDone).length} total={counted(all).length}/></h3>
     {zones.map(z=>{
      const floors=byZone.get(z.name)!,items=[...floors.values()].flat();
      if(!items.some(keep))return null;
      // Buscando o filtrando se abre todo: lo que queda es justo lo que se busca.
      const expanded=!!q||focus!=='all'||open.includes(z.name);
      const order=['',...z.floors].filter(f=>floors.has(f));
      return <div key={z.name} id={`zone-${z.name}`} className={`zone ${expanded?'open':''}`}>
       <div className="zone-top">
        {/* La zona cuenta lo que ya se puede hacer: completa en verde hasta que algo
            nuevo se desbloquea. Si aun no se puede hacer nada, un candado. */}
        <button className="zone-head" onClick={()=>toggle(z.name)} aria-expanded={expanded}><b>{place(z.name)}</b>{counted(items).length
         ?<Progress done={items.filter(isDone).length} total={counted(items).length}/>
         :<span className="zone-lockbadge"><Lock/>{t('unavailable')}</span>}</button>
        <button className="show" onClick={()=>onShowZone(z.name)} aria-label={t('showOnMap',{name:place(z.name)})} title={t('showOnMap',{name:place(z.name)})}><MapPin/></button>
       </div>
       {/* Con lo no disponible oculto, que se sepa cuanto hay y por que. */}
       {expanded&&hideUnavailable&&(notes=>notes.length>0&&<p className="zone-locked"><Lock/>{notes.map(([why,n])=>t('hiddenNote',{n,why})).join(' · ')}</p>)(
        [...items.reduce((c,m)=>{const why=blocked(m)&&unavailable(m);return why?c.set(why,(c.get(why)??0)+1):c},new Map<string,number>())])}
       {/* Lo que se puede hacer, por pisos; lo que aun no, junto al final de la zona
           (con su piso al lado), para que lo primero que se vea sea lo que toca. */}
       {/* Los pasos de la historia de la zona van primero, con su piso al lado. */}
       {expanded&&(rows=>rows.length>0&&<div className="floor floor-story">
        <h4><Flag/>{t('storyGroup')}</h4>
        {rows.map(m=>row(m,checklist.markers[m.id]?.floor?floorName(z.name,checklist.markers[m.id].floor!):undefined))}
       </div>)(order.flatMap(f=>floors.get(f)!.filter(m=>m.category==='Story'&&keep(m)&&!blocked(m))))}
       {expanded&&order.map(f=>{const rows=checkOrder(floors.get(f)!.filter(m=>m.category!=='Story'&&keep(m)&&!blocked(m)),blocked);if(!rows.length)return null;return <div key={f||'_'} className="floor">
        {f&&<h4>{floorName(z.name,f)}</h4>}
        {rows.map(m=>row(m))}
       </div>})}
       {expanded&&(rows=>rows.length>0&&<div className="floor floor-locked">
        <h4><Lock/>{t('unavailable')}</h4>
        {rows.map(m=>row(m,checklist.markers[m.id]?.floor?floorName(z.name,checklist.markers[m.id].floor!):undefined))}
       </div>)(checkOrder(order.flatMap(f=>floors.get(f)!.filter(m=>keep(m)&&blocked(m))),blocked))}
      </div>})}
    </section>})}
   <p className="list-source">{checklist.note?<a href={checklist.source} target="_blank" rel="noreferrer">{t('orderStory')}</a>:<>{t('orderSource')}<a href={checklist.source} target="_blank" rel="noreferrer">{t('orderLink')}</a>.</>}</p>
  </div>
  {/* El buscador abajo, a mano del pulgar; arriba quedan los filtros y el objetivo. */}
  <div className="list-foot">
   <label className="list-search"><Search/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder={t('searchChecklist')}/></label>
  </div>
 </div>;
}


// uid de las entradas de la checklist de una especie (salvaje, regalo, intercambio).
// Especies registradas: las que tienen entradas en la checklist cuentan si
// alguna esta completa; las demas, si se marcaron a mano en la Pokedex.

export function PokedexView({dex,byId,done,setMany,onShow,game,storageKey,switcher,tr,imported=[]}:{dex:Dex;byId:Map<string,Marker>;done:number[];setMany:(uids:number[],on:boolean)=>void;onShow:(m:Marker)=>void;game:string;storageKey:string;switcher?:ReactNode;tr:T;imported?:number[]}){
 const {t,how,type,note,evo,place}=tr;
 // Sincronizada con la checklist: una especie con entradas alli esta registrada
 // si alguna esta completa, y marcarla aqui marca (o desmarca) todas. Las que no
 // tienen entradas (solo se consiguen evolucionando) se registran a mano.
 const [manual,setManual]=useState<number[]>([]),[query,setQuery]=useState(''),[filter,setFilter]=useState<'all'|'missing'|'caught'>('all'),[openN,setOpenN]=useState<number|null>(null);
 const saveManual=(next:number[])=>{setManual(next);try{localStorage.setItem(storageKey,JSON.stringify(next))}catch{}};
 useEffect(()=>{
  let list:number[]=[];try{list=JSON.parse(localStorage.getItem(storageKey)||'[]')}catch{}
  // Registros manuales de antes de sincronizar: si la especie tiene entradas, pasan a la checklist.
  const linked=dex.species.filter(s=>list.includes(s.n)&&uidsOf(byId,s).length);
  if(linked.length){setMany(linked.flatMap(s=>uidsOf(byId,s)),true);list=list.filter(n=>!linked.some(s=>s.n===n));try{localStorage.setItem(storageKey,JSON.stringify(list))}catch{}}
  setManual(list);
 },[storageKey,dex,byId,setMany]);
 const caughtSet=useMemo(()=>caughtSpecies(dex,byId,done,manual,imported),[dex,byId,done,manual,imported]);
 const caught=(s:Species)=>caughtSet.has(s.n);
 const toggle=(s:Species)=>{const uids=uidsOf(byId,s);if(uids.length)setMany(uids,!caught(s));else saveManual(manual.includes(s.n)?manual.filter(x=>x!==s.n):[...manual,s.n])};
 const names=useMemo(()=>new Map(dex.species.map(s=>[s.n,s.name])),[dex]);
 const q=query.trim().toLowerCase();
 const shown=dex.species.filter(s=>(filter==='all'||(filter==='caught')===caught(s))&&(!q||s.name.toLowerCase().includes(q)||pad(s.n).includes(q)));
 const count=dex.species.filter(caught).length;
 return <div className="listview">
  <div className="list-head">
   <div className="list-title"><h2>{t('tabDex')}</h2><Progress done={count} total={dex.species.length}/></div>
   {switcher}
   <label className="list-search"><Search/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder={t('searchDex')}/></label>
   <div className="list-filters">{([['all',t('filterAll')],['missing',t('filterMissing')],['caught',t('filterCaught')]] as const).map(([k,t])=><button key={k} className={`chip ${filter===k?'on':''}`} onClick={()=>setFilter(k)}>{t}</button>)}</div>
  </div>
  <div className="list-body dex">
   {shown.map(s=>{const c=caught(s),isOpen=openN===s.n;
    const where=s.get==='found'?s.found.slice(0,2).map(f=>`${place(f.zone)} · ${how(f.how)}`).join(' / ')+(s.found.length>2?t('andMore',{n:s.found.length-2}):'')
     :s.get==='evo'&&s.from?t(s.from.method?'evolvesFromHow':'evolvesFrom',{name:names.get(s.from.n)??'',how:evo(s.from.method??'')})
     :t('notAvailable',{game});
    return <div key={s.n} className={`dex-row ${c?'done':''} ${s.get==='none'?'unavailable':''}`}>
     <button className={`tick ${c?'on':''}`} aria-label={t('registered')} disabled={imported.includes(s.n)} onClick={()=>toggle(s)} title={imported.includes(s.n)?t('savRegistered'):uidsOf(byId,s).length?t('syncedChecklist'):undefined}>{c&&<Check/>}</button>
     <Figure m={{icon:s.icon,category:'Pokémon'}}/>
     <button className="dex-text" onClick={()=>setOpenN(isOpen?null:s.n)} aria-expanded={isOpen}>
      <b><em>#{pad(s.n)}</em>{s.name}</b>
      <span className="types">{s.types.map(ty=><i key={ty} className={`type t-${ty}`}>{type(ty)}</i>)}</span>
      <small>{where}</small>
     </button>
     {isOpen&&<div className="dex-more">
      {s.note&&<p>{note(s.note)}</p>}
      {s.found.map(f=>{const m=f.ids.map(id=>byId.get(id)).find(Boolean);return <div key={f.zone+f.how}><span>{place(f.zone)}<small>{how(f.how)}</small></span>{m&&<button className="show" onClick={()=>onShow(m)} aria-label={t('showOnMap',{name:place(f.zone)})}><MapPin/></button>}</div>})}
      {s.get==='evo'&&s.from&&<p>{t(s.from.method?'getAndEvolveHow':'getAndEvolve',{name:names.get(s.from.n)??'',how:evo(s.from.method??'')})}</p>}
      {s.get==='none'&&!s.note&&<p>{t('tradeOver',{game})}</p>}
     </div>}
    </div>})}
   {!shown.length&&<p className="list-empty">{t('emptyFilter')}</p>}
  </div>
 </div>;
}
