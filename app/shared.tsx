// Piezas comunes al mapa, la checklist y la Pokedex.
import {Gift,MapPin,Sparkles,Swords} from 'lucide-react';
import trainerIcons from '../public/data/trainer-icons.json';

export type Marker={id:string;uid:number;category:string;name:string;location:string;position:[number,number];icon?:string|null};

// Capas del mapa: solo estas categorias se pintan como pines.
export const groups=[['Pokémon',Sparkles,'#ffd739'],['Item In Map',MapPin,'#49a8ff'],['Item Gift',Gift,'#ff8ec1'],['In-Game Trade',Gift,'#ad83ff'],['In-Game Gift Pokémon',Sparkles,'#f3a63b'],['Battle',Swords,'#ff5f66']] as const;
// Las listas muestran tambien objetos de tienda y tareas, que no son pines.
const EXTRA:Record<string,string>={Item:'#5ccfb4','Miscellaneous Task':'#b9c2cf'};
export const colorOf=(category:string)=>groups.find(g=>g[0]===category)?.[2]??EXTRA[category]??'#fff';
export const CATEGORY_NAMES:Record<string,string>={'Pokémon':'Pokémon','Item In Map':'Item on the map','Item Gift':'Gift item','In-Game Trade':'In-game trade','In-Game Gift Pokémon':'Gift Pokémon','Battle':'Battle',Item:'Item','Miscellaneous Task':'Task'};

// Los combates no traen icono: se deduce de la clase del rival ("Youngster #3"
// -> sprite de Joven; "Snorlax" -> su figurita). Ver scripts/download-trainers.py.
const TRAINERS:Record<string,string>=trainerIcons;
// "Rival #8 (Jolteon)" -> "Rival"; el sexo se conserva: "Jr Trainer (F) #2" -> "Jr Trainer (F)".
const trainerClass=(name:string)=>name.replace(/\s*#\d+.*$/,'').replace(/\s*\((?![MF]\))[^)]*\)$/,'').trim();
export const iconOf=(m:{icon?:string|null;category:string;name?:string})=>m.icon??(m.category==='Battle'&&m.name?TRAINERS[trainerClass(m.name)]:undefined);

// Figurita del objeto (PokeAPI y sprites de entrenador, en /icons); si no hay,
// un cuadro del color de su categoria.
export function Figure({m}:{m:{icon?:string|null;category:string;name?:string}}){const icon=iconOf(m);return icon?<img className={`fig ${icon.startsWith('trainer/')?'fig-trainer':''}`} src={`/icons/${icon}`} alt="" loading="lazy"/>:<span className="fig fig-none" style={{'--pin':colorOf(m.category)} as React.CSSProperties}/>}

// Creditos: todo el contenido es de terceros y la app es un proyecto de fans.
export const CREDITS:{what:string;who:string;href:string;note?:string}[]=[
 {what:'Map image',who:'ZaidusRecon',href:'https://pokemoncompletion.com/completion/Yellow',note:'via Pokémon Completion'},
 {what:'Checklist and map markers',who:'Pokémon Completion',href:'https://pokemoncompletion.com/completion/Yellow',note:'with event flag research by FabioAttard'},
 {what:'Encounters, Pokédex data and sprites',who:'PokéAPI',href:'https://pokeapi.co'},
 {what:'Trainer sprites',who:'Pokémon Showdown',href:'https://play.pokemonshowdown.com'},
 {what:'Walkthrough order',who:'Bulbapedia',href:'https://bulbapedia.bulbagarden.net/wiki/Appendix:Yellow_walkthrough'},
];
export function Credits(){return <div className="credits">
 <ul>{CREDITS.map(c=><li key={c.what}><span>{c.what}</span><a href={c.href} target="_blank" rel="noreferrer">{c.who}</a>{c.note&&<small>{c.note}</small>}</li>)}</ul>
 <p>Route 151 is an unofficial fan project and is not affiliated with, endorsed or sponsored by Nintendo, Game Freak, Creatures Inc. or The Pokémon Company. Pokémon and all related names and images are trademarks of their respective owners.</p>
</div>}
