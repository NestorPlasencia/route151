import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { loadTypeScript } from './load-typescript.mjs';

const { loadJson, DataLoadError } = await loadTypeScript(
  new URL('../app/load-json.ts', import.meta.url),
);
const { GAMES, loadGame } = await loadTypeScript(
  new URL('../app/games.ts', import.meta.url),
);

await test('HTTP and malformed JSON produce a load error with the failed URL', async (t) => {
  for (const response of [
    new Response('unavailable', { status: 503 }),
    new Response('{'),
  ]) {
    const mock = t.mock.method(globalThis, 'fetch', async () => response);
    await assert.rejects(
      loadJson('/data/test.json'),
      (error) =>
        error instanceof DataLoadError && error.url === '/data/test.json',
    );
    mock.mock.restore();
  }
});

await test('a stalled request times out and can then be retried', async (t) => {
  const mock = t.mock.method(
    globalThis,
    'fetch',
    (_url, { signal }) =>
      new Promise((resolve, reject) => {
        signal.addEventListener('abort', () => reject(signal.reason), {
          once: true,
        });
      }),
  );
  await assert.rejects(
    loadJson('/data/test.json', { timeoutMs: 10 }),
    DataLoadError,
  );
  mock.mock.restore();
  t.mock.method(globalThis, 'fetch', async (_url, options) => {
    assert.equal(options.cache, 'reload');
    return Response.json({ ready: true });
  });
  assert.deepEqual(await loadJson('/data/test.json'), { ready: true });
});

await test('changing game cancels its outstanding request', async (t) => {
  t.mock.method(
    globalThis,
    'fetch',
    (_url, { signal }) =>
      new Promise((resolve, reject) => {
        if (signal.aborted) reject(signal.reason);
        else
          signal.addEventListener('abort', () => reject(signal.reason), {
            once: true,
          });
      }),
  );
  const controller = new AbortController();
  const request = loadJson('/data/test.json', { signal: controller.signal });
  controller.abort();
  await assert.rejects(request, (error) => error.name === 'AbortError');
});

async function fixture(url) {
  return readFile(new URL(`../public${url}`, import.meta.url), 'utf8');
}

await test('the actual data for all games loads successfully', async (t) => {
  t.mock.method(
    globalThis,
    'fetch',
    async (url) => new Response(await fixture(url)),
  );
  for (const game of GAMES) {
    const world = await loadGame(game);
    assert.ok(world.areas.length);
    assert.ok(world.markers.length);
    assert.ok(world.goals.length);
    assert.ok(world.gates.length);
  }
});

await test('essential gates, goals and navigation cannot silently disappear', async (t) => {
  const game = GAMES[0];
  for (const file of [
    'areas.json',
    'gates.json',
    'hm-gates.json',
    'goals.json',
    'nav.json',
  ]) {
    const mock = t.mock.method(globalThis, 'fetch', async (url) =>
      url === `${game.data}/${file}`
        ? new Response('missing', { status: 404 })
        : new Response(await fixture(url)),
    );
    await assert.rejects(
      loadGame(game),
      (error) => error instanceof DataLoadError && error.url.endsWith(file),
    );
    mock.mock.restore();
  }
});

await test('invalid required documents fail and a subsequent retry recovers', async (t) => {
  const game = GAMES[0];
  for (const file of [
    'gates.json',
    'hm-gates.json',
    'goals.json',
    'nav.json',
  ]) {
    const mock = t.mock.method(globalThis, 'fetch', async (url) =>
      url === `${game.data}/${file}`
        ? Response.json({})
        : new Response(await fixture(url)),
    );
    await assert.rejects(loadGame(game));
    mock.mock.restore();
  }
  for (const document of [
    { gates: [{}] },
    { gates: [], choices: [{ id: 'choice', options: [null] }] },
  ]) {
    const mock = t.mock.method(globalThis, 'fetch', async (url) =>
      url === `${game.data}/gates.json`
        ? Response.json(document)
        : new Response(await fixture(url)),
    );
    await assert.rejects(loadGame(game), /Invalid gate entries/);
    mock.mock.restore();
  }
  t.mock.method(
    globalThis,
    'fetch',
    async (url) => new Response(await fixture(url)),
  );
  assert.ok((await loadGame(game)).goals.length);
});
