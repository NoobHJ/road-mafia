import { randomBytes, randomInt } from 'node:crypto';
import type { Server, Socket } from 'socket.io';
import {
  GameState, Move, applyMove, botMove, createGame, makeView, nextRound, timeoutMove,
} from '@roadmafia/engine';

export const TURN_MS = 60_000;
// RM_FAST=1 speeds bots up for automated tests
const BOT_DELAY_MS = process.env.RM_FAST === '1' ? [5, 15] : [900, 1800];
const NEXT_ROUND_MS = 12_000;
const OFFLINE_GRACE_MS = 10_000;
const MAX_CHAT = 80;

const rng = () => randomInt(0, 2 ** 32) / 2 ** 32;

export interface Member {
  id: string;
  token: string;
  name: string;
  isBot: boolean;
  socketId?: string;
  connected: boolean;
  /** A human who left mid-game is played by a bot until the game ends. */
  away: boolean;
}

export interface ChatMsg {
  id: number;
  from: string;
  seat: number;
  text: string;
  emote?: string;
  ts: number;
}

export interface Room {
  code: string;
  isPublic: boolean;
  hostId: string;
  members: Member[];
  game?: GameState;
  /** Member ids in seat order for the running game. */
  seats: string[];
  deadline?: number;
  timer?: NodeJS.Timeout;
  chat: ChatMsg[];
  chatSeq: number;
  createdAt: number;
}

export const EMOTES: Record<string, string> = {
  sus: '🤨 수상한데?',
  trust: '🤝 믿어볼게',
  nice: '👍 나이스!',
  oops: '😅 미안…',
  hurry: '⏰ 빨리빨리',
  mafia: '🕴️ 너 마피아지?',
};

const BOT_NAMES = ['반장봇', '포클봇', '레미콘봇', '측량봇', '신호수봇', '용접봇', '미장봇', '타워봇', '배관봇'];

export class Rooms {
  rooms = new Map<string, Room>();
  constructor(private io: Server) {}

  private newCode() {
    const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    for (;;) {
      const code = Array.from({ length: 6 }, () => abc[randomInt(abc.length)]).join('');
      if (!this.rooms.has(code)) return code;
    }
  }

  private newMember(name: string, isBot: boolean): Member {
    return { id: randomBytes(6).toString('hex'), token: randomBytes(16).toString('hex'), name, isBot, connected: isBot, away: false };
  }

  create(name: string, isPublic: boolean) {
    const m = this.newMember(name, false);
    const room: Room = {
      code: this.newCode(), isPublic, hostId: m.id, members: [m], seats: [], chat: [], chatSeq: 0, createdAt: Date.now(),
    };
    this.rooms.set(room.code, room);
    return { room, member: m };
  }

  join(code: string, name: string) {
    const room = this.rooms.get(code.toUpperCase());
    if (!room) throw new Error('방을 찾을 수 없습니다');
    if (room.game) throw new Error('이미 게임이 진행 중입니다');
    if (room.members.length >= 10) throw new Error('방이 가득 찼습니다 (최대 10명)');
    const m = this.newMember(uniqueName(room, name), false);
    room.members.push(m);
    return { room, member: m };
  }

  find(code: string, memberId: string, token: string) {
    const room = this.rooms.get(code);
    const m = room?.members.find((x) => x.id === memberId && x.token === token);
    return room && m ? { room, member: m } : null;
  }

  publicList() {
    return [...this.rooms.values()]
      .filter((r) => r.isPublic && !r.game && r.members.length < 10)
      .map((r) => ({ code: r.code, host: r.members.find((m) => m.id === r.hostId)?.name ?? '?', count: r.members.length }));
  }

  addBot(room: Room) {
    if (room.game) throw new Error('게임 중에는 추가할 수 없습니다');
    if (room.members.length >= 10) throw new Error('최대 10명입니다');
    const used = new Set(room.members.map((m) => m.name));
    const name = BOT_NAMES.find((n) => !used.has(n)) ?? `봇${room.members.length}`;
    room.members.push(this.newMember(name, true));
  }

  removeMember(room: Room, id: string) {
    room.members = room.members.filter((m) => m.id !== id);
  }

  leave(room: Room, m: Member) {
    if (room.game && room.seats.includes(m.id)) {
      m.away = true;
      m.connected = false;
      m.socketId = undefined;
      this.systemChat(room, `${m.name} 님이 나갔습니다. 봇이 대신 플레이합니다.`);
      this.scheduleTurn(room);
    } else {
      this.removeMember(room, m.id);
    }
    const humans = room.members.filter((x) => !x.isBot && !x.away);
    if (!humans.length) return this.destroy(room);
    if (room.hostId === m.id) room.hostId = humans[0].id;
    this.broadcast(room);
  }

  destroy(room: Room) {
    clearTimeout(room.timer);
    this.rooms.delete(room.code);
  }

  start(room: Room) {
    if (room.members.length < 3) throw new Error('3명 이상이어야 시작할 수 있습니다');
    room.seats = room.members.map((m) => m.id);
    room.game = createGame(room.members.map((m) => ({ id: m.id, name: m.name, isBot: m.isBot })), rng);
    this.systemChat(room, '게임 시작! 역할 카드를 확인하세요.');
    this.afterChange(room);
  }

  backToLobby(room: Room) {
    clearTimeout(room.timer);
    room.game = undefined;
    room.deadline = undefined;
    room.members = room.members.filter((m) => !m.away);
    room.seats = [];
    this.broadcast(room);
  }

  seatOf(room: Room, memberId: string) {
    return room.seats.indexOf(memberId);
  }

  move(room: Room, m: Member, move: Move) {
    const g = room.game;
    if (!g) throw new Error('게임이 없습니다');
    const seat = this.seatOf(room, m.id);
    const res = applyMove(g, seat, move, rng);
    if (!res.ok) throw new Error(res.error);
    if (res.tipoff && m.socketId) this.io.to(m.socketId).emit('game:tipoff', res.tipoff);
    this.afterChange(room);
  }

  /** Called after every state change of a running game. */
  private afterChange(room: Room) {
    const g = room.game!;
    clearTimeout(room.timer);
    room.deadline = undefined;
    if (g.phase === 'roundEnd') {
      room.deadline = Date.now() + NEXT_ROUND_MS;
      room.timer = setTimeout(() => this.nextRound(room), NEXT_ROUND_MS);
    } else if (g.phase === 'playing') {
      this.scheduleTurn(room);
    }
    this.broadcast(room);
  }

  nextRound(room: Room) {
    if (room.game && nextRound(room.game, rng)) this.afterChange(room);
  }

  scheduleTurn(room: Room) {
    const g = room.game;
    if (!g || g.phase !== 'playing') return;
    clearTimeout(room.timer);
    const member = room.members.find((x) => x.id === room.seats[g.turn])!;
    const turnAt = g.moveNo;
    // bots, players who left, and players who dropped connection are auto-played
    if (member.isBot || member.away || !member.connected) {
      const delay = member.isBot || member.away ? BOT_DELAY_MS[0] + randomInt(BOT_DELAY_MS[1] - BOT_DELAY_MS[0]) : OFFLINE_GRACE_MS;
      room.deadline = member.isBot || member.away ? undefined : Date.now() + delay;
      room.timer = setTimeout(() => {
        if (!room.game || room.game.moveNo !== turnAt) return;
        const seat = g.turn;
        let res = applyMove(g, seat, botMove(makeView(g, seat), rng), rng);
        if (!res.ok) res = applyMove(g, seat, timeoutMove(g, rng)!, rng);
        this.afterChange(room);
      }, delay);
    } else {
      room.deadline = Date.now() + TURN_MS;
      room.timer = setTimeout(() => {
        if (!room.game || room.game.moveNo !== turnAt) return;
        const tm = timeoutMove(g, rng);
        if (tm) applyMove(g, g.turn, tm, rng, true);
        this.afterChange(room);
      }, TURN_MS);
    }
  }

  chat(room: Room, m: Member, text: string, emote?: string) {
    const msg: ChatMsg = { id: ++room.chatSeq, from: m.name, seat: this.seatOf(room, m.id), text: text.slice(0, 200), emote, ts: Date.now() };
    room.chat.push(msg);
    if (room.chat.length > MAX_CHAT) room.chat.shift();
    this.io.to(room.code).emit('chat:msg', msg);
  }

  systemChat(room: Room, text: string) {
    const msg: ChatMsg = { id: ++room.chatSeq, from: '', seat: -1, text, ts: Date.now() };
    room.chat.push(msg);
    if (room.chat.length > MAX_CHAT) room.chat.shift();
    this.io.to(room.code).emit('chat:msg', msg);
  }

  lobbyState(room: Room) {
    return {
      code: room.code,
      isPublic: room.isPublic,
      hostId: room.hostId,
      members: room.members.map((m) => ({ id: m.id, name: m.name, isBot: m.isBot, connected: m.connected, away: m.away })),
      inGame: !!room.game,
      deadline: room.deadline,
    };
  }

  /** Send lobby info plus each seat's private view. */
  broadcast(room: Room) {
    const lobby = this.lobbyState(room);
    for (const m of room.members) {
      if (!m.socketId) continue;
      const sock = this.io.sockets.sockets.get(m.socketId);
      if (!sock) continue;
      sock.emit('room:state', lobby);
      if (room.game) sock.emit('game:view', makeView(room.game, this.seatOf(room, m.id)));
    }
  }

  attach(room: Room, m: Member, socket: Socket) {
    if (m.socketId && m.socketId !== socket.id) this.io.sockets.sockets.get(m.socketId)?.leave(room.code);
    m.socketId = socket.id;
    m.connected = true;
    m.away = false;
    socket.join(room.code);
    socket.data.code = room.code;
    socket.data.memberId = m.id;
    socket.emit('session', { code: room.code, memberId: m.id, token: m.token });
    socket.emit('chat:history', room.chat);
    if (room.game?.phase === 'playing' && room.seats[room.game.turn] === m.id) this.scheduleTurn(room);
    this.broadcast(room);
  }
}

function uniqueName(room: Room, name: string) {
  const used = new Set(room.members.map((m) => m.name));
  if (!used.has(name)) return name;
  for (let i = 2; ; i++) if (!used.has(`${name}${i}`)) return `${name}${i}`;
}
