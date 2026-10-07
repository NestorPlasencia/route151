'use client';
import {Fragment,useCallback,useEffect,useLayoutEffect,useMemo,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {useGameMap} from './use-game-map';
import {drawMap} from './map-drawing';
import {ArrowLeft,BookOpen,Check,RefreshCw,ChevronDown,DoorOpen,Footprints,Gamepad,Info,Layers,ListChecks,LocateFixed,Lock,Map as MapIcon,MapPin,SkipForward,Sparkles,Swords,Undo2} from 'lucide-react';
import type {Marker as LeafletMarker} from 'leaflet';
import {FIELD_MOVES,Figure,checkOrder,choicesTaken,groupsOf,haveNames,missingTool,obstacleMove,unmetGate,type Encounter,type Marker} from './shared';
import {LANGS,LANG_NAMES,LANG_KEY,savedLang,translator,type Lang} from './i18n';
import {activeProfile,activeProfileKey,listProfiles,profileGame,validProfileId,type Profile} from './profiles';
import {PLAYER_EVENT,playerSpot,type GameLocation,type MapPositions,type PlayerSpot} from './player-position';
import {loadJson} from './load-json';
import {ChecklistView,PokedexView} from './lists';
import {GameHome} from './home';
import {BattleAdvice,effortText,trainerOpponents,type Opponent} from './team';
import {GAMES,battleUrl,moveTextUrl,type Area,type EncounterZone,type Place,type Pt} from './games';
import {blockerOf,findRoute,legsOf,reached,targetAt,movesYouHave} from './pathfind';
import {useNavigation} from './use-navigation';
import {useGameProgress} from './use-game-progress';
import {RoutePanel,tripItems,withoutGates,type TripItem} from './trip';
import {refreshApp} from './service-worker';
import {BehindNote,LEADER,goalTitle,nextGoalOf,type Behind,type Unlock} from './guide';
import {TOUR_KEY,Tour} from './tour';
import {useBattle,useGameWorld,useMoveText,useNames} from './use-game-data';
import {LoadNotice} from './load-notice';
import {AboutDialog,EncounterDialog} from './game-dialogs';
import dynamic from 'next/dynamic';
const RankingView=dynamic(()=>import('./ranking').then(m=>m.RankingView));
const LearnView=dynamic(()=>import('./learn').then(m=>m.LearnView));
const TeamView=dynamic(()=>import('./team-view').then(m=>m.TeamView));
const SaveImportDialog=dynamic(()=>import('./save-import-dialog').then(m=>m.SaveImportDialog));
const EmulatorPanel=dynamic(()=>import('./emulator-panel').then(m=>m.EmulatorPanel),{ssr:false});

type View={area:string;focus?:Pt;zoom?:number;restore?:{center:[number,number];zoom:number}};
const span=(e:Encounter)=>`${e.min}${e.max!==e.min?`–${e.max}`:''}`;
// CRS.Simple: x a la derecha, y hacia arriba; la imagen crece hacia abajo.
const ll=(p:Pt):[number,number]=>[-p[1],p[0]];
// "Silph Co. 7F" -> "7F": quita las palabras que comparten todos los pisos.
const shortLabels=(list:Area[])=>{const words=list.map(f=>f.label.split(' '));let n=0;while(words.every(w=>w.length>n+1&&w[n]===words[0][n]))n++;return new Map(list.map((f,i)=>[f.id,words[i].slice(n).join(' ')]))};
const GAME_KEY='ruta151-game';
// Lo que hace falta para volar: la MO02 y la Medalla Trueno (igual en los dos juegos).
const FLY_NEEDS=['HM02','Leader Lt. Surge'];
// Un piso (o el ascensor): la ultima palabra de su nombre es 1F, B2F, Roof, Elevator...levator...
const FLOOR_RE=/\s+(B?\d+F|Roof|Rooftop|Elevator)$/i;
// A la gente se le habla tambien por encima de un mostrador (a dos casillas).
// Lo que se avisa que te dejas al salir de una zona: entrenadores, objetos a la
// vista y regalos. Ni los salvajes (se marcan por especie) ni los objetos ocultos.
const PEOPLE=['Item Gift','In-Game Trade','Battle','In-Game Gift Pokémon','Shop'];
const LEFT_BEHIND=['Battle','Item In Map','Item Gift','In-Game Gift Pokémon'];
const MOVE_KEY:Record<string,'moveSurf'|'moveCut'|'moveStrength'|'moveSmash'|'moveWaterfall'|'moveFlute'|'moveSwitch'|'movePlate'>={surf:'moveSurf',cut:'moveCut',strength:'moveStrength',smash:'moveSmash',waterfall:'moveWaterfall',flute:'moveFlute',switch:'moveSwitch',plate:'movePlate'};
// Candado de lucide para los pines bloqueados: el pin es HTML de Leaflet, no React.
// Bandera del siguiente objetivo en el mapa.

export default function Home(){
 const [gameId,setGameId]=useState(GAMES[0].id),[lang,setLang]=useState<Lang>('en');
 const baseGame=GAMES.find(g=>g.id===gameId)??GAMES[0],groups=groupsOf(baseGame.id);
 // Lista activa: la manual o la de una partida real (emulador o SAV), con claves propias.
 const [profiles,setProfiles]=useState<Profile[]>([]),[profileId,setProfileId]=useState<string|null>(null);
 const game=useMemo(()=>profileGame(baseGame,profileId),[baseGame,profileId]);
 useEffect(()=>{
  const load=(pick?:string)=>{try{
   const list=listProfiles(localStorage,baseGame);setProfiles(list);
   if(pick&&list.some(p=>p.id===pick)){localStorage.setItem(activeProfileKey(baseGame),pick);setProfileId(pick)}
   else if(pick===undefined)setProfileId(activeProfile(localStorage,baseGame));
  }catch{setProfiles([]);setProfileId(null)}};
  const changed=(event:Event)=>{const detail=(event as CustomEvent<{game:string;id:string}>).detail;if(detail?.game===baseGame.id)load(detail.id)};
  const progress=(event:Event)=>{if((event as CustomEvent<string>).detail===baseGame.id)load('')};
  load();addEventListener('route151-profile',changed);addEventListener('route151-progress-changed',progress);
  return()=>{removeEventListener('route151-profile',changed);removeEventListener('route151-progress-changed',progress)};
 },[baseGame]);
 const pickProfile=(id:string)=>{const next=validProfileId(id)?id:null;setProfileId(next);try{if(next)localStorage.setItem(activeProfileKey(baseGame),next);else localStorage.removeItem(activeProfileKey(baseGame))}catch{}};
 const {world,worldFailure,loadAttempt,setLoadAttempt}=useGameWorld(baseGame);
 const {value:names,failure:namesFailure,setAttempt:setNamesAttempt}=useNames(lang);
 const tr=useMemo(()=>translator(lang,names),[lang,names]),{t,category,method,place,name}=tr,{detail:tDetail}=tr,layerName=tr.layer;
 const [tab,setTab]=useState<'mapa'|'checklist'|'pokedex'|'team'>('checklist'),[dexView,setDexView]=useState<'dex'|'ranking'|'learn'>('dex'),[view,setView]=useState<View>({area:''});
 // Cada juego tiene sus datos de combate (Yellow, los de Gen 1): se guardan por archivo.
 const moveTextSrc=moveTextUrl(game);
 const {value:moveText,failure:moveTextFailure,setAttempt:setMoveTextAttempt}=useMoveText(moveTextSrc,tab==='team');
 const [active,setActive]=useState<string[]>(groups.map(g=>g[0])),[selected,setSelected]=useState<Marker|null>(null),[stack,setStack]=useState<Marker[]|null>(null),[locations,setLocations]=useState(false),[about,setAbout]=useState(false),[layersOpen,setLayersOpen]=useState(false);
 const [mapVisited,setMapVisited]=useState(false);
 useEffect(()=>{if(tab==='mapa')setMapVisited(true)},[tab]);
 const clearMap=useCallback(()=>{setSelected(null);setStack(null)},[]);
 const {popup,popupBox,el,map,layer,overlay,shownArea,leaflet,mapReady,mapZoom,mapFailure,setMapAttempt}=useGameMap(mapVisited,clearMap);
 const [encounterZone,setEncounterZone]=useState<EncounterZone|null>(null);
 // Lo que decides saltar (no te interesa o ya no se puede): no cuenta en el total
 // ni se vuelve a avisar. No es hecho: no abre nada y se puede deshacer.
 const {done,skipped,saveDone,setSkip,setMany,imported}=useGameProgress(game,loadAttempt);
 const [saveImportOpen,setSaveImportOpen]=useState(false);
 const [playing,setPlaying]=useState(false);
 // Inicio para elegir juego, y el ultimo que se jugo (se marca en su tarjeta).
 const [home,setHome]=useState(false),[last,setLast]=useState<string|null>(null);

 // El juego elegido se recuerda; ?game=firered en la URL manda. Sin ninguno de
 // los dos, se empieza en el inicio para elegirlo.
 useEffect(()=>{let saved:string|null=null;try{saved=localStorage.getItem(GAME_KEY)}catch{}const id=[new URLSearchParams(location.search).get('game'),saved].find(x=>GAMES.some(g=>g.id===x));if(id)setGameId(id);else setHome(true);setLast(GAMES.some(g=>g.id===saved)?saved:null);setLang(savedLang())},[]);
 // Cada juego carga sus datos y su progreso, y empieza en su primera region.
 useEffect(()=>{
  setSelected(null);setStack(null);setEncounterZone(null);setLocations(false);saved.current=null;setArrival(null);
  setActive(groupsOf(baseGame.id).map(g=>g[0]).filter(n=>!baseGame.hidden.includes(n)));
 },[baseGame,loadAttempt]);
 useEffect(()=>{if(world)setView({area:world.areas.find(a=>a.kind==='region')?.id??world.areas[0].id})},[world]);
 const pickGame=(id:string)=>{setGameId(id);setLast(id);try{localStorage.setItem(GAME_KEY,id)}catch{}};
 // Desde el inicio se entra siempre al mapa del juego elegido.
 // Desde el inicio se entra a la checklist: la ruta, con la primera zona abierta y
 // su boton de mapa para ver donde esta.
 const choose=(id:string)=>{pickGame(id);setHome(false);setTab('checklist')};
 const pickLang=(l:Lang)=>{setLang(l);try{localStorage.setItem(LANG_KEY,l)}catch{}};
 useEffect(()=>{document.documentElement.lang=lang},[lang]);
 // Tambien se carga al abrir un entrenador o un Pokemon salvaje del mapa.
 const needsBattle=tab==='team'||tab==='checklist'||(tab==='pokedex'&&dexView!=='dex')||selected?.category==='Battle'||!!selected?.encounter||!!stack?.some(m=>m.category==='Battle'||m.encounter);
 const {value:battle,failure:battleFailure,setAttempt:setBattleAttempt}=useBattle(battleUrl(game),needsBattle);

 const areaById=useMemo(()=>new Map((world?.areas??[]).map(a=>[a.id,a])),[world]);
 const regions=useMemo(()=>world?.areas.filter(a=>a.kind==='region')??[],[world]);
 const isRegion=useCallback((id:string)=>areaById.get(id)?.kind==='region',[areaById]);
 const area=areaById.get(view.area)??null;
 const here=area?.kind==='interior'?area:null;
 // Pisos de cada zona (las mazmorras y edificios) y su nombre corto.
 const zoneFloors=useMemo(()=>{const z=new Map<string,Area[]>();for(const a of world?.areas??[])if(a.kind==='interior'){const k=a.zone??a.label,l=z.get(k);if(l)l.push(a);else z.set(k,[a])}return z},[world]);
 const short=useMemo(()=>{const s=new Map<string,string>();zoneFloors.forEach(l=>shortLabels(l).forEach((v,k)=>s.set(k,v)));return s},[zoneFloors]);
 const byId=useMemo(()=>new Map((world?.markers??[]).map(m=>[m.id,m])),[world]);
 const inArea=useMemo(()=>{const g=new Map<string,Marker[]>();for(const m of world?.markers??[])if(m.area&&m.at){const l=g.get(m.area);if(l)l.push(m);else g.set(m.area,[m])}return g},[world]);
 // Lugar al que lleva una puerta: el interior y lo que se alcanza desde el sin
 // salir a una region (sus pisos y escaleras; en Yellow, los pisos de su
 // mazmorra, que no tienen puertas entre si). Su puerta va en verde cuando alli
 // no queda nada por hacer: todo completado, o nada que contar.
 // Interiores conectados entre si por sus puertas y escaleras.
 const linked=useMemo(()=>{
  const g=new Map<string,string[]>(),join=(a:string,b:string)=>{g.set(a,[...(g.get(a)??[]),b]);g.set(b,[...(g.get(b)??[]),a])};
  for(const w of world?.warps??[])if(!isRegion(w.area)&&!isRegion(w.to))join(w.area,w.to);
  return g;
 },[world,isRegion]);
 // Lo que hay detras de una puerta: su destino y lo que se alcanza desde el sin
 // volver por donde se entro. Sin esto, un camarote vacio del S.S. Anne heredaba
 // lo que queda por hacer en todo el barco y su puerta nunca se ponia verde.
 const behind=useMemo(()=>{
  const cache=new Map<string,string[]>();
  return (from:string,to:string)=>{
   const key=`${from}>${to}`,hit=cache.get(key);if(hit)return hit;
   const seen=new Set([from,to]),queue=[to],out=[to];
   while(queue.length){for(const n of linked.get(queue.pop()!)??[])if(!seen.has(n)){seen.add(n);out.push(n);queue.push(n)}}
   cache.set(key,out);return out;
  };
 },[linked]);
 // Lo que aun no se puede hacer, y por que: falta una herramienta (sin cana no
 // se pesca) o un paso de la historia (el gimnasio de Verde pide 7 medallas). Lo
 // que tienes sale de tu checklist. No se oculta: sale como no disponible, y se
 // puede ocultar con un interruptor que se recuerda.
 const [hideUnavailable,setHideState]=useState(false);
 useEffect(()=>{try{setHideState(localStorage.getItem('ruta151-unavailable')==='hide')}catch{}},[]);
 const setHideUnavailable=(on:boolean)=>{setHideState(on);try{localStorage.setItem('ruta151-unavailable',on?'hide':'show')}catch{}};
 const have=useMemo(()=>new Set([...haveNames(world?.markers??[],done),...(imported?.snapshot.keyItems.map(i=>i.name)??[])]),[world,done,imported]);
 // Lo que ya elegiste en su lugar (otro inicial, el otro fosil): solo por intercambio.
 const taken=useMemo(()=>{const byId=new Map((world?.markers??[]).map(m=>[m.id,m]));
  return choicesTaken(world?.choices??[],id=>{const m=byId.get(id);return !!m&&done.includes(m.uid)})},[world,done]);
 const {navUrl,navWorld,navFailure,setNavAttempt,targets,tree,treeWith,reachFor}=useNavigation(game,world);
 // Pokemon que tienes (para los intercambios): marcados, registrados en la
 // Pokedex o en tu equipo. Se relee al volver de esas pestanas.
 const [speciesRev,setSpeciesRev]=useState(0);
 useEffect(()=>setSpeciesRev(r=>r+1),[tab]);
 const ownedSpecies=useMemo(()=>{
  const out=new Set<string>();if(!world||speciesRev<0)return out;
  for(const m of world.markers)if(['Pokémon','In-Game Gift Pokémon','In-Game Trade'].includes(m.category)&&done.includes(m.uid))out.add(m.name);
  try{
   const nums=new Set<number>([...(imported?.snapshot.owned??[]),...JSON.parse(localStorage.getItem(game.storage.dex)||'[]'),...(JSON.parse(localStorage.getItem(`${game.storage.done}-team`)||'[]') as {n:number}[]).map(x=>x.n)]);
   for(const sp of world.dex.species)if(nums.has(sp.n))out.add(sp.name);
  }catch{}
  return out;
 },[world,done,game,speciesRev,imported]);
 const reasonWith=useCallback((m:Marker,owned:Set<string>)=>{
  const chosen=taken.get(m.id),pick=chosen&&world?.markers.find(x=>x.id===chosen);
  if(pick)return t(m.category.includes('Pokémon')?'choiceTrade':'choiceOne',{chosen:name(pick.name)});
  // Un sitio que ya se cerro para siempre (el barco zarpo): lo que quedaba se perdio.
  const gone=world?.closings.find(c=>owned.has(c.gone)&&c.zones.includes(world.checklist.markers[m.id]?.zone??''));if(gone)return gone.why[lang];
  const gate=unmetGate(m,world?.gates??[],owned);if(gate)return gate.why[lang];
  // A lo que no se llega desde el inicio: el primer obstaculo del camino. Un
  // salvaje cuenta si llegas a su mapa (su pin puede caer en mitad del agua).
  const at=targets.get(m.id),r=at?reachFor(owned):null;
  if(at&&r&&navWorld&&tree){
   const g=navWorld.grids.get(at.map),ok=m.encounter?!!g&&r.maps.has(g.i):reached(navWorld,r.tiles,at);
   // Si ya pisas su mapa o su zona, lo que falta es un script (el ascensor de la
   // guarida, una puerta con tarjeta): se deja como disponible.
   const zoneIn=!!g&&navWorld.list.some(x=>x.m.zone===g.m.zone&&r.maps.has(x.i));
   if(!ok&&!zoneIn){
    const closed=(map:string)=>!!r.closed(map);
    const b=blockerOf(navWorld,treeWith(r.can)!,at,r.can,closed)??blockerOf(navWorld,tree,at,r.can,closed);
    if(b&&'map' in b){const x=r.closed(b.map);if(x)return t('reachFirst',{why:x.why[lang]})}
    if(b&&'move' in b){const f=navWorld.nav.moves[b.move];return t('reachMove',{move:t(MOVE_KEY[b.move]??'moveSurf'),needs:(f??[]).map(name).join(' + ')})}
   }
  }
  const trade=m.category==='In-Game Trade'&&/^Trade your (.+)$/.exec(m.detail??'');
  if(trade&&!done.includes(m.uid)&&!ownedSpecies.has(trade[1]))return t('tradeNeeds',{name:name(trade[1])});
  const tool=missingTool(m,owned);return tool?t('needsTool',{tool:name(tool)}):null;
 },[world,lang,t,name,taken,targets,reachFor,navWorld,tree,treeWith,ownedSpecies,done]);
 // El motivo de cada marcador con lo que tienes, calculado una vez por cambio.
 const reasons=useMemo(()=>new Map((world?.markers??[]).map(m=>[m.id,reasonWith(m,have)])),[world,reasonWith,have]);
 const unavailable=useCallback((m:Marker)=>reasons.get(m.id)??null,[reasons]);
 // Hecho, o descartado por otra eleccion (el inicial que no elegiste).
 // Empezar el juego de cero: se borra lo suyo (checks, Pokedex, equipo, lo ultimo
 // marcado) y se recarga. Los otros juegos, el idioma y la copia se quedan.
 const resetGame=()=>{
  if(!confirm(t('resetConfirm',{game:game.title})))return;
  try{const base=game.storage.done;for(const k of Object.keys(localStorage))if(k===base||k.startsWith(`${base}-`))localStorage.removeItem(k)}catch{}
  location.reload();
 };
 // Saltado y sin hacer (si luego lo marcas, cuenta como hecho).
 const skipSet=useMemo(()=>new Set(skipped.filter(u=>!done.includes(u))),[skipped,done]);
 // Lo que no se consigue jugando (tras un bloqueo `never`): fuera de los totales.
 const never=useMemo(()=>{const gates=(world?.gates??[]).filter(g=>g.never);return new Set((world?.markers??[]).filter(m=>!done.includes(m.uid)&&unmetGate(m,gates,new Set())).map(m=>m.uid))},[world,done]);
 const settled=useCallback((m:Marker)=>done.includes(m.uid)||taken.has(m.id)||skipSet.has(m.uid)||never.has(m.uid),[done,taken,skipSet,never]);
 // El siguiente objetivo, el mismo que en la checklist: sale arriba del mapa.
 const nextGoal=useMemo(()=>world?nextGoalOf(world.markers.filter(m=>world.checklist.markers[m.id]),world.goals,settled):null,[world,settled]);
 // Puertas del mapa a las que aun no llegas: grises, con candado.
 const reachNow=useMemo(()=>reachFor(have),[reachFor,have]);
 // Una puerta con candado: no se llega a ella. Como con los marcadores, si ya
 // pisas su zona lo que falta es un script (las salas del Alto Mando se abren
 // al ganar cada combate): no se cierra.
 const doorLocked=useCallback((area:string,at:Pt)=>{
  if(!navWorld||!reachNow)return false;const x=targetAt(navWorld,area,at,false);if(!x||reached(navWorld,reachNow.tiles,x))return false;
  const g=navWorld.grids.get(x.map);return !(g&&navWorld.list.some(o=>o.m.zone===g.m.zone&&reachNow.maps.has(o.i)));
 },[navWorld,reachNow]);
 // Lo que abre el ultimo marcador que marcaste (una MO, una medalla, una llave).
 const [unlock,setUnlock]=useState<Unlock|null>(null);
 const [refreshing,setRefreshing]=useState(false);
 // Bienvenida: sale una vez, la primera vez que se entra a un juego.
 const [tour,setTour]=useState(false);
 useEffect(()=>{if(home||!world)return;try{if(!localStorage.getItem(TOUR_KEY))setTour(true)}catch{}},[home,world]);
 const closeTour=()=>{setTour(false);try{localStorage.setItem(TOUR_KEY,'seen')}catch{}};
 useEffect(()=>setUnlock(null),[baseGame]);
 // Sin marcar ni bloqueado: lo que de verdad queda por hacer.
 const pending=useCallback((m:Marker)=>!done.includes(m.uid)&&!skipSet.has(m.uid)&&!unavailable(m),[done,skipSet,unavailable]);
 const left=useMemo(()=>{
  const n=new Map<string,number>();
  for(const m of world?.markers??[])if(m.area&&!game.untracked.includes(m.category)&&pending(m))n.set(m.area,(n.get(m.area)??0)+1);
  return n;
 },[world,game.untracked,pending]);
 const finished=useCallback((from:string,to:string)=>behind(from,to).every(a=>!left.get(a)),[behind,left]);

 // Cambiar de area cambia la imagen; cada vista decide donde se posa la camara.
 // Solo con el mapa a la vista: oculto (se empieza en la checklist) mide 0x0, el
 // encuadre sale invalido y el mapa se veia negro al abrirlo. La vista que llega
 // con el mapa oculto se aplica al abrir la pestana; volver sin cambios deja la
 // camara donde estaba.
 const applied=useRef<View|null>(null);
 useEffect(()=>{
  const L=leaflet.current,m=map.current;if(!L||!m||!area||tab!=='mapa')return;
  m.invalidateSize();
  if(applied.current===view&&shownArea.current===area.image)return;
  applied.current=view;
  const b:[Pt,Pt]=[[-area.height,0],[0,area.width]];
  // La imagen se identifica por su ruta: al cambiar de juego hay un render con el
  // juego nuevo y el mapa viejo, y con 'juego/area' la imagen vieja quedaba fija.
  const key=area.image,changed=shownArea.current!==key;
  if(changed){
   shownArea.current=key;overlay.current?.remove();
   overlay.current=L.imageOverlay(area.image,b,{className:'area-image',interactive:false}).addTo(m);
   m.setMinZoom(-10);
  }
  const fit=m.getBoundsZoom(b);
  if(changed){const p=Math.max(area.width,area.height)*.25;m.setMinZoom(fit-.5);m.setMaxBounds([[-area.height-p,-p],[p,area.width+p]])}
  if(view.restore)m.setView(view.restore.center,view.restore.zoom,{animate:!changed});
  else if(view.focus)m.setView(ll(view.focus),Math.max(fit,view.zoom??0),{animate:!changed});
  else m.fitBounds(b,{animate:!changed});
 },[view,area,mapReady,tab,leaflet,overlay,shownArea,map]);

 const shown=useMemo(()=>(area?inArea.get(area.id)??[]:[]).filter(m=>active.includes(m.category)&&!(hideUnavailable&&unavailable(m))),[area,inArea,active,hideUnavailable,unavailable]);
 // Muchos objetos comparten punto exacto (hasta 14): se pintan como un solo pin
 // con su recuento, o el de arriba taparia a los demas.
 const stacks=useMemo(()=>{const g=new Map<string,{at:Pt;items:Marker[]}>();for(const m of shown){const k=m.at!.join(','),s=g.get(k);if(s)s.items.push(m);else g.set(k,{at:m.at!,items:[m]})}return [...g.values()]},[shown]);
 useEffect(()=>setStack(null),[view.area]);
 useEffect(()=>{if(!stack&&!selected&&!encounterZone)return;const close=(e:KeyboardEvent)=>{if(e.key!=='Escape'||document.querySelector('dialog:modal'))return;if(selected)setSelected(null);else if(stack)setStack(null);else setEncounterZone(null)};addEventListener('keydown',close);return()=>removeEventListener('keydown',close)},[stack,selected,encounterZone]);
 const counts=useMemo(()=>{const c:Record<string,number>={};(area?inArea.get(area.id)??[]:[]).forEach(m=>c[m.category]=(c[m.category]??0)+1);return c},[area,inArea]);

 // Al salir de una region se guarda la vista para volver exactamente alli.
 const saved=useRef<{region:string;restore:NonNullable<View['restore']>}|null>(null);
 const saveRegion=()=>{const m=map.current;if(m&&area?.kind==='region'){const c=m.getCenter();saved.current={region:area.id,restore:{center:[c.lat,c.lng],zoom:m.getZoom()}}}};
 // Seguir al jugador del emulador: la RAM dice mapa y casilla, y aquí se pasan al
 // área y al punto de la app. Arrastrar el mapa deja de seguir; el botón lo reanuda.
 const [player,setPlayer]=useState<PlayerSpot|null>(null),[follow,setFollow]=useState(true);
 const positions=useRef<{game:string;table:Promise<MapPositions|null>}|null>(null);
 useEffect(()=>{
  setPlayer(null);
  const moved=(event:Event)=>{
   const detail=(event as CustomEvent<{game:string;location:GameLocation|null}>).detail;
   if(detail?.game!==baseGame.id)return;
   const spotAt=detail.location;if(!spotAt){setPlayer(null);return}
   if(positions.current?.game!==baseGame.id)positions.current={game:baseGame.id,table:loadJson<MapPositions>(`${baseGame.data}/map-positions.json`).catch(()=>null)};
   void positions.current.table.then(table=>{const spot=table&&playerSpot(table,spotAt);if(spot)setPlayer(spot)});
  };
  addEventListener(PLAYER_EVENT,moved);return()=>removeEventListener(PLAYER_EVENT,moved);
 },[baseGame]);
 useEffect(()=>{
  if(!player||!follow||tab!=='mapa')return;
  if(player.area!==view.area){saveRegion();setView({area:player.area,focus:player.at,zoom:areaById.get(player.area)?.kind==='region'?0:-99});return}
  map.current?.panTo(ll(player.at),{animate:true});
 // Solo al moverse el jugador o al volver a seguirlo, no en cada cambio de vista.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[player,follow,tab]);
 useEffect(()=>{const m=map.current;if(!m)return;const stop=()=>setFollow(false);m.on('dragstart',stop);return()=>{m.off('dragstart',stop)}},[mapReady,map]);
 const playerMarker=useRef<LeafletMarker|null>(null);
 useEffect(()=>{
  const L=leaflet.current,m=map.current;if(!L||!m)return;
  if(!player||player.area!==area?.id){playerMarker.current?.remove();playerMarker.current=null;return}
  if(playerMarker.current)playerMarker.current.setLatLng(ll(player.at));
  else playerMarker.current=L.marker(ll(player.at),{icon:L.divIcon({className:'pin-wrap',html:'<span class="player-pin"></span>',iconSize:[28,28],iconAnchor:[14,14]}),title:t('youAreHere'),interactive:false,zIndexOffset:2000}).addTo(m);
 },[player,area,mapReady,leaflet,map,t]);
 // Cada salto entre mapas deja rastro: un aviso breve ("Entraste a Mt. Moon 1F
 // desde Route 4") y un anillo con flecha en el punto exacto de entrada o
 // salida, que se desvanece a los 6 s.
 const [arrival,setArrival]=useState<{area:string;at:Pt;label:string}|null>(null),[toast,setToast]=useState<string|null>(null);
 useEffect(()=>{if(!toast)return;const t=setTimeout(()=>setToast(null),4500);return()=>clearTimeout(t)},[toast]);
 useEffect(()=>{if(!arrival)return;const t=setTimeout(()=>setArrival(null),6000);return()=>clearTimeout(t)},[arrival]);
 // Lugar de la region (ruta o ciudad) mas cercano a un punto de esa region.
 const placeAt=useCallback((region:string,p:Pt)=>(world?.places??[]).filter(l=>l.area===region&&l.at).reduce<{name:string;d:number}|null>((best,l)=>{const d=(l.at![0]-p[0])**2+(l.at![1]-p[1])**2;return !best||d<best.d?{name:l.name,d}:best},null)?.name,[world]);
 // Por donde se sale de un interior: una puerta de su zona hacia una region
 // (la de este piso si la tiene) o, si no, una puerta de la region hacia la zona.
 const exitOf=(a:Area)=>{
  const zone=new Set((zoneFloors.get(a.zone??a.label)??[a]).map(f=>f.id)),warps=world?.warps??[];
  const out=warps.find(w=>w.area===a.id&&isRegion(w.to))??warps.find(w=>zone.has(w.area)&&isRegion(w.to));
  if(out)return {region:out.to,at:out.toAt};
  const into=warps.find(w=>isRegion(w.area)&&zone.has(w.to));
  return into?{region:into.area,at:into.at}:{region:regions[0]?.id??'',at:undefined as Pt|undefined};
 };
 const enter=(id:string,door?:{at:Pt;toAt:Pt})=>{
  const label=place(areaById.get(id)?.label??t('interior')),from=door&&area?.kind==='region'?place(placeAt(area.id,door.at)??''):undefined;
  saveRegion();setView(door?{area:id,focus:door.toAt,zoom:-99}:{area:id});setSelected(null);setEncounterZone(null);setLocations(false);
  setArrival(door?{area:id,at:door.toAt,label:t('enteredHere')}:null);setToast(from?t('enteredFrom',{place:label,from}):t('entered',{place:label}));
 };
 const leave=()=>{
  if(!here)return;setSelected(null);
  const exit=exitOf(here),back=saved.current?.region===exit.region?saved.current:null;
  setView(back?{area:back.region,restore:back.restore}:exit.at?{area:exit.region,focus:exit.at}:{area:exit.region});
  saved.current=null;
  setArrival(exit.at?{area:exit.region,at:exit.at,label:t('leftHere')}:null);
  const to=exit.at&&placeAt(exit.region,exit.at);setToast(t('leftTo',{place:place(here.label),to:place(to??areaById.get(exit.region)?.label??'')}));
 };
 const exitTo=(region:string,to:Pt)=>{
  setSelected(null);saved.current=null;setView({area:region,focus:to});
  setArrival({area:region,at:to,label:t('leftHere')});const near=placeAt(region,to);
  if(here)setToast(t('leftTo',{place:place(here.label),to:place(near??areaById.get(region)?.label??'')}));
 };
 const showRegion=(id:string)=>{setLocations(false);setSelected(null);setEncounterZone(null);setArrival(null);saved.current=null;setView({area:id});if(id!==area?.id)setToast(t('nowIn',{place:place(areaById.get(id)?.label??'')}))};
 const switchFloor=(id:string)=>{setSelected(null);setView({area:id});setArrival(null);setToast(t('nowIn',{place:place(areaById.get(id)?.label??'')}))};
 // Desde las listas solo se senala el objeto en el mapa, con el mismo anillo
 // parpadeante que marca por donde se entra; `open` abre ademas su ficha.
 const reveal=(m:Marker,open=true)=>{setStack(null);setArrival(null);setSelected(null);if(!m.area||!m.at)return;if(m.area!==area?.id)saveRegion();setView({area:m.area,focus:m.at,zoom:.5});if(open)setSelected(m);else setArrival({area:m.area,at:m.at,label:m.name})};
 // `encounters`: desde el menu de lugares se abre tambien la lista de salvajes
 // de la zona; desde la checklist solo se lleva al sitio.
 const go=(loc:Place,encounters=true)=>{
  setLocations(false);setSelected(null);setEncounterZone(encounters?world?.zones.find(z=>z.name===loc.name)??null:null);
  if(!isRegion(loc.area)){saveRegion();setView({area:loc.area});setArrival(null);setToast(t('entered',{place:place(areaById.get(loc.area)?.label??'')}));return}
  saved.current=null;setArrival(null);setView(loc.at?{area:loc.area,focus:loc.at,zoom:-1}:{area:loc.area});
 };

 // Como llegar: al siguiente objetivo o a cualquier marcador del mapa. La app no
 // sabe donde estas en tu partida: por defecto, la ultima zona de la historia
 // donde marcaste algo; se cambia en el panel o con "Estoy aqui".
 const [routeTo,setRouteTo]=useState<Marker|null>(null);
 useEffect(()=>setRouteTo(null),[baseGame]);
 const lastZone=useMemo(()=>{
  if(!world)return '';
  const zones=new Set(world.markers.filter(m=>done.includes(m.uid)).map(m=>world.checklist.markers[m.id]?.zone));
  return world.checklist.zones.reduce((last,z)=>zones.has(z.name)?z.name:last,world.checklist.zones[0]?.name??'');
 },[world,done]);
 // Donde estas, si no lo dices: en la casilla de lo ultimo que marcaste (en orden
 // de historia; los salvajes no cuentan, marcarlos los marca en todas partes), o
 // en tu cuarto si la partida empieza.
 // Donde estas: en la casilla de lo ultimo que marcaste (guardado al marcarlo);
 // si lo desmarcas, el ultimo objetivo hecho de la lista; al empezar, tu cuarto.
 const [lastTicked,setLastTicked]=useState<string|null>(null);
 useEffect(()=>{try{setLastTicked(localStorage.getItem(`${game.storage.done}-last`))}catch{setLastTicked(null)}},[game]);
 const lastSpot=useMemo(()=>{
  if(!world||!navWorld)return null;
  const byId=new Map(world.markers.map(m=>[m.id,m]));
  let last=lastTicked?byId.get(lastTicked)??null:null;
  if(last&&!done.includes(last.uid))last=null;
  if(!last)for(const id of world.goals){const m=byId.get(id);if(m&&m.area&&m.at&&done.includes(m.uid))last=m}
  const x=last?.area&&last.at?targetAt(navWorld,last.area,last.at,false):null;
  if(x)return {zone:navWorld.grids.get(x.map)!.m.zone,anchor:{map:x.map,x:x.x,y:x.y},room:false};
  const [m,sx,sy]=navWorld.nav.starts[0]??[];const g=m?navWorld.grids.get(m):undefined;
  return g?{zone:g.m.zone,anchor:{map:g.id,x:sx,y:sy},room:true}:null;
 },[world,navWorld,done,lastTicked]);
 // Se sale siempre del ultimo objetivo marcado (o de tu cuarto): de objetivo en objetivo.
 const from=lastSpot?.zone??lastZone;
 // items null: no hay camino con lo que tienes (falta una MO o un paso de la historia).
 // Vuelo (MO02 y la Medalla Trueno): los pueblos de Kanto que ya visitaste (con
 // algo marcado en ellos que no sea un Pokemon; Pueblo Paleta siempre), frente a su Centro Pokemon o,
 // en Paleta, a tu casa. Una ruta puede empezar volando a uno.
 const flySpots=useMemo(()=>{
  if(!navWorld||!world||!FLY_NEEDS.every(n=>have.has(n)))return [];
  // Un Pokemon marcado no cuenta: la marca es de la especie y sale en todas sus
  // zonas (atrapar un Tentacool marca tambien el de Canela sin haber ido).
  const visited=new Set(world.markers.filter(m=>m.category!=='Pokémon'&&done.includes(m.uid)).map(m=>world.checklist.markers[m.id]?.zone));
  const home=world.checklist.zones[0]?.name;
  return navWorld.list.flatMap(g=>{
   if(g.m.area!=='kanto'||!/(City|Town|Island)$/.test(g.m.zone)||!(visited.has(g.m.zone)||g.m.zone===home))return [];
   const w=(g.m.wp??[]).find(([,,d])=>/POKECENTER|POKEMON_CENTER_1F|REDS_HOUSE_1F|PLAYERS_HOUSE_1F/.test(d));
   return w?[{map:g.id,x:w[0],y:w[1]+1}]:[];
  });
 },[navWorld,world,have,done]);
 // Volar es una alternativa: cada ruta nueva empieza a pie.
 const [flyOn,setFlyOn]=useState(false);
 useEffect(()=>setFlyOn(false),[routeTo]);
 const trip=useMemo(()=>{
  if(!routeTo||!navWorld||!world||!routeTo.area||!routeTo.at)return null;
  const [px,py]=routeTo.at;
  const g=[...navWorld.grids.values()].find(g=>g.m.area===routeTo.area&&px>=g.m.x*16&&py>=g.m.y*16&&px<(g.m.x+g.m.w)*16&&py<(g.m.y+g.m.h)*16);
  if(!g)return {items:null,draw:[] as TripItem[],partial:false};
  const story=world.gates.filter(x=>!x.id.startsWith('hm-')&&x.needs.some(n=>!have.has(n)));
  const closed=(map:string)=>{const z=navWorld.grids.get(map)?.m.zone;return story.some(x=>!!x.maps?.includes(map)||(!!z&&!!x.zones?.includes(z)))};
  // Ancla: el centro de la zona de salida en el mapa de la region, si lo tiene.
  const spot=world.places.find(p=>p.name===from&&p.at&&isRegion(p.area));
  const ag=spot&&[...navWorld.grids.values()].find(g=>g.m.area===spot.area&&g.m.zone===from&&spot.at![0]>=g.m.x*16&&spot.at![1]>=g.m.y*16&&spot.at![0]<(g.m.x+g.m.w)*16&&spot.at![1]<(g.m.y+g.m.h)*16);
  const anchor=lastSpot?lastSpot.anchor:spot&&ag?{map:ag.id,x:Math.floor(spot.at![0]/16)-ag.m.x,y:Math.floor(spot.at![1]/16)-ag.m.y}:undefined;
  // A pie (con Surf si hace falta) por defecto; volando, solo si lo eliges y si
  // de verdad empieza con un vuelo.
  const target={map:g.id,x:Math.floor(px/16)-g.m.x,y:Math.floor(py/16)-g.m.y,far:PEOPLE.includes(routeTo.category)},moves=movesYouHave(navWorld.nav,have);
  const walk=findRoute(navWorld,from,target,moves,closed,anchor);
  const flown=flySpots.length?findRoute(navWorld,from,target,moves,closed,anchor,flySpots):null;
  const canFly=flown?.path[0]?.how==='fly',flying=flyOn&&canFly,found=flying?flown:walk;
  // Los pasos en palabras se resumen (sin casetas ni pisos de paso); el dibujo
  // usa el camino entero, para que salga la linea tambien dentro de tu casa.
  // Un Snorlax que ya despertaste (su paso de historia marcado, en su casilla) ya
  // no esta: no se dice que uses la flauta.
  const awake=new Set(world.markers.filter(m=>m.category==='Story'&&m.at&&done.includes(m.uid)).map(m=>`${m.area}:${m.at!.join(",")}`));
  const legs=found?legsOf(navWorld,found.path).map(l=>{
   const acts=l.acts.filter(a=>!(a.how==='flute'&&awake.has(`${l.area}:${a.at.join(",")}`)));
   return {...l,acts,uses:l.uses.filter(u=>u!=='flute'||acts.some(a=>a.how==='flute'))};
  }):null;
  const all=legs?tripItems(legs):null;
  return {items:all?withoutGates(all,a=>!isRegion(a),a=>{const l=areaById.get(a)?.label??'';return FLOOR_RE.test(l)?l.replace(FLOOR_RE,''):null}):null,draw:all??[],partial:!!found?.partial,canFly,flying};
 },[routeTo,navWorld,world,have,done,from,isRegion,lastSpot,areaById,flySpots,flyOn]);
 const [tripOpen,setTripOpen]=useState(false);
 useEffect(()=>setTripOpen(false),[routeTo]);
 // Al marcar el destino, la ruta termina: la barra vuelve al siguiente objetivo.
 // Con los pasitos encendidos, al marcar un objetivo la ruta sigue sola al
 // siguiente; una ruta a otra cosa (un objeto suelto) se cierra.
 useEffect(()=>{
  if(!routeTo||!settled(routeTo))return;
  const next=world?.goals.includes(routeTo.id)&&nextGoal&&nextGoal.id!==routeTo.id?nextGoal:null;
  setRouteTo(next);
  setToast(next&&world?t('routeOnward',{name:goalTitle(next,world.markers,world.checklist,tr)}):t('routeDone'));
 },[routeTo,settled,t,world,nextGoal,tr]);
 const startRoute=(m:Marker)=>{setRouteTo(m);setTab('mapa');setSelected(null);setStack(null);setEncounterZone(null)};
 // Zoom al mover la camara a un punto del camino: el que tenias si sigues en la
 // misma area (sin alejarte), si no uno de cerca.
 const keepZoom=useCallback((to:string)=>{const z=map.current?.getZoom();return to===area?.id&&z!==undefined?Math.max(z,-.5):.5},[area,map]);
 // Al empezar una ruta, la camara va a su inicio. Solo entonces: marcar algo con
 // la ruta abierta cambia de donde sales, pero no te mueve el mapa.
 const framed=useRef('');
 useEffect(()=>{
  const first=trip?.items?.[0];if(!routeTo||!first)return;
  // Tambien al cambiar entre a pie y volando: el camino empieza en otro sitio.
  const k=`${routeTo.id}|${trip?.flying?'fly':'walk'}`;if(framed.current===k)return;framed.current=k;
  setView({area:first.area,focus:first.pts[0],zoom:keepZoom(first.area)});setArrival(null);
 },[trip,routeTo,keepZoom]);
 useEffect(()=>{if(!routeTo)framed.current=''},[routeTo]);
 const stepTo=(item:TripItem)=>{setSelected(null);setStack(null);setView({area:item.area,focus:item.pts[Math.floor(item.pts.length/2)],zoom:keepZoom(item.area)})};

 // Los pines llaman a la version mas reciente de enter/exitTo sin redibujarse
 // en cada render (se recrean con cada render).
 const nav=useRef({enter,exitTo});
 useEffect(()=>{nav.current={enter,exitTo}});
 useEffect(()=>{
  const L=leaflet.current,g=layer.current,m=map.current;if(!L||!g||!m||!world||!area)return;
  drawMap({L,g,m,world,area,areaById,items:trip?.draw??[],nextGoal,stacks,done,skipSet,pending,isRegion,finished,doorLocked,placeAt,arrival,tr,onPick:items=>{if(items.length>1){setSelected(null);setStack(items)}else{setStack(null);setSelected(items[0])}},onDoor:(w,toRegion)=>toRegion?nav.current.exitTo(w.to,w.toAt):nav.current.enter(w.to,{at:w.at,toAt:w.toAt})});
 },[stacks,done,skipSet,pending,mapReady,world,area,areaById,arrival,isRegion,placeAt,finished,t,place,trip,doorLocked,nextGoal,layer,leaflet,tr,map,mapZoom]);

 useLayoutEffect(()=>{
  const m=map.current,p=popup.current;if(!m||!p)return;
  const at=(selected??stack?.[0])?.at,where=(selected??stack?.[0])?.area;
  if(at&&where===area?.id){if(!m.hasLayer(p))p.setLatLng(ll(at)).openOn(m);else p.setLatLng(ll(at))}
  else if(m.hasLayer(p))m.closePopup(p);
 },[selected,stack,area,mapReady,map,popup]);
 // Leaflet no se entera de que React cambio el contenido: se recoloca a mano.
 // El popup se coloca a mano, sin mover el mapa: encima del pin si cabe; si no
 // (pin pegado arriba, bajo la cabecera o la barra de pisos, donde una mazmorra
 // no puede desplazarse) debajo. Si se sale por un lado o por abajo, el mapa se
 // corre lo justo. Al marcar una casilla solo se recoloca: nada salta.
 useLayoutEffect(()=>{
  const m=map.current,p=popup.current,L=leaflet.current;if(!m||!p||!L||!m.hasLayer(p))return;
  const box=p.getElement();if(!box)return;
  const tip=p.getElement()?.querySelector<HTMLElement>('.leaflet-popup-tip-container');
  box.classList.remove('pop-below');p.options.offset=L.point(0,-6);if(tip)tip.style.marginLeft='';p.update();
  // Por arriba, lo que tape el mapa: la barra de pisos o regiones y la del objetivo.
  const stage=m.getContainer().getBoundingClientRect();
  const covers=[...document.querySelectorAll('.floorbar,.map-top')].map(e=>e.getBoundingClientRect().bottom);
  const top=Math.max(stage.top,...covers)+8;
  let r=box.getBoundingClientRect();
  if(r.top<top){box.classList.add('pop-below');p.options.offset=L.point(0,r.height+42);p.update();r=box.getBoundingClientRect()}
  // Si se sale por un lado (un pin pegado al borde de un interior, donde el mapa
  // no puede moverse), se corre la ficha y su flecha sigue apuntando al pin.
  const shift=r.left<stage.left+10?stage.left+10-r.left:r.right>stage.right-10?stage.right-10-r.right:0;
  if(shift){p.options.offset=L.point(shift,p.options.offset.y);p.update();if(tip)tip.style.marginLeft=`${-20-shift}px`;r=box.getBoundingClientRect()}
  const dy=r.bottom>stage.bottom-10?r.bottom-stage.bottom+10:0;
  if(dy)m.panBy([0,dy],{animate:true});
 },[selected,stack,done,area,battle,leaflet,popup,map]);
 const toggleGroup=(name:string)=>setActive(a=>a.includes(name)?a.filter(x=>x!==name):[...a,name]);
 const toggleDone=(uid:number,id?:string)=>{
  // Lo ultimo que marcas es donde estas: de ahi sale la siguiente ruta.
  if(id&&!done.includes(uid)){setLastTicked(id);try{localStorage.setItem(`${game.storage.done}-last`,id)}catch{}}
  // Al marcar algo que otros piden, se avisa de lo que queda abierto.
  const m=world?.markers.find(x=>x.uid===uid);
  if(m&&!done.includes(uid)&&!have.has(m.name)){
   const next=new Set([...have,m.name]);
   const items=listed.filter(x=>!done.includes(x.uid)&&x.uid!==uid&&reasonWith(x,have)&&!reasonWith(x,next));
   if(items.length){setUnlock({by:m.name,items});if(tab==='mapa')setToast(t('unlockToast',{name:name(m.name),n:items.length}))}
  }
  saveDone(old=>old.includes(uid)?old.filter(x=>x!==uid):[...old,uid]);
 };
 const skipOne=(m:Marker)=>{setSkip([m.uid],true);setToast(t('skipToast'))};
 const unskip=(m:Marker)=>setSkip([m.uid],false);
 // La Pokedex marca o desmarca de una vez todas las entradas de una especie.
 const tracked=useMemo(()=>new Set((world?.markers??[]).filter(m=>!game.untracked.includes(m.category)).map(m=>m.uid)),[world,game]);
 const completed=done.filter(uid=>tracked.has(uid)).length,trackedLeft=tracked.size-[...skipSet,...never].filter(uid=>tracked.has(uid)).length;
 const pct=trackedLeft?Math.round(completed/trackedLeft*100):0;
 // Ir al mapa desde las listas: el mapa sigue montado y coloca la camara al verse.
 const showOnMap=(m:Marker)=>{setTab('mapa');reveal(m,false)};
 // Llevar a una zona de la checklist: a su lugar del mapa si lo tiene y, si no
 // (cuevas y edificios de varios pisos), al piso del primer objeto que te falta.
 const showZone=(zone:string)=>{
  const spot=world?.places.find(p=>p.name===zone);
  const items=listed.filter(m=>world?.checklist.markers[m.id]?.zone===zone&&m.area);
  const next=items.find(pending)??items.find(m=>!done.includes(m.uid))??items[0];
  const loc=spot??(next?{name:zone,area:next.area!,at:isRegion(next.area!)?next.at:undefined}:null);
  if(loc){setTab('mapa');go(loc,false)}
 };
 const detail=(m:Marker)=>{const e=m.encounter;return e?t('encounterRate',{levels:span(e),chance:e.chance,methods:e.methods.map(method).join(' · ')}):info(m)??null};
 const listed=useMemo(()=>world?world.markers.filter(m=>world.checklist.markers[m.id]):[],[world]);
 // Se puede saltar lo opcional: de los objetivos, los que goals.json marca como
 // opcionales; de lo demas, todo menos un lider, lo que abre el camino (lo que
 // piden los bloqueos) y el primer Pokemon.
 const needed=useMemo(()=>new Set((world?.gates??[]).flatMap(g=>g.needs)),[world]);
 const canSkip=useCallback((m:Marker)=>world?.goals.includes(m.id)?world.optionalGoals.has(m.id)
  :!LEADER.test(m.name)&&!needed.has(m.name)&&!(m.category==='In-Game Gift Pokémon'&&world?.checklist.markers[m.id]?.zone===world?.checklist.zones[0]?.name),[needed,world]);
 // Lo que te dejas: al ir hacia un objetivo de otra zona, lo que queda por hacer
 // en la zona de lo ultimo que marcaste. Antes de un sitio que se cierra (el
 // S.S. Anne), lo que queda en el, con un aviso mas fuerte.
 const leftovers=useMemo<Behind|null>(()=>{
  if(!world||!nextGoal)return null;
  const zoneOf=(m:Marker)=>world.checklist.markers[m.id]?.zone,goalZone=zoneOf(nextGoal);
  // Los objetivos no: la MO01 tambien es un regalo del barco, y saltarla con el
  // resto dejaba la historia sin Corte.
  const leftIn=(zone:string)=>listed.filter(m=>zoneOf(m)===zone&&LEFT_BEHIND.includes(m.category)&&!world.goals.includes(m.id)&&canSkip(m)&&pending(m));
  const closing=world.closings.find(c=>!have.has(c.by)&&(c.zones.includes(goalZone??'')||nextGoal.name===c.by));
  if(closing){const items=closing.zones.flatMap(leftIn);if(items.length)return {zone:closing.zones[0],items,warn:closing.warn[lang]}}
  // Un salvaje no dice donde estas: se marca por especie en todas sus zonas.
  const last=lastTicked?byId.get(lastTicked):null,zone=last&&last.category!=='Pokémon'&&done.includes(last.uid)?zoneOf(last):null;
  if(!zone||zone===goalZone)return null;
  const items=leftIn(zone);return items.length?{zone,items}:null;
 },[world,nextGoal,listed,pending,canSkip,have,lang,lastTicked,byId,done]);
 const skipBehind=(b:Behind)=>{setSkip(b.items.map(m=>m.uid),true);setToast(t('behindSkipToast'))};
 // Por que nivel va la partida, mirando los gimnasios marcados en la lista.
 // Manda el ultimo que ganaste, no el siguiente: al salir del gimnasio de
 // Brock (nivel 14) se anda por 13-16, no por los 21 de Misty. Se le suma un
 // cuarto de lo que falta hasta el proximo, que es el terreno que se recorre
 // entrenando por el camino.
 const suggestedLevel=useMemo(()=>{
  const bosses=(world?.markers??[])
   .filter(m=>m.category==='Battle'&&/^(Leader|Elite Four|Champion)/i.test(m.name))
   .map(m=>({uid:m.uid,level:Math.max(0,...trainerOpponents(m.detail).map(foe=>foe.level))}))
   .filter(boss=>boss.level>0).sort((a,b)=>a.level-b.level);
  if(!bosses.length)return 5;
  const beaten=bosses.filter(boss=>done.includes(boss.uid));
  const last=beaten.at(-1)?.level??0;
  const next=bosses.find(boss=>boss.level>last)?.level??last;
  // Sin ningun gimnasio ganado se empieza por debajo del primero.
  // Hacia abajo: quedarse corto hace el consejo prudente, pasarse lo hace
  // prometer mas dano del que vas a hacer.
  return last?Math.floor(last+(next-last)*.25):Math.max(5,next-5);
 },[world,done]);
 const tabs=([['checklist',t('tabChecklist'),ListChecks],['mapa',t('tabMap'),MapIcon],['pokedex',t('tabDex'),BookOpen],['team',t('tabTeam'),Swords]] as const);
 const worldFailed=worldFailure===game.id,battleFailed=battleFailure===battleUrl(game)&&!battle;
 const retryWorld=()=>setLoadAttempt(n=>n+1),retryBattle=()=>setBattleAttempt(n=>n+1);
 const worldNotice=<LoadNotice message={worldFailed?t('loadGameFailed',{game:game.short}):t('loadingGame',{game:game.short})} onRetry={worldFailed?retryWorld:undefined} tr={tr}/>;
 const battleNotice=<LoadNotice message={t('loadBattleFailed')} onRetry={retryBattle} tr={tr}/>;
 const extraFailure=world&&(navFailure===navUrl&&!navWorld?{message:t('loadRoutesFailed'),retry:()=>setNavAttempt(n=>n+1)}
  :lang==='es'&&namesFailure&&!names?{message:t('loadNamesFailed'),retry:()=>setNamesAttempt(n=>n+1)}
  :tab==='team'&&!!moveTextSrc&&moveTextFailure===moveTextSrc&&!moveText?{message:t('loadMoveTextFailed'),retry:()=>setMoveTextAttempt(n=>n+1)}
  :battleFailed&&needsBattle&&(tab==='checklist'||tab==='mapa')?{message:t('loadBattleFailed'),retry:retryBattle}:null);
 const areaName=(id?:string)=>id?place(areaById.get(id)?.label??'—'):'—';
 // Ficha de un marcador: el lugar junto a la categoria si es corto.
 // Lo que vende una tienda, con los objetos traducidos; los demas detalles solo
 // cambian el nivel ('Lv45' -> 'Nv. 45').
 const info=(m:Marker)=>{const d=m.detail;if(!d)return null;
  const list=(from:number)=>d.slice(from).split(', ').map(name).join(', ');
  return d.startsWith('Sells ')?t('sells',{list:list(6)}):d.startsWith('For Berry Powder: ')?t('berryPowder',{list:list(18)}):tDetail(d)};
 // Los nombres del mapa y de la Pokedex se comparan sin signos: "Nidoran♀", "Farfetch'd".
 const speciesKey=(value:string)=>value.toLowerCase().replace(/♀/g,'f').replace(/♂/g,'m').replace(/[^a-z0-9]/g,'');
 const speciesByName=useMemo(()=>new Map((world?.dex.species??[]).map(s=>[speciesKey(s.name),s.n])),[world]);
 const shortPlace=(m:Marker)=>!!m.location&&m.location.length<=40;
 const opponentsOf=(m:Marker):Opponent[]=>m.encounter?[{name:m.name,level:m.encounter.max}]:m.category==='Battle'?trainerOpponents(m.detail):[];
 // Linea de detalle: niveles y probabilidad, equipo, lo que vende, lo que pide un
 // intercambio, o el texto largo de Yellow.
 // En un grupo el lugar va una vez en el titulo; cada fila, sin subtitulo.
 // Casilla de la ficha, como en la checklist: sin marcar y bloqueado, candado y
 // no se puede marcar.
 const whyLocked=(m:Marker)=>done.includes(m.uid)?null:unavailable(m);
 const popTick=(m:Marker)=>{if(game.untracked.includes(m.category))return null;
  if(skipSet.has(m.uid))return <button className="tick skip" aria-label={t('unskip')} title={t('skipped')} onClick={()=>unskip(m)}><SkipForward/></button>;
  const why=whyLocked(m),on=done.includes(m.uid);
  return <button className={`tick ${on?'on':''}`} aria-label={t('markDone')} disabled={!!why} title={why??undefined} onClick={()=>toggleDone(m.uid,m.id)}>{on?<Check/>:why?<Lock/>:null}</button>};
 const popWhy=(m:Marker)=>{const why=whyLocked(m);return why&&<p className="pop-why"><Lock/>{why}</p>};
 const obstacleHint=(m:Marker)=>{const mv=m.category==='Obstacle'?obstacleMove(m.name):null;if(!mv)return null;
  const f=FIELD_MOVES[mv],missing=f.needs.filter(n=>!have.has(n)),key=({cut:'moveCut',strength:'moveStrength',smash:'moveSmash'} as const)[mv as 'cut'];
  return <p className={`pop-hm ${missing.length?'':'ok'}`}>{t('obstacleUse',{move:t(key),needs:f.needs.map(name).join(' + ')})} {missing.length?t('obstacleMissing',{list:missing.map(name).join(', ')}):t('obstacleHave')}</p>};
 const popRow=(m:Marker,compact=false)=><div className={`pop-item ${whyLocked(m)?'pop-locked':''}`}><div className="pop-head">{popTick(m)}<Figure m={m}/><div><b>{m.category==='Obstacle'&&obstacleMove(m.name)?t(`obstacle_${obstacleMove(m.name)}` as 'obstacle_cut'):name(m.name)}</b>{!compact&&<small>{m.encounter?`${category(m.category)} · ${place(m.encounter.zone)}`:shortPlace(m)?`${category(m.category)} · ${place(m.location)}`:category(m.category)}</small>}</div></div>{popWhy(m)}{obstacleHint(m)}{popLine(m)&&<p>{popLine(m)}</p>}{evs(m)&&<p className="pop-ev">{evs(m)}</p>}</div>;
 // Lo que gana tu Pokemon al derrotar a un salvaje, segun las reglas del juego:
 // EVs ("+1 At. Esp." en un Oddish) o Stat Exp.
 const evs=(m:Marker)=>{const n=m.encounter&&battle?speciesByName.get(speciesKey(m.name)):undefined;
  return n?effortText(battle!,[n],tr):null};
 const popLine=(m:Marker)=>{const e=m.encounter;return e?t('encounterRate',{levels:span(e),chance:e.chance,methods:e.methods.map(method).join(' · ')}):info(m)??(shortPlace(m)?null:place(m.location)||null)};
 const popRowWithAdvice=(m:Marker,compact=false)=>{const opponents=opponentsOf(m);
  if(m.encounter&&battle)return <div className={`pop-item battle-wild-row ${whyLocked(m)?'pop-locked':''}`}>{popTick(m)}<BattleAdvice opponents={opponents} dex={world!.dex} battle={battle} storageKey={`${game.storage.done}-team`} tr={tr} inline foeLevel={t('encounterLevels',{levels:span(m.encounter)})} foeDetail={t('encounterChance',{chance:m.encounter.chance,methods:m.encounter.methods.map(x=>method(x).replace(/ /g,String.fromCharCode(160))).join(' · ')})}/>{popWhy(m)}</div>;
  return <div className="pop-advised">{popRow(m,compact)}{opponents.length>0&&<BattleAdvice opponents={opponents} dex={world!.dex} battle={battle} storageKey={`${game.storage.done}-team`} tr={tr}/>}</div>};
 const exitRegion=here?exitOf(here).region:null;
 const floors=here?zoneFloors.get(here.zone??here.label)??[here]:[];
 return <main className={playing?'with-emulator':undefined}><header><button className="brand" disabled={playing} onClick={()=>setHome(true)} aria-label={t('home')} title={t('home')}><i><MapIcon/></i><b>ROUTE 151<small>{t('companion',{game:game.title})}</small></b></button>
 <label className="game-select"><span className="sr-only">{t('game')}</span><select disabled={playing} value={game.id} onChange={e=>pickGame(e.target.value)} aria-label={t('game')}>{GAMES.map(g=><option key={g.id} value={g.id}>{g.short}</option>)}</select><ChevronDown/></label>
 <label className="game-select lang-select"><span className="sr-only">{t('language')}</span><select value={lang} onChange={e=>pickLang(e.target.value as Lang)} aria-label={t('language')}>{LANGS.map(l=><option key={l} value={l}>{LANG_NAMES[l]}</option>)}</select><ChevronDown/></label>
 {profiles.length>0&&<label className="game-select profile-select"><span className="sr-only">{t('profileLabel')}</span><select value={profileId??''} onChange={e=>pickProfile(e.target.value)} aria-label={t('profileLabel')}><option value="">{t('profileManual')}</option>{profiles.map(p=><option key={p.id} value={p.id}>{t('profileSave',{name:p.trainer||'?'})}</option>)}</select><ChevronDown/></label>}
 {tab==='mapa'&&<div className="map-controls"><button className="location-button" onClick={()=>setLocations(!locations)} aria-expanded={locations}>{here?<DoorOpen/>:<MapPin/>}<span>{here?place(here.label):area?<>{place(area.label)}<small>{t('allAreas')}</small></>:t('loading')}</span><ChevronDown/></button><button className={`layers-button ${active.length<groups.length?'filtered':''}`} onClick={()=>setLayersOpen(v=>!v)} aria-pressed={layersOpen} aria-label={t('mapLayers')}><Layers/></button>{player&&<button className={`layers-button follow-button ${follow?'on':''}`} onClick={()=>setFollow(f=>!f)} aria-pressed={follow} aria-label={t('followMe')} title={t('followMe')}><LocateFixed/></button>}</div>}
 <nav>{tabs.map(([k,t])=><button key={k} className={tab===k?'on':''} onClick={()=>setTab(k)} aria-current={tab===k?'page':undefined}>{t}</button>)}</nav><div className="counter"><span>{t('completed',{n:completed})}</span><i><em style={{width:`${pct}%`}}/></i><b>{pct}%</b></div>{game.gen===3&&<button className="about-button" disabled={!world||playing} onClick={()=>setPlaying(true)} aria-label={t('emuTitle')} title={t('emuTitle')}><Gamepad/></button>}<button className={`about-button refresh-button ${refreshing?'spin':''}`} disabled={playing} onClick={()=>{setRefreshing(true);void refreshApp()}} aria-label={t('refreshApp')} title={t('refreshApp')}><RefreshCw/></button><button className="about-button" disabled={playing} onClick={()=>setAbout(true)} aria-label={t('credits')}><Info/></button></header>
 {playing&&world&&<EmulatorPanel key={baseGame.id} game={baseGame} world={world} tr={tr} onClose={()=>setPlaying(false)}/>}
 <div className="companion-content">
 <div className={`app ${layersOpen?'layers-open':''}`} hidden={tab!=='mapa'}><aside><h3>{t('layers')}</h3>{groups.map(([name,Icon,color])=><button key={name} onClick={()=>toggleGroup(name)} className={active.includes(name)?'enabled':''}><i style={{'--color':color} as React.CSSProperties}>{active.includes(name)&&<Check/>}</i><Icon/><span>{layerName(name)}</span><b>{counts[name]??0}</b></button>)}<div className="source"><Sparkles/><p><b>{t('separateTitle')}</b>{t('separateText',{regions:regions.map(r=>r.label).join(' + ')})}</p></div></aside>
 <div className="map-stage"><div ref={el} className="leaflet-map"/>
 {here&&<div className="floorbar"><button onClick={leave}><ArrowLeft/>{place(areaById.get(exitRegion??'')?.label??t('back'))}</button>{floors.length>1&&floors.map(f=><button key={f.id} className={f.id===here.id?'on':''} onClick={()=>switchFloor(f.id)}>{place(short.get(f.id)||f.label)}</button>)}</div>}
 {!here&&regions.length>1&&<div className="floorbar">{regions.map(r=><button key={r.id} className={r.id===area?.id?'on':''} onClick={()=>showRegion(r.id)}><MapIcon/>{place(r.label)}</button>)}</div>}
 {toast&&<output className="toast" key={toast}>{toast}</output>}
 {/* El siguiente objetivo, arriba del mapa: verlo o trazar el camino. */}
 {/* Una sola barra arriba: el siguiente objetivo o, con una ruta abierta, su
     destino. Marcar, trazar o cerrar la ruta, y verlo; los pasos se despliegan
     debajo al tocar su linea. Al marcar el destino la ruta se cierra sola y la
     barra pasa al siguiente objetivo, listo para trazarlo. */}
 {/* Barra del objetivo y, debajo, los pasos de la ruta: una sola pieza pegada arriba. */}
 <div className="map-top">
 {world&&(routeTo??nextGoal)&&(subject=>{
  const blocked=unavailable(subject),steps=!trip?t('routeLoading'):!trip.items?t('routeNoneShort').split(' · ')[0]:t(trip.items.length+1===1?'routeStepsOne':'routeSteps',{n:trip.items.length+1}).split(' · ')[0];
  return <div className="map-goal"><Figure m={subject}/>
   {routeTo?<button className="map-goal-text" onClick={()=>setTripOpen(v=>!v)} aria-expanded={tripOpen}>
     <small className={trip&&!trip.items?'trip-none':''}>{t('routeHow')} · {steps}<ChevronDown/></small><b>{world.goals.includes(routeTo.id)?goalTitle(routeTo,world.markers,world.checklist,tr):name(routeTo.name)}</b></button>
    :<span className="map-goal-text"><small>{t('goalTitle')}</small><b>{goalTitle(subject,world.markers,world.checklist,tr)}</b></span>}
   <button className="map-goal-tick" disabled={!!blocked} title={blocked??t('goalMark')} aria-label={t('goalMark')} onClick={()=>toggleDone(subject.uid,subject.id)}><span className="check-box pulse">{blocked&&<Lock/>}</span></button>
   {/* Interruptor de Como llegar: encendido dibuja la ruta; apagado la quita. */}
   <button className={`map-goal-go ${routeTo?'on':''}`} aria-pressed={!!routeTo} onClick={()=>routeTo?setRouteTo(null):startRoute(subject)} aria-label={t(routeTo?'routeClose':'routeHow')} title={t(routeTo?'routeClose':'routeHow')}><Footprints/></button>
   <button onClick={()=>reveal(subject,true)} aria-label={t('goalShow')} title={t('goalShow')}><MapPin/></button>
  </div>;
 })(routeTo??nextGoal!)}
 {leftovers&&!tripOpen&&<BehindNote behind={leftovers} onSee={()=>showZone(leftovers.zone)} onSkip={()=>skipBehind(leftovers)} tr={tr}/>}
 {routeTo&&world&&tripOpen&&<RoutePanel target={name(routeTo.name)} fromRoom={!!lastSpot?.room} fly={trip?.canFly?{on:trip.flying,set:setFlyOn}:null}
  items={trip?.items??[]} partial={!!trip?.partial} status={!trip?'loading':trip.items?'ok':'none'} onStep={item=>{setTripOpen(false);stepTo(item)}}
  labelOf={it=>isRegion(it.area)?place(it.zone):place(areaById.get(it.area)?.label??it.zone)} isInterior={a=>!isRegion(a)} tr={tr}/>}
 </div>
 {(!world||!mapReady)&&<div className="loading">{!world?worldNotice:<LoadNotice message={mapFailure?t('loadMapFailed'):t('loading')} onRetry={mapFailure?()=>setMapAttempt(n=>n+1):undefined} tr={tr}/>}</div>}<div className="map-note">{t('mapNote')}</div></div>
 {locations&&world&&<div className="locations">{here&&<button className="leave-inline" onClick={()=>{leave();setLocations(false)}}><ArrowLeft/>{t('backToMap',{region:place(areaById.get(exitRegion??'')?.label??'')})}</button>}
  {regions.map((r,i)=><Fragment key={r.id}><h3>{place(r.label).toUpperCase()}</h3><button className={area?.id===r.id?'current':''} onClick={()=>showRegion(r.id)}><MapIcon/>{t('wholeMap')}</button>{world.places.filter(p=>p.area===r.id||(i===0&&!isRegion(p.area))).map(loc=><button key={loc.name} onClick={()=>go(loc)}><MapPin/>{place(loc.name)}</button>)}</Fragment>)}
  <h3>{t('interiors')}</h3>{[...zoneFloors].map(([zone,list])=><div key={zone} className="dungeon"><h4>{place(zone)}</h4>{list.map(f=><button key={f.id} onClick={()=>enter(f.id)} className={here?.id===f.id?'current':''}><DoorOpen/>{place(f.label)}<b>{inArea.get(f.id)?.length??0}</b></button>)}</div>)}</div>}
 {popupBox&&(selected||stack)&&createPortal(selected?<div className="pop">{popRowWithAdvice(selected)}
  {skipSet.has(selected.uid)?<div className="pop-actions"><button className="pop-skip" onClick={()=>unskip(selected)}><Undo2/>{t('unskip')}</button></div>
   :!done.includes(selected.uid)&&<div className="pop-actions"><button className="pop-route" onClick={()=>startRoute(selected)}><Footprints/>{t('routeHow')}</button>
    {!game.untracked.includes(selected.category)&&!whyLocked(selected)&&canSkip(selected)&&<button className="pop-skip" onClick={()=>skipOne(selected)}><SkipForward/>{t('skip')}</button>}</div>}</div>:<div className="pop pop-list"><small className="pop-title">{t('atThisSpot',{n:stack!.length})} · {areaName(stack![0].area)}</small>{checkOrder(stack!,m=>!!whyLocked(m)).map(m=><Fragment key={m.id}>{popRowWithAdvice(m,true)}</Fragment>)}</div>,popupBox)}
 {encounterZone&&!selected&&!stack&&<EncounterDialog zone={encounterZone} tr={tr} onClose={()=>setEncounterZone(null)}/>}
 </div>
 {extraFailure&&<LoadNotice message={extraFailure.message} onRetry={extraFailure.retry} tr={tr} banner/>}
 {tab==='checklist'&&(world?<ChecklistView markers={listed} checklist={world.checklist} gates={world.gates} goals={world.goals} goalNotes={world.goalNotes} settled={settled} skipped={skipSet} onSkip={skipOne} onUnskip={unskip} canSkip={canSkip} behind={leftovers} onSkipBehind={skipBehind} onRoute={startRoute} unlock={unlock} onUnlockDismiss={()=>setUnlock(null)} done={done} toggleDone={toggleDone} onShow={showOnMap} onShowZone={showZone} detail={detail} unavailable={unavailable} hideUnavailable={hideUnavailable} setHideUnavailable={setHideUnavailable} battle={battle} dex={world.dex} teamKey={`${game.storage.done}-team`} tr={tr}/>:<div className="listview loading-list">{worldNotice}</div>)}
 {/* La Pokedex y el ranking comparten pestana, cada uno con su lista: se
     cambia con el selector de arriba (el ranking solo en FireRed/LeafGreen). */}
 {tab==='pokedex'&&(()=>{
  const switcher=<div className="list-switch">{([['dex',t('tabDex')],['ranking',t('tabRanking')],['learn',t('tabLearn')]] as const).map(([k,label])=>
   <button key={k} className={`chip ${dexView===k?'on':''}`} aria-pressed={dexView===k} onClick={()=>setDexView(k)}>{label}</button>)}</div>;
  if(!world)return <div className="listview loading-list">{worldNotice}</div>;
  if(dexView!=='dex'&&battleFailed)return <div className="listview">{switcher}{battleNotice}</div>;
  if(dexView==='learn')return <LearnView battle={battle} gen={game.gen} switcher={switcher} tr={tr}/>;
  return dexView==='ranking'&&switcher
   ?<RankingView dex={world.dex} battle={battle} byId={byId} done={done} dexKey={game.storage.dex} storageKey={`${game.storage.done}-team`} switcher={switcher} tr={tr} imported={imported?.snapshot.owned}/>
   :<PokedexView dex={world.dex} byId={byId} done={done} setMany={setMany} onShow={showOnMap} game={game.short} storageKey={game.storage.dex} switcher={switcher} tr={tr} imported={imported?.snapshot.owned}/>;
 })()}
 {tab==='team'&&(world?battleFailed?<div className="listview loading-list">{battleNotice}</div>:<TeamView dex={world.dex} battle={battle} moveText={moveTextSrc?moveText:null} storageKey={`${game.storage.done}-team`} suggestedLevel={suggestedLevel} tr={tr}/>:<div className="listview loading-list">{worldNotice}</div>)}
 </div>
 {tour&&!home&&<Tour onClose={closeTour} tr={tr}/>}
 {about&&<AboutDialog game={game} tr={tr} onClose={()=>setAbout(false)} onTour={()=>{setAbout(false);setTour(true)}} onReset={resetGame} onImport={()=>{setAbout(false);setSaveImportOpen(true)}}/>}
 {saveImportOpen&&world&&<SaveImportDialog game={baseGame} world={world} tr={tr} onClose={()=>setSaveImportOpen(false)}/>}
 <nav className="tabbar">{tabs.map(([k,t,Icon])=><button key={k} className={tab===k?'on':''} onClick={()=>setTab(k)} aria-current={tab===k?'page':undefined}><Icon/>{t}</button>)}</nav>
 {home&&<GameHome current={game.id} last={last} lang={lang} onLang={pickLang} onPick={choose} tr={tr}/>}
 </main>
}
