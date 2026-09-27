'use client';
// Bienvenida: la primera vez que se entra a un juego, unas pantallas que
// ensenan lo que hace la app a quien empieza. Se puede saltar y volver a ver
// desde la ficha de informacion.
import {useState} from 'react';
import {BookOpen,Download,Footprints,ListChecks,Swords,Target} from 'lucide-react';
import type {Key,T} from './i18n';

export const TOUR_KEY='ruta151-tour';
const SLIDES:[typeof ListChecks,Key,Key][]=[
 [ListChecks,'tour1Title','tour1Text'],
 [Target,'tour2Title','tour2Text'],
 [Footprints,'tour3Title','tour3Text'],
 [Swords,'tour4Title','tour4Text'],
 [BookOpen,'tour5Title','tour5Text'],
 [Download,'tour6Title','tour6Text'],
];

export function Tour({onClose,tr}:{onClose:()=>void;tr:T}){
 const {t}=tr;
 const [i,setI]=useState(0);
 const [Icon,title,text]=SLIDES[i],last=i===SLIDES.length-1;
 return <div className="modal-backdrop tour-backdrop" role="presentation">
  <dialog open className="modal tour" aria-modal="true" aria-label={t('tourTitle')}>
   <small>{t('tourTitle')} · {i+1}/{SLIDES.length}</small>
   <i className="tour-icon"><Icon/></i>
   <h2>{t(title)}</h2>
   <p>{t(text)}</p>
   <div className="tour-dots">{SLIDES.map((_,k)=><button key={k} className={k===i?'on':''} aria-label={`${k+1}`} onClick={()=>setI(k)}/>)}</div>
   <div className="tour-actions">
    {!last&&<button className="tour-skip" onClick={onClose}>{t('tourSkip')}</button>}
    {i>0&&<button className="tour-back" onClick={()=>setI(i-1)}>{t('back')}</button>}
    <button className="tour-next" onClick={()=>last?onClose():setI(i+1)}>{t(last?'tourStart':'tourNext')}</button>
   </div>
  </dialog>
 </div>;
}
