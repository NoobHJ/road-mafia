import { describe, expect, it } from 'vitest';
import {
  BoardLike, CARD_DEFS, DECK_COUNTS, GameState, addr, applyMove, botMove, buildDeck, canPlace, createGame, key, legalPlacements,
  makeView, nextRound, parseAddr, reachable, totalScore,
} from '../src';

function rngFrom(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

const emptyBoard = (): BoardLike => ({
  tiles: { [key(0, 0)]: { type: 'depot', rotated: false } },
  goals: [{ r: -2, c: 8, revealed: false }, { r: 0, c: 8, revealed: false }, { r: 2, c: 8, revealed: false }],
});

describe('cards', () => {
  it('has 40 road tiles and 27 actions', () => {
    const count = (kind: string) => Object.entries(DECK_COUNTS).filter(([t]) => (CARD_DEFS[t].kind === 'path') === (kind === 'path')).reduce((a, [, n]) => a + n, 0);
    expect(count('path')).toBe(40);
    expect(count('action')).toBe(27);
    expect(buildDeck(rngFrom(1))).toHaveLength(67);
  });
});

describe('addresses', () => {
  it('maps depot to B4 and goals to J2/J4/J6', () => {
    expect(addr(0, 0)).toBe('B4');
    expect(addr(-2, 8)).toBe('J2');
    expect(addr(2, 8)).toBe('J6');
    expect(addr(0, -1)).toBe('A4');
    expect(parseAddr('J4')).toEqual({ r: 0, c: 8 });
  });
});

describe('placement', () => {
  it('requires matching edges and a link to the depot', () => {
    const b = emptyBoard();
    expect(canPlace(b, 'road_straight_h', false, 0, 1)).toBe(true);
    expect(canPlace(b, 'road_straight_v', false, 0, 1)).toBe(false); // W side closed against depot's open E
    expect(canPlace(b, 'road_straight_h', false, 0, 2)).toBe(false); // not adjacent
    expect(canPlace(b, 'road_curve_ws', false, 0, 1)).toBe(true);
    expect(canPlace(b, 'road_curve_es', false, 0, 1)).toBe(false);
    expect(canPlace(b, 'road_curve_es', true, 0, 1)).toBe(true); // rotated: N+W
  });

  it('does not pass through dead ends', () => {
    const b = emptyBoard();
    b.tiles[key(0, 1)] = { type: 'dead_straight_h', rotated: false };
    expect(canPlace(b, 'road_straight_h', false, 0, 2)).toBe(false);
    const reach = reachable(b);
    expect(reach.has('0,1,3')).toBe(true);
    expect(reach.has('0,1,1')).toBe(false);
  });

  it('cannot place on goal cells', () => {
    const b = emptyBoard();
    for (let c = 1; c < 8; c++) b.tiles[key(0, c)] = { type: 'road_straight_h', rotated: false };
    expect(legalPlacements(b, 'road_cross').some((p) => p.r === 0 && p.c === 8)).toBe(false);
  });
});

function forceGame(seed: number): GameState {
  return createGame(['a', 'b', 'c', 'd'].map((n) => ({ id: n, name: n, isBot: true })), rngFrom(seed));
}

describe('round flow', () => {
  it('reveals the vault and pays builders', () => {
    const rng = rngFrom(7);
    const g = forceGame(7);
    g.goals.forEach((x, i) => (x.kind = i === 1 ? 'vault' : i === 0 ? 'lotA' : 'lotB'));
    for (let c = 1; c < 7; c++) g.tiles[key(0, c)] = { type: 'road_straight_h', rotated: false };
    const p = g.players[g.turn];
    p.role = 'builder';
    p.broken = [];
    p.hand[0] = { id: 'x', type: 'road_straight_h' };
    const res = applyMove(g, g.turn, { type: 'place', cardId: 'x', r: 0, c: 7, rotated: false }, rng);
    expect(res.ok).toBe(true);
    expect(g.result?.winner).toBe('builders');
    expect(g.goals[1].revealed).toBe(true);
    const builderGain = g.result!.gains.filter((_, i) => g.players[i].role === 'builder').reduce((a, b) => a + b, 0);
    expect(builderGain).toBeGreaterThan(0);
    expect(g.phase).toBe('roundEnd');
  });

  it('blocks broken players from building', () => {
    const g = forceGame(3);
    const p = g.players[g.turn];
    p.broken = ['light'];
    p.hand[0] = { id: 'y', type: 'road_straight_h' };
    const res = applyMove(g, g.turn, { type: 'place', cardId: 'y', r: 0, c: 1, rotated: false }, rngFrom(1));
    expect(res.ok).toBe(false);
  });

  it('hides other hands and unknown goals in views', () => {
    const g = forceGame(5);
    const v = makeView(g, 0);
    expect(v.goals.every((x) => x.kind === undefined)).toBe(true);
    expect(JSON.stringify(v.players)).not.toContain('"hand"');
    expect(JSON.stringify(v.players)).not.toContain('"role"');
  });
});

describe('bot games', () => {
  it('always finish with legal moves', () => {
    let builderWins = 0, rounds = 0;
    for (let seed = 1; seed <= 120; seed++) {
      const rng = rngFrom(seed);
      const n = 3 + (seed % 8);
      const g = createGame(Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `P${i}`, isBot: true })), rng);
      let guard = 0;
      while (g.phase !== 'gameOver') {
        if (g.phase === 'roundEnd') {
          rounds++;
          if (g.result!.winner === 'builders') builderWins++;
          nextRound(g, rng);
          continue;
        }
        const m = botMove(makeView(g, g.turn), rng);
        const res = applyMove(g, g.turn, m, rng);
        if (!res.ok) throw new Error(`seed ${seed}: ${res.error} ${JSON.stringify(m)}`);
        if (++guard > 2000) throw new Error('stuck');
      }
      rounds++;
      if (g.result!.winner === 'builders') builderWins++;
      expect(g.players.every((p) => p.scores.length === 3)).toBe(true);
      expect(Math.max(...g.players.map(totalScore))).toBeGreaterThan(0);
    }
    const rate = builderWins / rounds;
    console.log(`builder win rate ${(rate * 100).toFixed(1)}% over ${rounds} rounds`);
    expect(rate).toBeGreaterThan(0.2);
    expect(rate).toBeLessThan(0.9);
  });
});
