import { Card, TileDef, cardDef, tileDef } from './cards';
import { BoardLike, DC, DR, Placement, effSides, goalIndexAt, key, legalPlacements, reachable, removableTiles } from './board';
import { Move, PlayerView, Rng } from './game';

/**
 * Heuristic bots. They only see a PlayerView, i.e. exactly what a human in that seat would see.
 */

function boardOf(v: PlayerView): BoardLike {
  return { tiles: v.tiles, goals: v.goals };
}

/** Goals still worth digging toward from this seat's point of view. */
function targets(v: PlayerView) {
  const vault = v.known.find((k) => k.kind === 'vault');
  if (vault) return [v.goals[vault.goal]];
  const lots = new Set(v.known.filter((k) => k.kind !== 'vault').map((k) => k.goal));
  return v.goals.filter((g, i) => !g.revealed && !lots.has(i));
}

const manhattan = (r: number, c: number, ts: { r: number; c: number }[]) =>
  ts.length ? Math.min(...ts.map((t) => Math.abs(t.r - r) + Math.abs(t.c - c))) : 99;

/** Shortest distance from any open, reachable road end to a target goal. */
function frontierDistance(b: BoardLike, ts: { r: number; c: number }[]) {
  const reach = reachable(b);
  let best = 99;
  for (const node of reach) {
    const [r, c, d] = node.split(',').map(Number);
    const t = b.tiles[key(r, c)];
    const def = tileDef(t.type)!;
    if (!effSides(def, t.rotated)[d]) continue;
    const nr = r + DR[d], nc = c + DC[d];
    if (b.tiles[key(nr, nc)] && goalIndexAt(b, nr, nc) < 0) continue;
    best = Math.min(best, manhattan(nr, nc, ts));
  }
  return best;
}

interface Option {
  card: Card;
  pl: Placement;
  after: number;
}

function placementOptions(v: PlayerView, ts: { r: number; c: number }[], wantDead: boolean): Option[] {
  const b = boardOf(v);
  const out: Option[] = [];
  for (const card of v.hand) {
    const def = cardDef(card.type);
    if (def.kind !== 'path' || def.dead !== wantDead) continue;
    for (const pl of legalPlacements(b, card.type)) {
      const nb: BoardLike = { tiles: { ...b.tiles, [key(pl.r, pl.c)]: { type: card.type, rotated: pl.rotated } }, goals: b.goals };
      const after = wantDead ? manhattan(pl.r, pl.c, ts) : frontierDistance(nb, ts);
      out.push({ card, pl, after });
    }
  }
  return out;
}

/** Suspicion of each seat, from public actions this round. */
function suspicion(v: PlayerView): number[] {
  const s = v.players.map(() => 0);
  let start = 0;
  v.log.forEach((e, i) => e.kind === 'round' && e.text.includes('시작') && (start = i));
  for (const e of v.log.slice(start)) {
    if (e.player < 0) continue;
    if (e.kind === 'place' && e.dead) s[e.player] += 3;
    if (e.kind === 'sinkhole') s[e.player] += 2;
    if (e.kind === 'break' && e.target !== undefined) s[e.player] += 1;
    if (e.kind === 'repair' && e.target !== undefined && e.target !== e.player) s[e.player] -= 1;
    if (e.kind === 'place' && !e.dead) s[e.player] -= 0.5;
  }
  return s;
}

const pick = <T>(arr: T[], rng: Rng) => arr[Math.floor(rng() * arr.length)];

function cardsOf(v: PlayerView, kind: string) {
  return v.hand.filter((c) => cardDef(c.type).kind === kind);
}

function repairMove(v: PlayerView, target: number): Move | null {
  const broken = v.players[target].broken;
  for (const c of cardsOf(v, 'repair')) {
    const def = cardDef(c.type) as Extract<ReturnType<typeof cardDef>, { kind: 'repair' }>;
    const tool = def.tools.find((t) => broken.includes(t));
    if (tool) return { type: 'repair', cardId: c.id, target, tool };
  }
  return null;
}

function breakMove(v: PlayerView, order: number[]): Move | null {
  for (const target of order) {
    if (target === v.me) continue;
    for (const c of cardsOf(v, 'break')) {
      const def = cardDef(c.type) as Extract<ReturnType<typeof cardDef>, { kind: 'break' }>;
      if (!v.players[target].broken.includes(def.tool)) return { type: 'break', cardId: c.id, target };
    }
  }
  return null;
}

function tipoffMove(v: PlayerView): Move | null {
  const c = cardsOf(v, 'tipoff')[0];
  if (!c || v.known.some((k) => k.kind === 'vault')) return null;
  const unknown = v.goals.map((g, i) => i).filter((i) => !v.goals[i].revealed && !v.known.some((k) => k.goal === i));
  if (unknown.length <= 1) return null;
  // the middle goal is checked first, as it is the cheapest to reach
  const goal = unknown.includes(1) ? 1 : unknown[0];
  return { type: 'tipoff', cardId: c.id, goal };
}

function discardMove(v: PlayerView, preferKinds: string[], rng: Rng): Move {
  for (const kind of preferKinds) {
    const c = v.hand.find((x) => {
      const d = cardDef(x.type);
      return kind === 'dead' ? d.kind === 'path' && (d as TileDef).dead : kind === 'road' ? d.kind === 'path' && !(d as TileDef).dead : d.kind === kind;
    });
    if (c) return { type: 'discard', cardId: c.id };
  }
  return { type: 'discard', cardId: pick(v.hand, rng).id };
}

function builderMove(v: PlayerView, rng: Rng): Move {
  const b = boardOf(v);
  const ts = targets(v);
  const me = v.players[v.me];
  const sus = suspicion(v);
  const canBuild = me.broken.length === 0;
  const cur = frontierDistance(b, ts);

  if (!canBuild) {
    const m = repairMove(v, v.me);
    if (m) return m;
  }
  const opts = canBuild ? placementOptions(v, ts, false).sort((a, b2) => a.after - b2.after || (rng() - 0.5)) : [];
  if (opts.length && opts[0].after < cur) return place(opts[0]);

  const tip = tipoffMove(v);
  if (tip && rng() < 0.8) return tip;

  // help a trusted player back to work
  const trusted = v.players.map((_, i) => i).filter((i) => i !== v.me && v.players[i].broken.length && sus[i] <= 0);
  for (const t of trusted) {
    const m = repairMove(v, t);
    if (m) return m;
  }
  const suspects = v.players.map((_, i) => i).filter((i) => sus[i] >= 3).sort((a, c) => sus[c] - sus[a]);
  const brk = breakMove(v, suspects);
  if (brk) return brk;

  if (opts.length && opts[0].after <= cur) return place(opts[0]);

  // clear a dead end that sits in the way
  const sink = cardsOf(v, 'sinkhole')[0];
  if (sink) {
    const dead = removableTiles(b)
      .filter(([r, c]) => tileDef(b.tiles[key(r, c)].type)!.dead)
      .sort((x, y) => manhattan(x[0], x[1], ts) - manhattan(y[0], y[1], ts));
    if (dead.length && manhattan(dead[0][0], dead[0][1], ts) <= 5) return { type: 'sinkhole', cardId: sink.id, r: dead[0][0], c: dead[0][1] };
  }
  if (tip) return tip;
  return discardMove(v, ['dead', 'sinkhole', 'break', 'tipoff'], rng);
}

function mafiaMove(v: PlayerView, rng: Rng): Move {
  const b = boardOf(v);
  const ts = targets(v);
  const me = v.players[v.me];
  const sus = suspicion(v);
  const canBuild = me.broken.length === 0;
  const cur = frontierDistance(b, ts);

  // stay under cover now and then
  if (rng() < 0.2 && sus[v.me] >= 2) return builderMove(v, rng);

  if (!canBuild && rng() < 0.6) {
    const m = repairMove(v, v.me);
    if (m) return m;
  }
  if (canBuild) {
    const dead = placementOptions(v, ts, true).sort((a, c) => a.after - c.after);
    if (dead.length && dead[0].after <= cur + 1) return place(dead[0]);
  }
  const sink = cardsOf(v, 'sinkhole')[0];
  if (sink && cur <= 4) {
    const reach = reachable(b);
    const cand = removableTiles(b)
      .filter(([r, c]) => !tileDef(b.tiles[key(r, c)].type)!.dead && [0, 1, 2, 3].some((d) => reach.has(`${r},${c},${d}`)))
      .sort((x, y) => manhattan(x[0], x[1], ts) - manhattan(y[0], y[1], ts));
    if (cand.length) return { type: 'sinkhole', cardId: sink.id, r: cand[0][0], c: cand[0][1] };
  }
  // break whoever looks most like a builder
  const order = v.players.map((_, i) => i).filter((i) => i !== v.me).sort((a, c) => sus[a] - sus[c] || rng() - 0.5);
  const brk = breakMove(v, order);
  if (brk && rng() < 0.85) return brk;

  const tip = tipoffMove(v);
  if (tip) return tip;
  if (canBuild) {
    // look busy: lay a road that does not bring anyone closer
    const slow = placementOptions(v, ts, false).filter((o) => o.after >= cur).sort((a, c) => c.after - a.after);
    if (slow.length) return place(slow[0]);
  }
  return discardMove(v, ['repair', 'road', 'tipoff'], rng);
}

function place(o: Option): Move {
  return { type: 'place', cardId: o.card.id, r: o.pl.r, c: o.pl.c, rotated: o.pl.rotated };
}

export function botMove(v: PlayerView, rng: Rng): Move {
  return v.role === 'mafia' ? mafiaMove(v, rng) : builderMove(v, rng);
}

