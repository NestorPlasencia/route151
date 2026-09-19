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
 // Capas que empiezan ocultas y categorias que no cuentan como progreso (en FRLG,
 // obstaculos y tiendas: comprar no es coleccionar).
 hidden:string[];untracked:string[];
 encounterSource:string;
 // En FRLG `location` es el lugar exacto de cada marcador; en Yellow es un texto
 // descriptivo y el lugar se deduce por cercania.
 exactLocations:boolean;
 load:()=>Promise<World>;
};

async function json<T>(url:string):Promise<T>{const r=await fetch(url);if(!r.ok)throw new Error(`${r.status} ${url}`);return r.json() as Promise<T>}

// --- Yellow ---------------------------------------------------------------------
// Sus datos vienen de otra fuente y en otro formato: posiciones en el mapa
// completo (lat/lng de Pokemon Completion) y encuentros de PokeAPI por zona.

type YArea={image:string;width:number;height:number;origin:Pt;markers:{id:string;at:Pt}[]};
type YFloor=YArea&{id:number;key:string;label:string;exits:{at:Pt;to:Pt}[]};
type YAreas={kanto:YArea&{doors:{at:Pt;floor:number;to:Pt}[]};dungeons:{zone:string;slug:string;floors:YFloor[]}[]};
type YLocation={name:string;aliases:string[];position:[number,number]};
type YMarker=Marker&{position:[number,number]};

// "Nidoran♀" / "nidoran-f", "Mr. Mime" / "mr-mime": misma clave.
const norm=(s:string)=>s.toLowerCase().replace(/♀/g,'f').replace(/♂/g,'m').replace(/[^a-z0-9]/g,'');
export const METHODS:Record<string,string>={walk:'Grass','old-rod':'Old Rod','good-rod':'Good Rod','super-rod':'Super Rod',surf:'Surf'};

async function loadYellow():Promise<World>{
 const [data,y,checklist,dex,enc]=await Promise.all([
  json<{locations:YLocation[];markers:YMarker[]}>('/data/yellow-map.json'),json<YAreas>('/data/areas.json'),
  json<Checklist>('/data/checklist.json'),json<Dex>('/data/pokedex.json'),json<{zones:EncounterZone[]}>('/data/yellow-encounters-by-zone.json')]);
 const k=y.kanto,fid=(id:number)=>`f${id}`,floors=y.dungeons.flatMap(d=>d.floors.map(f=>({f,d})));
 const areas:Area[]=[{id:'kanto',kind:'region',label:'Kanto',image:k.image,width:k.width,height:k.height},
  ...floors.map(({f,d}):Area=>({id:fid(f.id),kind:'interior',zone:d.zone,label:f.label,image:f.image,width:f.width,height:f.height}))];
 const warps:Warp[]=[...k.doors.map(d=>({area:'kanto',at:d.at,to:fid(d.floor),toAt:d.to})),
  ...floors.flatMap(({f})=>f.exits.map(e=>({area:fid(f.id),at:e.at,to:'kanto',toAt:e.to})))];
 // Lugares: los de Kanto con su punto; los que caen dentro de un piso (o se
 // llaman como una mazmorra) llevan a ese piso.
 const [ox,oy]=k.origin;
 const inFloor=(x:number,y2:number)=>floors.find(({f})=>x>=f.origin[0]&&x<f.origin[0]+f.width&&y2>=f.origin[1]&&y2<f.origin[1]+f.height);
 const places=data.locations.flatMap((l):Place[]=>{
  const x=l.position[1]*8,y2=-l.position[0]*8,f=inFloor(x,y2)??floors.find(({d})=>d.zone===l.name);
  if(f)return [{name:l.name,area:fid(f.f.id)}];
  const at:Pt=[x-ox,y2-oy];return at[0]>=0&&at[1]>=0&&at[0]<k.width&&at[1]<k.height?[{name:l.name,area:'kanto',at}]:[];
 });
 const home=new Map<string,{area:string;at:Pt;floor?:typeof floors[number]}>();
 k.markers.forEach(p=>home.set(p.id,{area:'kanto',at:p.at}));
 floors.forEach(fl=>fl.f.markers.forEach(p=>home.set(p.id,{area:fid(fl.f.id),at:p.at,floor:fl})));
 // Une cada Pokemon del mapa con sus encuentros de PokeAPI. En una mazmorra manda
 // la mazmorra y, si se puede, su piso ("Mt. Moon 1F" -> area "mt-moon-1f"); en
 // Kanto, de las rutas donde aparece la especie, la mas cercana al punto.
 const locPos=new Map(data.locations.map(l=>[l.name,l.position]));
 const encounterOf=(m:YMarker)=>{
  if(m.category!=='Pokémon')return undefined;
  const key=norm(m.name),zones=enc.zones.filter(z=>z.pokemon.some(p=>norm(p.name)===key));if(!zones.length)return undefined;
  const fl=home.get(m.id)?.floor;
  let zone:EncounterZone|undefined;
  if(fl)zone=zones.find(z=>z.name===fl.d.zone);
  else{const listed=new Set(m.location.split(/,\s*/)),named=zones.filter(z=>listed.has(z.name)),pool=named.length?named:zones;const d=(z:EncounterZone)=>{const p=locPos.get(z.name);return p?(p[0]-m.position[0])**2+(p[1]-m.position[1])**2:Infinity};zone=pool.reduce((a,b)=>d(b)<d(a)?b:a)}
  const mon=zone?.pokemon.find(p=>norm(p.name)===key);if(!zone||!mon)return undefined;
  let list=mon.areas;const code=fl?.f.label.match(/\b(B?\d+F)\b/)?.[1].toLowerCase();
  if(code){const only=list.filter(a=>a.area.endsWith('-'+code));if(only.length)list=only}
  const v=list.flatMap(a=>a.encounters);if(!v.length)return undefined;
  return {zone:zone.name,sprite:mon.sprite,min:Math.min(...v.map(x=>x.minLevel)),max:Math.max(...v.map(x=>x.maxLevel)),chance:Math.max(...v.map(x=>x.chance)),methods:[...new Set(v.map(x=>METHODS[x.method]??x.method))]};
 };
 const markers=data.markers.map((m):Marker=>{const h=home.get(m.id);return {...m,area:h?.area,at:h?.at,encounter:encounterOf(m)}});
 return {areas,warps,places,markers,zones:enc.zones,checklist,dex};
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
 {id:'yellow',short:'Yellow',title:'Pokémon Yellow',storage:{done:'ruta151-full',dex:'ruta151-dex'},hidden:[],untracked:[],encounterSource:'PokéAPI encounters',exactLocations:false,load:loadYellow},
 {id:'firered',short:'FireRed',title:'Pokémon FireRed',storage:{done:'ruta151-firered',dex:'ruta151-firered-dex'},hidden:['Obstacle'],untracked:['Obstacle','Shop'],encounterSource:'Wild encounters',exactLocations:true,load:()=>loadFrlg('firered')},
 {id:'leafgreen',short:'LeafGreen',title:'Pokémon LeafGreen',storage:{done:'ruta151-leafgreen',dex:'ruta151-leafgreen-dex'},hidden:['Obstacle'],untracked:['Obstacle','Shop'],encounterSource:'Wild encounters',exactLocations:true,load:()=>loadFrlg('leafgreen')},
];
