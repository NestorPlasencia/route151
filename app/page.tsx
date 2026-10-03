'use client';
import {Fragment,useCallback,useEffect,useLayoutEffect,useMemo,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import type {Map as LeafletMap,LayerGroup,ImageOverlay,Popup} from 'leaflet';
import {ArrowLeft,BookOpen,Check,RefreshCw,RotateCcw,ChevronDown,DoorOpen,Footprints,Info,Layers,ListChecks,Lock,Map as MapIcon,MapPin,SkipForward,Sparkles,Swords,Undo2,X} from 'lucide-react';
import {Credits,FIELD_MOVES,Figure,checkOrder,choicesTaken,colorOf,groupsOf,haveNames,missingTool,obstacleMove,unmetGate,type Encounter,type Marker} from './shared';
import {LANGS,LANG_NAMES,LANG_KEY,savedLang,translator,type Lang,type Names} from './i18n';
import {ChecklistView,PokedexView} from './lists';
import {RankingView} from './ranking';
import {GameHome} from './home';
import {BattleAdvice,TeamView,effortText,trainerOpponents,type Battle,type Opponent} from './team';
import {GAMES,METHODS,battleUrl,loadGame,moveTextUrl,type Area,type EncounterZone,type Place,type Pt,type World} from './games';
import {blockerOf,findRoute,legsOf,movesYouHave,openTree,prepare,reachTiles,reached,targetAt,type Nav,type Target,type Tree,type World as RouteWorld} from './pathfind';
import {RoutePanel,tripItems,withoutGates,type TripItem} from './trip';
import {BackupBox} from './backup';
import {refreshApp} from './service-worker';
import {LearnView} from './learn';
import {BehindNote,LEADER,goalTitle,nextGoalOf,type Behind,type Unlock} from './guide';
import {TOUR_KEY,Tour} from './tour';
import {loadJson} from './load-json';
import {LoadNotice} from './load-notice';

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
const PEOPLE=['Item Gift','In-Game Trade','Battle','In-Game Gift Pokémon','Shop'];
// Lo que se avisa que te dejas al salir de una zona: entrenadores, objetos a la
// vista y regalos. Ni los salvajes (se marcan por especie) ni los objetos ocultos.
const LEFT_BEHIND=['Battle','Item In Map','Item Gift','In-Game Gift Pokémon'];
const MOVE_KEY:Record<string,'moveSurf'|'moveCut'|'moveStrength'|'moveSmash'|'moveWaterfall'|'moveFlute'|'moveSwitch'|'movePlate'>={surf:'moveSurf',cut:'moveCut',strength:'moveStrength',smash:'moveSmash',waterfall:'moveWaterfall',flute:'moveFlute',switch:'moveSwitch',plate:'movePlate'};
// Candado de lucide para los pines bloqueados: el pin es HTML de Leaflet, no React.
// Bandera del siguiente objetivo en el mapa.
const FLAG_SVG='<svg viewBox="0 0 24 24" width="18" height="18" fill="#ffd936" stroke="#172034" stroke-width="2" stroke-linejoin="round"><path d="M4 22V3"/><path d="M4 4h13l-2.5 4L17 12H4"/></svg>';
const LOCK_SVG='<svg viewBox="0 0 24 24" width="9" height="9" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="11" x="3" y="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>';

export default function Home(){
 const popup=useRef<Popup|null>(null),[popupBox,setPopupBox]=useState<HTMLDivElement|null>(null);
 const el=useRef<HTMLDivElement>(null),map=useRef<LeafletMap|null>(null),layer=useRef<LayerGroup|null>(null),overlay=useRef<ImageOverlay|null>(null),shownArea=useRef<string|null>(null),leaflet=useRef<typeof import('leaflet')|null>(null);
 const [mapReady,setMapReady]=useState(false);
 const [loadAttempt,setLoadAttempt]=useState(0),[worldFailure,setWorldFailure]=useState<string|null>(null);
 const [battleAttempt,setBattleAttempt]=useState(0),[battleFailure,setBattleFailure]=useState<string|null>(null);
 const [navAttempt,setNavAttempt]=useState(0),[navFailure,setNavFailure]=useState<string|null>(null);
 const [namesAttempt,setNamesAttempt]=useState(0),[namesFailure,setNamesFailure]=useState(false);
 const [moveTextAttempt,setMoveTextAttempt]=useState(0),[moveTextFailure,setMoveTextFailure]=useState<string|null>(null);
 const [mapAttempt,setMapAttempt]=useState(0),[mapFailure,setMapFailure]=useState(false);
 const [gameId,setGameId]=useState(GAMES[0].id),[world,setWorld]=useState<World|null>(null),[lang,setLang]=useState<Lang>('en'),[names,setNames]=useState<Names>(null);
 const tr=useMemo(()=>translator(lang,names),[lang,names]),{t,category,method,place,name}=tr,{detail:tDetail}=tr,layerName=tr.layer;
 // Los nombres en espanol de los objetos (de PokeAPI) solo se bajan si hacen falta.
 useEffect(()=>{if(lang!=='es'||names)return;const controller=new AbortController();setNamesFailure(false);
  loadJson<NonNullable<Names>>('/data/names-es.json',{signal:controller.signal}).then(n=>{if(!n||[n.items,n.moves,n.abilities,n.natures].some(table=>!table||typeof table!=='object'||Array.isArray(table)||Object.values(table).some(value=>typeof value!=='string')))throw new Error('Invalid translations');setNames(n)}).catch(e=>{if(!controller.signal.aborted){setNamesFailure(true);console.error('No se pudieron cargar los nombres',e)}});
  return()=>controller.abort();
 },[lang,names,namesAttempt]);
 const game=GAMES.find(g=>g.id===gameId)??GAMES[0],groups=groupsOf(game.id);
 const [tab,setTab]=useState<'mapa'|'checklist'|'pokedex'|'team'>('checklist'),[dexView,setDexView]=useState<'dex'|'ranking'|'learn'>('dex'),[battles,setBattles]=useState<Record<string,Battle>>({}),[moveText,setMoveText]=useState<Record<string,{en:string;es:string}>|null>(null),[view,setView]=useState<View>({area:''});
 // Cada juego tiene sus datos de combate (Yellow, los de Gen 1): se guardan por archivo.
 const battle=battles[battleUrl(game)]??null,moveTextSrc=moveTextUrl(game);
 const [active,setActive]=useState<string[]>(groups.map(g=>g[0])),[selected,setSelected]=useState<Marker|null>(null),[stack,setStack]=useState<Marker[]|null>(null),[done,setDone]=useState<number[]>([]),[locations,setLocations]=useState(false),[about,setAbout]=useState(false),[layersOpen,setLayersOpen]=useState(false);
 const [encounterZone,setEncounterZone]=useState<EncounterZone|null>(null);
 // Lo que decides saltar (no te interesa o ya no se puede): no cuenta en el total
 // ni se vuelve a avisar. No es hecho: no abre nada y se puede deshacer.
 const [skipped,setSkipped]=useState<number[]>([]);
 // Inicio para elegir juego, y el ultimo que se jugo (se marca en su tarjeta).
 const [home,setHome]=useState(false),[last,setLast]=useState<string|null>(null);

 // El juego elegido se recuerda; ?game=firered en la URL manda. Sin ninguno de
 // los dos, se empieza en el inicio para elegirlo.
 useEffect(()=>{let saved:string|null=null;try{saved=localStorage.getItem(GAME_KEY)}catch{}const id=[new URLSearchParams(location.search).get('game'),saved].find(x=>GAMES.some(g=>g.id===x));if(id)setGameId(id);else setHome(true);setLast(GAMES.some(g=>g.id===saved)?saved:null);setLang(savedLang())},[]);
 // Cada juego carga sus datos y su progreso, y empieza en su primera region.
 useEffect(()=>{
  let live=true;const controller=new AbortController();setWorldFailure(null);setWorld(null);setSelected(null);setStack(null);setEncounterZone(null);setLocations(false);saved.current=null;setArrival(null);
  setActive(groupsOf(game.id).map(g=>g[0]).filter(n=>!game.hidden.includes(n)));
  try{setDone(JSON.parse(localStorage.getItem(game.storage.done)||'[]'))}catch{setDone([])}
  try{setSkipped(JSON.parse(localStorage.getItem(`${game.storage.done}-skip`)||'[]'))}catch{setSkipped([])}
  loadGame(game,controller.signal).then(w=>{if(!live)return;setWorld(w);setView({area:w.areas.find(a=>a.kind==='region')?.id??w.areas[0].id})}).catch(e=>{if(live){setWorldFailure(game.id);console.error('No se pudo cargar',game.id,e)}});
  return()=>{live=false;controller.abort()};
 },[game,loadAttempt]);
 const pickGame=(id:string)=>{setGameId(id);setLast(id);try{localStorage.setItem(GAME_KEY,id)}catch{}};
 // Desde el inicio se entra siempre al mapa del juego elegido.
 // Desde el inicio se entra a la checklist: la ruta, con la primera zona abierta y
 // su boton de mapa para ver donde esta.
 const choose=(id:string)=>{pickGame(id);setHome(false);setTab('checklist')};
 const pickLang=(l:Lang)=>{setLang(l);try{localStorage.setItem(LANG_KEY,l)}catch{}};
 useEffect(()=>{document.documentElement.lang=lang},[lang]);
 // Tambien se carga al abrir un entrenador o un Pokemon salvaje del mapa.
 const needsBattle=tab==='team'||tab==='checklist'||(tab==='pokedex'&&dexView!=='dex')||selected?.category==='Battle'||!!selected?.encounter||!!stack?.some(m=>m.category==='Battle'||m.encounter);
 useEffect(()=>{if(!needsBattle||battle)return;const url=battleUrl(game);
  const controller=new AbortController();setBattleFailure(null);
  loadJson<Battle>(url,{signal:controller.signal}).then(b=>{if(!b.species||!b.moves||!b.chart||!b.natures||!b.abilities)throw new Error('Invalid battle data');setBattles(all=>({...all,[url]:b}))}).catch(e=>{if(!controller.signal.aborted){setBattleFailure(url);console.error('No se pudieron cargar los datos de combate',e)}});
  return()=>controller.abort();
 },[needsBattle,battle,game,battleAttempt]);
 // Solo si las reglas del juego los tienen (en Gen 1 no hay descripciones).
 useEffect(()=>{if(tab!=='team'||moveText||!moveTextSrc)return;
  const controller=new AbortController();setMoveTextFailure(null);
  loadJson<Record<string,{en:string;es:string}>>(moveTextSrc,{signal:controller.signal}).then(texts=>{if(!texts||typeof texts!=='object'||Array.isArray(texts)||Object.values(texts).some(text=>!text||typeof text.en!=='string'||typeof text.es!=='string'))throw new Error('Invalid move descriptions');setMoveText(texts)}).catch(e=>{if(!controller.signal.aborted){setMoveTextFailure(moveTextSrc);console.error('No se pudo cargar la descripcion de los ataques',e)}});
  return()=>controller.abort();
 },[tab,moveText,moveTextSrc,moveTextAttempt]);

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
 const have=useMemo(()=>haveNames(world?.markers??[],done),[world,done]);
 // Lo que ya elegiste en su lugar (otro inicial, el otro fosil): solo por intercambio.
 const taken=useMemo(()=>{const byId=new Map((world?.markers??[]).map(m=>[m.id,m]));
  return choicesTaken(world?.choices??[],id=>{const m=byId.get(id);return !!m&&done.includes(m.uid)})},[world,done]);
 // La rejilla de los mapas (nav.json): para las rutas y para saber a que llegas.
 const [navData,setNavData]=useState<{url:string;w:RouteWorld}|null>(null);
 const navUrl=`${game.data}/nav.json`,navWorld=navData?.url===navUrl?navData.w:null;
 useEffect(()=>{if(!world||navWorld)return;const controller=new AbortController();setNavFailure(null);
  loadJson<Nav>(navUrl,{signal:controller.signal}).then(n=>{if(!n.maps||!n.moves||!Array.isArray(n.starts)||!Array.isArray(n.ferry))throw new Error('Invalid navigation data');const w=prepare(n);if(!controller.signal.aborted)setNavData({url:navUrl,w})}).catch(e=>{if(!controller.signal.aborted){setNavFailure(navUrl);console.error('No se pudo cargar la rejilla de rutas',e)}});
  return()=>controller.abort();
 },[world,navWorld,navUrl,navAttempt]);
 // Zonas y mapas que la historia aun no abre con lo que tienes (guardias, Snorlax...).
 const storyLeft=useCallback((owned:Set<string>)=>(world?.gates??[]).filter(x=>!x.id.startsWith('hm-')&&x.needs.some(n=>!owned.has(n))),[world]);
 const closedBy=useCallback((owned:Set<string>)=>{const story=storyLeft(owned);
  return (map:string)=>{const z=navWorld?.grids.get(map)?.m.zone;return story.find(x=>!!x.maps?.includes(map)||(!!z&&!!x.zones?.includes(z)))??null}},[storyLeft,navWorld]);
 // Casilla de cada marcador en la rejilla, y el arbol de caminos con todo abierto.
 const targets=useMemo(()=>{const out=new Map<string,Target>();if(navWorld&&world)for(const m of world.markers)if(m.area&&m.at){const x=targetAt(navWorld,m.area,m.at,PEOPLE.includes(m.category));if(x)out.set(m.id,x)}return out},[navWorld,world]);
 const tree=useMemo(()=>navWorld?openTree(navWorld):null,[navWorld]);
 // El mismo arbol con solo tus MO (sin cierres de la historia), por firma de MO.
 const treeCache=useRef<{url:string;trees:Map<string,Tree>}>({url:'',trees:new Map()});
 const treeWith=useCallback((can:Set<string>)=>{
  if(!navWorld)return null;
  if(treeCache.current.url!==navUrl)treeCache.current={url:navUrl,trees:new Map()};
  const sig=[...can].sort().join();let hit=treeCache.current.trees.get(sig);
  if(!hit){hit=openTree(navWorld,can);treeCache.current.trees.set(sig,hit)}
  return hit;
 },[navWorld,navUrl]);
 // Lo que pisas desde el inicio con lo que tienes. Solo cambia al tener otra MO
 // o abrir un paso de la historia: se guarda por esa firma.
 const reachCache=useRef<{url:string;tiles:Map<string,{tiles:Set<number>;maps:Set<number>}>}>({url:'',tiles:new Map()});
 const reachFor=useCallback((owned:Set<string>)=>{
  if(!navWorld)return null;
  if(reachCache.current.url!==navUrl)reachCache.current={url:navUrl,tiles:new Map()};
  const can=movesYouHave(navWorld.nav,owned),story=storyLeft(owned),closed=closedBy(owned);
  const sig=[...can].sort().join()+'|'+story.map(x=>x.id).join();
  let hit=reachCache.current.tiles.get(sig);
  if(!hit){const tiles=reachTiles(navWorld,can,m=>!!closed(m));hit={tiles,maps:new Set([...tiles].map(k=>Math.floor(k/65536)))};reachCache.current.tiles.set(sig,hit)}
  return {...hit,can,closed};
 },[navWorld,navUrl,storyLeft,closedBy]);
 // Pokemon que tienes (para los intercambios): marcados, registrados en la
 // Pokedex o en tu equipo. Se relee al volver de esas pestanas.
 const [speciesRev,setSpeciesRev]=useState(0);
 useEffect(()=>setSpeciesRev(r=>r+1),[tab]);
 const ownedSpecies=useMemo(()=>{
  const out=new Set<string>();if(!world||speciesRev<0)return out;
  for(const m of world.markers)if(['Pokémon','In-Game Gift Pokémon','In-Game Trade'].includes(m.category)&&done.includes(m.uid))out.add(m.name);
  try{
   const nums=new Set<number>([...JSON.parse(localStorage.getItem(game.storage.dex)||'[]'),...(JSON.parse(localStorage.getItem(`${game.storage.done}-team`)||'[]') as {n:number}[]).map(x=>x.n)]);
   for(const sp of world.dex.species)if(nums.has(sp.n))out.add(sp.name);
  }catch{}
  return out;
 },[world,done,game,speciesRev]);
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
 useEffect(()=>setUnlock(null),[game]);
 // Sin marcar ni bloqueado: lo que de verdad queda por hacer.
 const pending=useCallback((m:Marker)=>!done.includes(m.uid)&&!skipSet.has(m.uid)&&!unavailable(m),[done,skipSet,unavailable]);
 const left=useMemo(()=>{
  const n=new Map<string,number>();
  for(const m of world?.markers??[])if(m.area&&!game.untracked.includes(m.category)&&pending(m))n.set(m.area,(n.get(m.area)??0)+1);
  return n;
 },[world,game.untracked,pending]);
 const finished=useCallback((from:string,to:string)=>behind(from,to).every(a=>!left.get(a)),[behind,left]);

 useEffect(()=>{
  // Un solo mapa para todos los juegos: al cambiar de juego solo cambia la imagen.
  if(!el.current||map.current)return;let disposed=false;setMapFailure(false);
  import('leaflet').then(mod=>{
   if(disposed||!el.current)return;const L=mod.default;leaflet.current=L;
   const m=L.map(el.current,{crs:L.CRS.Simple,zoomSnap:.25,zoomDelta:.5,maxZoom:2,zoomControl:false,attributionControl:false});
   L.control.zoom({position:'bottomright'}).addTo(m);
   // Pixelado nitido solo al acercar; al alejar, el suavizado evita el muare.
   m.on('zoomend',()=>{el.current?.classList.toggle('crisp',m.getZoom()>=0);el.current?.classList.toggle('far',m.getZoom()<-1)});
   // Ficha de un marcador: un popup junto al pin; React pinta su contenido.
   const box=document.createElement('div');L.DomEvent.disableClickPropagation(box);
   popup.current=L.popup({closeButton:false,closeOnClick:false,autoClose:false,className:'marker-pop',offset:[0,-6],autoPan:false,maxWidth:390}).setContent(box);
   // Leaflet cierra los popups en el 'preclick' de cualquier clic, tambien sobre
   // un pin: al volver a pulsar el mismo pin se cerraba y no se reabria. Se
   // cierra solo con un clic en el mapa (fuera de los pines) o con Escape.
   // Eligiendo donde estas (Como llegar), el toque marca el sitio y no cierra nada.
   m.on('click',()=>{setSelected(null);setStack(null)});setPopupBox(box);
   layer.current=L.layerGroup().addTo(m);map.current=m;setMapReady(true);
  }).catch(e=>{if(!disposed){setMapFailure(true);console.error('No se pudo cargar Leaflet',e)}});
  return()=>{disposed=true;map.current?.remove();map.current=null};
 },[mapAttempt]);

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
 },[view,area,mapReady,tab]);

 const shown=useMemo(()=>(area?inArea.get(area.id)??[]:[]).filter(m=>active.includes(m.category)&&!(hideUnavailable&&unavailable(m))),[area,inArea,active,hideUnavailable,unavailable]);
 // Muchos objetos comparten punto exacto (hasta 14): se pintan como un solo pin
 // con su recuento, o el de arriba taparia a los demas.
 const stacks=useMemo(()=>{const g=new Map<string,{at:Pt;items:Marker[]}>();for(const m of shown){const k=m.at!.join(','),s=g.get(k);if(s)s.items.push(m);else g.set(k,{at:m.at!,items:[m]})}return [...g.values()]},[shown]);
 useEffect(()=>setStack(null),[view.area]);
 useEffect(()=>{if(!about)return;const close=(e:KeyboardEvent)=>e.key==='Escape'&&setAbout(false);addEventListener('keydown',close);return()=>removeEventListener('keydown',close)},[about]);
 useEffect(()=>{if(!stack&&!selected&&!encounterZone)return;const close=(e:KeyboardEvent)=>{if(e.key!=='Escape')return;if(selected)setSelected(null);else if(stack)setStack(null);else setEncounterZone(null)};addEventListener('keydown',close);return()=>removeEventListener('keydown',close)},[stack,selected,encounterZone]);
 const counts=useMemo(()=>{const c:Record<string,number>={};(area?inArea.get(area.id)??[]:[]).forEach(m=>c[m.category]=(c[m.category]??0)+1);return c},[area,inArea]);

 // Al salir de una region se guarda la vista para volver exactamente alli.
 const saved=useRef<{region:string;restore:NonNullable<View['restore']>}|null>(null);
 const saveRegion=()=>{const m=map.current;if(m&&area?.kind==='region'){const c=m.getCenter();saved.current={region:area.id,restore:{center:[c.lat,c.lng],zoom:m.getZoom()}}}};
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
 useEffect(()=>setRouteTo(null),[game]);
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
 const keepZoom=useCallback((to:string)=>{const z=map.current?.getZoom();return to===area?.id&&z!==undefined?Math.max(z,-.5):.5},[area]);
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
  const L=leaflet.current,g=layer.current;if(!L||!g||!world||!area)return;g.clearLayers();
  // El camino de "Como llegar" en esta area: linea azul con borde blanco, y un
  // punto donde empieza. Al cruzar a otra zona por el borde, la linea sigue.
  const items=trip?.draw??[];
  // La linea solo une casillas vecinas (un salto son dos): si el camino entra en
  // un edificio y sale por otra puerta, la linea se corta en vez de cruzarlo.
  const pieces=(pts:[number,number][])=>pts.reduce<[number,number][][]>((out,p,i)=>{
   const q=pts[i-1];if(!q||Math.hypot(p[0]-q[0],p[1]-q[1])>40)out.push([p]);else out[out.length-1].push(p);return out},[]);
  items.forEach((it,i)=>{
   if(it.area!==area.id)return;
   const prev=items[i-1];
   for(const seg of pieces(prev&&prev.area===it.area&&it.enter==='edge'?[prev.pts[prev.pts.length-1],...it.pts]:it.pts)){
    const pts=seg.map(ll);
    L.polyline(pts,{color:'#fff',weight:10,opacity:.95,interactive:false,lineCap:'round',lineJoin:'round'}).addTo(g);
    L.polyline(pts,{color:'#2d6df6',weight:5,opacity:1,interactive:false,lineCap:'round',lineJoin:'round'}).addTo(g);
    // Flechas sobre la linea cada tres casillas: hacia donde se camina.
    let run=24;
    for(let j=1;j<seg.length;j++){
     const [ax,ay]=seg[j-1],[bx,by]=seg[j],len=Math.hypot(bx-ax,by-ay);
     for(;run<=len;run+=48){const f=run/len,deg=Math.atan2(by-ay,bx-ax)*180/Math.PI;
      L.marker(ll([ax+(bx-ax)*f,ay+(by-ay)*f]),{icon:L.divIcon({className:'pin-wrap',html:`<span class="route-arrow" style="transform:rotate(${deg}deg)"></span>`,iconSize:[12,12],iconAnchor:[6,6]}),interactive:false,zIndexOffset:-100}).addTo(g)}
     run-=len;
    }
   }
  });
  // El siguiente objetivo, con una bandera sobre su pin.
  if(nextGoal?.area===area.id&&nextGoal.at)L.marker(ll(nextGoal.at),{icon:L.divIcon({className:'pin-wrap',html:`<span class="goal-flag">${FLAG_SVG}</span>`,iconSize:[28,28],iconAnchor:[4,30]}),interactive:false,zIndexOffset:900}).addTo(g);
  // Donde el camino quita un obstaculo: su MO encima (tijeras, roca, puno).
  const ACT:Record<string,string>={cut:'✂',strength:'✊',smash:'⛏',flute:'🎵',switch:'🔘',plate:'🪨'};
  for(const it of items)if(it.area===area.id)for(const a of it.acts)
   L.marker(ll(a.at),{icon:L.divIcon({className:'pin-wrap',html:`<span class="route-act" title="${t(MOVE_KEY[a.how]??'moveCut')}">${ACT[a.how]??''}</span>`,iconSize:[24,24],iconAnchor:[12,12]}),interactive:false,zIndexOffset:400}).addTo(g);
  if(items[0]?.area===area.id)L.circleMarker(ll(items[0].pts[0]),{radius:8,color:'#fff',weight:3,fillColor:'#2d6df6',fillOpacity:1,interactive:false}).addTo(g);
  for(const {at,items} of stacks){
   // Verde si todo esta hecho; gris con candado si lo que falta aun no se puede hacer.
   // Saltado cuenta como terminado, con una raya en vez del check.
   const completed=items.every(m=>done.includes(m.uid)||skipSet.has(m.uid)),skip=completed&&items.some(m=>skipSet.has(m.uid)),locked=!completed&&!items.some(pending);
   // Varias categorias en el mismo punto: el pin se reparte en sectores de color.
   const colors=[...new Set(items.map(m=>colorOf(m.category)))];
   const fill=colors.length>1?`conic-gradient(${colors.map((c,i)=>`${c} ${i*100/colors.length}% ${(i+1)*100/colors.length}%`).join(',')})`:colors[0];
   // Un pin sobre una puerta (los pasos de historia en una salida) se corre a un
   // costado, arriba a la derecha: asi se ven y se tocan los dos.
   const onDoor=world.warps.some(w=>w.area===area.id&&Math.abs(w.at[0]-at[0])<12&&Math.abs(w.at[1]-at[1])<12);
   const icon=L.divIcon({className:`pin-wrap ${onDoor?'pin-aside':''}`,html:`<span class="pin ${skip?'pin-skip':completed?'pin-done':locked?'pin-locked':''}" style="--pin:${fill}">${skip?'–':completed?'✓':locked?LOCK_SVG:''}</span>${items.length>1?`<b class="pin-count">${items.length}</b>`:''}`,iconSize:[20,20],iconAnchor:onDoor?[-6,26]:[10,10]});
   L.marker(ll(at),{icon,zIndexOffset:onDoor?600:0}).on('click',()=>{if(items.length>1){setSelected(null);setStack(items)}else{setStack(null);setSelected(items[0])}}).addTo(g);
  }
  // Puertas: hacia un interior (o a otro piso) se entra; hacia una region se sale.
  const door=(cls:string,text='')=>L.divIcon({className:'pin-wrap',html:`<span class="door ${cls}">${text}</span>`,iconSize:[26,26],iconAnchor:[13,13]});
  // Dentro de un ascensor, una puerta por piso con su nombre (B4F, 5F...).
  const lift=/ELEVATOR/.test(area.id);
  // La puerta por la que el camino sale de aqui (en un ascensor, el piso al que
  // ir): la mas cercana al ultimo punto del tramo, hacia el area siguiente.
  const exits=new Set<object>();
  items.forEach((it,i)=>{
   const nx=items[i+1];if(it.area!==area.id||!nx||nx.area===area.id||nx.enter!=='door')return;
   const end=it.pts[it.pts.length-1],cands=world.warps.filter(w=>w.area===area.id&&w.to===nx.area);
   const best=cands.reduce<typeof cands[number]|null>((b,w)=>!b||Math.hypot(w.at[0]-end[0],w.at[1]-end[1])<Math.hypot(b.at[0]-end[0],b.at[1]-end[1])?w:b,null);
   if(best)exits.add(best);
  });
  for(const w of world.warps)if(w.area===area.id){
   const toRegion=isRegion(w.to),dest=areaById.get(w.to);
   const shut=!lift&&doorLocked(w.area,w.at);
   L.marker(ll(w.at),{icon:door(`${shut?'locked':toRegion?'exit':finished(w.area,w.to)?'done':''} ${lift?'lift':''} ${exits.has(w)?'next':''}`,lift?place(dest?.label??'').split(' ').pop():''),title:`${toRegion?t('exitTo',{place:place(placeAt(w.to,w.toAt)??dest?.label??'')}):`${place(dest?.label??t('interior'))}${finished(w.area,w.to)?` · ${t('nothingLeft')}`:''}`}${shut?` · ${t('unavailable')}`:''}`,zIndexOffset:500})
    .on('click',()=>toRegion?nav.current.exitTo(w.to,w.toAt):nav.current.enter(w.to,{at:w.at,toAt:w.toAt})).addTo(g);
  }
  if(arrival&&arrival.area===area.id)L.marker(ll(arrival.at),{icon:L.divIcon({className:'arrive',html:'<span></span><i></i>',iconSize:[0,0]}),title:arrival.label,interactive:false,zIndexOffset:1000}).addTo(g);
 },[stacks,done,skipSet,pending,mapReady,world,area,areaById,arrival,isRegion,placeAt,finished,t,place,trip,doorLocked,nextGoal]);

 useLayoutEffect(()=>{
  const m=map.current,p=popup.current;if(!m||!p)return;
  const at=(selected??stack?.[0])?.at,where=(selected??stack?.[0])?.area;
  if(at&&where===area?.id){if(!m.hasLayer(p))p.setLatLng(ll(at)).openOn(m);else p.setLatLng(ll(at))}
  else if(m.hasLayer(p))m.closePopup(p);
 },[selected,stack,area,mapReady]);
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
 },[selected,stack,done,area,battle]);
 const toggleGroup=(name:string)=>setActive(a=>a.includes(name)?a.filter(x=>x!==name):[...a,name]);
 const saveDone=(update:(old:number[])=>number[])=>setDone(old=>{const n=update(old);try{localStorage.setItem(game.storage.done,JSON.stringify(n))}catch{}return n});
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
 const setSkip=(uids:number[],on:boolean)=>setSkipped(old=>{const n=on?[...new Set([...old,...uids])]:old.filter(x=>!uids.includes(x));try{localStorage.setItem(`${game.storage.done}-skip`,JSON.stringify(n))}catch{}return n});
 const skipOne=(m:Marker)=>{setSkip([m.uid],true);setToast(t('skipToast'))};
 const unskip=(m:Marker)=>setSkip([m.uid],false);
 // La Pokedex marca o desmarca de una vez todas las entradas de una especie.
 const doneKey=game.storage.done;
 const setMany=useCallback((uids:number[],on:boolean)=>setDone(old=>{const n=on?[...new Set([...old,...uids])]:old.filter(x=>!uids.includes(x));try{localStorage.setItem(doneKey,JSON.stringify(n))}catch{}return n}),[doneKey]);
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
  :tab==='team'&&moveTextFailure===moveTextSrc&&!moveText?{message:t('loadMoveTextFailed'),retry:()=>setMoveTextAttempt(n=>n+1)}
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
 return <main><header><button className="brand" onClick={()=>setHome(true)} aria-label={t('home')} title={t('home')}><i><MapIcon/></i><b>ROUTE 151<small>{t('companion',{game:game.title})}</small></b></button>
 <label className="game-select"><span className="sr-only">{t('game')}</span><select value={game.id} onChange={e=>pickGame(e.target.value)} aria-label={t('game')}>{GAMES.map(g=><option key={g.id} value={g.id}>{g.short}</option>)}</select><ChevronDown/></label>
 <label className="game-select lang-select"><span className="sr-only">{t('language')}</span><select value={lang} onChange={e=>pickLang(e.target.value as Lang)} aria-label={t('language')}>{LANGS.map(l=><option key={l} value={l}>{LANG_NAMES[l]}</option>)}</select><ChevronDown/></label>
 {tab==='mapa'&&<div className="map-controls"><button className="location-button" onClick={()=>setLocations(!locations)} aria-expanded={locations}>{here?<DoorOpen/>:<MapPin/>}<span>{here?place(here.label):area?<>{place(area.label)}<small>{t('allAreas')}</small></>:t('loading')}</span><ChevronDown/></button><button className={`layers-button ${active.length<groups.length?'filtered':''}`} onClick={()=>setLayersOpen(v=>!v)} aria-pressed={layersOpen} aria-label={t('mapLayers')}><Layers/></button></div>}
 <nav>{tabs.map(([k,t])=><button key={k} className={tab===k?'on':''} onClick={()=>setTab(k)} aria-current={tab===k?'page':undefined}>{t}</button>)}</nav><div className="counter"><span>{t('completed',{n:completed})}</span><i><em style={{width:`${pct}%`}}/></i><b>{pct}%</b></div><button className={`about-button refresh-button ${refreshing?'spin':''}`} onClick={()=>{setRefreshing(true);void refreshApp()}} aria-label={t('refreshApp')} title={t('refreshApp')}><RefreshCw/></button><button className="about-button" onClick={()=>setAbout(true)} aria-label={t('credits')}><Info/></button></header>
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
 {encounterZone&&!selected&&!stack&&<div className="modal-backdrop" role="presentation" onClick={e=>{if(e.target===e.currentTarget)setEncounterZone(null)}}><dialog open className="drawer encounter-drawer" aria-modal="true" aria-label={place(encounterZone.name)}><button className="close" onClick={()=>setEncounterZone(null)} aria-label={t('close')}><X/></button><small>{t('encountersWild').toUpperCase()}</small><h2>{place(encounterZone.name)}</h2><p>{t('availableHere',{n:encounterZone.pokemon.length})}</p><div className="encounter-list">{encounterZone.pokemon.map(mon=>{const variants=mon.areas.flatMap(a=>a.encounters);const min=Math.min(...variants.map(v=>v.minLevel)),max=Math.max(...variants.map(v=>v.maxLevel)),chance=Math.max(...variants.map(v=>v.chance));return <article key={mon.id}><img src={mon.sprite} alt=""/><div><b>{mon.name.replace(/-/g,' ')}</b><span>{t('encounterRate',{levels:`${min}${max!==min?`–${max}`:''}`,chance,methods:[...new Set(variants.map(v=>method(METHODS[v.method]??v.method)))].join(' · ')})}</span></div></article>})}</div></dialog></div>}
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
   ?<RankingView dex={world.dex} battle={battle} byId={byId} done={done} dexKey={game.storage.dex} storageKey={`${game.storage.done}-team`} switcher={switcher} tr={tr}/>
   :<PokedexView dex={world.dex} byId={byId} done={done} setMany={setMany} onShow={showOnMap} game={game.short} storageKey={game.storage.dex} switcher={switcher} tr={tr}/>;
 })()}
 {tab==='team'&&(world?battleFailed?<div className="listview loading-list">{battleNotice}</div>:<TeamView dex={world.dex} battle={battle} moveText={moveTextSrc?moveText:null} storageKey={`${game.storage.done}-team`} suggestedLevel={suggestedLevel} tr={tr}/>:<div className="listview loading-list">{worldNotice}</div>)}
 {tour&&!home&&<Tour onClose={closeTour} tr={tr}/>}
 {about&&<div className="modal-backdrop" role="presentation" onClick={e=>{if(e.target===e.currentTarget)setAbout(false)}}><dialog open className="modal" aria-modal="true" aria-label={t('credits')}><button className="close" onClick={()=>setAbout(false)} aria-label={t('close')}><X/></button><BackupBox tr={tr}/><button className="tour-again" onClick={()=>{setAbout(false);setTour(true)}}>{t('tourAgain')}</button><button className="tour-again reset-game" onClick={()=>resetGame()}><RotateCcw/>{t('resetGame',{game:game.title})}</button><small>{t('about')}</small><h2>{t('credits')}</h2><Credits game={game.id} tr={tr}/></dialog></div>}
 <nav className="tabbar">{tabs.map(([k,t,Icon])=><button key={k} className={tab===k?'on':''} onClick={()=>setTab(k)} aria-current={tab===k?'page':undefined}><Icon/>{t}</button>)}</nav>
 {home&&<GameHome current={game.id} last={last} lang={lang} onLang={pickLang} onPick={choose} tr={tr}/>}
 </main>
}
