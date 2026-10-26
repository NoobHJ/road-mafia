// Two humans + one bot over Socket.IO: private info stays private, both can finish a game.
import { io, Socket } from 'socket.io-client';
import { PlayerView, botMove } from '@roadmafia/engine';

const URL = process.env.URL ?? 'http://localhost:3999';
const call = (s: Socket, ev: string, arg?: unknown) => new Promise<any>((res) => s.emit(ev, arg, (r: any) => res(r)));
const assert = (c: unknown, m: string) => { if (!c) { console.error('FAIL', m); process.exit(1); } };

function player(name: string) {
  const s = io(URL, { transports: ['websocket'] });
  const st = { s, view: null as PlayerView | null, session: null as any, last: -1 };
  s.on('session', (x) => (st.session = x));
  s.on('game:view', async (v: PlayerView) => {
    st.view = v;
    if (v.phase !== 'playing' || v.turn !== v.me) return;
    const n = v.log.at(-1)!.n;
    if (n === st.last) return;
    st.last = n;
    const r = await call(s, 'game:move', botMove(v, Math.random));
    assert(r.ok, `${name} move rejected ${r.error}`);
  });
  return st;
}

const a = player('A'), b = player('B');
assert((await call(a.s, 'room:create', { name: '효준', isPublic: false })).ok, 'create');
await new Promise((r) => setTimeout(r, 100));
const code = a.session.code;
assert(!(await call(b.s, 'room:start')).ok, 'non-member cannot start');
assert((await call(b.s, 'room:join', { code, name: '효준' })).ok, 'join');
assert(!(await call(b.s, 'room:start')).ok, 'non-host cannot start');
assert((await call(a.s, 'room:addBot')).ok, 'bot');
assert((await call(a.s, 'room:start')).ok, 'start');
await new Promise((r) => setTimeout(r, 300));
const va = a.view!, vb = b.view!;
assert(va.me !== vb.me, 'different seats');
assert(va.players[1].name === '효준2', 'duplicate name renamed');
assert(!va.hand.some((c) => vb.hand.some((d) => d.id === c.id)), 'hands differ');
assert(!JSON.stringify(va).includes(JSON.stringify(vb.hand)), 'B hand not leaked to A');

// B drops and comes back with its session token
const sess = b.session;
b.s.disconnect();
await new Promise((r) => setTimeout(r, 300));
const b2 = player('B2');
assert((await call(b2.s, 'room:resume', sess)).ok, 'resume');

await new Promise<void>((resolve, reject) => {
  const t = setTimeout(() => reject(new Error('timeout')), 120_000);
  const iv = setInterval(async () => {
    const v = a.view!;
    if (v.phase === 'roundEnd') await call(a.s, 'room:nextRound');
    if (v.phase === 'gameOver') { clearInterval(iv); clearTimeout(t); resolve(); }
  }, 200);
});
assert((await call(a.s, 'room:lobby')).ok, 'back to lobby');
console.log('multi OK · final', a.view!.players.map((p) => `${p.name}:${p.total}`).join(' '));
process.exit(0);
