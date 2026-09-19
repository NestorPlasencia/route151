'use client';
// Prototipo de FireRed/LeafGreen: mapas y marcadores generados desde la
// decompilacion (scripts/frlg/build-frlg.py). Pagina de trabajo, no enlazada.
import {useEffect,useMemo,useRef,useState} from 'react';
import type {Map as LeafletMap,LayerGroup,ImageOverlay} from 'leaflet';

type Pt=[number,number];
type Area={id:string;kind:'region'|'interior';label:string;zone?:string;image:string;width:number;height:number};
type Warp={area:string;at:Pt;to:string;toAt:Pt};
type Marker={id:string;category:string;name:string;detail:string|null;area:string;at:Pt;map:string;flag:string|null};

const COLORS:Record<string,string>={'Item':'#49a8ff','Hidden Item':'#7fd4ff','TM/HM':'#b98cff','Key Item':'#ffd739','Gift Item':'#ff8ec1','Gift Pokémon':'#f3a63b','Static Pokémon':'#ffb347','Trainer':'#ff5f66','Boss':'#ff2d55','Obstacle':'#9aa6b8'};
const LIST_LIMIT=300;
// CRS.Simple: x a la derecha, y hacia arriba; la imagen crece hacia abajo.
const ll=(p:Pt):[number,number]=>[-p[1],p[0]];

export default function FireRed(){
 const el=useRef<HTMLDivElement>(null),map=useRef<LeafletMap|null>(null),leaflet=useRef<typeof import('leaflet')|null>(null);
 const overlay=useRef<ImageOverlay|null>(null),pins=useRef<LayerGroup|null>(null),focus=useRef<LayerGroup|null>(null);
 const [ready,setReady]=useState(false),[areas,setAreas]=useState<Area[]>([]),[warps,setWarps]=useState<Warp[]>([]),[markers,setMarkers]=useState<Marker[]>([]);
 const [current,setCurrent]=useState('kanto'),[history,setHistory]=useState<{area:string;at?:Pt}[]>([]),[target,setTarget]=useState<Pt|null>(null);
 const [hidden,setHidden]=useState<string[]>(['Obstacle']),[query,setQuery]=useState(''),[selected,setSelected]=useState<Marker|null>(null);

 useEffect(()=>{
  const load=<T,>(url:string,use:(v:T)=>void)=>{fetch(url).then(r=>{if(!r.ok)throw new Error(`${r.status} ${url}`);return r.json() as Promise<T>}).then(use).catch(e=>console.error('No se pudo cargar',url,e))};
  load<{areas:Area[];warps:Warp[]}>('/frlg/data/areas.json',d=>{setAreas(d.areas);setWarps(d.warps)});
  load<Marker[]>('/frlg/data/markers.json',setMarkers);
 },[]);

 const byId=useMemo(()=>new Map(areas.map(a=>[a.id,a])),[areas]);
 const area=byId.get(current);
 const zones=useMemo(()=>{const z=new Map<string,Area[]>();areas.filter(a=>a.kind==='interior').forEach(a=>z.set(a.zone??'Other',[...(z.get(a.zone??'Other')??[]),a]));return [...z].sort((a,b)=>a[0].localeCompare(b[0]))},[areas]);
 const categories=useMemo(()=>{const m=new Map<string,number>();markers.forEach(mk=>m.set(mk.category,(m.get(mk.category)??0)+1));return [...m]},[markers]);
 const here=useMemo(()=>markers.filter(mk=>mk.area===current&&!hidden.includes(mk.category)),[markers,current,hidden]);
 const results=useMemo(()=>{const q=query.trim().toLowerCase();return markers.filter(mk=>!hidden.includes(mk.category)&&(!q||`${mk.name} ${mk.detail??''} ${mk.map}`.toLowerCase().includes(q)))},[markers,hidden,query]);
 const place=(a?:Area)=>!a?'':a.kind==='region'?a.label:`${a.zone} · ${a.label}`;

 useEffect(()=>{
  if(!el.current||map.current)return;let dead=false;
  import('leaflet').then(mod=>{
   if(dead||!el.current)return;const L=mod.default;leaflet.current=L;
   const m=L.map(el.current,{crs:L.CRS.Simple,minZoom:-4,maxZoom:3,zoomSnap:.5,attributionControl:false});
   pins.current=L.layerGroup().addTo(m);focus.current=L.layerGroup().addTo(m);
   map.current=m;setReady(true);
  }).catch(e=>console.error('No se pudo cargar Leaflet',e));
  return()=>{dead=true;map.current?.remove();map.current=null};
 },[]);

 // Cambia la imagen al entrar en otra area; si se llega por una puerta o desde
 // la lista, centra en ese punto.
 useEffect(()=>{
  const L=leaflet.current,m=map.current;if(!L||!m||!area)return;
  const bounds=L.latLngBounds(ll([0,area.height]),ll([area.width,0]));
  overlay.current?.remove();overlay.current=L.imageOverlay(area.image,bounds,{className:'world-image',interactive:false}).addTo(m);
  if(target)m.setView(ll(target),1,{animate:false});else m.fitBounds(bounds,{animate:false});
 },[area,target,ready]);

 useEffect(()=>{
  const L=leaflet.current,g=pins.current;if(!L||!g)return;g.clearLayers();
  for(const w of warps)if(w.area===current){
   const dest=byId.get(w.to);
   L.circleMarker(ll(w.at),{radius:4,color:'#11182a',weight:2,fillColor:'#ffd936',fillOpacity:1}).bindTooltip(place(dest)).on('click',()=>nav.current(w.to,w.toAt,w.at)).addTo(g);
  }
  for(const mk of here)L.circleMarker(ll(mk.at),{radius:5,color:'#fff',weight:1.5,fillColor:COLORS[mk.category]??'#ccc',fillOpacity:1}).bindTooltip(mk.name).on('click',()=>setSelected(mk)).addTo(g);
 },[here,warps,current,ready,byId]);

 useEffect(()=>{
  const L=leaflet.current,g=focus.current;if(!L||!g)return;g.clearLayers();
  if(selected&&selected.area===current)L.circleMarker(ll(selected.at),{radius:12,color:'#fff',weight:3,fill:false,dashArray:'4 3',interactive:false}).addTo(g);
 },[selected,current,ready]);

 // `from` es la puerta de salida: al volver atras se regresa a ella.
 function go(to:string,at?:Pt,from?:Pt){setHistory(h=>[...h,{area:current,at:from}]);setCurrent(to);setTarget(at??null)}
 // Los clics de Leaflet llaman siempre a la version actual de go().
 const nav=useRef(go);
 useEffect(()=>{nav.current=go});
 const back=()=>{const prev=history.at(-1);if(!prev)return;setHistory(h=>h.slice(0,-1));setCurrent(prev.area);setTarget(prev.at??null)};
 const show=(mk:Marker)=>{setSelected(mk);if(mk.area!==current)go(mk.area,mk.at);else{setTarget(mk.at);map.current?.flyTo(ll(mk.at),1.5,{duration:.5})}};
 const toggle=(c:string)=>setHidden(h=>h.includes(c)?h.filter(x=>x!==c):[...h,c]);

 return <div className="wk">
  <div className="wk-map"><div ref={el}/>{!area&&<div className="wk-loading">Loading FireRed / LeafGreen…</div>}</div>
  <div className="wk-side">
   <div className="wk-head">
    <h1>FireRed / LeafGreen</h1>
    <p>Prototype · {areas.length} areas · {warps.length} doors · {markers.length} markers · data from <a href="https://github.com/pret/pokefirered" target="_blank" rel="noreferrer">pret/pokefirered</a></p>
   </div>
   <div className="wk-filters">
    {areas.filter(a=>a.kind==='region').map(a=><button key={a.id} className={`wk-chip ${current===a.id?'':'off'}`} onClick={()=>{setHistory([]);setCurrent(a.id);setTarget(null)}}>{a.label}</button>)}
    <select className="wk-search" value={area?.kind==='interior'?current:''} onChange={e=>e.target.value&&go(e.target.value)}>
     <option value="">Interiors…</option>
     {zones.map(([zone,list])=><optgroup key={zone} label={zone}>{list.map(a=><option key={a.id} value={a.id}>{a.label}</option>)}</optgroup>)}
    </select>
   </div>
   <div className="wk-filters">
    {history.length>0&&<button className="wk-chip" onClick={back}>← Back</button>}
    <span className="wk-count">{place(area)} · {here.length} markers here</span>
   </div>
   <div className="wk-filters">
    {categories.map(([c,n])=><button key={c} className={`wk-chip ${hidden.includes(c)?'off':''}`} style={{'--c':COLORS[c]??'#ccc'} as React.CSSProperties} onClick={()=>toggle(c)}><i/>{c}<b>{n}</b></button>)}
   </div>
   {selected&&<div className="wk-detail">
    <button className="wk-close" onClick={()=>setSelected(null)} aria-label="Close">×</button>
    <small style={{color:COLORS[selected.category]}}>{selected.category}</small>
    <h2>{selected.name}</h2>
    <dl>
     {selected.detail&&<><dt>{selected.category==='Trainer'||selected.category==='Boss'?'Team':'Level'}</dt><dd>{selected.detail}</dd></>}
     <dt>Where</dt><dd>{place(byId.get(selected.area))}</dd>
     <dt>Map</dt><dd>{selected.map}</dd>
     {selected.flag&&<><dt>Flag</dt><dd>{selected.flag}</dd></>}
    </dl>
   </div>}
   <input className="wk-search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search items, trainers, Pokémon…"/>
   <div className="wk-count">{results.length} results{results.length>LIST_LIMIT&&` · showing the first ${LIST_LIMIT}`}</div>
   <div className="wk-list">
    {results.slice(0,LIST_LIMIT).map(mk=><button key={mk.id} className={`wk-row ${selected?.id===mk.id?'on':''}`} style={{'--c':COLORS[mk.category]??'#ccc'} as React.CSSProperties} onClick={()=>show(mk)}>
     <i/><span><b>{mk.name}</b><small>{place(byId.get(mk.area))}</small></span><em>{mk.category}</em>
    </button>)}
   </div>
  </div>
 </div>;
}
