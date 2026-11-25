// 시간표 데이터를 보관하는 Durable Object (SQLite 저장소). 서버 하나에 한 개만 씀.
import { DurableObject } from 'cloudflare:workers';

export class StateStore extends DurableObject {
  async fetch(req) {
    if (req.method === 'GET') {
      const v = await this.ctx.storage.get('state');
      return v
        ? new Response(v, { headers: { 'Content-Type': 'application/json; charset=utf-8' } })
        : new Response('{}', { status: 404, headers: { 'Content-Type': 'application/json' } });
    }
    if (req.method === 'PUT') {
      await this.ctx.storage.put('state', await req.text());
      return new Response('{"ok":true}', { headers: { 'Content-Type': 'application/json' } });
    }
    return new Response('', { status: 405 });
  }
}
