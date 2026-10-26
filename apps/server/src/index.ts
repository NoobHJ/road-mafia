import { existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { networkInterfaces } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { Server } from 'socket.io';
import type { Move } from '@roadmafia/engine';
import { EMOTES, Rooms } from './rooms';

const PORT = Number(process.env.PORT ?? 3000);
const here = dirname(fileURLToPath(import.meta.url));
const clientDist = join(here, '../../client/dist');

const app = express();
const http = createServer(app);
const io = new Server(http, { cors: { origin: true } });
const rooms = new Rooms(io);

app.get('/api/health', (_req, res) => res.json({ ok: true, rooms: rooms.rooms.size }));
if (existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get('*', (_req, res) => res.sendFile(join(clientDist, 'index.html')));
}

const cleanName = (s: unknown) => String(s ?? '').trim().slice(0, 12) || '익명';

io.on('connection', (socket) => {
  /** Wrap a handler: errors go back to the caller as a toast. */
  const on = (event: string, fn: (arg: any) => void) =>
    socket.on(event, (arg, ack?: (r: unknown) => void) => {
      try {
        fn(arg ?? {});
        ack?.({ ok: true });
      } catch (e) {
        const error = e instanceof Error ? e.message : String(e);
        ack ? ack({ ok: false, error }) : socket.emit('toast', error);
      }
    });

  const ctx = () => {
    const room = rooms.rooms.get(socket.data.code);
    const member = room?.members.find((m) => m.id === socket.data.memberId);
    if (!room || !member) throw new Error('방에 연결되어 있지 않습니다');
    return { room, member };
  };
  const hostOnly = () => {
    const c = ctx();
    if (c.room.hostId !== c.member.id) throw new Error('방장만 할 수 있습니다');
    return c;
  };

  on('rooms:list', () => socket.emit('rooms:list', rooms.publicList()));

  on('room:create', ({ name, isPublic }) => {
    const { room, member } = rooms.create(cleanName(name), !!isPublic);
    rooms.attach(room, member, socket);
  });

  on('room:join', ({ code, name }) => {
    const { room, member } = rooms.join(String(code ?? ''), cleanName(name));
    rooms.attach(room, member, socket);
    rooms.systemChat(room, `${member.name} 님이 들어왔습니다.`);
  });

  on('room:resume', ({ code, memberId, token }) => {
    const found = rooms.find(String(code), String(memberId), String(token));
    if (!found) throw new Error('이전 방에 다시 들어갈 수 없습니다');
    rooms.attach(found.room, found.member, socket);
  });

  on('room:leave', () => {
    const { room, member } = ctx();
    socket.leave(room.code);
    socket.data.code = undefined;
    rooms.leave(room, member);
  });

  on('room:addBot', () => {
    const { room } = hostOnly();
    rooms.addBot(room);
    rooms.broadcast(room);
  });

  on('room:kick', ({ memberId }) => {
    const { room, member } = hostOnly();
    if (room.game) throw new Error('게임 중에는 내보낼 수 없습니다');
    if (memberId === member.id) throw new Error('자기 자신은 내보낼 수 없습니다');
    const target = room.members.find((m) => m.id === memberId);
    if (target?.socketId) io.to(target.socketId).emit('kicked');
    rooms.removeMember(room, String(memberId));
    rooms.broadcast(room);
  });

  on('room:start', () => {
    const { room } = hostOnly();
    if (room.game) throw new Error('이미 시작했습니다');
    rooms.start(room);
  });

  on('room:nextRound', () => {
    const { room } = hostOnly();
    rooms.nextRound(room);
  });

  on('room:lobby', () => {
    const { room } = hostOnly();
    rooms.backToLobby(room);
  });

  on('game:move', (move: Move) => {
    const { room, member } = ctx();
    rooms.move(room, member, move);
  });

  on('chat:send', ({ text, emote }) => {
    const { room, member } = ctx();
    if (emote && EMOTES[emote]) return rooms.chat(room, member, EMOTES[emote], emote);
    const t = String(text ?? '').trim();
    if (t) rooms.chat(room, member, t);
  });

  socket.on('disconnect', () => {
    const room = rooms.rooms.get(socket.data.code);
    const member = room?.members.find((m) => m.id === socket.data.memberId);
    if (!room || !member || member.socketId !== socket.id) return;
    member.connected = false;
    member.socketId = undefined;
    if (room.game?.phase === 'playing' && room.seats[room.game.turn] === member.id) rooms.scheduleTurn(room);
    // lobby rooms without anyone connected are cleaned up after a grace period
    if (!room.game) {
      setTimeout(() => {
        if (!member.connected && rooms.rooms.get(room.code) === room && !room.game) rooms.leave(room, member);
      }, 90_000);
    }
    // drop rooms that nobody is connected to anymore
    setTimeout(() => {
      if (rooms.rooms.get(room.code) === room && !room.members.some((m) => !m.isBot && m.connected)) rooms.destroy(room);
    }, 120_000);
    rooms.broadcast(room);
  });
});

http.listen(PORT, () => {
  const lan = Object.values(networkInterfaces())
    .flat()
    .find((i) => i && i.family === 'IPv4' && !i.internal)?.address;
  console.log(`🟨 Road Mafia server  http://localhost:${PORT}${lan ? `  (같은 와이파이: http://${lan}:${PORT})` : ''}`);
  if (!existsSync(clientDist)) console.log('   client/dist 없음 — 개발 모드는 http://localhost:5173 사용');
});
