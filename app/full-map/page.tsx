'use client';
// Pagina de trabajo: el mapa original completo, interiores incluidos, con todos
// los objetos encima. Sirve para revisar datos, no forma parte de la app.
import {useEffect,useMemo,useRef,useState} from 'react';
import type {Map as LeafletMap,LayerGroup} from 'leaflet';
import {Credits} from '../shared';
import {translator} from '../i18n';

type Marker={id:string;uid:number;category:string;name:string;location:string;position:[number,number];icon?:string;requirements:unknown};
type Bounds=[[number,number],[number,number]];
type Door={at:[number,number];to:[number,number]};
type Block={id:number;key:string;label:string|null;zone:string|null;certain:boolean;bounds:Bounds;ids:string[];doors:Door[];sliver?:boolean};
type Interiors={overworld:{bounds:Bounds;ids:string[]};blocks:Block[]};
// Secciones tal y como las usa la app (areas.json): incluye los interiores
// recortados a mano (id negativo), que no existen en yellow-interiors.json.
type Pt=[number,number];
type Areas={kanto:{origin:Pt;doors:{at:Pt;floor:number;to:Pt}[]};dungeons:{zone:string;floors:{id:number;key:string;label:string;origin:Pt;width:number;height:number;markers:{id:string}[]}[]}[]};
type Section={id:number;key:string;label:string;zone:string;bounds:Bounds;ids:string[];doors:Door[]};
const toLL=(x:number,y:number):Pt=>[-y/8,x/8];

const COLORS:Record<string,string>={'Pokémon':'#ffd739','Item In Map':'#49a8ff','Item Gift':'#ff8ec1','In-Game Trade':'#ad83ff','In-Game Gift Pokémon':'#f3a63b','Battle':'#ff5f66'};
const WORLD:Bounds=[[-1024,0],[0,1024]];
const LIST_LIMIT=300;
const FULL_IMAGE='/maps/yellow-full.png';

export default function Trabajo(){
 const el=useRef<HTMLDivElement>(null),map=useRef<LeafletMap|null>(null),leaflet=useRef<typeof import('leaflet')|null>(null);
 const pins=useRef<LayerGroup|null>(null),extras=useRef<LayerGroup|null>(null),focus=useRef<LayerGroup|null>(null);
 const [ready,setReady]=useState(false),[imageReady,setImageReady]=useState(false);
 const [markers,setMarkers]=useState<Marker[]>([]),[interiors,setInteriors]=useState<Interiors|null>(null),[areas,setAreas]=useState<Areas|null>(null);
 const [hidden,setHidden]=useState<string[]>([]),[showDoors,setShowDoors]=useState(true),[showBlocks,setShowBlocks]=useState(true);
 const [query,setQuery]=useState(''),[selected,setSelected]=useState<Marker|null>(null),[pickedBlock,setPickedBlock]=useState<Section|null>(null);

 useEffect(()=>{
  const load=<T,>(url:string,use:(v:T)=>void)=>{fetch(url).then(r=>r.json() as Promise<T>).then(use).catch(e=>console.error('No se pudo cargar',url,e))};
  load<{markers:Marker[]}>('/data/yellow-map.json',d=>setMarkers(d.markers));
  load<Interiors>('/data/yellow-interiors.json',setInteriors);
  load<Areas>('/data/areas.json',setAreas);
 },[]);

 const sections=useMemo(()=>{
  if(!areas)return [];const k=areas.kanto;
  return areas.dungeons.flatMap(d=>d.floors.map((f):Section=>{const [x,y]=f.origin;return {id:f.id,key:f.key,label:f.label,zone:d.zone,
   bounds:[toLL(x,y+f.height),toLL(x+f.width,y)],ids:f.markers.map(m=>m.id),
   doors:k.doors.filter(dr=>dr.floor===f.id).map(dr=>({at:toLL(k.origin[0]+dr.at[0],k.origin[1]+dr.at[1]),to:toLL(x+dr.to[0],y+dr.to[1])}))}}));
 },[areas]);
 const byId=useMemo(()=>new Map(sections.map(s=>[s.id,s])),[sections]);
 const blockOf=useMemo(()=>{const m=new Map<string,Section>();sections.forEach(b=>b.ids.forEach(id=>m.set(id,b)));return m},[sections]);
 const sameUid=useMemo(()=>{const m=new Map<number,number>();markers.forEach(mk=>m.set(mk.uid,(m.get(mk.uid)??0)+1));return m},[markers]);
 const categories=useMemo(()=>{const m=new Map<string,number>();markers.forEach(mk=>m.set(mk.category,(m.get(mk.category)??0)+1));return [...m]},[markers]);
 const pending=useMemo(()=>{const n=new Map<string,number>();interiors?.blocks.forEach(b=>b.zone&&n.set(b.zone,(n.get(b.zone)??0)+1));return interiors?.blocks.filter(b=>!b.sliver&&(!b.certain||(b.label===b.zone&&(n.get(b.zone??'')??0)>1)))??[]},[interiors]);
 const isPending=useMemo(()=>new Set(pending.map(b=>b.id)),[pending]);
 const visible=useMemo(()=>{const q=query.trim().toLowerCase();return markers.filter(mk=>!hidden.includes(mk.category)&&(!q||`${mk.name} ${mk.location} ${mk.id} ${mk.uid}`.toLowerCase().includes(q)))},[markers,hidden,query]);

 // Sin tiles: la imagen completa de 8192 px (yellow-full.png, unida a partir de
 // los tiles nativos) cubre el mundo entero en una sola pieza.
 useEffect(()=>{
  if(!el.current||map.current)return;let dead=false;
  import('leaflet').then(mod=>{
   if(dead||!el.current)return;const L=mod.default;leaflet.current=L;
   const m=L.map(el.current,{crs:L.CRS.Simple,minZoom:-1,maxZoom:5,zoomSnap:1,preferCanvas:true,attributionControl:false});
   L.imageOverlay(FULL_IMAGE,WORLD,{className:'world-image',interactive:false}).on('load',()=>setImageReady(true)).addTo(m);
   m.fitBounds(WORLD);
   extras.current=L.layerGroup().addTo(m);pins.current=L.layerGroup().addTo(m);focus.current=L.layerGroup().addTo(m);
   map.current=m;setReady(true);
  }).catch(e=>console.error('No se pudo cargar Leaflet',e));
  return()=>{dead=true;map.current?.remove();map.current=null};
 },[]);

 useEffect(()=>{
  const L=leaflet.current,g=pins.current;if(!L||!g)return;g.clearLayers();
  for(const mk of visible)L.circleMarker(mk.position,{radius:5,color:'#fff',weight:1.5,fillColor:COLORS[mk.category]??'#ccc',fillOpacity:1}).on('click',()=>setSelected(mk)).addTo(g);
 },[visible,ready]);

 // Cajas de cada seccion (azul: fiable, naranja: por revisar, violeta: interior
 // recortado a mano) y las lineas que unen cada puerta con su interior.
 useEffect(()=>{
  const L=leaflet.current,g=extras.current;if(!L||!g)return;g.clearLayers();
  if(showBlocks)for(const b of sections){
   const doubt=isPending.has(b.id),manual=b.id<0,color=manual?'#b56cff':doubt?'#ff8a3d':'#49a8ff';
   const r=L.rectangle(b.bounds,{color,weight:doubt||manual?2.5:1.5,fill:doubt||manual,fillColor:color,fillOpacity:.12,dashArray:doubt?'5 4':undefined}).on('click',()=>setPickedBlock(b)).addTo(g);
   if(doubt)r.bindTooltip(`#${b.id}`,{permanent:true,direction:'center',className:'wk-tag'});
   else r.bindTooltip(`${manual?'Cut out by hand':'#'+b.id} · ${b.label} · ${b.ids.length} items`,{sticky:true});
  }
  if(showDoors)for(const b of sections)for(const d of b.doors){
   L.polyline([d.at,d.to],{color:'#ffd936',weight:2,dashArray:'2 6',interactive:false}).addTo(g);
   L.circleMarker(d.at,{radius:4,color:'#11182a',weight:2,fillColor:'#ffd936',fillOpacity:1,interactive:false}).addTo(g);
  }
 },[sections,showBlocks,showDoors,ready,isPending]);

 useEffect(()=>{
  const L=leaflet.current,g=focus.current;if(!L||!g)return;g.clearLayers();
  if(selected)L.circleMarker(selected.position,{radius:12,color:'#fff',weight:3,fill:false,dashArray:'4 3',interactive:false}).addTo(g);
 },[selected,ready]);

 const goBlock=(b:Section)=>{setPickedBlock(b);map.current?.flyToBounds(b.bounds,{duration:.6,maxZoom:3})};
 const go=(mk:Marker)=>{setSelected(mk);map.current?.flyTo(mk.position,3,{duration:.6})};
 const toggle=(c:string)=>setHidden(h=>h.includes(c)?h.filter(x=>x!==c):[...h,c]);
 const block=selected?blockOf.get(selected.id):undefined;
 const doors=areas?.kanto.doors.length??0;

 return <div className="wk">
  <div className="wk-map"><div ref={el}/>{!imageReady&&<div className="wk-loading">Loading full image (9.9 MB)…</div>}</div>
  <div className="wk-side">
   <div className="wk-head">
    <h1>Full map</h1>
    <p>{markers.length} items · {sections.length} interior sections · {doors} doors</p>
    <div className="wk-legend"><span><i className="sq"/>confirmed area</span><span><i className="sq dudosa"/>to review</span><span><i className="sq manual"/>cut out by hand</span><span><i className="ln"/>door → interior</span></div>
   </div>
   <div className="wk-filters">
    {categories.map(([c,n])=><button key={c} className={`wk-chip ${hidden.includes(c)?'off':''}`} style={{'--c':COLORS[c]??'#ccc'} as React.CSSProperties} onClick={()=>toggle(c)}><i/>{c}<b>{n}</b></button>)}
    <button className={`wk-chip ${showBlocks?'':'off'}`} onClick={()=>setShowBlocks(v=>!v)}>Sections</button>
    <button className={`wk-chip ${showDoors?'':'off'}`} onClick={()=>setShowDoors(v=>!v)}>Doors</button>
   </div>
   {selected&&<div className="wk-detail">
    <button className="wk-close" onClick={()=>setSelected(null)} aria-label="Close">×</button>
    <small style={{color:COLORS[selected.category]}}>{selected.category}</small>
    <h2>{selected.name}</h2>
    <dl>
     <dt>Location</dt><dd>{selected.location||'—'}</dd>
     <dt>id</dt><dd>{selected.id}</dd>
     <dt>uid</dt><dd>#{selected.uid}{(sameUid.get(selected.uid)??1)>1&&` · shared by ${sameUid.get(selected.uid)} markers`}</dd>
     <dt>Position</dt><dd>{selected.position.map(n=>n.toFixed(2)).join(', ')}</dd>
     <dt>Area</dt><dd>{block?`${block.id<0?'Cut out by hand':'Section #'+block.id} · ${block.label}${isPending.has(block.id)?' (to review)':''}`:'Kanto overworld'}</dd>
     {selected.icon&&<><dt>Icon</dt><dd>{selected.icon}</dd></>}
     {selected.requirements!=null&&<><dt>Requirements</dt><dd>{JSON.stringify(selected.requirements)}</dd></>}
    </dl>
   </div>}
   {pending.length>0&&<div className="wk-review">
    <h3>To review ({pending.length})</h3>
    <p>Tap one to see it on the map and identify it, e.g. <i>#10 is Bill&apos;s house</i>.</p>
    <div>{pending.map(b=><button key={b.id} className={pickedBlock?.id===b.id?'on':''} onClick={()=>{const s=byId.get(b.id);if(s)goBlock(s)}}>#{b.id}<small>{b.label??'?'}</small></button>)}</div>
    {pickedBlock&&<dl><dt>Section</dt><dd>#{pickedBlock.id} · key {pickedBlock.key}</dd><dt>Current name</dt><dd>{pickedBlock.label??'unnamed'}</dd><dt>Contents</dt><dd>{pickedBlock.ids.length} items · {pickedBlock.doors.length} doors</dd></dl>}
   </div>}
   <details className="wk-credits"><summary>Credits</summary><Credits game="yellow" tr={translator('en')}/></details>
   <input className="wk-search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search by name, place, id or uid…"/>
   <div className="wk-count">{visible.length} results{visible.length>LIST_LIMIT&&` · showing the first ${LIST_LIMIT}`}</div>
   <div className="wk-list">
    {visible.slice(0,LIST_LIMIT).map(mk=><button key={mk.id} className={`wk-row ${selected?.id===mk.id?'on':''}`} style={{'--c':COLORS[mk.category]??'#ccc'} as React.CSSProperties} onClick={()=>go(mk)}>
     <i/><span><b>{mk.name}</b><small>{mk.location||'—'}</small></span><em>{blockOf.has(mk.id)?'interior':'kanto'}</em>
    </button>)}
   </div>
  </div>
 </div>;
}
