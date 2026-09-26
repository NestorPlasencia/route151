'use client';
// Inicio: se elige el juego. Sale la primera vez (sin juego guardado ni ?game
// en la URL) y al tocar el logo; despues de elegir se entra al mapa. Cada
// tarjeta lee el progreso guardado de su juego sin cargar sus datos.
import {useEffect,useState} from 'react';
import {Map as MapIcon} from 'lucide-react';
import {GAMES} from './games';
import {LANGS,LANG_NAMES,type Lang,type T} from './i18n';

// Portada y consola de cada juego: la mascota de su caja.
const COVER:Record<string,{icon:string;color:string;system:string}>={
 yellow:{icon:'yellow/pokemon/p25.png',color:'#ffd936',system:'Game Boy · 1998'},
 firered:{icon:'pokemon/p6.png',color:'#f0643c',system:'Game Boy Advance · 2004'},
 leafgreen:{icon:'pokemon/p3.png',color:'#52c46b',system:'Game Boy Advance · 2004'},
};

type Saved={done:number;team:number};
const read=(key:string)=>{try{const list=JSON.parse(localStorage.getItem(key)||'[]');return Array.isArray(list)?list.length:0}catch{return 0}};

export function GameHome({current,last,lang,onLang,onPick,tr}:{current:string;last:string|null;lang:Lang;onLang:(l:Lang)=>void;onPick:(id:string)=>void;tr:T}){
 const {t}=tr;
 const [saved,setSaved]=useState<Record<string,Saved>>({});
 useEffect(()=>{setSaved(Object.fromEntries(GAMES.map(g=>[g.id,{done:read(g.storage.done),team:g.id==='yellow'?0:read(`${g.storage.done}-team`)}])))},[]);
 return <section className="home" aria-label={t('homeChoose')}>
  <div className="home-inner">
   <div className="home-brand"><i><MapIcon/></i><b>ROUTE 151</b></div>
   <p className="home-tagline">{t('homeTagline')}</p>
   <div className="home-langs">{LANGS.map(l=><button key={l} className={l===lang?'on':''} aria-pressed={l===lang} onClick={()=>onLang(l)}>{LANG_NAMES[l]}</button>)}</div>
   <h2>{t('homeChoose')}</h2>
   <div className="home-games">{GAMES.map(g=>{
    const cover=COVER[g.id],s=saved[g.id];
    return <button key={g.id} className={`home-game ${g.id===current?'current':''}`} style={{'--c':cover?.color} as React.CSSProperties} onClick={()=>onPick(g.id)}>
     <span className="home-cover">{cover&&<img src={`/icons/${cover.icon}`} alt=""/>}</span>
     <span className="home-text">
      <b>{g.title}{g.id===last&&<i>{t('homeLast')}</i>}</b>
      <small>{cover?.system}</small>
      <small className="home-progress">{s?.done?t('homeDone',{n:s.done}):t('homeNew')}{s?.team?` · ${t('homeTeam',{n:s.team})}`:''}</small>
     </span>
    </button>;
   })}</div>
  </div>
 </section>;
}
