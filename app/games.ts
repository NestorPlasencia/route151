// Juegos de la app y su carga. Cada juego se convierte al mismo modelo (World):
// areas con imagen propia (regiones y pisos), puertas entre areas, lugares a
// los que ir, marcadores con su area y su punto, encuentros por zona, checklist
// y Pokedex. Asi el mapa y las listas son los mismos para todos los juegos.
import type {Choice,Gate,Marker} from './shared';
import type {Checklist,Dex} from './lists';
import {rulesFor,type Gen} from './rules';

export type Pt=[number,number];
export type Area={id:string;kind:'region'|'interior';label:string;zone?:string;image:string;width:number;height:number};
export type Warp={area:string;at:Pt;to:string;toAt:Pt};
export type Place={name:string;area:string;at?:Pt};
export type EncounterMon={id:number;name:string;sprite:string;types:string[];areas:{area:string;maxChance:number;encounters:{chance:number;minLevel:number;maxLevel:number;method:string}[]}[]};
export type EncounterZone={name:string;pokemon:EncounterMon[]};
export type World={areas:Area[];warps:Warp[];places:Place[];markers:Marker[];zones:EncounterZone[];checklist:Checklist;dex:Dex;gates:Gate[];choices:Choice[]};
export type Game={
 id:string;short:string;title:string;
 // Claves de localStorage con el progreso.
 storage:{done:string;dex:string};
 // Donde estan sus datos (todos los juegos generan los mismos archivos), que
 // version es (para los exclusivos y su Pokedex) y de que generacion son sus
 // reglas (rules.ts): con eso se sabe todo lo demas.
 data:string;version:string;gen:Gen;
 // Capas que empiezan ocultas y categorias que no cuentan como progreso
 // (obstaculos y tiendas: comprar no es coleccionar).
 hidden:string[];untracked:string[];
};

async function json<T>(url:string):Promise<T>{const r=await fetch(url);if(!r.ok)throw new Error(`${r.status} ${url}`);return r.json() as Promise<T>}

// Metodos de encuentro como los nombra PokeAPI; los datos de ahora ya traen el
// nombre final, asi que solo se traduce lo que venga con ese formato.
export const METHODS:Record<string,string>={walk:'Grass','old-rod':'Old Rod','good-rod':'Good Rod','super-rod':'Super Rod',surf:'Surf'};

// Un solo cargador: cada juego se genera desde su decompilacion (scripts/frlg,
// scripts/yellow) con los mismos archivos. FireRed y LeafGreen comparten
// mapas y marcadores; los exclusivos de cada version llevan `version`.
export async function loadGame(game:Game):Promise<World>{
 const {data,version}=game;
 const [a,markers,enc,checklist,dex]=await Promise.all([
  json<{areas:Area[];warps:Warp[];places:Place[]}>(`${data}/areas.json`),json<(Marker&{version?:string})[]>(`${data}/markers.json`),
  json<{zones:EncounterZone[]}>(`${data}/encounters-${version}.json`),json<Checklist>(`${data}/checklist.json`),json<Dex>(`${data}/pokedex-${version}.json`)]);
 // Bloqueos: los de la historia (a mano) y los de las MO (sacados de los mapas:
 // lo que queda detras de un arbol o del agua). Si un juego no los tiene, nada.
 const fileOf=(file:string)=>json<{gates:Gate[];choices?:Choice[]}>(`${data}/${file}`).catch(()=>({gates:[] as Gate[],choices:[] as Choice[]}));
 const [story,hm]=await Promise.all([fileOf('gates.json'),fileOf('hm-gates.json')]);
 const gates=[...story.gates,...hm.gates],choices=story.choices??[];
 return {...a,markers:markers.filter(m=>!m.version||m.version===version),zones:enc.zones,checklist,dex,gates,choices};
}
// Datos de combate y, si las reglas los tienen, textos de los ataques.
export const battleUrl=(game:Game)=>`${game.data}/battle.json`;
export const moveTextUrl=(game:Game)=>rulesFor(game.gen).moveText?`${game.data}/move-text.json`:null;

export const GAMES:Game[]=[
 {id:'yellow',short:'Yellow',title:'Pokémon Yellow',storage:{done:'ruta151-yellow',dex:'ruta151-yellow-dex'},data:'/yellow/data',version:'yellow',gen:1,hidden:['Obstacle'],untracked:['Obstacle','Shop']},
 {id:'firered',short:'FireRed',title:'Pokémon FireRed',storage:{done:'ruta151-firered',dex:'ruta151-firered-dex'},data:'/frlg/data',version:'firered',gen:3,hidden:['Obstacle'],untracked:['Obstacle','Shop']},
 {id:'leafgreen',short:'LeafGreen',title:'Pokémon LeafGreen',storage:{done:'ruta151-leafgreen',dex:'ruta151-leafgreen-dex'},data:'/frlg/data',version:'leafgreen',gen:3,hidden:['Obstacle'],untracked:['Obstacle','Shop']},
];
