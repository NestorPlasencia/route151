'use client';
import {Fragment,useCallback,useEffect,useLayoutEffect,useMemo,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import type {Map as LeafletMap,LayerGroup,ImageOverlay,Popup} from 'leaflet';
import {ArrowLeft,BookOpen,Check,ChevronDown,DoorOpen,Info,Layers,ListChecks,Map as MapIcon,MapPin,Sparkles,Swords,X} from 'lucide-react';
import {Credits,Figure,colorOf,groupsOf,type Encounter,type Marker} from './shared';
import {LANGS,LANG_NAMES,LANG_KEY,savedLang,translator,type Lang,type Names} from './i18n';
import {ChecklistView,PokedexView} from './lists';
import {TeamView,type Battle} from './team';
import {GAMES,METHODS,type Area,type EncounterZone,type Place,type Pt,type World} from './games';

type View={area:string;focus?:Pt;zoom?:number;restore?:{center:[number,number];zoom:number}};
const span=(e:Encounter)=>`${e.min}${e.max!==e.min?`–${e.max}`:''}`;
// CRS.Simple: x a la derecha, y hacia arriba; la imagen crece hacia abajo.
const ll=(p:Pt):[number,number]=>[-p[1],p[0]];
// "Silph Co. 7F" -> "7F": quita las palabras que comparten todos los pisos.
const shortLabels=(list:Area[])=>{const words=list.map(f=>f.label.split(' '));let n=0;while(words.every(w=>w.length>n+1&&w[n]===words[0][n]))n++;return new Map(list.map((f,i)=>[f.id,words[i].slice(n).join(' ')]))};
const GAME_KEY='ruta151-game';

export default function Home(){
 const popup=useRef<Popup|null>(null),[popupBox,setPopupBox]=useState<HTMLDivElement|null>(null);
 const el=useRef<HTMLDivElement>(null),map=useRef<LeafletMap|null>(null),layer=useRef<LayerGroup|null>(null),overlay=useRef<ImageOverlay|null>(null),shownArea=useRef<string|null>(null),leaflet=useRef<typeof import('leaflet')|null>(null);
 const [mapReady,setMapReady]=useState(false);
 const [gameId,setGameId]=useState(GAMES[0].id),[world,setWorld]=useState<World|null>(null),[lang,setLang]=useState<Lang>('en'),[names,setNames]=useState<Names>(null);
 const tr=useMemo(()=>translator(lang,names),[lang,names]),{t,category,method,place,name}=tr,{detail:tDetail}=tr,layerName=tr.layer;
 // Los nombres en espanol de los objetos (de PokeAPI) solo se bajan si hacen falta.
 useEffect(()=>{if(lang!=='es'||names)return;fetch('/data/names-es.json').then(r=>r.json()).then(setNames).catch(e=>console.error('No se pudieron cargar los nombres',e))},[lang,names]);
 const game=GAMES.find(g=>g.id===gameId)??GAMES[0],groups=groupsOf(game.id);
 const [tab,setTab]=useState<'mapa'|'checklist'|'pokedex'|'team'>('mapa'),[battle,setBattle]=useState<Battle|null>(null),[view,setView]=useState<View>({area:''});
 const [active,setActive]=useState<string[]>(groups.map(g=>g[0])),[selected,setSelected]=useState<Marker|null>(null),[stack,setStack]=useState<Marker[]|null>(null),[done,setDone]=useState<number[]>([]),[locations,setLocations]=useState(false),[about,setAbout]=useState(false),[layersOpen,setLayersOpen]=useState(false);
 const [encounterZone,setEncounterZone]=useState<EncounterZone|null>(null);

 // El juego elegido se recuerda; ?game=firered en la URL manda.
 useEffect(()=>{let saved:string|null=null;try{saved=localStorage.getItem(GAME_KEY)}catch{}const id=[new URLSearchParams(location.search).get('game'),saved].find(x=>GAMES.some(g=>g.id===x));if(id)setGameId(id);setLang(savedLang())},[]);
 // Cada juego carga sus datos y su progreso, y empieza en su primera region.
 useEffect(()=>{
  let live=true;setWorld(null);setSelected(null);setStack(null);setEncounterZone(null);setLocations(false);saved.current=null;setArrival(null);
  setActive(groupsOf(game.id).map(g=>g[0]).filter(n=>!game.hidden.includes(n)));
  try{setDone(JSON.parse(localStorage.getItem(game.storage.done)||'[]'))}catch{setDone([])}
  game.load().then(w=>{if(!live)return;setWorld(w);setView({area:w.areas.find(a=>a.kind==='region')?.id??w.areas[0].id})}).catch(e=>console.error('No se pudo cargar',game.id,e));
  return()=>{live=false};
 },[game]);
 const pickGame=(id:string)=>{setGameId(id);try{localStorage.setItem(GAME_KEY,id)}catch{}};
 const pickLang=(l:Lang)=>{setLang(l);try{localStorage.setItem(LANG_KEY,l)}catch{}};
 useEffect(()=>{document.documentElement.lang=lang},[lang]);
 // Los datos de combate (164 KB) solo se bajan al abrir la pestana de equipo.
 useEffect(()=>{if(tab!=='team'||battle||game.id==='yellow')return;fetch('/frlg/data/battle.json').then(r=>r.json()).then(setBattle).catch(e=>console.error('No se pudieron cargar los datos de combate',e))},[tab,battle,game.id]);

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
 // Interiores conectados entre si: por sus puertas y, en Yellow, por los pisos de
 // una misma mazmorra (que se cambian con la barra, sin puertas).
 const linked=useMemo(()=>{
  const g=new Map<string,string[]>(),join=(a:string,b:string)=>{g.set(a,[...(g.get(a)??[]),b]);g.set(b,[...(g.get(b)??[]),a])};
  for(const w of world?.warps??[])if(!isRegion(w.area)&&!isRegion(w.to))join(w.area,w.to);
  if(game.id==='yellow')zoneFloors.forEach(list=>list.slice(1).forEach(f=>join(f.id,list[0].id)));
  return g;
 },[world,isRegion,zoneFloors,game.id]);
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
 const left=useMemo(()=>{
  const n=new Map<string,number>();
  for(const m of world?.markers??[])if(m.area&&!game.untracked.includes(m.category)&&!done.includes(m.uid))n.set(m.area,(n.get(m.area)??0)+1);
  return n;
 },[world,game.untracked,done]);
 const finished=useCallback((from:string,to:string)=>behind(from,to).every(a=>!left.get(a)),[behind,left]);

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
   popup.current=L.popup({closeButton:false,closeOnClick:false,autoClose:false,className:'marker-pop',offset:[0,-6],autoPan:false,maxWidth:300}).setContent(box);
   // Leaflet cierra los popups en el 'preclick' de cualquier clic, tambien sobre
   // un pin: al volver a pulsar el mismo pin se cerraba y no se reabria. Se
   // cierra solo con un clic en el mapa (fuera de los pines) o con Escape.
   m.on('click',()=>{setSelected(null);setStack(null)});setPopupBox(box);
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

 const shown=useMemo(()=>(area?inArea.get(area.id)??[]:[]).filter(m=>active.includes(m.category)),[area,inArea,active]);
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
 const go=(loc:Place)=>{
  setLocations(false);setSelected(null);setEncounterZone(world?.zones.find(z=>z.name===loc.name)??null);
  if(!isRegion(loc.area)){saveRegion();setView({area:loc.area});setArrival(null);setToast(t('entered',{place:place(areaById.get(loc.area)?.label??'')}));return}
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
   L.marker(ll(w.at),{icon:door(toRegion?'exit':finished(w.area,w.to)?'done':''),title:toRegion?t('exitTo',{place:place(placeAt(w.to,w.toAt)??dest?.label??'')}):`${place(dest?.label??t('interior'))}${finished(w.area,w.to)?` · ${t('nothingLeft')}`:''}`,zIndexOffset:500})
    .on('click',()=>toRegion?nav.current.exitTo(w.to,w.toAt):nav.current.enter(w.to,{at:w.at,toAt:w.toAt})).addTo(g);
  }
  if(arrival&&arrival.area===area.id)L.marker(ll(arrival.at),{icon:L.divIcon({className:'arrive',html:'<span></span><i></i>',iconSize:[0,0]}),title:arrival.label,interactive:false,zIndexOffset:1000}).addTo(g);
 },[stacks,done,mapReady,world,area,areaById,arrival,isRegion,placeAt,finished,t,place]);

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
  box.classList.remove('pop-below');p.options.offset=L.point(0,-6);p.update();
  const stage=m.getContainer().getBoundingClientRect(),bar=document.querySelector('.floorbar')?.getBoundingClientRect();
  const top=Math.max(stage.top,bar?bar.bottom:stage.top)+8;
  let r=box.getBoundingClientRect();
  if(r.top<top){box.classList.add('pop-below');p.options.offset=L.point(0,r.height+42);p.update();r=box.getBoundingClientRect()}
  const dx=r.left<stage.left+10?r.left-stage.left-10:r.right>stage.right-10?r.right-stage.right+10:0;
  const dy=r.bottom>stage.bottom-10?r.bottom-stage.bottom+10:0;
  if(dx||dy)m.panBy([dx,dy],{animate:true});
 },[selected,stack,done,area]);
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
 const detail=(m:Marker)=>{const e=m.encounter;return e?t('encounterRate',{levels:span(e),chance:e.chance,methods:e.methods.map(method).join(' · ')}):info(m)??null};
 const listed=useMemo(()=>world?world.markers.filter(m=>world.checklist.markers[m.id]):[],[world]);
 const tabs=([['mapa',t('tabMap'),MapIcon],['checklist',t('tabChecklist'),ListChecks],['pokedex',t('tabDex'),BookOpen],...(game.id==='yellow'?[]:[['team',t('tabTeam'),Swords] as const])] as const);
 const areaName=(id?:string)=>id?place(areaById.get(id)?.label??'—'):'—';
 // Ficha de un marcador: el lugar junto a la categoria si es corto.
 // Lo que vende una tienda, con los objetos traducidos; los demas detalles solo
 // cambian el nivel ('Lv45' -> 'Nv. 45').
 const info=(m:Marker)=>{const d=m.detail;if(!d)return null;
  return d.startsWith('Sells ')?t('sells',{list:d.slice(6).split(', ').map(name).join(', ')}):tDetail(d)};
 const shortPlace=(m:Marker)=>!!m.location&&m.location.length<=40;
 // Linea de detalle: niveles y probabilidad, equipo, lo que vende, lo que pide un
 // intercambio, o el texto largo de Yellow.
 // En un grupo el lugar va una vez en el titulo; cada fila, sin subtitulo.
 const popRow=(m:Marker,compact=false)=><div className="pop-item"><div className="pop-head">{!game.untracked.includes(m.category)&&<button className={`tick ${done.includes(m.uid)?'on':''}`} aria-label={t('markDone')} onClick={()=>toggleDone(m.uid)}>{done.includes(m.uid)&&<Check/>}</button>}<Figure m={m}/><div><b>{name(m.name)}</b>{!compact&&<small>{m.encounter?`${category(m.category)} · ${place(m.encounter.zone)}`:shortPlace(m)?`${category(m.category)} · ${place(m.location)}`:category(m.category)}</small>}</div></div>{popLine(m)&&<p>{popLine(m)}</p>}</div>;
 const popLine=(m:Marker)=>{const e=m.encounter;return e?t('encounterRate',{levels:span(e),chance:e.chance,methods:e.methods.map(method).join(' · ')}):info(m)??(shortPlace(m)?null:place(m.location)||null)};
 const exitRegion=here?exitOf(here).region:null;
 const floors=here?zoneFloors.get(here.zone??here.label)??[here]:[];
 return <main><header><div className="brand"><i><MapIcon/></i><b>ROUTE 151<small>{t('companion',{game:game.title})}</small></b></div>
 <label className="game-select"><span className="sr-only">{t('game')}</span><select value={game.id} onChange={e=>pickGame(e.target.value)} aria-label={t('game')}>{GAMES.map(g=><option key={g.id} value={g.id}>{g.short}</option>)}</select><ChevronDown/></label>
 <label className="game-select lang-select"><span className="sr-only">{t('language')}</span><select value={lang} onChange={e=>pickLang(e.target.value as Lang)} aria-label={t('language')}>{LANGS.map(l=><option key={l} value={l}>{LANG_NAMES[l]}</option>)}</select><ChevronDown/></label>
 {tab==='mapa'&&<div className="map-controls"><button className="location-button" onClick={()=>setLocations(!locations)} aria-expanded={locations}>{here?<DoorOpen/>:<MapPin/>}<span>{here?place(here.label):area?<>{place(area.label)}<small>{t('allAreas')}</small></>:t('loading')}</span><ChevronDown/></button><button className={`layers-button ${active.length<groups.length?'filtered':''}`} onClick={()=>setLayersOpen(v=>!v)} aria-pressed={layersOpen} aria-label={t('mapLayers')}><Layers/></button></div>}
 <nav>{tabs.map(([k,t])=><button key={k} className={tab===k?'on':''} onClick={()=>setTab(k)} aria-current={tab===k?'page':undefined}>{t}</button>)}</nav><div className="counter"><span>{t('completed',{n:completed})}</span><i><em style={{width:`${pct}%`}}/></i><b>{pct}%</b></div><button className="about-button" onClick={()=>setAbout(true)} aria-label={t('credits')}><Info/></button></header>
 <div className={`app ${layersOpen?'layers-open':''}`} hidden={tab!=='mapa'}><aside><h3>{t('layers')}</h3>{groups.map(([name,Icon,color])=><button key={name} onClick={()=>toggleGroup(name)} className={active.includes(name)?'enabled':''}><i style={{'--color':color} as React.CSSProperties}>{active.includes(name)&&<Check/>}</i><Icon/><span>{layerName(name)}</span><b>{counts[name]??0}</b></button>)}<div className="source"><Sparkles/><p><b>{t('separateTitle')}</b>{t('separateText',{regions:regions.map(r=>r.label).join(' + ')})}</p></div></aside>
 <div className="map-stage"><div ref={el} className="leaflet-map"/>
 {here&&<div className="floorbar"><button onClick={leave}><ArrowLeft/>{place(areaById.get(exitRegion??'')?.label??t('back'))}</button>{floors.length>1&&floors.map(f=><button key={f.id} className={f.id===here.id?'on':''} onClick={()=>switchFloor(f.id)}>{place(short.get(f.id)||f.label)}</button>)}</div>}
 {!here&&regions.length>1&&<div className="floorbar">{regions.map(r=><button key={r.id} className={r.id===area?.id?'on':''} onClick={()=>showRegion(r.id)}><MapIcon/>{place(r.label)}</button>)}</div>}
 {toast&&<output className="toast" key={toast}>{toast}</output>}
 {!world&&<div className="loading">{t('loadingGame',{game:game.short})}</div>}<div className="map-note">{t('mapNote')}</div></div>
 {locations&&world&&<div className="locations">{here&&<button className="leave-inline" onClick={()=>{leave();setLocations(false)}}><ArrowLeft/>{t('backToMap',{region:place(areaById.get(exitRegion??'')?.label??'')})}</button>}
  {regions.map((r,i)=><Fragment key={r.id}><h3>{place(r.label).toUpperCase()}</h3><button className={area?.id===r.id?'current':''} onClick={()=>showRegion(r.id)}><MapIcon/>{t('wholeMap')}</button>{world.places.filter(p=>p.area===r.id||(i===0&&!isRegion(p.area))).map(loc=><button key={loc.name} onClick={()=>go(loc)}><MapPin/>{place(loc.name)}</button>)}</Fragment>)}
  <h3>{t('interiors')}</h3>{[...zoneFloors].map(([zone,list])=><div key={zone} className="dungeon"><h4>{place(zone)}</h4>{list.map(f=><button key={f.id} onClick={()=>enter(f.id)} className={here?.id===f.id?'current':''}><DoorOpen/>{place(f.label)}<b>{inArea.get(f.id)?.length??0}</b></button>)}</div>)}</div>}
 {popupBox&&(selected||stack)&&createPortal(selected?<div className="pop">{popRow(selected)}</div>:<div className="pop pop-list"><small className="pop-title">{t('atThisSpot',{n:stack!.length})} · {areaName(stack![0].area)}</small>{stack!.map(m=><Fragment key={m.id}>{popRow(m,true)}</Fragment>)}</div>,popupBox)}
 {encounterZone&&!selected&&!stack&&<div className="modal-backdrop" role="presentation" onClick={e=>{if(e.target===e.currentTarget)setEncounterZone(null)}}><dialog open className="drawer encounter-drawer" aria-modal="true" aria-label={place(encounterZone.name)}><button className="close" onClick={()=>setEncounterZone(null)} aria-label={t('close')}><X/></button><small>{t(game.id==='yellow'?'encountersPokeapi':'encountersWild').toUpperCase()}</small><h2>{place(encounterZone.name)}</h2><p>{t('availableHere',{n:encounterZone.pokemon.length})}</p><div className="encounter-list">{encounterZone.pokemon.map(mon=>{const variants=mon.areas.flatMap(a=>a.encounters);const min=Math.min(...variants.map(v=>v.minLevel)),max=Math.max(...variants.map(v=>v.maxLevel)),chance=Math.max(...variants.map(v=>v.chance));return <article key={mon.id}><img src={mon.sprite} alt=""/><div><b>{mon.name.replace(/-/g,' ')}</b><span>{t('encounterRate',{levels:`${min}${max!==min?`–${max}`:''}`,chance,methods:[...new Set(variants.map(v=>method(METHODS[v.method]??v.method)))].join(' · ')})}</span></div></article>})}</div></dialog></div>}
 </div>
 {tab==='checklist'&&(world?<ChecklistView markers={listed} checklist={world.checklist} done={done} toggleDone={toggleDone} onShow={showOnMap} detail={detail} tr={tr}/>:<div className="listview loading-list">{t('loadingChecklist')}</div>)}
 {tab==='pokedex'&&(world?<PokedexView dex={world.dex} byId={byId} done={done} setMany={setMany} onShow={showOnMap} game={game.short} storageKey={game.storage.dex} tr={tr}/>:<div className="listview loading-list">{t('loadingDex')}</div>)}
 {tab==='team'&&(world?<TeamView dex={world.dex} battle={battle} storageKey={`${game.storage.done}-team`} tr={tr}/>:<div className="listview loading-list">{t('loadingTeam')}</div>)}
 {about&&<div className="modal-backdrop" role="presentation" onClick={e=>{if(e.target===e.currentTarget)setAbout(false)}}><dialog open className="modal" aria-modal="true" aria-label={t('credits')}><button className="close" onClick={()=>setAbout(false)} aria-label={t('close')}><X/></button><small>{t('about')}</small><h2>{t('credits')}</h2><Credits game={game.id} tr={tr}/></dialog></div>}
 <nav className="tabbar">{tabs.map(([k,t,Icon])=><button key={k} className={tab===k?'on':''} onClick={()=>setTab(k)} aria-current={tab===k?'page':undefined}><Icon/>{t}</button>)}</nav>
 </main>
}
