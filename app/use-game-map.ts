'use client';
import {useEffect,useRef,useState} from 'react';
import type {Map as LeafletMap,LayerGroup,ImageOverlay,Popup} from 'leaflet';
export function useGameMap(enabled:boolean,onClear:()=>void){
 const popup=useRef<Popup|null>(null),[popupBox,setPopupBox]=useState<HTMLDivElement|null>(null);
 const el=useRef<HTMLDivElement>(null),map=useRef<LeafletMap|null>(null),layer=useRef<LayerGroup|null>(null),overlay=useRef<ImageOverlay|null>(null),shownArea=useRef<string|null>(null),leaflet=useRef<typeof import('leaflet')|null>(null);
 const [mapReady,setMapReady]=useState(false);
 const [mapAttempt,setMapAttempt]=useState(0),[mapFailure,setMapFailure]=useState(false);
 useEffect(()=>{
  // Un solo mapa para todos los juegos: al cambiar de juego solo cambia la imagen.
  if(!enabled||!el.current||map.current)return;let disposed=false;setMapFailure(false);
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
   m.on('click',onClear);setPopupBox(box);
   layer.current=L.layerGroup().addTo(m);map.current=m;setMapReady(true);
  }).catch(e=>{if(!disposed){setMapFailure(true);console.error('No se pudo cargar Leaflet',e)}});
  return()=>{disposed=true;map.current?.remove();map.current=null};
 },[enabled,mapAttempt,onClear]);

 return {popup,popupBox,el,map,layer,overlay,shownArea,leaflet,mapReady,mapFailure,setMapAttempt};
}
