import type { Game } from './games';
import {validSaveRecord} from './save-record';

const PREFIX = 'ruta151-';
export const BACKUP_STAMP = 'ruta151-backup-date';
// Fuera de PREFIX: nunca se exporta como progreso ni se borra al importarlo.
const RECOVERY_KEY = 'route151-import-recovery';
type Store = Pick<
  Storage,
  'length' | 'key' | 'getItem' | 'setItem' | 'removeItem'
>;
type BackupGame = Pick<Game, 'id' | 'storage' | 'gen'>;
export type Backup = {
  app: 'ruta151';
  version: 1;
  date: string;
  data: Record<string, string>;
};

const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
const integer = (value: unknown, min: number, max: number): value is number =>
  typeof value === 'number' &&
  Number.isInteger(value) &&
  value >= min &&
  value <= max;
const text = (value: unknown, min = 0, max = 500): value is string =>
  typeof value === 'string' && value.length >= min && value.length <= max;
const numbers = (value: unknown, min: number, max: number) =>
  Array.isArray(value) &&
  value.every((n) => integer(n, min, max)) &&
  new Set(value).size === value.length;
const guesses = new Set(['level', 'nature', 'ability', 'moves']);

function team(value: unknown, maxSpecies: number): boolean {
  if (!Array.isArray(value)) return false;
  const ids = new Set<string>();
  return value.every((mon) => {
    if (!record(mon) || !text(mon.id, 1) || ids.has(mon.id)) return false;
    ids.add(mon.id);
    return (
      integer(mon.n, 1, maxSpecies) &&
      integer(mon.level, 1, 100) &&
      text(mon.nature, 1) &&
      text(mon.ability) &&
      Array.isArray(mon.moves) &&
      mon.moves.length === 4 &&
      mon.moves.every((move) => move === null || text(move, 1)) &&
      (mon.bench === undefined || typeof mon.bench === 'boolean') &&
      (mon.out === undefined || typeof mon.out === 'boolean') &&
      (mon.nickname === undefined || text(mon.nickname)) &&
      (mon.speciesName === undefined || text(mon.speciesName)) &&
      (mon.ivs === undefined || (Array.isArray(mon.ivs) && mon.ivs.length === 6 && mon.ivs.every(n => integer(n, 0, 31)))) &&
      (mon.evs === undefined || (Array.isArray(mon.evs) && mon.evs.length === 6 && mon.evs.every(n => integer(n, 0, 255)) && mon.evs.reduce((a,b) => a+b, 0) <= 510)) &&
      (mon.stats === undefined ||
        (Array.isArray(mon.stats) &&
          mon.stats.length === 6 &&
          mon.stats.every((stat) => integer(stat, 1, 999)))) &&
      (mon.guess === undefined ||
        (Array.isArray(mon.guess) &&
          mon.guess.every(
            (field) => typeof field === 'string' && guesses.has(field),
          )))
    );
  });
}

function envelope(value: unknown): value is Backup {
  if (
    !record(value) ||
    value.app !== 'ruta151' ||
    value.version !== 1 ||
    !text(value.date, 1) ||
    !record(value.data)
  )
    return false;
  const date = new Date(value.date);
  return (
    Number.isFinite(date.getTime()) &&
    date.toISOString() === value.date &&
    Object.entries(value.data).every(
      ([key, entry]) =>
        key.startsWith(PREFIX) &&
        key !== BACKUP_STAMP &&
        typeof entry === 'string',
    )
  );
}

export function parseBackup(
  value: unknown,
  games: readonly BackupGame[],
): Backup {
  if (!envelope(value)) throw new Error('Invalid backup version or envelope');
  for (const [key, entry] of Object.entries(value.data)) {
    let valid = false;
    if (key === 'ruta151-lang') valid = ['en', 'es'].includes(entry);
    else if (key === 'ruta151-game')
      valid = games.some((game) => game.id === entry);
    else if (key === 'ruta151-unavailable')
      valid = ['hide', 'show'].includes(entry);
    else if (key === 'ruta151-tour') valid = entry === 'seen';
    else {
      for (const game of games) {
        const maxSpecies = game.gen === 1 ? 151 : 386;
        if (key === game.storage.done || key === `${game.storage.done}-skip`)
          valid = numbers(JSON.parse(entry), 0, 0x7fffffff);
        else if (key === game.storage.dex)
          valid = numbers(JSON.parse(entry), 1, maxSpecies);
        else if (key === `${game.storage.done}-team`)
          valid = team(JSON.parse(entry), maxSpecies);
        else if (key === `${game.storage.done}-sav`) {
          const saved: unknown = JSON.parse(entry);
          valid = validSaveRecord(saved) && saved.game === game.id;
        }
        else if (key === `${game.storage.done}-last`) valid = text(entry, 1);
        else continue;
        break;
      }
    }
    if (!valid) throw new Error(`Invalid backup entry: ${key}`);
  }
  return value;
}

export function collectBackup(storage: Store): Backup {
  const data: Record<string, string> = {};
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (key?.startsWith(PREFIX) && key !== BACKUP_STAMP)
      data[key] = storage.getItem(key) ?? '';
  }
  return { app: 'ruta151', version: 1, date: new Date().toISOString(), data };
}

export function readRecovery(storage: Store): Backup | null {
  const raw = storage.getItem(RECOVERY_KEY);
  if (raw === null) return null;
  const value: unknown = JSON.parse(raw);
  if (!envelope(value)) throw new Error('Invalid recovery copy');
  return value;
}

function removeProgress(storage: Store) {
  const keys = Object.keys(collectBackup(storage).data);
  for (const key of keys) storage.removeItem(key);
}

// Al liberar primero la importacion parcial, la copia anterior vuelve a caber.
// El diario se conserva hasta que TODOS los valores se hayan restaurado.
export function recoverBackup(storage: Store, previous: Backup) {
  removeProgress(storage);
  for (const [key, entry] of Object.entries(previous.data))
    storage.setItem(key, entry);
  storage.removeItem(RECOVERY_KEY);
}

export class BackupImportError extends Error {
  constructor(
    public readonly previous: Backup,
    public readonly restored: boolean,
  ) {
    super('Backup import failed');
  }
}

export function importBackup(storage: Store, backup: Backup) {
  if (storage.getItem(RECOVERY_KEY) !== null)
    throw new Error('Recovery pending');
  const previous = collectBackup(storage);
  // Si no cabe la copia de recuperacion, se aborta antes de tocar el progreso.
  try {
    storage.setItem(RECOVERY_KEY, JSON.stringify(previous));
  } catch {
    throw new BackupImportError(previous, true);
  }
  try {
    for (const [key, entry] of Object.entries(backup.data))
      storage.setItem(key, entry);
    for (const key of Object.keys(previous.data))
      if (!Object.hasOwn(backup.data, key)) storage.removeItem(key);
    storage.removeItem(RECOVERY_KEY);
  } catch {
    let restored = false;
    try {
      recoverBackup(storage, previous);
      restored = true;
    } catch {
      /* El diario sigue disponible. */
    }
    throw new BackupImportError(previous, restored);
  }
}
