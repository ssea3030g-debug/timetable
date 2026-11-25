// 시간표 서버 요청 처리 (Cloudflare 전용 코드와 분리해서 node 로 시험할 수 있게 함)
//   GET /health   연결 확인 (비밀번호가 설정됐는지)
//   GET /state    저장된 시간표 데이터 (없으면 404)
//   PUT /state    시간표 데이터 저장
// 비밀값(wrangler secret): APP_PASSCODE / 일반 설정(wrangler.toml [vars]): ALLOWED_ORIGINS
export const MAX_BYTES = 300000;

function cors(req, env) {
  const origin = req.headers.get('Origin') || '';
  const allowed = String(env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
  const ok = !allowed.length || !origin || allowed.includes(origin);
  return {
    ok,
    headers: {
      'Access-Control-Allow-Origin': allowed.length ? (allowed.includes(origin) ? origin : allowed[0]) : '*',
      'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-App-Pass',
      'Access-Control-Max-Age': '86400',
      Vary: 'Origin'
    }
  };
}

const json = (data, status, headers) =>
  new Response(JSON.stringify(data), { status: status || 200, headers: { 'Content-Type': 'application/json; charset=utf-8', ...headers } });

function sameText(a, b) {
  // 길이·내용 비교 시간을 일정하게
  const x = new TextEncoder().encode(String(a)), y = new TextEncoder().encode(String(b));
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] || 0) ^ (y[i] || 0);
  return diff === 0;
}

export async function handle(req, env) {
  const url = new URL(req.url);
  const c = cors(req, env);
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: c.headers });
  if (url.pathname === '/health' && req.method === 'GET') return json({ ok: true, passcode: !!env.APP_PASSCODE }, 200, c.headers);
  if (!c.ok) return json({ error: '허용되지 않은 주소에서 온 요청이에요.' }, 403, c.headers);
  if (!env.APP_PASSCODE) return json({ error: '서버에 비밀번호(APP_PASSCODE)가 아직 없어요.' }, 503, c.headers);

  if (env.LIMITER) {
    const key = req.headers.get('CF-Connecting-IP') || 'anon';
    const { success } = await env.LIMITER.limit({ key });
    if (!success) return json({ error: '요청이 너무 많아요. 잠시 뒤에 다시 해 주세요.' }, 429, c.headers);
  }

  let pass = req.headers.get('X-App-Pass') || '';
  try { pass = decodeURIComponent(pass); } catch { /* 그대로 비교 */ } // 앱이 한글 비밀번호를 인코딩해서 보냄
  if (!sameText(pass, env.APP_PASSCODE)) return json({ error: '비밀번호가 맞지 않아요.' }, 401, c.headers);

  if (url.pathname !== '/state') return json({ error: '없는 주소예요.' }, 404, c.headers);
  const stub = env.STATE.get(env.STATE.idFromName('main'));

  if (req.method === 'GET') {
    const r = await stub.fetch('https://store/state', { method: 'GET' });
    if (r.status === 404) return json({ error: '저장된 내용이 아직 없어요.' }, 404, c.headers);
    return new Response(await r.text(), { status: 200, headers: { 'Content-Type': 'application/json; charset=utf-8', ...c.headers } });
  }
  if (req.method === 'PUT') {
    const body = await req.text();
    if (body.length > MAX_BYTES) return json({ error: '내용이 너무 커요.' }, 413, c.headers);
    let data;
    try { data = JSON.parse(body); } catch { return json({ error: 'JSON 형식이 아니에요.' }, 400, c.headers); }
    if (!data || typeof data !== 'object' || Array.isArray(data)) return json({ error: '올바른 시간표 데이터가 아니에요.' }, 400, c.headers);
    await stub.fetch('https://store/state', { method: 'PUT', body: JSON.stringify(data) });
    return json({ ok: true }, 200, c.headers);
  }
  return json({ error: '지원하지 않는 방식이에요.' }, 405, c.headers);
}
