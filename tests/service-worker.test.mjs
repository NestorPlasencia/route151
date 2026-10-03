import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const source = await readFile(
  new URL('../public/sw.js', import.meta.url),
  'utf8',
);

function worker(fetch) {
  const listeners = new Map();
  const stored = new Map();
  const cache = {
    match: async (request) => stored.get(request.url)?.clone(),
    put: async (request, response) => {
      stored.set(request.url, response.clone());
    },
  };
  vm.runInNewContext(source, {
    URL,
    fetch,
    caches: { open: async () => cache },
    self: {
      location: { origin: 'https://route.test' },
      addEventListener: (name, handler) => listeners.set(name, handler),
    },
  });
  return {
    stored,
    async request(request) {
      /** @type {Promise<Response> | undefined} */
      let response;
      const background = [];
      listeners.get('fetch')({
        request,
        respondWith: (value) => {
          response = value;
        },
        waitUntil: (value) => background.push(value),
      });
      const result = await response;
      await Promise.all(background);
      return result;
    },
  };
}

await test('JSON retries bypass stale data and request the new document', async () => {
  let calls = 0;
  const sw = worker(async () => {
    calls++;
    return Response.json({ version: 'new' });
  });
  const request = new Request('https://route.test/yellow/data/gates.json', {
    cache: 'reload',
  });
  sw.stored.set(request.url, Response.json({ version: 'old' }));
  assert.deepEqual(await (await sw.request(request)).json(), {
    version: 'new',
  });
  assert.equal(calls, 1);
});

await test('JSON retries retain cached data when offline', async () => {
  const sw = worker(async () => {
    throw new TypeError('Offline');
  });
  const request = new Request('https://route.test/frlg/data/gates.json', {
    cache: 'reload',
  });
  sw.stored.set(request.url, Response.json({ gates: [] }));
  assert.deepEqual(await (await sw.request(request)).json(), { gates: [] });
});

await test('HTTP failures remain visible and do not overwrite a valid copy', async () => {
  const sw = worker(async () => new Response('unavailable', { status: 503 }));
  const request = new Request('https://route.test/frlg/data/gates.json', {
    cache: 'reload',
  });
  sw.stored.set(request.url, Response.json({ gates: [] }));
  assert.equal((await sw.request(request)).status, 503);
  assert.deepEqual(await sw.stored.get(request.url).json(), { gates: [] });
});
