import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { loadTypeScript } from './load-typescript.mjs';

const { parseGameCatalog } = await loadTypeScript(
  new URL('../app/game-catalog.ts', import.meta.url),
);
const { GAMES } = await loadTypeScript(
  new URL('../app/games.ts', import.meta.url),
);
const catalog = JSON.parse(
  await readFile(new URL('../app/games.json', import.meta.url), 'utf8'),
);

await test('the application uses the shared catalog and preserves existing progress keys', () => {
  assert.deepEqual(GAMES, catalog);
  assert.deepEqual(
    GAMES.map((game) => [game.id, game.storage.done, game.storage.dex]),
    [
      ['yellow', 'ruta151-yellow', 'ruta151-yellow-dex'],
      ['firered', 'ruta151-firered', 'ruta151-firered-dex'],
      ['leafgreen', 'ruta151-leafgreen', 'ruta151-leafgreen-dex'],
    ],
  );
  assert.deepEqual(
    parseGameCatalog(JSON.parse(JSON.stringify(catalog, null, 4))),
    GAMES,
  );
});

await test('rejects empty catalogs and malformed game entries', () => {
  for (const value of [
    [],
    null,
    {},
    [null],
    [{ ...catalog[0], gen: 2 }],
    [{ ...catalog[0], hidden: 'Obstacle' }],
    [{ ...catalog[0], storage: null }],
    [{ ...catalog[0], data: '/../private/data' }],
  ])
    assert.throws(() => parseGameCatalog(value));
});

await test('rejects duplicate ids and conflicting progress keys', () => {
  assert.throws(
    () => parseGameCatalog([catalog[0], catalog[0]]),
    /Duplicate game id/,
  );
  assert.throws(
    () =>
      parseGameCatalog([
        catalog[0],
        { ...catalog[1], storage: catalog[0].storage },
      ]),
    /Duplicate progress key/,
  );
  assert.throws(
    () =>
      parseGameCatalog([
        {
          ...catalog[0],
          storage: { done: 'ruta151-game', dex: 'ruta151-test-dex' },
        },
      ]),
    /Duplicate progress key/,
  );
  assert.throws(
    () =>
      parseGameCatalog([
        {
          ...catalog[0],
          storage: { done: 'ruta151-test', dex: 'ruta151-test-team' },
        },
      ]),
    /Duplicate progress key/,
  );
});
