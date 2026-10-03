import type { Game } from './games';
import { RULES } from './rules';

const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
const text = (value: unknown): value is string =>
  typeof value === 'string' && !!value.trim();
const slug = (value: unknown): value is string =>
  text(value) && /^[a-z0-9][a-z0-9-]*$/.test(value);
const strings = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every(text);
const storageKey = (value: unknown): value is string =>
  text(value) && /^ruta151-[a-z0-9-]+$/.test(value);

function game(value: unknown): value is Game {
  return (
    record(value) &&
    slug(value.id) &&
    text(value.short) &&
    text(value.title) &&
    text(value.data) &&
    /^\/(?:[a-z0-9-]+\/)+data$/.test(value.data) &&
    slug(value.version) &&
    typeof value.gen === 'number' &&
    Object.hasOwn(RULES, value.gen) &&
    record(value.storage) &&
    storageKey(value.storage.done) &&
    storageKey(value.storage.dex) &&
    strings(value.hidden) &&
    strings(value.untracked)
  );
}

export function parseGameCatalog(value: unknown): Game[] {
  if (!Array.isArray(value) || value.length === 0)
    throw new Error('Game catalog must not be empty');
  const games: Game[] = [],
    ids = new Set<string>();
  const keys = new Set([
    'ruta151-game',
    'ruta151-lang',
    'ruta151-tour',
    'ruta151-unavailable',
    'ruta151-backup-date',
  ]);
  for (const entry of value) {
    if (!game(entry)) throw new Error('Invalid game catalog entry');
    if (ids.has(entry.id)) throw new Error(`Duplicate game id: ${entry.id}`);
    ids.add(entry.id);
    for (const key of [
      entry.storage.done,
      entry.storage.dex,
      ...['skip', 'team', 'last'].map(
        (suffix) => `${entry.storage.done}-${suffix}`,
      ),
    ]) {
      if (keys.has(key)) throw new Error(`Duplicate progress key: ${key}`);
      keys.add(key);
    }
    games.push(entry);
  }
  return games;
}
