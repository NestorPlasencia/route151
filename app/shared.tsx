// Piezas comunes al mapa, la checklist y la Pokedex.
import {Backpack,Gift,ListChecks,MapPin,Mountain,Search,Sparkles,Store,Swords} from 'lucide-react';
import trainerIcons from '../public/data/trainer-icons.json';
import type {T} from './i18n';

export type Encounter={zone:string;min:number;max:number;chance:number;methods:string[];sprite?:string};
// `area` y `at`: donde se pinta (sin ellos solo aparece en las listas);
// `encounter`: niveles y probabilidad de un Pokemon; `detail`: equipo de un
// entrenador, que pide un intercambio...
export type Marker={id:string;uid:number;category:string;name:string;location:string;icon?:string|null;area?:string;at?:[number,number];detail?:string|null;encounter?:Encounter};

// Capas del mapa: solo estas categorias se pintan como pines.
export const groups=[['Pokémon',Sparkles,'#ffd739'],['Item In Map',MapPin,'#49a8ff'],['Item Gift',Gift,'#ff8ec1'],['In-Game Trade',Gift,'#ad83ff'],['In-Game Gift Pokémon',Sparkles,'#f3a63b'],['Battle',Swords,'#ff5f66']] as const;
// Yellow suma su coleccion de objetos (un pin por objeto: el Old Amber, los
// fosiles, las MT, los de tienda...) y sus tareas; FireRed/LeafGreen, los objetos
// ocultos, las tiendas y los obstaculos (rocas, arbustos).
const yellowGroups=[...groups,['Item',Backpack,'#5ccfb4'],['Miscellaneous Task',ListChecks,'#b9c2cf']] as const;
export const frlgGroups=[...groups.slice(0,2),['Hidden Item',Search,'#7fd4ff'],...groups.slice(2),['Shop',Store,'#5ccfb4'],['Obstacle',Mountain,'#9aa6b8']] as const;
export type Group=(typeof yellowGroups)[number]|(typeof frlgGroups)[number];
export const groupsOf=(game:string):readonly Group[]=>game==='yellow'?yellowGroups:frlgGroups;
export const colorOf=(category:string)=>[...yellowGroups,...frlgGroups].find(g=>g[0]===category)?.[2]??'#fff';

// Los combates de Yellow no traen icono: se deduce de la clase del rival
// ("Youngster #3" -> sprite de Joven; "Snorlax" -> su figurita). Ver
// scripts/download-trainers.py. Los de FRLG traen su sprite del mapa.
const TRAINERS:Record<string,string>=trainerIcons;
// "Rival #8 (Jolteon)" -> "Rival"; el sexo se conserva: "Jr Trainer (F) #2" -> "Jr Trainer (F)".
const trainerClass=(name:string)=>name.replace(/\s*#\d+.*$/,'').replace(/\s*\((?![MF]\))[^)]*\)$/,'').trim();
export const iconOf=(m:{icon?:string|null;category:string;name?:string})=>m.icon??(m.category==='Battle'&&m.name?TRAINERS[trainerClass(m.name)]:undefined);

// Figurita del objeto (PokeAPI, sprites de entrenador o del propio juego, en
// /icons); si no hay, un cuadro del color de su categoria.
export function Figure({m}:{m:{icon?:string|null;category:string;name?:string}}){const icon=iconOf(m);return icon?<img className={`fig ${icon.startsWith('trainer/')||icon.startsWith('frlg/npc/')?'fig-trainer':''}`} src={`/icons/${icon}`} alt="" loading="lazy"/>:<span className="fig fig-none" style={{'--pin':colorOf(m.category)} as React.CSSProperties}/>}

// Creditos: todo el contenido es de terceros y la app es un proyecto de fans.
type Credit={what:string;who:string;href:string;note?:string};
const yellowCredits=(tr:T):Credit[]=>[
 {what:tr.t('creditMap'),who:'ZaidusRecon',href:'https://pokemoncompletion.com/completion/Yellow',note:tr.t('creditVia')},
 {what:tr.t('creditMarkers'),who:'Pokémon Completion',href:'https://pokemoncompletion.com/completion/Yellow',note:tr.t('creditFlags')},
 {what:tr.t('creditData'),who:'PokéAPI',href:'https://pokeapi.co'},
 {what:tr.t('creditTrainers'),who:'Pokémon Showdown',href:'https://play.pokemonshowdown.com'},
 {what:tr.t('creditOrder'),who:'Bulbapedia',href:'https://bulbapedia.bulbagarden.net/wiki/Appendix:Yellow_walkthrough'},
];
const frlgCredits=(tr:T):Credit[]=>[
 {what:tr.t('creditFrlg'),who:'pret/pokefirered',href:'https://github.com/pret/pokefirered',note:tr.t('creditDecomp')},
 {what:tr.t('creditDex'),who:'PokéAPI',href:'https://pokeapi.co'},
];
export function Credits({game,tr}:{game:string;tr:T}){return <div className="credits">
 <ul>{(game==='yellow'?yellowCredits(tr):frlgCredits(tr)).map(c=><li key={c.what}><span>{c.what}</span><a href={c.href} target="_blank" rel="noreferrer">{c.who}</a>{c.note&&<small>{c.note}</small>}</li>)}</ul>
 <p>{tr.t('disclaimer')}</p>
</div>}
