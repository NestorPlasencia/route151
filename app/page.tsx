'use client';
import {useEffect,useMemo,useRef,useState} from 'react';
import type {Map as LeafletMap,LayerGroup,ImageOverlay} from 'leaflet';
import {ArrowLeft,BookOpen,Check,ChevronDown,DoorOpen,Info,Layers,ListChecks,Map as MapIcon,MapPin,Search,Sparkles,X} from 'lucide-react';
import {Credits,Figure,colorOf,groups,type Marker} from './shared';
import {ChecklistView,PokedexView,type Checklist,type Dex} from './lists';

type Location={name:string;aliases:string[];position:[number,number]};
type MapData={locations:Location[];markers:Marker[]};
type EncounterMon={id:number;name:string;sprite:string;types:string[];areas:{area:string;maxChance:number;encounters:{chance:number;minLevel:number;maxLevel:number;method:string}[]}[]};
type EncounterZone={name:string;pokemon:EncounterMon[]};
// Cada area (Kanto o un piso) es una imagen propia; las posiciones van en sus
// pixeles locales y `origin` situa la imagen dentro del mapa completo.
type Pt=[number,number];
type Area={image:string;width:number;height:number;origin:Pt;markers:{id:string;at:Pt}[]};
type Kanto=Area&{doors:{at:Pt;floor:number;to:Pt}[]};
type Floor=Area&{id:number;key:string;label:string;exits:{at:Pt;to:Pt}[]};
type Dungeon={zone:string;slug:string;floors:Floor[]};
type Areas={kanto:Kanto;dungeons:Dungeon[]};
type View={floor:number|null;focus?:Pt;zoom?:number;restore?:{center:[number,number];zoom:number}};
// "Nidoran♀" / "nidoran-f", "Mr. Mime" / "mr-mime": misma clave.
const norm=(s:string)=>s.toLowerCase().replace(/♀/g,'f').replace(/♂/g,'m').replace(/[^a-z0-9]/g,'');
const METHODS:Record<string,string>={walk:'Grass','old-rod':'Old Rod','good-rod':'Good Rod','super-rod':'Super Rod',surf:'Surf'};
type Encounter={zone:string;sprite:string;min:number;max:number;chance:number;methods:string[]};
const levels=(e:Encounter)=>`Lv. ${e.min}${e.max!==e.min?`–${e.max}`:''}`;
// CRS.Simple: x a la derecha, y hacia arriba; la imagen crece hacia abajo.
const ll=(p:Pt):[number,number]=>[-p[1],p[0]];
// "Silph Co. 7F" -> "7F": quita las palabras que comparten todos los pisos.
const shortLabels=(d:Dungeon)=>{const words=d.floors.map(f=>f.label.split(' '));let n=0;while(words.every(w=>w.length>n+1&&w[n]===words[0][n]))n++;return new Map(d.floors.map((f,i)=>[f.id,words[i].slice(n).join(' ')]))};

// Descarga un JSON de /public; si falla, lo deja registrado en la consola.
function load<T>(url:string,use:(value:T)=>void){fetch(url).then(r=>{if(!r.ok)throw new Error(`${r.status} ${url}`);return r.json() as Promise<T>}).then(use).catch(e=>console.error('No se pudo cargar',url,e))}

export default function Home(){
 const el=useRef<HTMLDivElement>(null),map=useRef<LeafletMap|null>(null),layer=useRef<LayerGroup|null>(null),overlay=useRef<ImageOverlay|null>(null),shownFloor=useRef<number|null|undefined>(undefined),leaflet=useRef<typeof import('leaflet')|null>(null);
 const [mapReady,setMapReady]=useState(false);
 const [tab,setTab]=useState<'mapa'|'checklist'|'pokedex'>('mapa'),[checklist,setChecklist]=useState<Checklist|null>(null),[dex,setDex]=useState<Dex|null>(null);
 const [data,setData]=useState<MapData|null>(null),[areas,setAreas]=useState<Areas|null>(null),[view,setView]=useState<View>({floor:null});
 const [active,setActive]=useState<string[]>(groups.map(g=>g[0])),[selected,setSelected]=useState<Marker|null>(null),[stack,setStack]=useState<Marker[]|null>(null),[done,setDone]=useState<number[]>([]),[query,setQuery]=useState(''),[searching,setSearching]=useState(false),[locations,setLocations]=useState(false),[about,setAbout]=useState(false),[layersOpen,setLayersOpen]=useState(false);
 const [encounters,setEncounters]=useState<EncounterZone[]>([]),[encounterZone,setEncounterZone]=useState<EncounterZone|null>(null);
 useEffect(()=>{
  load<MapData>('/data/yellow-map.json',setData);
  load<Areas>('/data/areas.json',setAreas);
  load<Checklist>('/data/checklist.json',setChecklist);
  load<Dex>('/data/pokedex.json',setDex);
  load<{zones:EncounterZone[]}>('/data/yellow-encounters-by-zone.json',r=>setEncounters(r.zones));
  try{setDone(JSON.parse(localStorage.getItem('ruta151-full')||'[]'))}catch{}
 },[]);

 const byId=useMemo(()=>new Map((data?.markers??[]).map(m=>[m.id,m])),[data]);
 const floors=useMemo(()=>{const out=new Map<number,{floor:Floor;dungeon:Dungeon;short:string}>();areas?.dungeons.forEach(d=>{const s=shortLabels(d);d.floors.forEach(f=>out.set(f.id,{floor:f,dungeon:d,short:s.get(f.id)||f.label}))});return out},[areas]);
 // Donde vive cada objeto, para que el buscador lleve a cualquier area.
 const home=useMemo(()=>{const out=new Map<string,{floor:number|null;at:Pt}>();areas?.kanto.markers.forEach(p=>out.set(p.id,{floor:null,at:p.at}));areas?.dungeons.forEach(d=>d.floors.forEach(f=>f.markers.forEach(p=>out.set(p.id,{floor:f.id,at:p.at}))));return out},[areas]);
 const here=view.floor==null?null:floors.get(view.floor)??null;
 const area:Area|null=here?here.floor:areas?.kanto??null;

 useEffect(()=>{
  if(!areas||!el.current||map.current)return;let disposed=false;
  import('leaflet').then(mod=>{
   if(disposed||!el.current)return;const L=mod.default;leaflet.current=L;
   const m=L.map(el.current,{crs:L.CRS.Simple,zoomSnap:.25,zoomDelta:.5,maxZoom:2,zoomControl:false,attributionControl:false});
   L.control.zoom({position:'bottomright'}).addTo(m);
   // Pixelado nitido solo al acercar; al alejar, el suavizado evita el muare.
   m.on('zoomend',()=>{el.current?.classList.toggle('crisp',m.getZoom()>=0);el.current?.classList.toggle('far',m.getZoom()<-1)});
   layer.current=L.layerGroup().addTo(m);map.current=m;setMapReady(true);
  }).catch(e=>console.error('No se pudo cargar Leaflet',e));
  return()=>{disposed=true;map.current?.remove();map.current=null};
 },[areas]);

 // Cambiar de area cambia la imagen; cada vista decide donde se posa la camara.
 useEffect(()=>{
  const L=leaflet.current,m=map.current;if(!L||!m||!area)return;
  const b:[Pt,Pt]=[[-area.height,0],[0,area.width]];
  const changed=shownFloor.current!==view.floor;
  if(changed){
   shownFloor.current=view.floor;overlay.current?.remove();
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
 const shown=useMemo(()=>(area?.markers??[]).flatMap(p=>{const m=byId.get(p.id);return m&&active.includes(m.category)&&`${m.name} ${m.location}`.toLowerCase().includes(q)?[{m,at:p.at}]:[]}),[area,byId,active,q]);
 // Muchos objetos comparten punto exacto (hasta 14): se pintan como un solo pin
 // con su recuento, o el de arriba taparia a los demas.
 const stacks=useMemo(()=>{const g=new Map<string,{at:Pt;items:Marker[]}>();for(const {m,at} of shown){const k=at.join(','),s=g.get(k);if(s)s.items.push(m);else g.set(k,{at,items:[m]})}return [...g.values()]},[shown]);
 useEffect(()=>setStack(null),[view.floor]);
 useEffect(()=>{if(!about)return;const close=(e:KeyboardEvent)=>e.key==='Escape'&&setAbout(false);addEventListener('keydown',close);return()=>removeEventListener('keydown',close)},[about]);
 useEffect(()=>{if(!stack&&!selected&&!encounterZone)return;const close=(e:KeyboardEvent)=>{if(e.key!=='Escape')return;if(selected)setSelected(null);else if(stack)setStack(null);else setEncounterZone(null)};addEventListener('keydown',close);return()=>removeEventListener('keydown',close)},[stack,selected,encounterZone]);
 const results=useMemo(()=>q.length<2?[]:(data?.markers??[]).filter(m=>active.includes(m.category)&&`${m.name} ${m.location}`.toLowerCase().includes(q)).slice(0,8),[data,active,q]);
 // Une cada Pokemon del mapa con sus encuentros de PokeAPI. En una mazmorra manda
 // la mazmorra y, si se puede, su piso ("Mt. Moon 1F" -> area "mt-moon-1f"); en
 // Kanto, de las rutas donde aparece la especie, la mas cercana al punto.
 const locPos=useMemo(()=>new Map((data?.locations??[]).map(l=>[l.name,l.position])),[data]);
 const encounterOf=(m:Marker):Encounter|null=>{
  if(m.category!=='Pokémon')return null;
  const key=norm(m.name),zones=encounters.filter(z=>z.pokemon.some(p=>norm(p.name)===key));if(!zones.length)return null;
  const h=home.get(m.id),fl=h&&h.floor!=null?floors.get(h.floor):undefined;
  let zone:EncounterZone|undefined;
  if(fl)zone=zones.find(z=>z.name===fl.dungeon.zone);
  else{const listed=new Set(m.location.split(/,\s*/)),named=zones.filter(z=>listed.has(z.name)),pool=named.length?named:zones;const d=(z:EncounterZone)=>{const p=locPos.get(z.name);return p?(p[0]-m.position[0])**2+(p[1]-m.position[1])**2:Infinity};zone=pool.reduce((a,b)=>d(b)<d(a)?b:a)}
  const mon=zone?.pokemon.find(p=>norm(p.name)===key);if(!zone||!mon)return null;
  let areas=mon.areas;const code=fl?.floor.label.match(/\b(B?\d+F)\b/)?.[1].toLowerCase();
  if(code){const only=areas.filter(a=>a.area.endsWith('-'+code));if(only.length)areas=only}
  const v=areas.flatMap(a=>a.encounters);if(!v.length)return null;
  return {zone:zone.name,sprite:mon.sprite,min:Math.min(...v.map(x=>x.minLevel)),max:Math.max(...v.map(x=>x.maxLevel)),chance:Math.max(...v.map(x=>x.chance)),methods:[...new Set(v.map(x=>METHODS[x.method]??x.method))]};
 };
 const counts=useMemo(()=>{const c:Record<string,number>={};area?.markers.forEach(p=>{const m=byId.get(p.id);if(m)c[m.category]=(c[m.category]??0)+1});return c},[area,byId]);

 // Al salir de Kanto se guarda la vista para volver exactamente alli.
 const saved=useRef<View['restore']|null>(null);
 const saveKanto=()=>{const m=map.current;if(m&&!here){const c=m.getCenter();saved.current={center:[c.lat,c.lng],zoom:m.getZoom()}}};
 // Cada salto entre mapas deja rastro: un aviso breve ("Entraste a Mt. Moon 1F
 // desde Route 4") y un anillo con flecha en el punto exacto de entrada o
 // salida, que se desvanece a los 6 s.
 const [arrival,setArrival]=useState<{floor:number|null;at:Pt;label:string}|null>(null),[toast,setToast]=useState<string|null>(null);
 useEffect(()=>{if(!toast)return;const t=setTimeout(()=>setToast(null),4500);return()=>clearTimeout(t)},[toast]);
 useEffect(()=>{if(!arrival)return;const t=setTimeout(()=>setArrival(null),6000);return()=>clearTimeout(t)},[arrival]);
 // Lugar de Kanto (ruta o ciudad) mas cercano a un punto de Kanto. Se descartan
 // los que caen dentro de un piso (mazmorras), no por nombre: las ciudades con
 // gimnasio tambien tienen interiores.
 const kantoPlaces=useMemo(()=>{if(!areas||!data)return [];const [ox,oy]=areas.kanto.origin;return data.locations.map(l=>({name:l.name,at:[l.position[1]*8-ox,-l.position[0]*8-oy] as Pt})).filter(l=>l.at[0]>=0&&l.at[1]>=0&&l.at[0]<areas.kanto.width&&l.at[1]<areas.kanto.height&&![...floors.values()].some(({floor:f})=>{const x=l.at[0]+ox,y=l.at[1]+oy;return x>=f.origin[0]&&x<f.origin[0]+f.width&&y>=f.origin[1]&&y<f.origin[1]+f.height}))},[areas,data,floors]);
 const placeAt=(p:Pt)=>kantoPlaces.reduce<{name:string;d:number}|null>((best,l)=>{const d=(l.at[0]-p[0])**2+(l.at[1]-p[1])**2;return !best||d<best.d?{name:l.name,d}:best},null)?.name;
 const enter=(floor:number,door?:{at:Pt;to:Pt})=>{
  const label=floors.get(floor)?.floor.label??'Interior',from=door&&!here?placeAt(door.at):undefined;
  saveKanto();setView(door?{floor,focus:door.to,zoom:-99}:{floor});setSelected(null);setEncounterZone(null);setLocations(false);
  setArrival(door?{floor,at:door.to,label:'You entered here'}:null);setToast(`Entered ${label}${from?` from ${from}`:''}`);
 };
 const leave=()=>{
  if(!here)return;setSelected(null);
  const door=areas?.kanto.doors.find(d=>d.floor===here.floor.id)??areas?.kanto.doors.find(d=>floors.get(d.floor)?.dungeon===here.dungeon);
  setView(saved.current?{floor:null,restore:saved.current}:door?{floor:null,focus:door.at}:{floor:null});
  saved.current=null;
  setArrival(door?{floor:null,at:door.at,label:'You left here'}:null);
  const to=door&&placeAt(door.at);setToast(`Left ${here.floor.label}${to?` to ${to}`:' to Kanto'}`);
 };
 const exitTo=(to:Pt)=>{
  setSelected(null);saved.current=null;setView({floor:null,focus:to});
  setArrival({floor:null,at:to,label:'You left here'});const place=placeAt(to);
  if(here)setToast(`Left ${here.floor.label}${place?` to ${place}`:' to Kanto'}`);
 };
 const switchFloor=(floor:number)=>{setSelected(null);setView({floor});setArrival(null);setToast(`Now in ${floors.get(floor)?.floor.label??'another floor'}`)};
 const reveal=(m:Marker)=>{setStack(null);setArrival(null);const h=home.get(m.id);if(!h)return;if(h.floor!==null)saveKanto();setView({floor:h.floor,focus:h.at,zoom:.5});setSelected(m);setQuery('');setSearching(false)};
 const go=(loc:Location)=>{
  setLocations(false);setSelected(null);setEncounterZone(encounters.find(z=>z.name===loc.name)??null);if(!areas)return;
  const px:Pt=[loc.position[1]*8,-loc.position[0]*8];
  const inside=(a:Area)=>px[0]>=a.origin[0]&&px[0]<a.origin[0]+a.width&&px[1]>=a.origin[1]&&px[1]<a.origin[1]+a.height;
  const f=[...floors.values()].find(x=>inside(x.floor))?.floor??areas.dungeons.find(d=>d.zone===loc.name)?.floors[0];
  if(f){saveKanto();setView({floor:f.id});setArrival(null);setToast(`Entered ${f.label}`);return}
  saved.current=null;setArrival(null);setView({floor:null,focus:[px[0]-areas.kanto.origin[0],px[1]-areas.kanto.origin[1]],zoom:-1});
 };

 // Los pines llaman a la version mas reciente de enter/exitTo sin redibujarse
 // en cada render (se recrean con cada render).
 const nav=useRef({enter,exitTo});
 useEffect(()=>{nav.current={enter,exitTo}});
 useEffect(()=>{
  const L=leaflet.current,g=layer.current;if(!L||!g||!areas)return;g.clearLayers();
  for(const {at,items} of stacks){
   const completed=items.every(m=>done.includes(m.uid));
   // Varias categorias en el mismo punto: el pin se reparte en sectores de color.
   const colors=[...new Set(items.map(m=>colorOf(m.category)))];
   const fill=colors.length>1?`conic-gradient(${colors.map((c,i)=>`${c} ${i*100/colors.length}% ${(i+1)*100/colors.length}%`).join(',')})`:colors[0];
   const icon=L.divIcon({className:'pin-wrap',html:`<span class="pin ${completed?'pin-done':''}" style="--pin:${fill}">${completed?'✓':''}</span>${items.length>1?`<b class="pin-count">${items.length}</b>`:''}`,iconSize:[20,20],iconAnchor:[10,10]});
   L.marker(ll(at),{icon}).on('click',()=>{if(items.length>1){setSelected(null);setStack(items)}else{setStack(null);setSelected(items[0])}}).addTo(g);
  }
  const door=(cls:string)=>L.divIcon({className:'pin-wrap',html:`<span class="door ${cls}"></span>`,iconSize:[26,26],iconAnchor:[13,13]});
  if(!here)for(const d of areas.kanto.doors)L.marker(ll(d.at),{icon:door(''),title:floors.get(d.floor)?.floor.label??'Interior',zIndexOffset:500}).on('click',()=>nav.current.enter(d.floor,d)).addTo(g);
  else for(const e of here.floor.exits)L.marker(ll(e.at),{icon:door('exit'),title:'Exit to Kanto',zIndexOffset:500}).on('click',()=>nav.current.exitTo(e.to)).addTo(g);
  if(arrival&&arrival.floor===view.floor)L.marker(ll(arrival.at),{icon:L.divIcon({className:'arrive',html:'<span></span><i></i>',iconSize:[0,0]}),title:arrival.label,interactive:false,zIndexOffset:1000}).addTo(g);
 },[stacks,done,mapReady,here,areas,floors,arrival,view.floor]);

 const toggleGroup=(name:string)=>setActive(a=>a.includes(name)?a.filter(x=>x!==name):[...a,name]);
 const toggleDone=(uid:number)=>setDone(old=>{const n=old.includes(uid)?old.filter(x=>x!==uid):[...old,uid];localStorage.setItem('ruta151-full',JSON.stringify(n));return n});
 const pct=data?Math.round(done.length/Math.max(1,new Set(data.markers.map(m=>m.uid)).size)*100):0;
 const selectedEncounter=selected?encounterOf(selected):null;
 // El mapa sigue montado bajo las listas; al volver, Leaflet recalcula su tamaño.
 useEffect(()=>{if(tab==='mapa')setTimeout(()=>map.current?.invalidateSize(),0)},[tab]);
 const showOnMap=(m:Marker)=>{setTab('mapa');reveal(m)};
 const detail=(m:Marker)=>{const e=encounterOf(m);return e?`${levels(e)} · up to ${e.chance}% · ${e.methods.join(' · ')}`:null};
 const tabs=([['mapa','Map',MapIcon],['checklist','Checklist',ListChecks],['pokedex','Pokédex',BookOpen]] as const);
 const areaName=(floor:number|null)=>floor==null?'Kanto':floors.get(floor)?.floor.label??'Interior';
 return <main><header><div className="brand"><i><MapIcon/></i><b>ROUTE 151<small>Pokémon Yellow Companion</small></b></div><nav>{tabs.map(([k,t])=><button key={k} className={tab===k?'on':''} onClick={()=>setTab(k)} aria-current={tab===k?'page':undefined}>{t}</button>)}</nav><div className="counter"><span>{done.length} completed</span><i><em style={{width:`${pct}%`}}/></i><b>{pct}%</b></div><button className="about-button" onClick={()=>setAbout(true)} aria-label="Credits"><Info/></button></header>
 <section className="toolbar" hidden={tab!=='mapa'}><button className="location-button" onClick={()=>setLocations(!locations)}>{here?<DoorOpen/>:<MapPin/>}<span>{here?here.floor.label:'Kanto — all areas'}</span><ChevronDown/></button><label><Search/><input value={query} onFocus={()=>setSearching(true)} onBlur={()=>setTimeout(()=>setSearching(false),150)} onChange={e=>{setQuery(e.target.value);setSearching(true)}} placeholder="Search Pokémon, items or places…"/></label><button className={`layers-button ${active.length<groups.length?'filtered':''}`} onClick={()=>setLayersOpen(v=>!v)} aria-pressed={layersOpen} aria-label="Map layers"><Layers/></button><span>{shown.length} markers here</span>
 {searching&&results.length>0&&<div className="search-results">{results.map(m=><button key={m.id} onMouseDown={e=>e.preventDefault()} onClick={()=>reveal(m)}><Figure m={m}/><span><b>{m.name}</b><small>{areaName(home.get(m.id)?.floor??null)}</small></span></button>)}</div>}</section>
 <div className={`app ${layersOpen?'layers-open':''}`} hidden={tab!=='mapa'}><aside><h3>MAP LAYERS</h3>{groups.map(([name,Icon,color])=><button key={name} onClick={()=>toggleGroup(name)} className={active.includes(name)?'enabled':''}><i style={{'--color':color} as React.CSSProperties}>{active.includes(name)&&<Check/>}</i><Icon/><span>{name}</span><b>{counts[name]??0}</b></button>)}<div className="source"><Sparkles/><p><b>Separate maps</b>Kanto and every dungeon have their own map. Enter through the yellow doors.</p></div></aside>
 <div className="map-stage"><div ref={el} className="leaflet-map"/>
 {here&&<div className="floorbar"><button onClick={leave}><ArrowLeft/>Kanto</button>{here.dungeon.floors.length>1&&here.dungeon.floors.map(f=><button key={f.id} className={f.id===here.floor.id?'on':''} onClick={()=>switchFloor(f.id)}>{floors.get(f.id)?.short}</button>)}</div>}
 {toast&&<output className="toast" key={toast}>{toast}</output>}
 {!areas&&<div className="loading">Loading map…</div>}<div className="map-note">Scroll or pinch to zoom · drag to explore</div></div>
 {locations&&<div className="locations">{here&&<button className="leave-inline" onClick={()=>{leave();setLocations(false)}}><ArrowLeft/>Back to the Kanto map</button>}<h3>GO TO AN AREA</h3>{data?.locations.map(loc=><button key={loc.name} onClick={()=>go(loc)}><MapPin/>{loc.name}</button>)}<h3>DUNGEONS &amp; INTERIORS</h3>{areas?.dungeons.map(d=><div key={d.slug} className="dungeon"><h4>{d.zone}</h4>{d.floors.map(f=><button key={f.id} onClick={()=>enter(f.id)} className={here?.floor.id===f.id?'current':''}><DoorOpen/>{f.label}<b>{f.markers.length}</b></button>)}</div>)}</div>}
 {selected&&<div className="modal-backdrop" role="presentation" onClick={e=>{if(e.target===e.currentTarget)setSelected(null)}}><dialog open className="drawer" aria-modal="true" aria-label={selected.name}><button className="close" onClick={()=>setSelected(null)} aria-label="Close"><X/></button><small>{selectedEncounter?`${selected.category} · ${selectedEncounter.zone}`:selected.category}</small><div className="title-row"><Figure m={selected}/><h2>{selected.name}</h2></div>{selectedEncounter?<div className="local-encounter"><img src={selectedEncounter.sprite} alt=""/><div><b>{levels(selectedEncounter)}</b><span>Up to {selectedEncounter.chance}% encounter rate</span><em>{selectedEncounter.methods.join(' · ')}</em></div></div>:<p><MapPin/>{selected.location||'Location on the map'}</p>}<button className={`complete ${done.includes(selected.uid)?'checked':''}`} onClick={()=>toggleDone(selected.uid)}>{done.includes(selected.uid)?<><Check/>Caught / completed</>:<>Mark as completed</>}</button>{!selectedEncounter&&<div className="details"><span>ID</span><b>#{selected.uid}</b><span>Map</span><b>{areaName(home.get(selected.id)?.floor??null)}</b></div>}</dialog></div>}
 {stack&&!selected&&<div className="modal-backdrop" role="presentation" onClick={e=>{if(e.target===e.currentTarget)setStack(null)}}><dialog open className="modal" aria-modal="true" aria-label="Items at this spot"><button className="close" onClick={()=>setStack(null)} aria-label="Close"><X/></button><small>{stack.length} at this spot</small><h2>Several items here</h2><div className="stack-list">{stack.map(m=><div key={m.id} className="stack-row"><button className={`tick ${done.includes(m.uid)?'on':''}`} aria-label="Mark as completed" onClick={()=>toggleDone(m.uid)}>{done.includes(m.uid)&&<Check/>}</button><button className="stack-item" onClick={()=>setSelected(m)}><Figure m={m}/><span><b>{m.name}</b>{(e=>e?<small className="enc">{levels(e)} · up to {e.chance}% · <em>{e.methods.join(' · ')}</em></small>:<small>{m.category}</small>)(encounterOf(m))}</span></button></div>)}</div></dialog></div>}
 {encounterZone&&!selected&&!stack&&<div className="modal-backdrop" role="presentation" onClick={e=>{if(e.target===e.currentTarget)setEncounterZone(null)}}><dialog open className="drawer encounter-drawer" aria-modal="true" aria-label={encounterZone.name}><button className="close" onClick={()=>setEncounterZone(null)} aria-label="Close"><X/></button><small>POKÉAPI ENCOUNTERS</small><h2>{encounterZone.name}</h2><p>{encounterZone.pokemon.length} Pokémon available in this area.</p><div className="encounter-list">{encounterZone.pokemon.map(mon=>{const variants=mon.areas.flatMap(a=>a.encounters);const min=Math.min(...variants.map(v=>v.minLevel)),max=Math.max(...variants.map(v=>v.maxLevel)),chance=Math.max(...variants.map(v=>v.chance));return <article key={mon.id}><img src={mon.sprite} alt=""/><div><b>{mon.name.replace(/-/g,' ')}</b><span>Lv. {min}{max!==min&&`–${max}`} · up to {chance}%</span><em>{[...new Set(variants.map(v=>v.method))].join(' · ')}</em></div></article>})}</div></dialog></div>}
 </div>
 {tab==='checklist'&&(checklist&&data?<ChecklistView markers={data.markers} checklist={checklist} done={done} toggleDone={toggleDone} onShow={showOnMap} detail={detail}/>:<div className="listview loading-list">Loading checklist…</div>)}
 {tab==='pokedex'&&(dex&&data?<PokedexView dex={dex} byId={byId} done={done} onShow={showOnMap}/>:<div className="listview loading-list">Loading Pokédex…</div>)}
 {about&&<div className="modal-backdrop" role="presentation" onClick={e=>{if(e.target===e.currentTarget)setAbout(false)}}><dialog open className="modal" aria-modal="true" aria-label="Credits"><button className="close" onClick={()=>setAbout(false)} aria-label="Close"><X/></button><small>About</small><h2>Credits</h2><Credits/></dialog></div>}
 <nav className="tabbar">{tabs.map(([k,t,Icon])=><button key={k} className={tab===k?'on':''} onClick={()=>setTab(k)} aria-current={tab===k?'page':undefined}><Icon/>{t}</button>)}</nav>
 </main>
}
