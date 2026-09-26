// Juegos de la app y su carga. Cada juego se convierte al mismo modelo (World):
// areas con imagen propia (regiones y pisos), puertas entre areas, lugares a
// los que ir, marcadores con su area y su punto, encuentros por zona, checklist
// y Pokedex. Asi el mapa y las listas son los mismos para todos los juegos.
import type {Marker} from './shared';
import type {Checklist,Dex} from './lists';

export type Pt=[number,number];
export type Area={id:string;kind:'region'|'interior';label:string;zone?:string;image:string;width:number;height:number};
export type Warp={area:string;at:Pt;to:string;toAt:Pt};
export type Place={name:string;area:string;at?:Pt};
export type EncounterMon={id:number;name:string;sprite:string;types:string[];areas:{area:string;maxChance:number;encounters:{chance:number;minLevel:number;maxLevel:number;method:string}[]}[]};
export type EncounterZone={name:string;pokemon:EncounterMon[]};
export type World={areas:Area[];warps:Warp[];places:Place[];markers:Marker[];zones:EncounterZone[];checklist:Checklist;dex:Dex};
export type Game={
 id:string;short:string;title:string;
 // Claves de localStorage con el progreso (las de Yellow son las de siempre).
 storage:{done:string;dex:string};
 // Datos de combate (equipo, ranking, consejos) y, si los hay, textos de los ataques.
 battle:string;moveText?:string;
 // Capas que empiezan ocultas y categorias que no cuentan como progreso (en FRLG,
 // obstaculos y tiendas: comprar no es coleccionar).
 hidden:string[];untracked:string[];
 load:()=>Promise<World>;
};

async function json<T>(url:string):Promise<T>{const r=await fetch(url);if(!r.ok)throw new Error(`${r.status} ${url}`);return r.json() as Promise<T>}

// --- Yellow ---------------------------------------------------------------------
// Generado desde la decompilacion (scripts/yellow), en el mismo formato que FRLG.

// Metodos de encuentro como los nombra PokeAPI; los datos de ahora ya traen el
// nombre final, asi que solo se traduce lo que venga con ese formato.
export const METHODS:Record<string,string>={walk:'Grass','old-rod':'Old Rod','good-rod':'Good Rod','super-rod':'Super Rod',surf:'Surf'};

async function loadYellow():Promise<World>{
 const [a,markers,enc,checklist,dex]=await Promise.all([
  json<{areas:Area[];warps:Warp[];places:Place[]}>('/yellow/data/areas.json'),json<Marker[]>('/yellow/data/markers.json'),
  json<{zones:EncounterZone[]}>('/yellow/data/encounters.json'),json<Checklist>('/yellow/data/checklist.json'),json<Dex>('/yellow/data/pokedex.json')]);
 return {...a,markers,zones:enc.zones,checklist,dex};
}

// --- FireRed / LeafGreen ----------------------------------------------------------
// Generados desde la decompilacion (scripts/frlg); comparten mapas y marcadores,
// y los exclusivos de cada version llevan `version`.

async function loadFrlg(version:'firered'|'leafgreen'):Promise<World>{
 const [a,markers,enc,checklist,dex]=await Promise.all([
  json<{areas:Area[];warps:Warp[];places:Place[]}>('/frlg/data/areas.json'),json<(Marker&{version?:string})[]>('/frlg/data/markers.json'),
  json<{zones:EncounterZone[]}>(`/frlg/data/encounters-${version}.json`),json<Checklist>('/frlg/data/checklist.json'),json<Dex>(`/frlg/data/pokedex-${version}.json`)]);
 return {...a,markers:markers.filter(m=>!m.version||m.version===version),zones:enc.zones,checklist,dex};
}

export const GAMES:Game[]=[
 // Yellow empieza de cero con los datos del juego: sus marcadores son otros, asi
 // que el progreso tiene claves nuevas (las de antes, 'ruta151-full', no casan).
 {id:'yellow',short:'Yellow',title:'Pokémon Yellow',storage:{done:'ruta151-yellow',dex:'ruta151-yellow-dex'},battle:'/yellow/data/battle.json',hidden:['Obstacle'],untracked:['Obstacle','Shop'],load:loadYellow},
 {id:'firered',short:'FireRed',title:'Pokémon FireRed',storage:{done:'ruta151-firered',dex:'ruta151-firered-dex'},battle:'/frlg/data/battle.json',moveText:'/frlg/data/move-text.json',hidden:['Obstacle'],untracked:['Obstacle','Shop'],load:()=>loadFrlg('firered')},
 {id:'leafgreen',short:'LeafGreen',title:'Pokémon LeafGreen',storage:{done:'ruta151-leafgreen',dex:'ruta151-leafgreen-dex'},battle:'/frlg/data/battle.json',moveText:'/frlg/data/move-text.json',hidden:['Obstacle'],untracked:['Obstacle','Shop'],load:()=>loadFrlg('leafgreen')},
];
