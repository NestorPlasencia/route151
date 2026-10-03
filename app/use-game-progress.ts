'use client';
import {useCallback,useEffect,useState} from 'react';
import type {Game} from './games';
import {validSaveRecord,type SaveRecord} from './save-record';
export function useGameProgress(game:Game,attempt:number){
 const [done,setDone]=useState<number[]>([]),[skipped,setSkipped]=useState<number[]>([]);
 const [imported,setImported]=useState<SaveRecord|null>(null);
 useEffect(()=>{
  try{setDone(JSON.parse(localStorage.getItem(game.storage.done)||'[]'))}catch{setDone([])}
  try{setSkipped(JSON.parse(localStorage.getItem(`${game.storage.done}-skip`)||'[]'))}catch{setSkipped([])}
  try{const record:unknown=JSON.parse(localStorage.getItem(`${game.storage.done}-sav`)||'null');setImported(validSaveRecord(record)&&record.game===game.id?record:null)}catch{setImported(null)}
 },[game,attempt]);
 const saveDone=(update:(old:number[])=>number[])=>setDone(old=>{const next=update(old);try{localStorage.setItem(game.storage.done,JSON.stringify(next))}catch{}return next});
 const setSkip=(uids:number[],on:boolean)=>setSkipped(old=>{const next=on?[...new Set([...old,...uids])]:old.filter(x=>!uids.includes(x));try{localStorage.setItem(`${game.storage.done}-skip`,JSON.stringify(next))}catch{}return next});
 const doneKey=game.storage.done;
 const setMany=useCallback((uids:number[],on:boolean)=>setDone(old=>{const next=on?[...new Set([...old,...uids])]:old.filter(x=>!uids.includes(x));try{localStorage.setItem(doneKey,JSON.stringify(next))}catch{}return next}),[doneKey]);
 return {done,skipped,saveDone,setSkip,setMany,imported};
}
