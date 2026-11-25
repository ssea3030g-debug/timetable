import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handle } from '../src/handler.js';

// 가짜 Durable Object: 메모리에 보관
function fakeState() {
  let v = null;
  return {
    idFromName: () => 'main',
    get: () => ({
      fetch: async (_u, init) => {
        if (init.method === 'PUT') { v = init.body; return new Response('{"ok":true}'); }
        return v ? new Response(v) : new Response('{}', { status: 404 });
      }
    })
  };
}
const ORIGIN = 'https://ssea3030g-debug.github.io';
const mk = (over = {}) => ({ APP_PASSCODE: '비밀', ALLOWED_ORIGINS: ORIGIN, STATE: fakeState(), ...over });
const req = (path, { method = 'GET', pass = encodeURIComponent('비밀'), origin = ORIGIN, body } = {}) =>
  new Request('https://x.workers.dev' + path, { method, body, headers: { Origin: origin, 'X-App-Pass': pass, 'Content-Type': 'application/json' } });

test('health 는 비밀번호 없이도 열리고 설정 여부만 알려 줌', async () => {
  const r = await handle(req('/health', { pass: '' }), mk());
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { ok: true, passcode: true });
});
test('비밀번호가 서버에 없으면 거절(503)', async () => {
  const r = await handle(req('/state'), mk({ APP_PASSCODE: '' }));
  assert.equal(r.status, 503);
});
test('틀린 비밀번호는 401', async () => {
  const r = await handle(req('/state', { pass: encodeURIComponent('틀림') }), mk());
  assert.equal(r.status, 401);
});
test('허용되지 않은 주소는 403', async () => {
  const r = await handle(req('/state', { origin: 'https://evil.example' }), mk());
  assert.equal(r.status, 403);
});
test('저장 전에는 404, 저장 후에는 같은 내용을 돌려줌', async () => {
  const env = mk();
  assert.equal((await handle(req('/state'), env)).status, 404);
  const data = { v: 1, t: 123, on: { a1: true }, ov: {}, cu: [] };
  const put = await handle(req('/state', { method: 'PUT', body: JSON.stringify(data) }), env);
  assert.equal(put.status, 200);
  const got = await handle(req('/state'), env);
  assert.equal(got.status, 200);
  assert.deepEqual(await got.json(), data);
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
});
test('요청 제한에 걸리면 429', async () => {
  const r = await handle(req('/state'), mk({ LIMITER: { limit: async () => ({ success: false }) } }));
  assert.equal(r.status, 429);
});
