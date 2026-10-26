// Full game over Socket.IO: one scripted human (driven by the bot AI) + 3 bots.
import { io, Socket } from 'socket.io-client';
import { PlayerView, botMove } from '@roadmafia/engine';

const URL = process.env.URL ?? 'http://localhost:3999';
const call = (s: Socket, ev: string, arg?: unknown) =>
  new Promise<any>((res) => s.emit(ev, arg, (r: any) => res(r)));

const s = io(URL, { transports: ['websocket'] });
let view: PlayerView | null = null;
let lastMoveNo = -1;
let tipoffs = 0, chats = 0;
s.on('game:tipoff', () => tipoffs++);
s.on('chat:msg', () => chats++);
const done = new Promise<void>((resolve, reject) => {
  const t = setTimeout(() => reject(new Error('timeout')), 240_000);
  s.on('game:view', async (v: PlayerView) => {
    view = v;
    if (v.phase === 'gameOver') { clearTimeout(t); resolve(); return; }
    if (v.phase === 'roundEnd') { await call(s, 'room:nextRound'); return; }
    const n = v.log.at(-1)?.n ?? 0;
    if (v.turn === v.me && n !== lastMoveNo) {
      lastMoveNo = n;
      const r = await call(s, 'game:move', botMove(v, Math.random));
      if (!r.ok) reject(new Error('move rejected: ' + r.error));
    }
  });
});

const r1 = await call(s, 'room:create', { name: '효준', isPublic: true });
if (!r1.ok) throw new Error(r1.error);
for (let i = 0; i < 3; i++) await call(s, 'room:addBot');
await call(s, 'chat:send', { text: 'H4 막힘 누구야?' });
await call(s, 'chat:send', { emote: 'sus' });
const st = await call(s, 'room:start');
if (!st.ok) throw new Error(st.error);
await done;
const v = view!;
console.log('final scores', v.players.map((p) => `${p.name}:${p.total}`).join(' '));
console.log('rounds', v.round, 'tipoffs', tipoffs, 'chat msgs', chats);
s.close();
process.exit(0);
