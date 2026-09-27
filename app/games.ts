// Juegos de la app y su carga. Cada juego se convierte al mismo modelo (World):
// areas con imagen propia (regiones y pisos), puertas entre areas, lugares a
// los que ir, marcadores con su area y su punto, encuentros por zona, checklist
// y Pokedex. Asi el mapa y las listas son los mismos para todos los juegos.
import type {Choice,Gate,Marker} from './shared';
import {registerStory,registerTeach} from './i18n';
import type {Checklist,Dex} from './lists';
import {rulesFor,type Gen} from './rules';

export type Pt=[number,number];
export type Area={id:string;kind:'region'|'interior';label:string;zone?:string;image:string;width:number;height:number};
export type Warp={area:string;at:Pt;to:string;toAt:Pt};
export type Place={name:string;area:string;at?:Pt};
export type EncounterMon={id:number;name:string;sprite:string;types:string[];areas:{area:string;maxChance:number;encounters:{chance:number;minLevel:number;maxLevel:number;method:string}[]}[]};
export type EncounterZone={name:string;pokemon:EncounterMon[]};
export type World={areas:Area[];warps:Warp[];places:Place[];markers:Marker[];zones:EncounterZone[];checklist:Checklist;dex:Dex;gates:Gate[];choices:Choice[];goals:string[];goalNotes:Record<string,{en:string;es:string}>};
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
// Numero estable para guardar el progreso: el mismo FNV-1a de 31 bits que
// scripts/common/world.py (uid_of), para que un paso valga lo mismo en los dos.
const uidOf=(text:string)=>{let h=2166136261;for(const b of new TextEncoder().encode(text)){h^=b;h=Math.imul(h,16777619)>>>0}return h&0x7fffffff};

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
 // Objetivos (goals.json, a mano), en orden. Cada uno es un marcador de la
 // checklist ("id") o un paso propio ("step" con su mapa y casilla): este se
 // vuelve un marcador mas, un check de verdad, colocado con la rejilla de los
 // mapas (nav.json) y con su piso en la checklist. Su uid sale de su nombre,
 // como el de cualquier marcador, para que el progreso no se pierda.
 type Goal={id:string;name?:string;note?:{en:string;es:string}}|{step:string;map:string;x:number;y:number;name:{en:string;es:string};detail:{en:string;es:string}};
 const [goalList,nav]=await Promise.all([
  json<{goals:Goal[]}>(`${data}/goals.json`).then(g=>g.goals).catch(()=>[] as Goal[]),
  json<{maps:Record<string,{zone:string;area:string;x:number;y:number}>}>(`${data}/nav.json`).then(n=>n.maps).catch(()=>({} as Record<string,{zone:string;area:string;x:number;y:number}>))]);
 const prefix=data.split('/').filter(Boolean)[0],areaById=new Map(a.areas.map(x=>[x.id,x]));
 const steps:(Marker&{zone:string;floor:string|null})[]=[];
 for(const g of goalList){
  if(!('step' in g))continue;
  const m=nav[g.map];if(!m)continue;
  const inside=areaById.get(m.area)?.kind==='interior',floor=inside?areaById.get(m.area)!.label:null;
  steps.push({id:`${g.map}:story:${g.step}`,uid:uidOf(`${prefix}:story:${g.step}`),category:'Story',name:g.name.en,detail:g.detail.en,
   location:floor??m.zone,area:m.area,at:[(m.x+g.x)*16+8,(m.y+g.y)*16+8],icon:null,zone:m.zone,floor});
 }
 // Que ataque ensena cada MT/MO de este juego (no son las mismas en Gen 1 y Gen 3).
 registerTeach(markers.flatMap(m=>m.move?[[m.name,m.move] as [string,string]]:[]));
 registerStory(goalList.flatMap(g=>'step' in g?[[g.name.en,g.name.es,g.detail.en,g.detail.es] as [string,string,string,string]]:[]));
 const list={...checklist,markers:{...checklist.markers},zones:checklist.zones.map(z=>({...z,floors:[...z.floors]}))};
 for(const s of steps){
  list.markers[s.id]=s.floor?{zone:s.zone,floor:s.floor}:{zone:s.zone};
  const z=list.zones.find(x=>x.name===s.zone);if(z&&s.floor&&!z.floors.includes(s.floor))z.floors.push(s.floor);
 }
 const goals=goalList.map(g=>'step' in g?`${g.map}:story:${g.step}`:g.id);
 // Nota de un objetivo de la checklist (un consejo: Bulbasaur pide a Pikachu contento).
 const goalNotes=Object.fromEntries(goalList.flatMap(g=>!('step' in g)&&g.note?[[g.id,g.note]]:[])) as Record<string,{en:string;es:string}>;
 return {...a,markers:[...markers.filter(m=>!m.version||m.version===version),...steps],zones:enc.zones,checklist:list,dex,gates,choices,goals,goalNotes};
}
// Datos de combate y, si las reglas los tienen, textos de los ataques.
export const battleUrl=(game:Game)=>`${game.data}/battle.json`;
export const moveTextUrl=(game:Game)=>rulesFor(game.gen).moveText?`${game.data}/move-text.json`:null;

export const GAMES:Game[]=[
 {id:'yellow',short:'Yellow',title:'Pokémon Yellow',storage:{done:'ruta151-yellow',dex:'ruta151-yellow-dex'},data:'/yellow/data',version:'yellow',gen:1,hidden:['Obstacle'],untracked:['Obstacle','Shop']},
 {id:'firered',short:'FireRed',title:'Pokémon FireRed',storage:{done:'ruta151-firered',dex:'ruta151-firered-dex'},data:'/frlg/data',version:'firered',gen:3,hidden:['Obstacle'],untracked:['Obstacle','Shop']},
 {id:'leafgreen',short:'LeafGreen',title:'Pokémon LeafGreen',storage:{done:'ruta151-leafgreen',dex:'ruta151-leafgreen-dex'},data:'/frlg/data',version:'leafgreen',gen:3,hidden:['Obstacle'],untracked:['Obstacle','Shop']},
];
