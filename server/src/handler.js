// 시간표 서버 요청 처리 (Cloudflare 전용 코드와 분리해서 node 로 시험할 수 있게 함)
//   GET /health   연결 확인
//   GET /state    내 코드로 저장된 시간표 데이터 (없으면 404)
//   PUT /state    내 코드로 시간표 데이터 저장
// 사용자마다 자기 "코드"(예: 0310손서영)를 앱에 적으면 그 코드의 SHA-256 값이 저장 칸 이름이 됨.
// 코드 자체는 서버에 저장하지 않고, 같은 코드를 아는 사람만 같은 칸에 읽고 쓸 수 있음.
// 일반 설정(wrangler.toml [vars]): ALLOWED_ORIGINS
export const MAX_BYTES = 300000;
export const MIN_CODE = 4, MAX_CODE = 100;

function cors(req, env) {
  const origin = req.headers.get('Origin') || '';
  const allowed = String(env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
  const ok = !allowed.length || !origin || allowed.includes(origin);
  return {
    ok,
    headers: {
      'Access-Control-Allow-Origin': allowed.length ? (allowed.includes(origin) ? origin : allowed[0]) : '*',
      'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-App-Key',
      'Access-Control-Max-Age': '86400',
      Vary: 'Origin'
    }
  };
}

const json = (data, status, headers) =>
  new Response(JSON.stringify(data), { status: status || 200, headers: { 'Content-Type': 'application/json; charset=utf-8', ...headers } });

async function slotName(code) {
  // 한글 코드는 기기마다 글자 조합 방식이 다를 수 있어 NFC 로 통일
  const data = new TextEncoder().encode('timetable:' + code.normalize('NFC').trim());
  const hash = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function handle(req, env) {
  const url = new URL(req.url);
  const c = cors(req, env);
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: c.headers });
  if (url.pathname === '/health' && req.method === 'GET') return json({ ok: true }, 200, c.headers);
  if (!c.ok) return json({ error: '허용되지 않은 주소에서 온 요청이에요.' }, 403, c.headers);

  if (env.LIMITER) {
    const key = req.headers.get('CF-Connecting-IP') || 'anon';
    const { success } = await env.LIMITER.limit({ key });
    if (!success) return json({ error: '요청이 너무 많아요. 잠시 뒤에 다시 해 주세요.' }, 429, c.headers);
  }

  let code = req.headers.get('X-App-Key') || '';
  try { code = decodeURIComponent(code); } catch { /* 그대로 사용 */ } // 앱이 한글 코드를 인코딩해서 보냄
  code = code.normalize('NFC').trim();
  if (code.length < MIN_CODE) return json({ error: `코드를 ${MIN_CODE}글자 이상 적어 주세요.` }, 401, c.headers);
  if (code.length > MAX_CODE) return json({ error: '코드가 너무 길어요.' }, 401, c.headers);

  if (url.pathname !== '/state') return json({ error: '없는 주소예요.' }, 404, c.headers);
  const stub = env.STATE.get(env.STATE.idFromName(await slotName(code)));

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
