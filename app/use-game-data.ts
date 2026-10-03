'use client';
import {useEffect,useState} from 'react';
import {loadJson} from './load-json';
import {loadGame,type Game,type World} from './games';
import type {Lang,Names} from './i18n';
import type {Battle} from './battle';

// La identidad de cada respuesta es su URL: cambiar de juego nunca mezcla datos.
export function useJsonResource<T>(url:string|null,enabled:boolean,valid:(value:T)=>boolean){
 const [values,setValues]=useState<Record<string,T>>({}),[failure,setFailure]=useState<string|null>(null),[attempt,setAttempt]=useState(0);
 const value=url?values[url]??null:null;
 useEffect(()=>{
  if(!url||!enabled||value)return;const controller=new AbortController();setFailure(null);
  loadJson<T>(url,{signal:controller.signal}).then(next=>{if(!valid(next))throw new Error(`Invalid data: ${url}`);if(!controller.signal.aborted)setValues(old=>({...old,[url]:next}))}).catch(error=>{if(!controller.signal.aborted){setFailure(url);console.error(error)}});
  return()=>controller.abort();
 },[url,enabled,value,attempt,valid]);
 return {value,failure,setAttempt};
}
export function useGameWorld(game:Game){
 const [data,setData]=useState<{id:string;world:World}|null>(null),[worldFailure,setWorldFailure]=useState<string|null>(null),[loadAttempt,setLoadAttempt]=useState(0);
 useEffect(()=>{
  const controller=new AbortController();setData(null);setWorldFailure(null);
  loadGame(game,controller.signal).then(world=>{if(!controller.signal.aborted)setData({id:game.id,world})}).catch(error=>{if(!controller.signal.aborted){setWorldFailure(game.id);console.error(error)}});
  return()=>controller.abort();
 },[game,loadAttempt]);
 return {world:data?.id===game.id?data.world:null,worldFailure,loadAttempt,setLoadAttempt};
}
const validNames=(n:NonNullable<Names>)=>!!n&&[n.items,n.moves,n.abilities,n.natures].every(table=>!!table&&typeof table==='object'&&!Array.isArray(table)&&Object.values(table).every(value=>typeof value==='string'));
const validBattle=(b:Battle)=>!!b&&!!b.species&&!!b.moves&&!!b.chart&&!!b.natures&&!!b.abilities;
const validText=(texts:Record<string,{en:string;es:string}>)=>!!texts&&typeof texts==='object'&&!Array.isArray(texts)&&Object.values(texts).every(text=>!!text&&typeof text.en==='string'&&typeof text.es==='string');
export const useNames=(lang:Lang)=>useJsonResource('/data/names-es.json',lang==='es',validNames);
export const useBattle=(url:string,enabled:boolean)=>useJsonResource(url,enabled,validBattle);
export const useMoveText=(url:string|null,enabled:boolean)=>useJsonResource(url,enabled,validText);
