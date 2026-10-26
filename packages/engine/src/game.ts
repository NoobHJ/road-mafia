import { CARD_DEFS, CASH_COUNTS, Card, DECK_COUNTS, MAFIA_REWARD, SETUP, TOOLS, TOOL_LABEL, Tool, cardDef, tileDef } from './cards';
import {
  BoardLike, DEPOT, GOAL_CELLS, GoalKind, GoalSlot, Placed, addr, canPlace, effSides, goalsReached, key, reachable,
  removableTiles,
} from './board';

export type Role = 'builder' | 'mafia';
export type Rng = () => number;

export interface PlayerState {
  id: string;
  name: string;
  isBot: boolean;
  role: Role;
  hand: Card[];
  broken: Tool[];
  /** Goal indexes this player has privately seen. */
  known: number[];
  scores: number[];
}

export interface FullGoal extends GoalSlot {
  kind: GoalKind;
}

export type LogKind = 'place' | 'break' | 'repair' | 'tipoff' | 'sinkhole' | 'discard' | 'reveal' | 'round' | 'timeout';

export interface LogEntry {
  n: number;
  kind: LogKind;
  player: number;
  text: string;
  /** Structured details used by bots and the UI. */
  target?: number;
  tool?: Tool;
  cell?: string;
  dead?: boolean;
  goal?: number;
}

export interface RoundResult {
  winner: 'builders' | 'mafia';
  roles: Role[];
  gains: number[];
  connector?: number;
  vaultGoal: number;
}

export interface GameState {
  players: PlayerState[];
  deck: Card[];
  cash: number[];
  tiles: Record<string, Placed>;
  goals: FullGoal[];
  turn: number;
  round: number;
  totalRounds: number;
  phase: 'playing' | 'roundEnd' | 'gameOver';
  log: LogEntry[];
  moveNo: number;
  result?: RoundResult;
  /** Index of the player whose action ended the last round. */
  lastActor: number;
}

export type Move =
  | { type: 'place'; cardId: string; r: number; c: number; rotated: boolean }
  | { type: 'break'; cardId: string; target: number }
  | { type: 'repair'; cardId: string; target: number; tool: Tool }
  | { type: 'tipoff'; cardId: string; goal: number }
  | { type: 'sinkhole'; cardId: string; r: number; c: number }
  | { type: 'discard'; cardId: string };

export interface MoveResult {
  ok: boolean;
  error?: string;
  /** Private reveal for a tip-off, delivered only to the actor. */
  tipoff?: { goal: number; kind: GoalKind };
}

export function shuffle<T>(arr: T[], rng: Rng): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function buildDeck(rng: Rng): Card[] {
  const deck: Card[] = [];
  let n = 0;
  for (const [type, count] of Object.entries(DECK_COUNTS)) for (let i = 0; i < count; i++) deck.push({ id: `c${n++}`, type });
  return shuffle(deck, rng);
}

export interface NewPlayer {
  id: string;
  name: string;
  isBot: boolean;
}

export function createGame(players: NewPlayer[], rng: Rng, totalRounds = 3): GameState {
  if (players.length < 3 || players.length > 10) throw new Error('3–10명이 필요합니다');
  const cash: number[] = [];
  for (const [v, n] of Object.entries(CASH_COUNTS)) for (let i = 0; i < n; i++) cash.push(Number(v));
  const g: GameState = {
    players: players.map((p) => ({ ...p, role: 'builder', hand: [], broken: [], known: [], scores: [] })),
    deck: [],
    cash: shuffle(cash, rng),
    tiles: {},
    goals: [],
    turn: Math.floor(rng() * players.length),
    round: 0,
    totalRounds,
    phase: 'playing',
    log: [],
    moveNo: 0,
    lastActor: -1,
  };
  startRound(g, rng);
  return g;
}

export function startRound(g: GameState, rng: Rng) {
  const n = g.players.length;
  const [builders, mafia, handSize] = SETUP[n];
  const roles = shuffle([...Array(builders).fill('builder'), ...Array(mafia).fill('mafia')] as Role[], rng);
  g.round += 1;
  g.phase = 'playing';
  g.result = undefined;
  g.deck = buildDeck(rng);
  g.tiles = { [key(DEPOT.r, DEPOT.c)]: { type: 'depot', rotated: false } };
  const kinds = shuffle<GoalKind>(['vault', 'lotA', 'lotB'], rng);
  g.goals = GOAL_CELLS.map((cell, i) => ({ ...cell, revealed: false, kind: kinds[i] }));
  g.players.forEach((p, i) => {
    p.role = roles[i]; // the leftover role card stays hidden
    p.hand = g.deck.splice(0, handSize);
    p.broken = [];
    p.known = [];
  });
  if (g.lastActor >= 0) g.turn = (g.lastActor + 1) % n;
  pushLog(g, { kind: 'round', player: -1, text: `라운드 ${g.round} 시작` });
}

function pushLog(g: GameState, e: Omit<LogEntry, 'n'>) {
  g.log.push({ n: ++g.moveNo, ...e });
  if (g.log.length > 200) g.log.splice(0, g.log.length - 200);
}

export function boardOf(g: GameState): BoardLike {
  return { tiles: g.tiles, goals: g.goals };
}

/** Validate without mutating. */
export function checkMove(g: GameState, pi: number, m: Move): string | null {
  if (g.phase !== 'playing') return '진행 중인 라운드가 없습니다';
  if (g.turn !== pi) return '내 차례가 아닙니다';
  const p = g.players[pi];
  const card = p.hand.find((c) => c.id === m.cardId);
  if (!card) return '손에 없는 카드입니다';
  const def = cardDef(card.type);
  switch (m.type) {
    case 'discard':
      return null;
    case 'place':
      if (def.kind !== 'path') return '도로 타일이 아닙니다';
      if (p.broken.length) return '고장 난 도구가 있어 도로를 놓을 수 없습니다';
      return canPlace(boardOf(g), card.type, m.rotated, m.r, m.c) ? null : '그 칸에는 놓을 수 없습니다';
    case 'break': {
      if (def.kind !== 'break') return '파손 카드가 아닙니다';
      const t = g.players[m.target];
      if (!t || m.target === pi) return '다른 플레이어를 골라야 합니다';
      return t.broken.includes(def.tool) ? '이미 고장 난 도구입니다' : null;
    }
    case 'repair': {
      if (def.kind !== 'repair') return '수리 카드가 아닙니다';
      const t = g.players[m.target];
      if (!t) return '대상이 없습니다';
      if (!def.tools.includes(m.tool)) return '이 카드로 고칠 수 없는 도구입니다';
      return t.broken.includes(m.tool) ? null : '고장 나지 않은 도구입니다';
    }
    case 'tipoff': {
      if (def.kind !== 'tipoff') return '제보 카드가 아닙니다';
      const goal = g.goals[m.goal];
      return goal && !goal.revealed ? null : '확인할 수 없는 목적지입니다';
    }
    case 'sinkhole': {
      if (def.kind !== 'sinkhole') return '싱크홀 카드가 아닙니다';
      return removableTiles(boardOf(g)).some(([r, c]) => r === m.r && c === m.c) ? null : '제거할 수 없는 칸입니다';
    }
  }
}

export function applyMove(g: GameState, pi: number, m: Move, rng: Rng, timeout = false): MoveResult {
  const err = checkMove(g, pi, m);
  if (err) return { ok: false, error: err };
  const p = g.players[pi];
  const idx = p.hand.findIndex((c) => c.id === m.cardId);
  const [card] = p.hand.splice(idx, 1);
  const def = cardDef(card.type);
  const name = p.name;
  let result: MoveResult = { ok: true };

  switch (m.type) {
    case 'discard':
      pushLog(g, { kind: timeout ? 'timeout' : 'discard', player: pi, text: timeout ? `${name} 시간 초과 · 1장 버림` : `${name} 1장 버림` });
      break;
    case 'place': {
      const td = tileDef(card.type)!;
      g.tiles[key(m.r, m.c)] = { type: card.type, rotated: m.rotated };
      const cell = addr(m.r, m.c);
      pushLog(g, { kind: 'place', player: pi, cell, dead: td.dead, text: `${name} ${td.glyph}${m.rotated ? '↻' : ''} → ${cell}` });
      if (resolveReveals(g, pi)) return result;
      break;
    }
    case 'break': {
      const d = def as Extract<typeof def, { kind: 'break' }>;
      g.players[m.target].broken.push(d.tool);
      pushLog(g, { kind: 'break', player: pi, target: m.target, tool: d.tool, text: `${name} 🔨 ${g.players[m.target].name}의 ${TOOL_LABEL[d.tool]}` });
      break;
    }
    case 'repair': {
      const t = g.players[m.target];
      t.broken = t.broken.filter((x) => x !== m.tool);
      pushLog(g, { kind: 'repair', player: pi, target: m.target, tool: m.tool, text: `${name} 🔧 ${m.target === pi ? '자기' : t.name + '의'} ${TOOL_LABEL[m.tool]}` });
      break;
    }
    case 'tipoff': {
      const goal = g.goals[m.goal];
      if (!p.known.includes(m.goal)) p.known.push(m.goal);
      pushLog(g, { kind: 'tipoff', player: pi, goal: m.goal, cell: addr(goal.r, goal.c), text: `${name} 📞 ${addr(goal.r, goal.c)} 확인` });
      result = { ok: true, tipoff: { goal: m.goal, kind: goal.kind } };
      break;
    }
    case 'sinkhole': {
      delete g.tiles[key(m.r, m.c)];
      const cell = addr(m.r, m.c);
      pushLog(g, { kind: 'sinkhole', player: pi, cell, text: `${name} 🕳️ → ${cell}` });
      break;
    }
  }
  if (g.deck.length) p.hand.push(g.deck.shift()!);
  advance(g, pi);
  return result;
}

/** Reveal goals reached by road. Returns true when the vault ended the round. */
function resolveReveals(g: GameState, pi: number): boolean {
  for (;;) {
    const b = boardOf(g);
    const hits = goalsReached(b, reachable(b));
    if (!hits.length) return false;
    for (const { goal, fromDir } of hits) {
      const gs = g.goals[goal];
      gs.revealed = true;
      const type = `goal_${gs.kind}`;
      const def = tileDef(type)!;
      // fromDir points from the goal to the road; turn the card so that side is open
      const rotated = !effSides(def, false)[fromDir];
      g.tiles[key(gs.r, gs.c)] = { type, rotated };
      const cell = addr(gs.r, gs.c);
      pushLog(g, { kind: 'reveal', player: pi, goal, cell, text: gs.kind === 'vault' ? `💰 ${cell} 금고 발견!` : `🏚️ ${cell} 공터였다` });
      if (gs.kind === 'vault') {
        endRound(g, 'builders', pi);
        return true;
      }
    }
  }
}

function advance(g: GameState, pi: number) {
  const n = g.players.length;
  for (let k = 1; k <= n; k++) {
    const next = (pi + k) % n;
    if (g.players[next].hand.length) {
      g.turn = next;
      return;
    }
  }
  endRound(g, 'mafia', pi);
}

function endRound(g: GameState, winner: 'builders' | 'mafia', actor: number) {
  const n = g.players.length;
  const gains = Array(n).fill(0);
  if (winner === 'builders') {
    const drawn = g.cash.splice(0, n).sort((a, b) => b - a);
    const builders: number[] = [];
    // starting with the connector (or the next builder), counter-clockwise
    for (let k = 0; k < n; k++) {
      const i = (actor - k + n) % n;
      if (g.players[i].role === 'builder') builders.push(i);
    }
    if (builders.length) drawn.forEach((v, j) => (gains[builders[j % builders.length]] += v));
  } else {
    const mafia = g.players.map((p, i) => (p.role === 'mafia' ? i : -1)).filter((i) => i >= 0);
    const each = mafia.length ? MAFIA_REWARD(mafia.length) : 0;
    mafia.forEach((i) => (gains[i] = each));
  }
  g.players.forEach((p, i) => p.scores.push(gains[i]));
  g.result = {
    winner,
    roles: g.players.map((p) => p.role),
    gains,
    connector: winner === 'builders' ? actor : undefined,
    vaultGoal: g.goals.findIndex((x) => x.kind === 'vault'),
  };
  g.lastActor = actor;
  g.phase = g.round >= g.totalRounds ? 'gameOver' : 'roundEnd';
  pushLog(g, { kind: 'round', player: -1, text: winner === 'builders' ? '👷 시공단 승리!' : '🕴️ 마피아 승리!' });
}

export const totalScore = (p: PlayerState) => p.scores.reduce((a, b) => a + b, 0);

export function nextRound(g: GameState, rng: Rng) {
  if (g.phase !== 'roundEnd') return false;
  startRound(g, rng);
  return true;
}

/** A move that is always legal for the player on turn: discard a random card. */
export function timeoutMove(g: GameState, rng: Rng): Move | null {
  const p = g.players[g.turn];
  if (!p?.hand.length) return null;
  return { type: 'discard', cardId: p.hand[Math.floor(rng() * p.hand.length)].id };
}

// ---------------------------------------------------------------------------
// Per-player view: what one seat is allowed to see.

export interface PublicPlayer {
  id: string;
  name: string;
  isBot: boolean;
  handCount: number;
  broken: Tool[];
  scores: number[];
  total: number;
}

export interface PlayerView {
  me: number;
  role: Role | null;
  hand: Card[];
  known: { goal: number; kind: GoalKind }[];
  players: PublicPlayer[];
  tiles: Record<string, Placed>;
  goals: GoalSlot[];
  turn: number;
  round: number;
  totalRounds: number;
  phase: GameState['phase'];
  deckCount: number;
  log: LogEntry[];
  result?: RoundResult;
}

export function makeView(g: GameState, me: number): PlayerView {
  const p = g.players[me];
  const over = g.phase !== 'playing';
  return {
    me,
    role: p ? p.role : null,
    hand: p ? p.hand : [],
    known: p ? p.known.map((i) => ({ goal: i, kind: g.goals[i].kind })) : [],
    players: g.players.map((x) => ({
      id: x.id, name: x.name, isBot: x.isBot, handCount: x.hand.length, broken: x.broken, scores: x.scores, total: totalScore(x),
    })),
    tiles: g.tiles,
    goals: g.goals.map((x) => (x.revealed || over ? { r: x.r, c: x.c, revealed: x.revealed, kind: x.kind } : { r: x.r, c: x.c, revealed: false })),
    turn: g.turn,
    round: g.round,
    totalRounds: g.totalRounds,
    phase: g.phase,
    deckCount: g.deck.length,
    log: g.log.slice(-60),
    result: g.result,
  };
}

export { TOOLS, CARD_DEFS };
