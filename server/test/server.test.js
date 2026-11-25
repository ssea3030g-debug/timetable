import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handle } from '../src/handler.js';

// 가짜 Durable Object: 이름(코드 해시)마다 메모리 칸을 따로 가짐
function fakeState() {
  const slots = {};
  return {
    idFromName: name => name,
    get: id => ({
      fetch: async (_u, init) => {
        if (init.method === 'PUT') { slots[id] = init.body; return new Response('{"ok":true}'); }
        return slots[id] ? new Response(slots[id]) : new Response('{}', { status: 404 });
      }
    })
  };
}
const ORIGIN = 'https://ssea3030g-debug.github.io';
const mk = (over = {}) => ({ ALLOWED_ORIGINS: ORIGIN, STATE: fakeState(), ...over });
const req = (path, { method = 'GET', code = '0310손서영', origin = ORIGIN, body } = {}) =>
  new Request('https://x.workers.dev' + path, { method, body, headers: { Origin: origin, 'X-App-Key': encodeURIComponent(code), 'Content-Type': 'application/json' } });
const DATA = { v: 1, t: 123, on: { a1: true }, ov: {}, cu: [] };

test('health 는 코드 없이도 열림', async () => {
  const r = await handle(req('/health', { code: '' }), mk());
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { ok: true });
});
test('코드가 너무 짧거나 비어 있으면 401', async () => {
  assert.equal((await handle(req('/state', { code: '' }), mk())).status, 401);
  assert.equal((await handle(req('/state', { code: 'abc' }), mk())).status, 401);
  assert.equal((await handle(req('/state', { code: 'a'.repeat(101) }), mk())).status, 401);
});
test('허용되지 않은 주소는 403', async () => {
  const r = await handle(req('/state', { origin: 'https://evil.example' }), mk());
  assert.equal(r.status, 403);
});
test('저장 전에는 404, 저장 후에는 같은 코드로 같은 내용을 돌려줌', async () => {
  const env = mk();
  assert.equal((await handle(req('/state'), env)).status, 404);
  const put = await handle(req('/state', { method: 'PUT', body: JSON.stringify(DATA) }), env);
  assert.equal(put.status, 200);
  const got = await handle(req('/state'), env);
  assert.equal(got.status, 200);
  assert.deepEqual(await got.json(), DATA);
});
test('코드마다 저장 칸이 따로이고, 다른 코드로는 내용이 보이지 않음', async () => {
  const env = mk();
  await handle(req('/state', { method: 'PUT', body: JSON.stringify(DATA) }), env);
  const other = { ...DATA, t: 999, on: { a2: true } };
  await handle(req('/state', { code: '1111김철수', method: 'PUT', body: JSON.stringify(other) }), env);
  assert.deepEqual(await (await handle(req('/state'), env)).json(), DATA);
  assert.deepEqual(await (await handle(req('/state', { code: '1111김철수' }), env)).json(), other);
  assert.equal((await handle(req('/state', { code: '0310손서영 ' + 'x' }), env)).status, 404);
});
test('앞뒤 공백과 한글 조합 방식 차이는 같은 코드로 취급', async () => {
  const env = mk();
  await handle(req('/state', { method: 'PUT', body: JSON.stringify(DATA) }), env);
  const nfd = '0310손서영'.normalize('NFD');
  assert.notEqual(nfd, '0310손서영');
  assert.equal((await handle(req('/state', { code: nfd }), env)).status, 200);
  assert.equal((await handle(req('/state', { code: '  0310손서영  ' }), env)).status, 200);
});
test('JSON 이 아니거나 너무 크면 거절', async () => {
  const env = mk();
  assert.equal((await handle(req('/state', { method: 'PUT', body: 'abc' }), env)).status, 400);
  assert.equal((await handle(req('/state', { method: 'PUT', body: '[1]' }), env)).status, 400);
  assert.equal((await handle(req('/state', { method: 'PUT', body: JSON.stringify({ x: 'a'.repeat(310000) }) }), env)).status, 413);
});
test('OPTIONS 는 CORS 헤더와 함께 204', async () => {
  const r = await handle(new Request('https://x.workers.dev/state', { method: 'OPTIONS', headers: { Origin: ORIGIN } }), mk());
  assert.equal(r.status, 204);
  assert.equal(r.headers.get('Access-Control-Allow-Origin'), ORIGIN);
  assert.match(r.headers.get('Access-Control-Allow-Headers'), /X-App-Key/);
});
test('요청 제한에 걸리면 429', async () => {
  const r = await handle(req('/state'), mk({ LIMITER: { limit: async () => ({ success: false }) } }));
  assert.equal(r.status, 429);
});
