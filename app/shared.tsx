'use client';
// Piezas comunes al mapa, la checklist y la Pokedex.
import {useEffect,useState} from 'react';
import {Gift,MapPin,Mountain,Search,Sparkles,Store,Swords} from 'lucide-react';
import type {T} from './i18n';

export type Encounter={zone:string;min:number;max:number;chance:number;methods:string[];sprite?:string};
// `area` y `at`: donde se pinta (sin ellos solo aparece en las listas);
// `encounter`: niveles y probabilidad de un Pokemon; `detail`: equipo de un
// entrenador, que pide un intercambio...
export type Marker={id:string;uid:number;category:string;name:string;location:string;icon?:string|null;area?:string;at?:[number,number];detail?:string|null;encounter?:Encounter};

// Capas del mapa: solo estas categorias se pintan como pines.
export const groups=[['Pokémon',Sparkles,'#ffd739'],['Item In Map',MapPin,'#49a8ff'],['Item Gift',Gift,'#ff8ec1'],['In-Game Trade',Gift,'#ad83ff'],['In-Game Gift Pokémon',Sparkles,'#f3a63b'],['Battle',Swords,'#ff5f66']] as const;
// Los juegos suman los objetos ocultos, las tiendas y los obstaculos (rocas de
// Fuerza; en FRLG tambien arbustos de Corte y rocas de Golpe Roca).
export const frlgGroups=[...groups.slice(0,2),['Hidden Item',Search,'#7fd4ff'],...groups.slice(2),['Shop',Store,'#5ccfb4'],['Obstacle',Mountain,'#9aa6b8']] as const;
export type Group=(typeof frlgGroups)[number];
// Todos los juegos salen ya de su decompilacion y comparten capas.
export const groupsOf=(_game:string):readonly Group[]=>frlgGroups;
export const colorOf=(category:string)=>frlgGroups.find(g=>g[0]===category)?.[2]??'#fff';

// Herramientas que hacen falta para un metodo de encuentro, por el nombre de su
// marcador en la checklist (el mismo en todos los juegos): la cana para pescar,
// la MO para surfear o romper rocas. Andar por hierba o cueva no pide nada.
export const TOOLS:Record<string,string>={'Old Rod':'Old Rod','Good Rod':'Good Rod','Super Rod':'Super Rod',Surf:'HM03','Rock Smash':'HM06'};
// Lo que ya tienes: los nombres de los marcadores marcados en tu checklist (la
// Cana Vieja, la MO03, "Leader Brock"...). De ahi salen herramientas y bloqueos.
export const haveNames=(markers:Marker[],done:number[])=>new Set(markers.filter(m=>done.includes(m.uid)).map(m=>m.name));
// La herramienta que te falta para atrapar este Pokemon, o null si alguna de sus
// formas de encontrarlo ya te sirve (hierba y pesca: con la hierba basta).
export const missingTool=(m:Marker,owned:Set<string>)=>{
 const methods=m.category==='Pokémon'?m.encounter?.methods??[]:[];
 if(!methods.length||methods.some(method=>!TOOLS[method]||owned.has(TOOLS[method])))return null;
 // La primera que se consigue de las que sirven: si vale la Cana Buena, no pide la Super.
 const order=Object.values(TOOLS);
 return methods.map(method=>TOOLS[method]).sort((x,y)=>order.indexOf(x)-order.indexOf(y))[0];
};

// Bloqueos de cada juego: zonas, mapas o marcadores sueltos que no se pueden
// hacer hasta tener ciertos marcadores. Los de la historia van a mano en
// gates.json (el gimnasio de Verde pide las otras 7 medallas); los de las MO
// salen de los mapas en hm-gates.json (los objetos de la Ruta 2 tras un arbol
// de Corte). El primero sin cumplir que afecte al marcador, o null.
export type Gate={id:string;zones?:string[];maps?:string[];markers?:string[];needs:string[];why:{en:string;es:string}};
export const unmetGate=(m:Marker&{map?:string;zone?:string},gates:Gate[],have:Set<string>)=>gates.find(g=>
 (g.zones?.includes(m.zone??'')||g.maps?.includes(m.map??'')||g.markers?.includes(m.id))&&!g.needs.includes(m.name)&&g.needs.some(n=>!have.has(n)))??null;

// Todos los marcadores traen su figurita: los combates, el sprite del mapa.
export const iconOf=(m:{icon?:string|null})=>m.icon??undefined;

// Figurita del objeto (sprites del propio juego o de PokeAPI en FRLG, en
// /icons); si no hay, un cuadro del color de su categoria.
export function Figure({m}:{m:{icon?:string|null;category:string;name?:string}}){const icon=iconOf(m);return icon?<img className={`fig ${icon.startsWith('frlg/npc/')||icon.startsWith('yellow/npc/')?'fig-trainer':''}`} src={`/icons/${icon}`} alt="" loading="lazy"/>:<span className="fig fig-none" style={{'--pin':colorOf(m.category)} as React.CSSProperties}/>}

// Creditos: todo el contenido es de terceros y la app es un proyecto de fans.
type Credit={what:string;who:string;href:string;note?:string};
// Yellow sale entero de su decompilacion (mapas, datos y sprites); de PokeAPI
// solo quedan los nombres en espanol, que el juego no trae.
const yellowCredits=(tr:T):Credit[]=>[
 {what:tr.t('creditYellow'),who:'pret/pokeyellow',href:'https://github.com/pret/pokeyellow',note:tr.t('creditDecomp')},
 {what:tr.t('creditNames'),who:'PokéAPI',href:'https://pokeapi.co'},
 {what:tr.t('creditClasses'),who:'Pokémon Wiki (es)',href:'https://pokemon.fandom.com/es/wiki/Lista_de_clases_de_entrenadores'},
];
const frlgCredits=(tr:T):Credit[]=>[
 {what:tr.t('creditFrlg'),who:'pret/pokefirered',href:'https://github.com/pret/pokefirered',note:tr.t('creditDecomp')},
 {what:tr.t('creditDex'),who:'PokéAPI',href:'https://pokeapi.co'},
 {what:tr.t('creditClasses'),who:'Pokémon Wiki (es)',href:'https://pokemon.fandom.com/es/wiki/Lista_de_clases_de_entrenadores'},
];
export function Credits({game,tr}:{game:string;tr:T}){return <div className="credits">
 <ul>{(game==='yellow'?yellowCredits(tr):frlgCredits(tr)).map(c=><li key={c.what}><span>{c.what}</span><a href={c.href} target="_blank" rel="noreferrer">{c.who}</a>{c.note&&<small>{c.note}</small>}</li>)}</ul>
 <p>{tr.t('disclaimer')}</p>
</div>}

// Casilla de numeros que aguanta que la borres. Una casilla controlada con
// type=number se pelea con el teclado de Android: al borrar la ultima cifra el
// valor vuelve solo y queda un digito pegado. Aqui se guarda lo que escribes
// tal cual, se avisa al padre solo cuando es un numero dentro del rango, y al
// salir se ajusta. El teclado sigue siendo el numerico por `inputMode`.
// `stop`: frena el clic para poder usarla dentro de un <summary> sin que este
// abra o cierre la ficha.
export function Num({value,min,max,onChange,label,className,stop}:{value:number;min:number;max:number;onChange:(n:number)=>void;label?:string;className?:string;stop?:boolean}){
 const [text,setText]=useState(String(value));
 const [typing,setTyping]=useState(false);
 useEffect(()=>{if(!typing)setText(String(value))},[value,typing]);
 const clamp=(n:number)=>Math.max(min,Math.min(max,n));
 return <input type="text" inputMode="numeric" pattern="[0-9]*" className={className} aria-label={label} value={text}
  onClick={stop?(e=>{e.preventDefault();e.stopPropagation();e.currentTarget.focus()}):undefined}
  onFocus={()=>setTyping(true)}
  onChange={e=>{
   const raw=e.target.value.replace(/\D/g,'').slice(0,4);
   setText(raw);
   const n=Number(raw);
   // Mientras escribes solo se confirma lo que ya vale: asi "1" camino de
   // "15" no se convierte en otra cosa ni el campo se queda a medias.
   if(raw&&n>=min&&n<=max)onChange(n);
  }}
  onBlur={()=>{
   setTyping(false);
   const n=Number(text);
   if(!text||Number.isNaN(n)){setText(String(value));return}
   onChange(clamp(n));setText(String(clamp(n)));
  }}/>;
}
