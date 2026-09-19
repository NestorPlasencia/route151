import { mkdir, writeFile } from 'node:fs/promises';
import vm from 'node:vm';

const COMPLETION_PAGE = 'https://pokemoncompletion.com/completion/Yellow';
const POKEAPI = 'https://pokeapi.co/api/v2';
const outputDir = new URL('../data/', import.meta.url);

async function getText(url) {
  const response = await fetch(url, { headers: { 'user-agent': 'Ruta151 local data sync' } });
  if (!response.ok) throw new Error(`${response.status} al descargar ${url}`);
  return response.text();
}

async function getJson(url) {
  return JSON.parse(await getText(url));
}

async function pokemonCompletionYellow() {
  const html = await getText(COMPLETION_PAGE);
  const mainPath = html.match(/<script[^>]+src=["']([^"']*pokemonCompletion\.js[^"']*)/i)?.[1];
  if (!mainPath) throw new Error('No se encontró el bundle principal de Pokémon Completion.');

  const mainUrl = new URL(mainPath, COMPLETION_PAGE).href;
  const main = await getText(mainUrl);
  const chunkHash = main.match(/290:"([a-f0-9]+)"/)?.[1];
  if (!chunkHash) throw new Error('No se encontró el chunk de datos de Yellow.');

  const chunkUrl = new URL(
    `/compiled/pokemonCompletion/pokemonCompletion.290.${chunkHash}.bundle.js`,
    COMPLETION_PAGE,
  ).href;
  const source = await getText(chunkUrl);
  const sandbox = { self: { webpackChunkpokemoncompletion: [] } };
  vm.runInNewContext(source, sandbox, { timeout: 1_000 });
  const registration = sandbox.self.webpackChunkpokemoncompletion[0];
  const factory = registration?.[1]?.[290];
  if (typeof factory !== 'function') throw new Error('El formato del chunk de Yellow cambió.');
  const chunkModule = { exports: null };
  factory(chunkModule);

  return { data: chunkModule.exports, sourceUrl: chunkUrl };
}

function collectYellowEncounters(pokemonEncounters) {
  return pokemonEncounters.flatMap((entry) => {
    const yellow = entry.version_details.find((detail) => detail.version.name === 'yellow');
    if (!yellow) return [];
    return [{
      locationArea: entry.location_area.name,
      maxChance: yellow.max_chance,
      encounters: yellow.encounter_details.map((detail) => ({
        chance: detail.chance,
        minLevel: detail.min_level,
        maxLevel: detail.max_level,
        method: detail.method.name,
        conditions: detail.condition_values.map((condition) => condition.name),
      })),
    }];
  });
}

async function pokeApiYellow() {
  const pokedex = await getJson(`${POKEAPI}/pokedex/kanto`);
  const species = pokedex.pokemon_entries
    .filter((entry) => entry.entry_number <= 151)
    .map((entry) => ({ id: entry.entry_number, name: entry.pokemon_species.name }));

  const batchSize = 20;
  const pokemon = [];
  for (let index = 0; index < species.length; index += batchSize) {
    const batch = species.slice(index, index + batchSize);
    const results = await Promise.all(batch.map(async (entry) => {
      const [detail, encounters] = await Promise.all([
        getJson(`${POKEAPI}/pokemon/${entry.id}`),
        getJson(`${POKEAPI}/pokemon/${entry.id}/encounters`),
      ]);
      return {
        ...entry,
        sprite: detail.sprites.front_default,
        types: detail.types.map((type) => type.type.name),
        encounters: collectYellowEncounters(encounters),
      };
    }));
    pokemon.push(...results);
  }
  return pokemon;
}

function encounterZone(area) {
  const route = area.match(/kanto-(?:sea-)?route-(\d+)/);
  if (route) return `Route ${route[1]}`;
  const rules = [
    ['viridian-forest', 'Viridian Forest'], ['mt-moon', 'Mt. Moon'],
    ['cerulean-cave', 'Cerulean Cave'], ['pokemon-mansion', 'Pokémon Mansion'],
    ['safari-zone', 'Safari Zone'], ['seafoam-islands', 'Seafoam Islands'],
    ['rock-tunnel', 'Rock Tunnel'], ['victory-road', 'Victory Road'],
    ['digletts-cave', "Diglett's Cave"], ['power-plant', 'Power Plant'],
    ['pokemon-tower', 'Pokémon Tower'], ['underground-path', 'Underground Path'],
    ['ss-anne', 'S.S. Anne'], ['silph-co', 'Silph Co.'],
    ['pallet-town', 'Pallet Town'], ['viridian-city', 'Viridian City'],
    ['pewter-city', 'Pewter City'], ['cerulean-city', 'Cerulean City'],
    ['vermilion-city', 'Vermilion City'], ['lavender-town', 'Lavender Town'],
    ['celadon-city', 'Celadon City'], ['saffron-city', 'Saffron City'],
    ['fuchsia-city', 'Fuchsia City'], ['cinnabar-island', 'Cinnabar Island'],
  ];
  return rules.find(([needle]) => area.includes(needle))?.[1] ?? area;
}

function groupEncountersByZone(pokemon) {
  const zones = new Map();
  for (const mon of pokemon) for (const area of mon.encounters) {
    const zone = encounterZone(area.locationArea);
    if (!zones.has(zone)) zones.set(zone, new Map());
    const mons = zones.get(zone);
    const current = mons.get(mon.id) ?? { id: mon.id, name: mon.name, sprite: mon.sprite, types: mon.types, areas: [] };
    current.areas.push({ area: area.locationArea, maxChance: area.maxChance, encounters: area.encounters });
    mons.set(mon.id, current);
  }
  return [...zones.entries()].map(([name, mons]) => ({
    name,
    pokemon: [...mons.values()].sort((a, b) => a.id - b.id),
  })).sort((a, b) => a.name.localeCompare(b.name, 'en', { numeric: true }));
}

await mkdir(outputDir, { recursive: true });
const completion = await pokemonCompletionYellow();
const pokemon = await pokeApiYellow();
const encounterZones = groupEncountersByZone(pokemon);
const syncedAt = new Date().toISOString();

await writeFile(new URL('yellow-completion.raw.json', outputDir), JSON.stringify({
  source: COMPLETION_PAGE,
  sourceData: completion.sourceUrl,
  syncedAt,
  data: completion.data,
}, null, 2));

await writeFile(new URL('yellow-pokeapi.json', outputDir), JSON.stringify({
  source: POKEAPI,
  syncedAt,
  pokemon,
}, null, 2));
await writeFile(new URL('../public/data/yellow-encounters-by-zone.json', import.meta.url), JSON.stringify({
  source: POKEAPI,
  syncedAt,
  zones: encounterZones,
}));

const categories = completion.data.categories?.map((category) => ({
  name: category.name,
  count: category.list?.length ?? 0,
})) ?? [];

const mapPayload = {
  image: completion.data.interactiveMap.fullImgUrl,
  tiles: completion.data.interactiveMap.url,
  width: completion.data.interactiveMap.dim.w,
  height: completion.data.interactiveMap.dim.h,
  locations: completion.data.locations.filter((location) => location.pos).map((location) => ({
    name: location.name,
    aliases: location.alias ?? [],
    position: location.pos,
  })),
  markers: completion.data.categories.flatMap((category) => category.list.flatMap((entry) =>
    (entry.pos ?? []).map((position, index) => ({
      id: `${category.name}-${entry.uid}-${index}`,
      uid: entry.uid,
      category: category.name,
      name: entry.name,
      location: entry.location ?? '',
      position,
      icon: entry.iconUrl ?? category.iconUrl ?? null,
      requirements: entry.reqs ?? null,
    })),
  )),
};
await mkdir(new URL('../public/data/', import.meta.url), { recursive: true });
await writeFile(new URL('../public/data/yellow-map.json', import.meta.url), JSON.stringify(mapPayload));

console.log(JSON.stringify({
  completion: {
    name: completion.data.name,
    locations: completion.data.locations?.length ?? 0,
    categories,
    map: completion.data.interactiveMap ? {
      width: completion.data.interactiveMap.dim?.w,
      height: completion.data.interactiveMap.dim?.h,
      markerLinks: completion.data.interactiveMap.mapLinks?.length ?? 0,
    } : null,
  },
  pokeApi: {
    pokemon: pokemon.length,
    withYellowEncounters: pokemon.filter((entry) => entry.encounters.length > 0).length,
  },
  output: ['data/yellow-completion.raw.json', 'data/yellow-pokeapi.json', 'public/data/yellow-map.json', 'public/data/yellow-encounters-by-zone.json'],
}, null, 2));
