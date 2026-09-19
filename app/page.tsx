'use client';
import {Fragment,useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import type {Map as LeafletMap,LayerGroup,ImageOverlay,Popup} from 'leaflet';
import {ArrowLeft,BookOpen,Check,ChevronDown,DoorOpen,Info,Layers,ListChecks,Map as MapIcon,MapPin,Search,Sparkles,X} from 'lucide-react';
import {Credits,Figure,LAYER_NAMES,colorOf,groupsOf,type Encounter,type Marker} from './shared';
import {ChecklistView,PokedexView} from './lists';
import {GAMES,METHODS,type Area,type EncounterZone,type Place,type Pt,type World} from './games';

type View={area:string;focus?:Pt;zoom?:number;restore?:{center:[number,number];zoom:number}};
const levels=(e:Encounter)=>`Lv. ${e.min}${e.max!==e.min?`–${e.max}`:''}`;
// CRS.Simple: x a la derecha, y hacia arriba; la imagen crece hacia abajo.
const ll=(p:Pt):[number,number]=>[-p[1],p[0]];
// "Silph Co. 7F" -> "7F": quita las palabras que comparten todos los pisos.
const shortLabels=(list:Area[])=>{const words=list.map(f=>f.label.split(' '));let n=0;while(words.every(w=>w.length>n+1&&w[n]===words[0][n]))n++;return new Map(list.map((f,i)=>[f.id,words[i].slice(n).join(' ')]))};
const GAME_KEY='ruta151-game';

export default function Home(){
 const popup=useRef<Popup|null>(null),[popupBox,setPopupBox]=useState<HTMLDivElement|null>(null);
 const el=useRef<HTMLDivElement>(null),map=useRef<LeafletMap|null>(null),layer=useRef<LayerGroup|null>(null),overlay=useRef<ImageOverlay|null>(null),shownArea=useRef<string|null>(null),leaflet=useRef<typeof import('leaflet')|null>(null);
 const [mapReady,setMapReady]=useState(false);
 const [gameId,setGameId]=useState(GAMES[0].id),[world,setWorld]=useState<World|null>(null);
 const game=GAMES.find(g=>g.id===gameId)??GAMES[0],groups=groupsOf(game.id);
 const [tab,setTab]=useState<'mapa'|'checklist'|'pokedex'>('mapa'),[view,setView]=useState<View>({area:''});
 const [active,setActive]=useState<string[]>(groups.map(g=>g[0])),[selected,setSelected]=useState<Marker|null>(null),[stack,setStack]=useState<Marker[]|null>(null),[done,setDone]=useState<number[]>([]),[query,setQuery]=useState(''),[searching,setSearching]=useState(false),[locations,setLocations]=useState(false),[about,setAbout]=useState(false),[layersOpen,setLayersOpen]=useState(false);
 const [encounterZone,setEncounterZone]=useState<EncounterZone|null>(null);

 // El juego elegido se recuerda; ?game=firered en la URL manda.
 useEffect(()=>{let saved:string|null=null;try{saved=localStorage.getItem(GAME_KEY)}catch{}const id=[new URLSearchParams(location.search).get('game'),saved].find(x=>GAMES.some(g=>g.id===x));if(id)setGameId(id)},[]);
 // Cada juego carga sus datos y su progreso, y empieza en su primera region.
 useEffect(()=>{
  let live=true;setWorld(null);setSelected(null);setStack(null);setEncounterZone(null);setLocations(false);setQuery('');saved.current=null;setArrival(null);
  setActive(groupsOf(game.id).map(g=>g[0]).filter(n=>!game.hidden.includes(n)));
  try{setDone(JSON.parse(localStorage.getItem(game.storage.done)||'[]'))}catch{setDone([])}
  game.load().then(w=>{if(!live)return;setWorld(w);setView({area:w.areas.find(a=>a.kind==='region')?.id??w.areas[0].id})}).catch(e=>console.error('No se pudo cargar',game.id,e));
  return()=>{live=false};
 },[game]);
 const pickGame=(id:string)=>{setGameId(id);try{localStorage.setItem(GAME_KEY,id)}catch{}};

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

 useEffect(()=>{
  // Un solo mapa para todos los juegos: al cambiar de juego solo cambia la imagen.
  if(!el.current||map.current)return;let disposed=false;
  import('leaflet').then(mod=>{
   if(disposed||!el.current)return;const L=mod.default;leaflet.current=L;
   const m=L.map(el.current,{crs:L.CRS.Simple,zoomSnap:.25,zoomDelta:.5,maxZoom:2,zoomControl:false,attributionControl:false});
   L.control.zoom({position:'bottomright'}).addTo(m);
   // Pixelado nitido solo al acercar; al alejar, el suavizado evita el muare.
   m.on('zoomend',()=>{el.current?.classList.toggle('crisp',m.getZoom()>=0);el.current?.classList.toggle('far',m.getZoom()<-1)});
   // Ficha de un marcador: un popup junto al pin; React pinta su contenido.
   const box=document.createElement('div');L.DomEvent.disableClickPropagation(box);
   popup.current=L.popup({closeButton:false,className:'marker-pop',offset:[0,-6],autoPanPaddingTopLeft:[20,130],autoPanPaddingBottomRight:[20,20],maxWidth:300}).setContent(box);
   m.on('popupclose',()=>{setSelected(null);setStack(null)});setPopupBox(box);
   layer.current=L.layerGroup().addTo(m);map.current=m;setMapReady(true);
  }).catch(e=>console.error('No se pudo cargar Leaflet',e));
  return()=>{disposed=true;map.current?.remove();map.current=null};
 },[]);

 // Cambiar de area cambia la imagen; cada vista decide donde se posa la camara.
 useEffect(()=>{
  const L=leaflet.current,m=map.current;if(!L||!m||!area)return;
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
 },[view,area,mapReady]);

 const q=query.trim().toLowerCase();
 const shown=useMemo(()=>(area?inArea.get(area.id)??[]:[]).filter(m=>active.includes(m.category)&&`${m.name} ${m.location}`.toLowerCase().includes(q)),[area,inArea,active,q]);
 // Muchos objetos comparten punto exacto (hasta 14): se pintan como un solo pin
 // con su recuento, o el de arriba taparia a los demas.
 const stacks=useMemo(()=>{const g=new Map<string,{at:Pt;items:Marker[]}>();for(const m of shown){const k=m.at!.join(','),s=g.get(k);if(s)s.items.push(m);else g.set(k,{at:m.at!,items:[m]})}return [...g.values()]},[shown]);
 useEffect(()=>setStack(null),[view.area]);
 useEffect(()=>{if(!about)return;const close=(e:KeyboardEvent)=>e.key==='Escape'&&setAbout(false);addEventListener('keydown',close);return()=>removeEventListener('keydown',close)},[about]);
 useEffect(()=>{if(!stack&&!selected&&!encounterZone)return;const close=(e:KeyboardEvent)=>{if(e.key!=='Escape')return;if(selected)setSelected(null);else if(stack)setStack(null);else setEncounterZone(null)};addEventListener('keydown',close);return()=>removeEventListener('keydown',close)},[stack,selected,encounterZone]);
 const results=useMemo(()=>q.length<2?[]:(world?.markers??[]).filter(m=>active.includes(m.category)&&`${m.name} ${m.location}`.toLowerCase().includes(q)).slice(0,8),[world,active,q]);
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
  const label=areaById.get(id)?.label??'Interior',from=door&&area?.kind==='region'?placeAt(area.id,door.at):undefined;
  saveRegion();setView(door?{area:id,focus:door.toAt,zoom:-99}:{area:id});setSelected(null);setEncounterZone(null);setLocations(false);
  setArrival(door?{area:id,at:door.toAt,label:'You entered here'}:null);setToast(`Entered ${label}${from?` from ${from}`:''}`);
 };
 const leave=()=>{
  if(!here)return;setSelected(null);
  const exit=exitOf(here),back=saved.current?.region===exit.region?saved.current:null;
  setView(back?{area:back.region,restore:back.restore}:exit.at?{area:exit.region,focus:exit.at}:{area:exit.region});
  saved.current=null;
  setArrival(exit.at?{area:exit.region,at:exit.at,label:'You left here'}:null);
  const to=exit.at&&placeAt(exit.region,exit.at);setToast(`Left ${here.label} to ${to??areaById.get(exit.region)?.label}`);
 };
 const exitTo=(region:string,to:Pt)=>{
  setSelected(null);saved.current=null;setView({area:region,focus:to});
  setArrival({area:region,at:to,label:'You left here'});const place=placeAt(region,to);
  if(here)setToast(`Left ${here.label} to ${place??areaById.get(region)?.label}`);
 };
 const showRegion=(id:string)=>{setLocations(false);setSelected(null);setEncounterZone(null);setArrival(null);saved.current=null;setView({area:id});if(id!==area?.id)setToast(`Now in ${areaById.get(id)?.label}`)};
 const switchFloor=(id:string)=>{setSelected(null);setView({area:id});setArrival(null);setToast(`Now in ${areaById.get(id)?.label??'another floor'}`)};
 // El buscador abre la ficha; desde las listas solo se senala el objeto en el
 // mapa, con el mismo anillo parpadeante que marca por donde se entra.
 const reveal=(m:Marker,open=true)=>{setStack(null);setArrival(null);setSelected(null);if(!m.area||!m.at)return;if(m.area!==area?.id)saveRegion();setView({area:m.area,focus:m.at,zoom:.5});if(open)setSelected(m);else setArrival({area:m.area,at:m.at,label:m.name});setQuery('');setSearching(false)};
 const go=(loc:Place)=>{
  setLocations(false);setSelected(null);setEncounterZone(world?.zones.find(z=>z.name===loc.name)??null);
  if(!isRegion(loc.area)){saveRegion();setView({area:loc.area});setArrival(null);setToast(`Entered ${areaById.get(loc.area)?.label}`);return}
  saved.current=null;setArrival(null);setView(loc.at?{area:loc.area,focus:loc.at,zoom:-1}:{area:loc.area});
 };

 // Los pines llaman a la version mas reciente de enter/exitTo sin redibujarse
 // en cada render (se recrean con cada render).
 const nav=useRef({enter,exitTo});
 useEffect(()=>{nav.current={enter,exitTo}});
 useEffect(()=>{
  const L=leaflet.current,g=layer.current;if(!L||!g||!world||!area)return;g.clearLayers();
  for(const {at,items} of stacks){
   const completed=items.every(m=>done.includes(m.uid));
   // Varias categorias en el mismo punto: el pin se reparte en sectores de color.
   const colors=[...new Set(items.map(m=>colorOf(m.category)))];
   const fill=colors.length>1?`conic-gradient(${colors.map((c,i)=>`${c} ${i*100/colors.length}% ${(i+1)*100/colors.length}%`).join(',')})`:colors[0];
   const icon=L.divIcon({className:'pin-wrap',html:`<span class="pin ${completed?'pin-done':''}" style="--pin:${fill}">${completed?'✓':''}</span>${items.length>1?`<b class="pin-count">${items.length}</b>`:''}`,iconSize:[20,20],iconAnchor:[10,10]});
   L.marker(ll(at),{icon}).on('click',()=>{if(items.length>1){setSelected(null);setStack(items)}else{setStack(null);setSelected(items[0])}}).addTo(g);
  }
  // Puertas: hacia un interior (o a otro piso) se entra; hacia una region se sale.
  const door=(cls:string)=>L.divIcon({className:'pin-wrap',html:`<span class="door ${cls}"></span>`,iconSize:[26,26],iconAnchor:[13,13]});
  for(const w of world.warps)if(w.area===area.id){
   const toRegion=isRegion(w.to),dest=areaById.get(w.to);
   L.marker(ll(w.at),{icon:door(toRegion?'exit':''),title:toRegion?`Exit to ${placeAt(w.to,w.toAt)??dest?.label}`:dest?.label??'Interior',zIndexOffset:500})
    .on('click',()=>toRegion?nav.current.exitTo(w.to,w.toAt):nav.current.enter(w.to,{at:w.at,toAt:w.toAt})).addTo(g);
  }
  if(arrival&&arrival.area===area.id)L.marker(ll(arrival.at),{icon:L.divIcon({className:'arrive',html:'<span></span><i></i>',iconSize:[0,0]}),title:arrival.label,interactive:false,zIndexOffset:1000}).addTo(g);
 },[stacks,done,mapReady,world,area,areaById,arrival,isRegion,placeAt]);

 useEffect(()=>{
  const m=map.current,p=popup.current;if(!m||!p)return;
  const at=(selected??stack?.[0])?.at,where=(selected??stack?.[0])?.area;
  if(at&&where===area?.id){if(!m.hasLayer(p))p.setLatLng(ll(at)).openOn(m);else p.setLatLng(ll(at))}
  else if(m.hasLayer(p))m.closePopup(p);
 },[selected,stack,area,mapReady]);
 // Leaflet no se entera de que React cambio el contenido: se recoloca a mano.
 useEffect(()=>{popup.current?.update()},[selected,stack,done]);
 const toggleGroup=(name:string)=>setActive(a=>a.includes(name)?a.filter(x=>x!==name):[...a,name]);
 const saveDone=(update:(old:number[])=>number[])=>setDone(old=>{const n=update(old);try{localStorage.setItem(game.storage.done,JSON.stringify(n))}catch{}return n});
 const toggleDone=(uid:number)=>saveDone(old=>old.includes(uid)?old.filter(x=>x!==uid):[...old,uid]);
 // La Pokedex marca o desmarca de una vez todas las entradas de una especie.
 const doneKey=game.storage.done;
 const setMany=useCallback((uids:number[],on:boolean)=>setDone(old=>{const n=on?[...new Set([...old,...uids])]:old.filter(x=>!uids.includes(x));try{localStorage.setItem(doneKey,JSON.stringify(n))}catch{}return n}),[doneKey]);
 const tracked=useMemo(()=>new Set((world?.markers??[]).filter(m=>!game.untracked.includes(m.category)).map(m=>m.uid)),[world,game]);
 const completed=done.filter(uid=>tracked.has(uid)).length;
 const pct=tracked.size?Math.round(completed/tracked.size*100):0;
 // El mapa sigue montado bajo las listas; al volver, Leaflet recalcula su tamaño.
 useEffect(()=>{if(tab==='mapa')setTimeout(()=>map.current?.invalidateSize(),0)},[tab]);
 const showOnMap=(m:Marker)=>{setTab('mapa');reveal(m,false)};
 const detail=(m:Marker)=>{const e=m.encounter;return e?`${levels(e)} · up to ${e.chance}% · ${e.methods.join(' · ')}`:m.detail??null};
 const listed=useMemo(()=>world?world.markers.filter(m=>world.checklist.markers[m.id]):[],[world]);
 const tabs=([['mapa','Map',MapIcon],['checklist','Checklist',ListChecks],['pokedex','Pokédex',BookOpen]] as const);
 const areaName=(id?:string)=>id?areaById.get(id)?.label??'—':'—';
 // Ficha de un marcador: el lugar junto a la categoria si es corto.
 const shortPlace=(m:Marker)=>!!m.location&&m.location.length<=40;
 // Linea de detalle: niveles y probabilidad, equipo, lo que vende, lo que pide un
 // intercambio, o el texto largo de Yellow.
 // En un grupo el lugar va una vez en el titulo; cada fila, sin subtitulo.
 const popRow=(m:Marker,compact=false)=><div className="pop-item"><div className="pop-head">{!game.untracked.includes(m.category)&&<button className={`tick ${done.includes(m.uid)?'on':''}`} aria-label="Mark as completed" onClick={()=>toggleDone(m.uid)}>{done.includes(m.uid)&&<Check/>}</button>}<Figure m={m}/><div><b>{m.name}</b>{!compact&&<small>{m.encounter?`${m.category} · ${m.encounter.zone}`:shortPlace(m)?`${m.category} · ${m.location}`:m.category}</small>}</div></div>{popLine(m)&&<p>{popLine(m)}</p>}</div>;
 const popLine=(m:Marker)=>{const e=m.encounter;return e?`${levels(e)} · up to ${e.chance}% · ${e.methods.join(' · ')}`:m.detail??(shortPlace(m)?null:m.location||null)};
 // Donde esta un resultado de busqueda: su lugar exacto (FRLG), el texto de Yellow
 // si nombra un solo sitio ("Pewter Museum of Science"), o el lugar mas cercano.
 const resultPlace=(m:Marker)=>game.exactLocations||(m.location&&m.location.length<=40&&!/[,;(]/.test(m.location))?m.location:m.area&&m.at&&isRegion(m.area)?placeAt(m.area,m.at)??areaName(m.area):areaName(m.area);
 const exitRegion=here?exitOf(here).region:null;
 const floors=here?zoneFloors.get(here.zone??here.label)??[here]:[];
 return <main><header><div className="brand"><i><MapIcon/></i><b>ROUTE 151<small>{game.title} Companion</small></b></div>
 <label className="game-select"><span className="sr-only">Game</span><select value={game.id} onChange={e=>pickGame(e.target.value)} aria-label="Game">{GAMES.map(g=><option key={g.id} value={g.id}>{g.short}</option>)}</select><ChevronDown/></label>
 <nav>{tabs.map(([k,t])=><button key={k} className={tab===k?'on':''} onClick={()=>setTab(k)} aria-current={tab===k?'page':undefined}>{t}</button>)}</nav><div className="counter"><span>{completed} completed</span><i><em style={{width:`${pct}%`}}/></i><b>{pct}%</b></div><button className="about-button" onClick={()=>setAbout(true)} aria-label="Credits"><Info/></button></header>
 <section className="toolbar" hidden={tab!=='mapa'}><button className="location-button" onClick={()=>setLocations(!locations)}>{here?<DoorOpen/>:<MapPin/>}<span>{here?here.label:area?`${area.label} — all areas`:'Loading…'}</span><ChevronDown/></button><label><Search/><input value={query} onFocus={()=>setSearching(true)} onBlur={()=>setTimeout(()=>setSearching(false),150)} onChange={e=>{setQuery(e.target.value);setSearching(true)}} placeholder="Search Pokémon, items or places…"/></label><button className={`layers-button ${active.length<groups.length?'filtered':''}`} onClick={()=>setLayersOpen(v=>!v)} aria-pressed={layersOpen} aria-label="Map layers"><Layers/></button><span>{shown.length} markers here</span>
 {searching&&results.length>0&&<div className="search-results">{results.map(m=><button key={m.id} onMouseDown={e=>e.preventDefault()} onClick={()=>reveal(m)}><Figure m={m}/><span><b>{m.name}</b><small>{resultPlace(m)}</small></span></button>)}</div>}</section>
 <div className={`app ${layersOpen?'layers-open':''}`} hidden={tab!=='mapa'}><aside><h3>MAP LAYERS</h3>{groups.map(([name,Icon,color])=><button key={name} onClick={()=>toggleGroup(name)} className={active.includes(name)?'enabled':''}><i style={{'--color':color} as React.CSSProperties}>{active.includes(name)&&<Check/>}</i><Icon/><span>{LAYER_NAMES[name]??name}</span><b>{counts[name]??0}</b></button>)}<div className="source"><Sparkles/><p><b>Separate maps</b>{regions.map(r=>r.label).join(' and ')} and every dungeon have their own map. Enter through the yellow doors.</p></div></aside>
 <div className="map-stage"><div ref={el} className="leaflet-map"/>
 {here&&<div className="floorbar"><button onClick={leave}><ArrowLeft/>{areaById.get(exitRegion??'')?.label??'Back'}</button>{floors.length>1&&floors.map(f=><button key={f.id} className={f.id===here.id?'on':''} onClick={()=>switchFloor(f.id)}>{short.get(f.id)||f.label}</button>)}</div>}
 {!here&&regions.length>1&&<div className="floorbar">{regions.map(r=><button key={r.id} className={r.id===area?.id?'on':''} onClick={()=>showRegion(r.id)}><MapIcon/>{r.label}</button>)}</div>}
 {toast&&<output className="toast" key={toast}>{toast}</output>}
 {!world&&<div className="loading">Loading {game.short}…</div>}<div className="map-note">Scroll or pinch to zoom · drag to explore</div></div>
 {locations&&world&&<div className="locations">{here&&<button className="leave-inline" onClick={()=>{leave();setLocations(false)}}><ArrowLeft/>Back to the {areaById.get(exitRegion??'')?.label} map</button>}
  {regions.map((r,i)=><Fragment key={r.id}><h3>{r.label.toUpperCase()}</h3><button className={area?.id===r.id?'current':''} onClick={()=>showRegion(r.id)}><MapIcon/>Whole map</button>{world.places.filter(p=>p.area===r.id||(i===0&&!isRegion(p.area))).map(loc=><button key={loc.name} onClick={()=>go(loc)}><MapPin/>{loc.name}</button>)}</Fragment>)}
  <h3>DUNGEONS &amp; INTERIORS</h3>{[...zoneFloors].map(([zone,list])=><div key={zone} className="dungeon"><h4>{zone}</h4>{list.map(f=><button key={f.id} onClick={()=>enter(f.id)} className={here?.id===f.id?'current':''}><DoorOpen/>{f.label}<b>{inArea.get(f.id)?.length??0}</b></button>)}</div>)}</div>}
 {popupBox&&(selected||stack)&&createPortal(selected?<div className="pop">{popRow(selected)}</div>:<div className="pop pop-list"><small className="pop-title">{stack!.length} at this spot · {areaName(stack![0].area)}</small>{stack!.map(m=><Fragment key={m.id}>{popRow(m,true)}</Fragment>)}</div>,popupBox)}
 {encounterZone&&!selected&&!stack&&<div className="modal-backdrop" role="presentation" onClick={e=>{if(e.target===e.currentTarget)setEncounterZone(null)}}><dialog open className="drawer encounter-drawer" aria-modal="true" aria-label={encounterZone.name}><button className="close" onClick={()=>setEncounterZone(null)} aria-label="Close"><X/></button><small>{game.encounterSource.toUpperCase()}</small><h2>{encounterZone.name}</h2><p>{encounterZone.pokemon.length} Pokémon available in this area.</p><div className="encounter-list">{encounterZone.pokemon.map(mon=>{const variants=mon.areas.flatMap(a=>a.encounters);const min=Math.min(...variants.map(v=>v.minLevel)),max=Math.max(...variants.map(v=>v.maxLevel)),chance=Math.max(...variants.map(v=>v.chance));return <article key={mon.id}><img src={mon.sprite} alt=""/><div><b>{mon.name.replace(/-/g,' ')}</b><span>Lv. {min}{max!==min&&`–${max}`} · up to {chance}%</span><em>{[...new Set(variants.map(v=>METHODS[v.method]??v.method))].join(' · ')}</em></div></article>})}</div></dialog></div>}
 </div>
 {tab==='checklist'&&(world?<ChecklistView markers={listed} checklist={world.checklist} done={done} toggleDone={toggleDone} onShow={showOnMap} detail={detail}/>:<div className="listview loading-list">Loading checklist…</div>)}
 {tab==='pokedex'&&(world?<PokedexView dex={world.dex} byId={byId} done={done} setMany={setMany} onShow={showOnMap} game={game.short} storageKey={game.storage.dex}/>:<div className="listview loading-list">Loading Pokédex…</div>)}
 {about&&<div className="modal-backdrop" role="presentation" onClick={e=>{if(e.target===e.currentTarget)setAbout(false)}}><dialog open className="modal" aria-modal="true" aria-label="Credits"><button className="close" onClick={()=>setAbout(false)} aria-label="Close"><X/></button><small>About</small><h2>Credits</h2><Credits game={game.id}/></dialog></div>}
 <nav className="tabbar">{tabs.map(([k,t,Icon])=><button key={k} className={tab===k?'on':''} onClick={()=>setTab(k)} aria-current={tab===k?'page':undefined}><Icon/>{t}</button>)}</nav>
 </main>
}
