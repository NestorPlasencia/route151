// Textos de la interfaz en ingles y espanol. Los nombres que vienen de los datos
// del juego (objetos, entrenadores, lugares, equipos) se quedan como estan; los
// de Pokemon son iguales en los dos idiomas.
export const LANGS = ['en', 'es'] as const;
export type Lang = (typeof LANGS)[number];
export const LANG_NAMES: Record<Lang, string> = {en: 'EN', es: 'ES'};

const TEXT = {
 companion: ['{game} Companion', 'Guía de {game}'],
 game: ['Game', 'Juego'],
 language: ['Language', 'Idioma'],
 credits: ['Credits', 'Créditos'],
 about: ['About', 'Acerca de'],
 close: ['Close', 'Cerrar'],
 tabMap: ['Map', 'Mapa'],
 tabChecklist: ['Checklist', 'Lista'],
 tabDex: ['Pokédex', 'Pokédex'],
 completed: ['{n} completed', '{n} completados'],
 allAreas: [' — all areas', ' — todo'],
 loading: ['Loading…', 'Cargando…'],
 loadingGame: ['Loading {game}…', 'Cargando {game}…'],
 loadingChecklist: ['Loading checklist…', 'Cargando la lista…'],
 loadingDex: ['Loading Pokédex…', 'Cargando la Pokédex…'],
 layers: ['MAP LAYERS', 'CAPAS DEL MAPA'],
 mapLayers: ['Map layers', 'Capas del mapa'],
 separateTitle: ['Separate maps', 'Mapas aparte'],
 separateText: ['{regions} and every dungeon have their own map. Enter through the yellow doors.',
                '{regions} y cada interior tienen su propio mapa. Se entra por las puertas amarillas.'],
 mapNote: ['Scroll or pinch to zoom · drag to explore', 'Acerca con la rueda o con dos dedos · arrastra para explorar'],
 markersHere: ['{n} markers here', '{n} marcadores aquí'],
 back: ['Back', 'Volver'],
 backToMap: ['Back to the {region} map', 'Volver al mapa de {region}'],
 wholeMap: ['Whole map', 'Mapa completo'],
 interiors: ['DUNGEONS & INTERIORS', 'INTERIORES Y MAZMORRAS'],
 entered: ['Entered {place}', 'Entraste a {place}'],
 enteredFrom: ['Entered {place} from {from}', 'Entraste a {place} desde {from}'],
 leftTo: ['Left {place} to {to}', 'Saliste de {place} a {to}'],
 nowIn: ['Now in {place}', 'Ahora en {place}'],
 enteredHere: ['You entered here', 'Entraste aquí'],
 leftHere: ['You left here', 'Saliste aquí'],
 exitTo: ['Exit to {place}', 'Salida a {place}'],
 interior: ['Interior', 'Interior'],
 nothingLeft: ['nothing left to do', 'nada por hacer'],
 atThisSpot: ['{n} at this spot', '{n} en este punto'],
 markDone: ['Mark as completed', 'Marcar como completado'],
 encounterRate: ['Lv. {levels} · up to {chance}% · {methods}', 'Nv. {levels} · hasta {chance}% · {methods}'],
 levels: ['Lv. {levels}', 'Nv. {levels}'],
 availableHere: ['{n} Pokémon available in this area.', '{n} Pokémon disponibles en esta zona.'],
 encountersPokeapi: ['PokéAPI encounters', 'Encuentros de PokéAPI'],
 encountersWild: ['Wild encounters', 'Pokémon salvajes'],
 // Listas
 searchChecklist: ['Search the checklist…', 'Buscar en la lista…'],
 hideCompleted: ['Hide completed', 'Ocultar completados'],
 part: ['Part {n}', 'Parte {n}'],
 orderSource: ['Area order follows the ', 'El orden de las zonas sigue la '],
 orderLink: ['Bulbapedia walkthrough', 'guía de Bulbapedia'],
 orderStory: ['Area order follows the story of the game.', 'El orden de las zonas sigue la historia del juego.'],
 searchDex: ['Search by name or number…', 'Buscar por nombre o número…'],
 filterAll: ['All', 'Todos'],
 filterMissing: ['Missing', 'Faltan'],
 filterCaught: ['Registered', 'Registrados'],
 registered: ['Registered', 'Registrado'],
 syncedChecklist: ['Synced with the checklist', 'Sincronizado con la lista'],
 evolvesFrom: ['Evolves from {name}', 'Evoluciona de {name}'],
 evolvesFromHow: ['Evolves from {name} ({how})', 'Evoluciona de {name} ({how})'],
 getAndEvolve: ['Get {name} and evolve it.', 'Consigue un {name} y evoluciónalo.'],
 getAndEvolveHow: ['Get {name} and evolve it ({how}).', 'Consigue un {name} y evoluciónalo ({how}).'],
 notAvailable: ['Not available in {game}', 'No disponible en {game}'],
 tradeOver: ['Not found in Pokémon {game}: trade it over from another game.',
             'No aparece en Pokémon {game}: hay que intercambiarlo desde otro juego.'],
 andMore: [' and {n} more', ' y {n} más'],
 showOnMap: ['Show {name} on the map', 'Ver {name} en el mapa'],
 emptyFilter: ['Nothing to show with this filter.', 'No hay nada con este filtro.'],
 // Creditos
 creditMap: ['Map image', 'Imagen del mapa'],
 creditMarkers: ['Checklist and map markers', 'Lista y marcadores del mapa'],
 creditData: ['Encounters, Pokédex data and sprites', 'Encuentros, datos de la Pokédex y sprites'],
 creditTrainers: ['Trainer sprites', 'Sprites de entrenadores'],
 creditOrder: ['Walkthrough order', 'Orden de la guía'],
 creditFrlg: ['Maps, markers and encounters', 'Mapas, marcadores y encuentros'],
 creditDex: ['Pokédex data and icons', 'Datos de la Pokédex e iconos'],
 creditVia: ['via Pokémon Completion', 'vía Pokémon Completion'],
 creditFlags: ['with event flag research by FabioAttard', 'con la investigación de flags de FabioAttard'],
 creditDecomp: ['generated from the decompilation', 'generado desde la decompilación'],
 disclaimer: [
  'Route 151 is an unofficial fan project and is not affiliated with, endorsed or sponsored by Nintendo, Game Freak, Creatures Inc. or The Pokémon Company. Pokémon and all related names and images are trademarks of their respective owners.',
  'Route 151 es un proyecto de fans no oficial, sin relación ni respaldo de Nintendo, Game Freak, Creatures Inc. ni The Pokémon Company. Pokémon y todos los nombres e imágenes relacionados son marcas de sus respectivos dueños.',
 ],
} satisfies Record<string, [string, string]>;

export type Key = keyof typeof TEXT;

// Categorias de marcador, tal como llegan en los datos.
const CATEGORIES: Record<string, [string, string]> = {
 'Pokémon': ['Pokémon', 'Pokémon'],
 'Item In Map': ['Item on the map', 'Objeto en el mapa'],
 'Hidden Item': ['Hidden item', 'Objeto oculto'],
 'Item Gift': ['Gift item', 'Objeto de regalo'],
 'In-Game Trade': ['In-game trade', 'Intercambio'],
 'In-Game Gift Pokémon': ['Gift Pokémon', 'Pokémon de regalo'],
 Battle: ['Battle', 'Combate'],
 Item: ['Collectible item', 'Objeto de colección'],
 'Miscellaneous Task': ['Task', 'Tarea'],
 Obstacle: ['Obstacle', 'Obstáculo'],
 Shop: ['Shop', 'Tienda'],
};
// Nombre de la capa (mas corto que el de la categoria).
const LAYERS: Record<string, [string, string]> = {
 'Pokémon': ['Pokémon', 'Pokémon'],
 'Item In Map': ['Item In Map', 'Objetos en el mapa'],
 'Hidden Item': ['Hidden Item', 'Objetos ocultos'],
 'Item Gift': ['Item Gift', 'Objetos de regalo'],
 'In-Game Trade': ['In-Game Trade', 'Intercambios'],
 'In-Game Gift Pokémon': ['In-Game Gift Pokémon', 'Pokémon de regalo'],
 Battle: ['Battle', 'Combates'],
 Item: ['Collectible Item', 'Objetos de colección'],
 'Miscellaneous Task': ['Task', 'Tareas'],
 Obstacle: ['Obstacle', 'Obstáculos'],
 Shop: ['Shop', 'Tiendas'],
};
// Como se consigue un Pokemon (Pokedex) y metodos de encuentro.
const HOW: Record<string, [string, string]> = {
 Wild: ['Wild', 'Salvaje'], Static: ['Static', 'Fijo'], Gift: ['Gift', 'Regalo'],
 Trade: ['Trade', 'Intercambio'], Event: ['Event', 'Evento'], Fossil: ['Fossil', 'Fósil'],
};
const METHODS: Record<string, [string, string]> = {
 Grass: ['Grass', 'Hierba'], Cave: ['Cave', 'Cueva'], Surf: ['Surf', 'Surf'],
 'Old Rod': ['Old Rod', 'Caña Vieja'], 'Good Rod': ['Good Rod', 'Caña Buena'], 'Super Rod': ['Super Rod', 'Súper Caña'],
 'Rock Smash': ['Rock Smash', 'Golpe Roca'], 'Static encounter': ['Static encounter', 'Encuentro fijo'],
 gift: ['Gift', 'Regalo'], 'Game Corner prize': ['Game Corner prize', 'Premio del Casino'],
 'Reward or exchange': ['Reward or exchange', 'Recompensa o canje'],
};
// Como evoluciona ('level 16', 'trade', 'Fire Stone'...), tal como lo da PokeAPI.
const EVO: Record<string, [string, string]> = {
 trade: ['trade', 'intercambio'], 'level up': ['level up', 'al subir de nivel'], happiness: ['happiness', 'amistad'],
 'Moon Stone': ['Moon Stone', 'Piedra Lunar'], 'Fire Stone': ['Fire Stone', 'Piedra Fuego'],
 'Water Stone': ['Water Stone', 'Piedra Agua'], 'Thunder Stone': ['Thunder Stone', 'Piedra Trueno'],
 'Leaf Stone': ['Leaf Stone', 'Piedra Hoja'], 'Sun Stone': ['Sun Stone', 'Piedra Solar'],
};
const TYPES: Record<string, [string, string]> = {
 normal: ['Normal', 'Normal'], fire: ['Fire', 'Fuego'], water: ['Water', 'Agua'], grass: ['Grass', 'Planta'],
 electric: ['Electric', 'Eléctrico'], ice: ['Ice', 'Hielo'], fighting: ['Fighting', 'Lucha'], poison: ['Poison', 'Veneno'],
 ground: ['Ground', 'Tierra'], flying: ['Flying', 'Volador'], psychic: ['Psychic', 'Psíquico'], bug: ['Bug', 'Bicho'],
 rock: ['Rock', 'Roca'], ghost: ['Ghost', 'Fantasma'], dragon: ['Dragon', 'Dragón'], steel: ['Steel', 'Acero'],
 fairy: ['Fairy', 'Hada'], dark: ['Dark', 'Siniestro'],
};
// Notas de la Pokedex: las escriben los scripts de datos, en ingles.
const NOTES: Record<string, [string, string]> = {
 'Only in FireRed: trade it over.': ['Only in FireRed: trade it over.', 'Solo en FireRed: hay que intercambiarlo.'],
 'Only in LeafGreen: trade it over.': ['Only in LeafGreen: trade it over.', 'Solo en LeafGreen: hay que intercambiarlo.'],
 'Not found in FireRed: trade it over from another game.': ['Not found in FireRed: trade it over from another game.', 'No aparece en FireRed: hay que traerlo de otro juego.'],
 'Not found in LeafGreen: trade it over from another game.': ['Not found in LeafGreen: trade it over from another game.', 'No aparece en LeafGreen: hay que traerlo de otro juego.'],
 'Your Pikachu refuses to evolve in Yellow and there is no other one: trade only.':
  ['Your Pikachu refuses to evolve in Yellow and there is no other one: trade only.',
   'Tu Pikachu se niega a evolucionar en Amarillo y no hay otro: solo por intercambio.'],
};

const pick = (table: Record<string, [string, string]>, key: string, lang: Lang) => table[key]?.[lang === 'es' ? 1 : 0] ?? key;

export type T = ReturnType<typeof translator>;

export function translator(lang: Lang) {
 const fill = (text: string, vars?: Record<string, string | number>) =>
  vars ? text.replace(/\{(\w+)\}/g, (all, k) => String(vars[k] ?? all)) : text;
 return {
  lang,
  t: (key: Key, vars?: Record<string, string | number>) => fill(TEXT[key][lang === 'es' ? 1 : 0], vars),
  category: (c: string) => pick(CATEGORIES, c, lang),
  layer: (c: string) => pick(LAYERS, c, lang),
  how: (h: string) => pick(HOW, h, lang),
  method: (m: string) => pick(METHODS, m, lang),
  type: (t: string) => pick(TYPES, t, lang),
  note: (n: string) => pick(NOTES, n, lang),
  evo: (m: string) => lang === 'es' ? m.replace(/^level (\d+)$/, 'nivel $1').replace(/^[\w\s]+$/, w => pick(EVO, w, lang)) : m,
 };
}

// Idioma guardado, o el del navegador si es la primera vez.
export const LANG_KEY = 'ruta151-lang';
export function savedLang(): Lang {
 try {
  const saved = localStorage.getItem(LANG_KEY);
  if (LANGS.includes(saved as Lang)) return saved as Lang;
 } catch {}
 return typeof navigator !== 'undefined' && navigator.language.startsWith('es') ? 'es' : 'en';
}
