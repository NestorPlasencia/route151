import assert from 'node:assert/strict';
import test from 'node:test';
import { loadTypeScript } from './load-typescript.mjs';

const {
  parseBackup,
  collectBackup,
  importBackup,
  readRecovery,
  recoverBackup,
  BackupImportError,
} = await loadTypeScript(new URL('../app/backup-store.ts', import.meta.url));
const games = [
  {
    id: 'yellow',
    gen: 1,
    storage: { done: 'ruta151-yellow', dex: 'ruta151-yellow-dex' },
  },
  {
    id: 'firered',
    gen: 3,
    storage: { done: 'ruta151-firered', dex: 'ruta151-firered-dex' },
  },
];
const backup = (data) => ({
  app: 'ruta151',
  version: 1,
  date: '2026-10-03T12:00:00.000Z',
  data,
});
const mon = {
  id: '25-1',
  n: 25,
  level: 10,
  nature: 'Hardy',
  ability: '',
  moves: ['TACKLE', null, null, null],
};

class MemoryStorage {
  constructor(data = {}) {
    this.items = new Map(Object.entries(data));
  }
  get length() {
    return this.items.size;
  }
  key(i) {
    return [...this.items.keys()][i] ?? null;
  }
  getItem(key) {
    return this.items.get(key) ?? null;
  }
  setItem(key, value) {
    this.items.set(key, value);
  }
  removeItem(key) {
    this.items.delete(key);
  }
}

await test('accepts current backups, all progress types and optional team fields', () => {
  const value = backup({
    'ruta151-lang': 'es',
    'ruta151-game': 'firered',
    'ruta151-unavailable': 'hide',
    'ruta151-tour': 'seen',
    'ruta151-yellow': '[0,2147483647]',
    'ruta151-yellow-skip': '[2]',
    'ruta151-yellow-dex': '[151]',
    'ruta151-firered-last': 'MAP_PALLET_TOWN:story:leave-house',
    'ruta151-firered-team': JSON.stringify([
      {
        ...mon,
        bench: true,
        out: false,
        stats: [30, 20, 20, 20, 20, 20],
        guess: ['level'],
      },
    ]),
  });
  assert.equal(parseBackup(value, games), value);
  assert.doesNotThrow(() => parseBackup(backup({}), games));
});

await test('rejects incompatible envelopes before any writes', () => {
  for (const value of [
    null,
    [],
    { ...backup({}), version: 2 },
    { ...backup({}), version: undefined },
    { ...backup({}), date: 'not-a-date' },
    { ...backup({}), data: null },
    { ...backup({}), data: [] },
  ])
    assert.throws(() => parseBackup(value, games));
});

await test('rejects corrupt progress, unknown keys and invalid settings', () => {
  for (const data of [
    { 'ruta151-yellow': '{}' },
    { 'ruta151-yellow': 'null' },
    { 'ruta151-yellow': '[1,1]' },
    { 'ruta151-yellow': '[-1]' },
    { 'ruta151-yellow-skip': '[1.5]' },
    { 'ruta151-yellow-dex': '[152]' },
    { 'ruta151-firered-dex': '[387]' },
    { 'ruta151-game': 'unknown' },
    { 'ruta151-lang': 'fr' },
    { 'ruta151-unavailable': 'false' },
    { 'ruta151-tour': 'yes' },
    { 'ruta151-yellow-last': '' },
    { 'ruta151-unknown': '[]' },
    { 'another-app': '[]' },
    { 'ruta151-backup-date': 'bad' },
  ])
    assert.throws(() => parseBackup(backup(data), games));
  for (const value of [
    null,
    {},
    [mon, mon],
    [{ ...mon, level: 101 }],
    [{ ...mon, n: 0 }],
    [{ ...mon, moves: [] }],
    [{ ...mon, moves: [7, null, null, null] }],
    [{ ...mon, stats: [0, 1, 1, 1, 1, 1] }],
    [{ ...mon, bench: 'yes' }],
    [{ ...mon, guess: ['unknown'] }],
  ])
    assert.throws(() =>
      parseBackup(
        backup({ 'ruta151-firered-team': JSON.stringify(value) }),
        games,
      ),
    );
});

await test('replaces only application progress and never exports the recovery journal', () => {
  const storage = new MemoryStorage({
    'ruta151-yellow': '[1]',
    'ruta151-lang': 'es',
    'other-app': 'keep',
    'ruta151-backup-date': 'keep',
  });
  importBackup(
    storage,
    parseBackup(backup({ 'ruta151-yellow': '[2]' }), games),
  );
  assert.equal(storage.getItem('ruta151-yellow'), '[2]');
  assert.equal(storage.getItem('ruta151-lang'), null);
  assert.equal(storage.getItem('other-app'), 'keep');
  assert.equal(storage.getItem('ruta151-backup-date'), 'keep');
  assert.equal(readRecovery(storage), null);
  assert.deepEqual(collectBackup(storage).data, { 'ruta151-yellow': '[2]' });
});

await test('a restored game retains checks, skipped goals, Pokédex and team after a fresh read', () => {
  const storage = new MemoryStorage({'other-app':'keep'});
  const data = {
    'ruta151-yellow': '[1,2]',
    'ruta151-yellow-skip': '[3]',
    'ruta151-yellow-dex': '[25]',
    'ruta151-yellow-team': JSON.stringify([mon]),
    'ruta151-firered': '[4]',
    'ruta151-firered-last': 'MAP_PALLET_TOWN:story:leave-house',
  };
  importBackup(storage, parseBackup(backup(data), games));
  assert.deepEqual(collectBackup(storage).data, data);
  assert.deepEqual(JSON.parse(storage.getItem('ruta151-yellow')), [1,2]);
  assert.deepEqual(JSON.parse(storage.getItem('ruta151-yellow-team')), [mon]);
  assert.deepEqual(JSON.parse(storage.getItem('ruta151-firered')), [4]);
  assert.equal(storage.getItem('other-app'),'keep');
});

await test('aborts without touching old progress if the recovery copy cannot be stored', () => {
  const storage = new MemoryStorage({ 'ruta151-yellow': '[1]' });
  storage.setItem = () => {
    throw new Error('QuotaExceededError');
  };
  assert.throws(
    () => importBackup(storage, backup({ 'ruta151-yellow': '[2]' })),
    (error) => error instanceof BackupImportError && error.restored,
  );
  assert.equal(storage.getItem('ruta151-yellow'), '[1]');
});

await test('rolls back a partially written import after a quota failure', () => {
  const before = {
    'ruta151-yellow': '[1]',
    'ruta151-lang': 'es',
    'other-app': 'keep',
  };
  const storage = new MemoryStorage(before);
  const put = storage.setItem.bind(storage);
  storage.setItem = (key, value) => {
    if (key === 'ruta151-firered' && value === '[3]')
      throw new Error('QuotaExceededError');
    put(key, value);
  };
  assert.throws(
    () =>
      importBackup(
        storage,
        backup({ 'ruta151-yellow': '[2]', 'ruta151-firered': '[3]' }),
      ),
    (error) => error instanceof BackupImportError && error.restored,
  );
  assert.deepEqual(Object.fromEntries(storage.items), before);
});

await test('retains a durable recovery copy when storage also blocks rollback', () => {
  const storage = new MemoryStorage({
    'ruta151-yellow': '[1]',
    'other-app': 'keep',
  });
  const put = storage.setItem.bind(storage);
  storage.setItem = (key, value) => {
    if (key.startsWith('ruta151-')) throw new Error('SecurityError');
    put(key, value);
  };
  assert.throws(
    () => importBackup(storage, backup({ 'ruta151-yellow': '[2]' })),
    (error) =>
      error instanceof BackupImportError &&
      !error.restored &&
      error.previous.data['ruta151-yellow'] === '[1]',
  );
  // Una nueva instancia de la app puede leer y restaurar el diario.
  const recovery = readRecovery(storage);
  assert.equal(recovery.data['ruta151-yellow'], '[1]');
  assert.throws(() => importBackup(storage, backup({})), /Recovery pending/);
  storage.setItem = put;
  recoverBackup(storage, recovery);
  assert.deepEqual(Object.fromEntries(storage.items), {
    'ruta151-yellow': '[1]',
    'other-app': 'keep',
  });
});
