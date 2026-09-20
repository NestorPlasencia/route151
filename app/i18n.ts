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
 tabTeam: ['Team', 'Equipo'],
 party: ['Party', 'Equipo'],
 bench: ['Reserves', 'Suplentes'],
 benchEmpty: ['No reserves yet: add more Pokémon and they will come here.', 'Aún no hay suplentes: añade más Pokémon y aparecerán aquí.'],
 toBench: ['Move to reserves', 'Pasar a suplentes'],
 toParty: ['Move to the party', 'Pasar al equipo'],
 partyFull: ['The party is full: this one goes to the reserves.', 'El equipo está lleno: este va a suplentes.'],
 loadingTeam: ['Loading team data…', 'Cargando los datos de combate…'],
 addPokemon: ['Add a Pokémon by name…', 'Añade un Pokémon por su nombre…'],
 teamEmpty: ['Your team is empty: search a Pokémon above to add it.', 'Tu equipo está vacío: busca arriba un Pokémon para añadirlo.'],
 remove: ['Remove', 'Quitar'],
 level: ['Level', 'Nivel'],
 nature: ['Nature', 'Naturaleza'],
 ability: ['Ability', 'Habilidad'],
 physical: ['Physical', 'Físico'],
 special: ['Special', 'Especial'],
 status: ['Status', 'Estado'],
 effectRaise: ['Raises your {stat}', 'Sube tu {stat}'],
 effectRaiseMuch: ['Sharply raises your {stat}', 'Sube mucho tu {stat}'],
 effectLower: ['Lowers the target {stat}', 'Baja el {stat} del rival'],
 effectLowerMuch: ['Sharply lowers the target {stat}', 'Baja mucho el {stat} del rival'],
 effectLightScreen: ['Reduces special damage for 5 turns', 'Reduce el daño especial durante 5 turnos'],
 effectReflect: ['Reduces physical damage for 5 turns', 'Reduce el daño físico durante 5 turnos'],
 effectParalyze: ['Paralyzes the target', 'Paraliza al objetivo'],
 effectSleep: ['Puts the target to sleep', 'Duerme al objetivo'],
 effectPoison: ['Poisons the target', 'Envenena al objetivo'],
 effectBadPoison: ['Badly poisons the target', 'Envenena gravemente al objetivo'],
 effectBurn: ['Burns the target', 'Quema al objetivo'],
 effectConfuse: ['Confuses the target', 'Confunde al objetivo'],
 effectProtect: ['Blocks attacks for one turn', 'Bloquea ataques durante un turno'],
 effectRestoreHp: ['Restores HP', 'Recupera PS'],
 effectRest: ['Fully restores HP and sleeps', 'Recupera todos los PS y duerme'],
 effectWeatherRain: ['Starts rain for 5 turns', 'Hace llover durante 5 turnos'],
 effectWeatherSun: ['Starts sun for 5 turns', 'Hace sol durante 5 turnos'],
 effectWeatherSand: ['Starts a sandstorm for 5 turns', 'Inicia tormenta de arena durante 5 turnos'],
 effectWeatherHail: ['Starts hail for 5 turns', 'Inicia granizo durante 5 turnos'],
 effectHazards: ['Damages foes that switch in', 'Daña a los rivales al entrar'],
 stat_accuracy: ['Accuracy', 'Precisión'],
 stat_evasion: ['Evasion', 'Evasión'],
 physicalShort: ['Phys.', 'Fís.'],
 specialShort: ['Spec.', 'Esp.'],
 statusShort: ['Stat.', 'Est.'],
 whichToDrop: ['Which move should I replace?', '¿Qué ataque cambio?'],
 newMove: ['New move', 'Ataque nuevo'],
 dropYouDecide: ['It does no damage: keep it only for what it does.', 'No hace daño: consérvalo solo por su efecto.'],
 compareNote: ['Damage worked out with this Pokémon\'s stats against a neutral target, counting accuracy. It does not weigh types or effects.', 'Daño calculado con las estadísticas de este Pokémon contra un rival neutro, contando la precisión. No tiene en cuenta tipos ni efectos.'],
 baseStat: ['base {n}', 'base {n}'],
 basePower: ['Base power {n}', 'Potencia base {n}'],
 powerWithStats: ['With stats: {min}–{max}% to a neutral target ({stat} {n})', 'Con stats: {min}–{max}% a un rival neutro ({stat} {n})'],
 noMove: ['— no move —', '— sin ataque —'],
 pokemon: ['Pokémon', 'Pokémon'],
 bestAgainst: ['Best move against…', 'Mejor ataque contra…'],
 battleLevel: ['Lv. {level}', 'Nv. {level}'],
 battleUse: ['Use {move} · {min}–{max}%', 'Usa {move} · {min}–{max}%'],
 battleGoodAgainst: ['Good vs. {pokemon}', 'Bueno contra {pokemon}'],
 battlePoorAgainst: ['Not favorable vs. {pokemon}', 'No es favorable contra {pokemon}'],
 battleNoGood: ['No strong option in your party; this is the best available hit.', 'Ningún Pokémon de tu equipo tiene una opción favorable; este es el mejor golpe disponible.'],
 noEffect: ['no effect', 'no le afecta'],
 noDamage: ['No move of your team damages it: add attacking moves.', 'Ningún ataque de tu equipo le hace daño: añade ataques ofensivos.'],
 statsEditable: ['Estimated stats: write the ones your game shows if they differ.', 'Estadísticas estimadas: escribe las de tu partida si no coinciden.'],
 iv: ['IV {range}', 'IV {range}'],
 ivWithEv: ['IV+EV {n}', 'IV+EV {n}'],
 ivNoFit: ['?', '?'],
 ivNoFitHelp: ['That value does not fit this level and nature: check them.', 'Ese valor no cuadra con este nivel y naturaleza: revísalos.'],
 judge: ['Judge', 'Juez'],
 judgeNote: ['Rating of each IV, like the judge in the games.', 'Valoración de cada IV, como el juez de los juegos.'],
 judgeTotal: ['Total {n} of 186', 'Total {n} de 186'],
 profile: ['Deterministic profile', 'Perfil determinístico'],
 profileDeterministic: ['fixed rules', 'reglas fijas'],
 profilePhysical: ['Physical attacker', 'Atacante físico'],
 profileSpecial: ['Special attacker', 'Atacante especial'],
 profileMixed: ['Mixed attacker', 'Atacante mixto'],
 profileSupport: ['Utility / support', 'Apoyo / utilidad'],
 profilePhysicalTag: ['Physical', 'Físico'],
 profileSpecialTag: ['Special', 'Especial'],
 profileMixedTag: ['Mixed', 'Mixto'],
 profileSupportTag: ['Support', 'Apoyo'],
 profileFastTag: ['Fast', 'Veloz'],
 profileBulkTag: ['Bulky', 'Resistente'],
 profileUtilityTag: ['Status utility', 'Utilidad de estado'],
 profileAttackReason: ['Attack potential: {physical}% physical / {special}% special across {attacks} attacking move(s).', 'Potencial ofensivo: {physical}% físico / {special}% especial en {attacks} ataque(s) ofensivo(s).'],
 profileNatureReason: ['Nature boosts {up} and lowers {down}.', 'La naturaleza sube {up} y baja {down}.'],
 profileSpeedReason: ['Base Speed is {n}, one of this Pokémon\'s defining stats.', 'La Velocidad base es {n}, una de las estadísticas que más lo define.'],
 profileUtilityReason: ['The set has {n} status move(s).', 'El set tiene {n} movimiento(s) de estado.'],
 profileBulkReason: ['HP + Defense + Sp. Def base total {n}.', 'PS + Defensa + Def. Esp. base suman {n}.'],
 profileAbilityReason: ['{ability} adds {effect}.', '{ability} añade {effect}.'],
 profileAbility_contact: ['contact punishment', 'castigo al contacto'],
 profileAbility_physical: ['physical damage synergy', 'sinergia con el daño físico'],
 profileAbility_special: ['special damage synergy', 'sinergia con el daño especial'],
 profileAbility_speed: ['conditional Speed synergy', 'sinergia condicional con la Velocidad'],
 profileAbility_accuracy: ['accuracy support', 'apoyo a la precisión'],
 profileAbility_survival: ['a survival or immunity signal', 'una señal de supervivencia o inmunidad'],
 profileReplace: ['Replace {move}: it improves the {focus} profile enough.', 'Cambia {move}: mejora lo suficiente el perfil {focus}.'],
 profileAdd: ['Keep an empty slot for {move}: it improves the current profile.', 'Deja un hueco para {move}: mejora el perfil actual.'],
 profileKeep: ['Keep {move}: it does not improve the {focus} profile enough to lose a current move.', 'Conserva {move}: no mejora lo suficiente el perfil {focus} como para perder un ataque actual.'],
 profileNote: ['This is a transparent tendency from the current stats and four moves, not a battle simulator.', 'Es una tendencia transparente calculada con las estadísticas y los cuatro ataques actuales; no es un simulador de combates.'],
 rate0: ['No good', 'No está bien'],
 rate1: ['Decent', 'Decente'],
 rate2: ['Pretty good', 'No está mal'],
 rate3: ['Very good', 'Notable'],
 rate4: ['Fantastic', 'Genial'],
 rate5: ['Best', 'Inmejorable'],
 ivNote: ['IVs worked out from your stats (EVs at 0).', 'IVs deducidos de tus estadísticas (con EVs a 0).'],
 natureFits: ['Those stats fit these natures:', 'Esas cifras encajan con estas naturalezas:'],
 useEstimate: ['Use the estimate again', 'Volver a la estimación'],
 statsNote: ['Estimates assume IVs of 15 and no EVs; the IVs and EVs of each Pokémon move them, so you can correct them.', 'La estimación supone IVs de 15 y sin EVs; los IVs y EVs de cada Pokémon la desvían, por eso puedes corregirla.'],
 stat_hp: ['HP', 'PS'],
 stat_atk: ['Attack', 'Ataque'],
 stat_def: ['Defense', 'Defensa'],
 stat_spa: ['Sp. Atk', 'At. Esp.'],
 stat_spd: ['Sp. Def', 'Def. Esp.'],
 stat_spe: ['Speed', 'Velocidad'],
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
 sells: ['Sells {list}', 'Vende {list}'],
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
 creditClasses: ['Spanish trainer classes', 'Clases de entrenador en español'],
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

// Lugares de Kanto con su nombre oficial en espanol (PokeAPI no los trae). Los de
// las Islas Sete se quedan en ingles salvo el numero de la isla.
const PLACES: Record<string, string> = {
 'Pallet Town': 'Pueblo Paleta', 'Viridian City': 'Ciudad Verde', 'Pewter City': 'Ciudad Plateada',
 'Cerulean City': 'Ciudad Celeste', 'Vermilion City': 'Ciudad Carmín', 'Lavender Town': 'Pueblo Lavanda',
 'Celadon City': 'Ciudad Azulona', 'Saffron City': 'Ciudad Azafrán', 'Fuchsia City': 'Ciudad Fucsia',
 'Cinnabar Island': 'Isla Canela', 'Indigo Plateau': 'Meseta Añil', 'Viridian Forest': 'Bosque Verde',
 "Diglett's Cave": 'Cueva Diglett', 'Mt. Moon': 'Monte Moon', 'Cerulean Cave': 'Cueva Celeste',
 'Rock Tunnel': 'Túnel Roca', 'Power Plant': 'Central Eléctrica', 'Pokémon Tower': 'Torre Pokémon',
 'Pokémon Mansion': 'Mansión Pokémon', 'Pokémon League': 'Liga Pokémon', 'Safari Zone': 'Zona Safari',
 'Seafoam Islands': 'Islas Espuma', 'Victory Road': 'Calle Victoria', 'Silph Co.': 'Silph S.A.',
 'Rocket Hideout': 'Guarida Rocket', 'Team Rocket Hideout': 'Guarida Rocket',
 'Rocket Warehouse': 'Almacén Rocket', 'Underground Path': 'Túnel Subterráneo',
 'Sevii Islands': 'Islas Sete', 'One Island': 'Isla Uno', 'Two Island': 'Isla Dos',
 'Three Island': 'Isla Tres', 'Four Island': 'Isla Cuatro', 'Five Island': 'Isla Cinco',
 'Six Island': 'Isla Seis', 'Seven Island': 'Isla Siete', 'Kanto': 'Kanto',
};
// Partes del nombre de un interior ("Celadon City Department Store 2F").
const PARTS: [string, string][] = [
 ['Department Store', 'Centro Comercial'], ['Pokémon Center', 'Centro Pokémon'], ['Game Corner', 'Casino'],
 ['Prize Room', 'Sala de Premios'], ['Fan Club', 'Club de Fans'], ['Day Care', 'Guardería'],
 ['Fishing House', 'Casa de Pesca'], ['Sea Cottage', 'Cabaña'], ['Secret House', 'Casa Secreta'],
 ['Rest House', 'Casa de Descanso'], ['Bike Shop', 'Tienda de Bicis'], ['Champions Room', 'Sala del Campeón'],
 ['Hall of Fame', 'Sala de la Fama'], ['Trainer Tower', 'Torre de Entrenadores'],
 ["Professor Oak's Lab", 'Laboratorio del Profesor Oak'], ["Player's House", 'Casa del Jugador'],
 ["Rival's House", 'Casa del Rival'], ['Volunteer Pokémon House', 'Casa de Voluntarios'],
 ['Elite Four', 'Alto Mando'], ['Underground Path', 'Túnel Subterráneo'],
 ['Corridor', 'Pasillo'], ['Entrance', 'Entrada'], ['Condominiums', 'Condominios'],
 ['Restaurant', 'Restaurante'], ['Museum', 'Museo'], ['Office', 'Oficina'], ['Lobby', 'Vestíbulo'],
 ['Kitchen', 'Cocina'], ['Harbor', 'Puerto'], ['School', 'Escuela'], ['Lounge', 'Sala de Estar'],
 ['Research', 'Investigación'], ['Experiment', 'Experimentos'], ['Elevator', 'Ascensor'],
 ['Basement', 'Sótano'], ['Building', 'Edificio'], ['Stairs', 'Escaleras'], ['Chamber', 'Cámara'],
 ['Ruins', 'Ruinas'], ['Tunnel', 'Túnel'], ['Forest', 'Bosque'], ['Cave', 'Cueva'], ['Zone', 'Zona'],
 ['Rooms', 'Salas'], ['Room', 'Sala'], ['House', 'Casa'], ['Gym', 'Gimnasio'], ['Mart', 'Tienda'],
 ['Store', 'Tienda'], ['Shop', 'Tienda'], ['Roof', 'Azotea'], ['Deck', 'Cubierta'], ['Stern', 'Popa'],
 ['Center', 'Centro'], ['Summit', 'Cima'], ['Path', 'Camino'], ['Road', 'Carretera'], ['Lab', 'Laboratorio'],
 ['North', 'Norte'], ['South', 'Sur'], ['East', 'Este'], ['West', 'Oeste'], ['Back', 'Fondo'],
 ['Post-game', 'Post-juego'], ['Other areas', 'Otras zonas'], ['Events', 'Eventos'],
];

// Clases de entrenador en espanol. Las de Rojo Fuego y Verde Hoja salen de la
// lista de la Pokemon Wiki en espanol (pokemon.fandom.com/es, CC BY-SA); las que
// esa lista no recoge (lideres, Alto Mando, Rocket, nadadores) llevan el nombre
// que usan los juegos en espanol.
const CLASSES: Record<string, string> = {
 'Aroma Lady': 'Señorita Aroma', Beauty: 'Bella', Biker: 'Motorista', 'Bird Keeper': 'Ornitólogo',
 'Black Belt': 'Karateka', 'Bug Catcher': 'Cazabichos', Burglar: 'Ladrón', Camper: 'Campista',
 Channeler: 'Exorcista', 'Cool Couple': 'Pareja Guay', Cooltrainer: 'Entrenador Guay',
 'Crush Girl': 'Luchadora', 'Crush Kin': 'Dúo Fuerte', 'Cue Ball': 'Calvo', Engineer: 'Mecánico',
 Fisherman: 'Pescador', Gamer: 'Jugón', Gentleman: 'Caballero', Hiker: 'Montañero',
 Juggler: 'Malabarista', Lady: 'Damisela', Lass: 'Chica', Painter: 'Pintora', Picnicker: 'Dominguera',
 Pokemaniac: 'Pokemaníaco', 'Pkmn Breeder': 'Criapokémon', 'Pkmn Ranger': 'Pokéguarda',
 Psychic: 'Médium', Rocker: 'Rockero', 'Ruin Maniac': 'Ruinamaníaco', Sailor: 'Marinero',
 Scientist: 'Científico', 'Sis And Bro': 'Hermanos', 'Super Nerd': 'Supernecio',
 'Swimmer M': 'Nadador', 'Swimmer F': 'Nadadora', Tamer: 'Domador', Tuber: 'Playero',
 Twins: 'Gemelas', 'Young Couple': 'Pareja Joven', Youngster: 'Joven',
 Leader: 'Líder', 'Elite Four': 'Alto Mando', Champion: 'Campeón', Boss: 'Jefe', Rival: 'Rival',
 'Team Rocket Grunt': 'Recluta del Equipo Rocket', 'Team Rocket': 'Equipo Rocket',
};
const CLASS_ORDER = Object.keys(CLASSES).sort((a, b) => b.length - a.length);

// Traduce las partes conocidas del nombre de un interior y deja el resto igual.
const parts = (rest: string) => PARTS.reduce((out, [en, es]) => out.split(en).join(es), rest);

const pick = (table: Record<string, [string, string]>, key: string, lang: Lang) => table[key]?.[lang === 'es' ? 1 : 0] ?? key;

export type T = ReturnType<typeof translator>;

export type Names = {items: Record<string, string>; moves: Record<string, string>; abilities: Record<string, string>; natures: Record<string, string>} | null;

export function translator(lang: Lang, names: Names = null) {
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
  // Ataques, habilidades y naturalezas (de PokeAPI, como los objetos).
  move: (m: string) => (lang === 'es' && names?.moves[m]) || m,
  ability: (a: string) => (lang === 'es' && names?.abilities[a]) || a,
  nature: (n: string) => (lang === 'es' && names?.natures[n]) || n,
  // Nombre de un objeto ('Coins ×10' -> 'Monedas ×10'); lo demas (Pokemon,
  // entrenadores) se queda igual.
  name: (n: string) => {
   if (lang !== 'es') return n;
   // Combates: 'Bug Catcher Robby' -> 'Cazabichos Robby'.
   const cls = CLASS_ORDER.find(c => n === c || n.startsWith(c + ' '));
   if (cls) return (CLASSES[cls] + n.slice(cls.length)).trim();
   if (!names) return n;
   const [, base, tail] = n.match(/^(.*?)( ×\d+)?$/) ?? [];
   return (names.items[base] ?? base) + (tail ?? '');
  },
  // Lugar: el nombre oficial si se conoce, y si no, su zona traducida y el
  // resto por partes ('Celadon City Department Store 2F').
  // Detalle que viene de los datos: el equipo de un entrenador o el nivel.
  detail: (d: string) => lang === 'es' ? d.replace(/\bLv\.? ?(\d)/g, 'Nv. $1') : d,
  place: (p: string) => {
   if (lang !== 'es' || !p) return p;
   if (PLACES[p]) return PLACES[p];
   const route = p.match(/^Route (\d+)(.*)$/);
   if (route) return `Ruta ${route[1]}${parts(route[2])}`;
   const zone = Object.keys(PLACES).filter(k => p.startsWith(k + ' ')).sort((a, b) => b.length - a.length)[0];
   return zone ? PLACES[zone] + parts(p.slice(zone.length)) : parts(' ' + p).trimStart();
  },
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
