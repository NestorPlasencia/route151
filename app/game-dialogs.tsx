'use client';
import {RotateCcw,X} from 'lucide-react';
import {Modal} from './modal';
import {BackupBox} from './backup';
import {OfflineDownload} from './offline';
import {Credits} from './shared';
import {METHODS,type Game,type EncounterZone} from './games';
import type {T} from './i18n';
export function AboutDialog({game,tr,onClose,onTour,onReset}:{game:Game;tr:T;onClose:()=>void;onTour:()=>void;onReset:()=>void}){
 const {t}=tr;
 return <Modal label={t('credits')} onClose={onClose}>
  <button data-dialog-focus className="close" onClick={onClose} aria-label={t('close')}><X/></button>
  <OfflineDownload game={game.id} tr={tr}/><BackupBox tr={tr}/>
  <button className="tour-again" onClick={onTour}>{t('tourAgain')}</button>
  <button className="tour-again reset-game" onClick={onReset}><RotateCcw/>{t('resetGame',{game:game.title})}</button>
  <small>{t('about')}</small><h2>{t('credits')}</h2><Credits game={game.id} tr={tr}/>
 </Modal>;
}
export function EncounterDialog({zone,tr,onClose}:{zone:EncounterZone;tr:T;onClose:()=>void}){
 const {t,place,method}=tr;
 return <Modal className="drawer encounter-drawer" label={place(zone.name)} onClose={onClose}>
  <button data-dialog-focus className="close" onClick={onClose} aria-label={t('close')}><X/></button>
  <small>{t('encountersWild').toUpperCase()}</small><h2>{place(zone.name)}</h2><p>{t('availableHere',{n:zone.pokemon.length})}</p>
  <div className="encounter-list">{zone.pokemon.map(mon=>{
   const variants=mon.areas.flatMap(a=>a.encounters),min=Math.min(...variants.map(v=>v.minLevel)),max=Math.max(...variants.map(v=>v.maxLevel)),chance=Math.max(...variants.map(v=>v.chance));
   return <article key={mon.id}><img src={mon.sprite} alt=""/><div><b>{mon.name.replace(/-/g,' ')}</b><span>{t('encounterRate',{levels:`${min}${max!==min?`–${max}`:''}`,chance,methods:[...new Set(variants.map(v=>method(METHODS[v.method]??v.method)))].join(' · ')})}</span></div></article>;
  })}</div>
 </Modal>;
}
