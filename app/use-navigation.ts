'use client';
import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {movesYouHave,openTree,prepare,reachTiles,targetAt,type Nav,type Target,type Tree,type World as RouteWorld} from './pathfind';
import type {Game,World} from './games';
import {loadJson} from './load-json';
import {measure} from './performance';
const PEOPLE=['Item Gift','In-Game Trade','Battle','In-Game Gift Pokémon','Shop'];
export function useNavigation(game:Game,world:World|null){
 const [navAttempt,setNavAttempt]=useState(0),[navFailure,setNavFailure]=useState<string|null>(null);
 // La rejilla de los mapas (nav.json): para las rutas y para saber a que llegas.
 const [navData,setNavData]=useState<{url:string;w:RouteWorld}|null>(null);
 const navUrl=`${game.data}/nav.json`,navWorld=navData?.url===navUrl?navData.w:null;
 useEffect(()=>{if(!world||navWorld)return;const controller=new AbortController();setNavFailure(null);
  loadJson<Nav>(navUrl,{signal:controller.signal}).then(n=>{if(!n.maps||!n.moves||!Array.isArray(n.starts)||!Array.isArray(n.ferry))throw new Error('Invalid navigation data');const w=measure('prepare',()=>prepare(n));if(!controller.signal.aborted)setNavData({url:navUrl,w})}).catch(e=>{if(!controller.signal.aborted){setNavFailure(navUrl);console.error('No se pudo cargar la rejilla de rutas',e)}});
  return()=>controller.abort();
 },[world,navWorld,navUrl,navAttempt]);
 // Zonas y mapas que la historia aun no abre con lo que tienes (guardias, Snorlax...).
 const storyLeft=useCallback((owned:Set<string>)=>(world?.gates??[]).filter(x=>!x.id.startsWith('hm-')&&x.needs.some(n=>!owned.has(n))),[world]);
 const closedBy=useCallback((owned:Set<string>)=>{const story=storyLeft(owned);
  return (map:string)=>{const z=navWorld?.grids.get(map)?.m.zone;return story.find(x=>!!x.maps?.includes(map)||(!!z&&!!x.zones?.includes(z)))??null}},[storyLeft,navWorld]);
 // Casilla de cada marcador en la rejilla, y el arbol de caminos con todo abierto.
 const targets=useMemo(()=>{const out=new Map<string,Target>();if(navWorld&&world)for(const m of world.markers)if(m.area&&m.at){const x=targetAt(navWorld,m.area,m.at,PEOPLE.includes(m.category));if(x)out.set(m.id,x)}return out},[navWorld,world]);
 const tree=useMemo(()=>navWorld?measure('openTree',()=>openTree(navWorld)):null,[navWorld]);
 // El mismo arbol con solo tus MO (sin cierres de la historia), por firma de MO.
 const treeCache=useRef<{url:string;trees:Map<string,Tree>}>({url:'',trees:new Map()});
 const treeWith=useCallback((can:Set<string>)=>{
  if(!navWorld)return null;
  if(treeCache.current.url!==navUrl)treeCache.current={url:navUrl,trees:new Map()};
  const sig=[...can].sort().join();let hit=treeCache.current.trees.get(sig);
  if(!hit){hit=measure('openTreeOwned',()=>openTree(navWorld,can));treeCache.current.trees.set(sig,hit)}
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
  if(!hit){const tiles=measure('reachTiles',()=>reachTiles(navWorld,can,m=>!!closed(m)));hit={tiles,maps:new Set([...tiles].map(k=>Math.floor(k/65536)))};reachCache.current.tiles.set(sig,hit)}
  return {...hit,can,closed};
 },[navWorld,navUrl,storyLeft,closedBy]);
 return {navUrl,navWorld,navFailure,setNavAttempt,targets,tree,treeWith,reachFor,closedBy};
}
