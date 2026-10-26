import { Dir, Sides, TileDef, tileDef } from './cards';

export interface Placed {
  type: string;
  rotated: boolean;
}

export type GoalKind = 'vault' | 'lotA' | 'lotB';

/** Public shape of a goal slot; `kind` is only present once revealed (or privately known). */
export interface GoalSlot {
  r: number;
  c: number;
  revealed: boolean;
  kind?: GoalKind;
}

export interface BoardLike {
  tiles: Record<string, Placed>;
  goals: GoalSlot[];
}

export const DR = [-1, 0, 1, 0];
export const DC = [0, 1, 0, -1];
export const opp = (d: number) => ((d + 2) % 4) as Dir;
export const key = (r: number, c: number) => `${r},${c}`;
export const parseKey = (k: string) => k.split(',').map(Number) as [number, number];

export const DEPOT = { r: 0, c: 0 };
export const GOAL_CELLS = [
  { r: -2, c: 8 },
  { r: 0, c: 8 },
  { r: 2, c: 8 },
];

/** Spreadsheet address: depot sits at B4, goals at J2 / J4 / J6. */
export function colName(c: number): string {
  let n = c + 1;
  if (n < 0) return '-' + colName(-n - 2);
  let s = '';
  n += 1;
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}
export const rowName = (r: number) => String(r + 4);
export const addr = (r: number, c: number) => colName(c) + rowName(r);

export function parseAddr(a: string): { r: number; c: number } | null {
  const m = /^([A-Z]{1,2})(-?\d{1,2})$/.exec(a.toUpperCase());
  if (!m) return null;
  let n = 0;
  for (const ch of m[1]) n = n * 26 + (ch.charCodeAt(0) - 64);
  return { r: Number(m[2]) - 4, c: n - 2 };
}

export function effSides(def: TileDef, rotated: boolean): Sides {
  return rotated ? ([def.sides[2], def.sides[3], def.sides[0], def.sides[1]] as Sides) : def.sides;
}

export function effGroups(def: TileDef, rotated: boolean): Dir[][] {
  return rotated ? def.groups.map((g) => g.map(opp)) : def.groups;
}

export function tileAt(b: BoardLike, r: number, c: number): { def: TileDef; p: Placed } | undefined {
  const p = b.tiles[key(r, c)];
  if (!p) return undefined;
  const def = tileDef(p.type);
  return def ? { def, p } : undefined;
}

export function goalIndexAt(b: BoardLike, r: number, c: number): number {
  return b.goals.findIndex((g) => g.r === r && g.c === c);
}

const nodeKey = (r: number, c: number, d: number) => `${r},${c},${d}`;

/** Set of "r,c,side" nodes reachable by road from the depot. */
export function reachable(b: BoardLike): Set<string> {
  const seen = new Set<string>();
  const queue: [number, number, number][] = [];
  const push = (r: number, c: number, d: number) => {
    const k = nodeKey(r, c, d);
    if (!seen.has(k)) {
      seen.add(k);
      queue.push([r, c, d]);
    }
  };
  for (let d = 0; d < 4; d++) push(DEPOT.r, DEPOT.c, d);
  while (queue.length) {
    const [r, c, d] = queue.shift()!;
    const t = tileAt(b, r, c)!;
    for (const g of effGroups(t.def, t.p.rotated)) if (g.includes(d as Dir)) for (const o of g) push(r, c, o);
    const nr = r + DR[d], nc = c + DC[d];
    const n = tileAt(b, nr, nc);
    if (n && effSides(n.def, n.p.rotated)[opp(d)]) push(nr, nc, opp(d));
  }
  return seen;
}

export function isReachableSide(reach: Set<string>, r: number, c: number, d: number) {
  return reach.has(nodeKey(r, c, d));
}

/** Can `type` (optionally rotated) be placed at r,c? */
export function canPlace(b: BoardLike, type: string, rotated: boolean, r: number, c: number, reach = reachable(b)): boolean {
  const def = tileDef(type);
  if (!def || b.tiles[key(r, c)] || goalIndexAt(b, r, c) >= 0) return false;
  const s = effSides(def, rotated);
  let neighbours = 0;
  let linked = false;
  for (let d = 0; d < 4; d++) {
    const nr = r + DR[d], nc = c + DC[d];
    const n = tileAt(b, nr, nc);
    if (!n) continue; // empty cell or face-down goal: no constraint
    neighbours++;
    const ns = effSides(n.def, n.p.rotated);
    if (ns[opp(d)] !== s[d]) return false;
    if (s[d] && isReachableSide(reach, nr, nc, opp(d))) linked = true;
  }
  return neighbours > 0 && linked;
}

/** All cells adjacent to placed tiles. */
export function frontier(b: BoardLike): [number, number][] {
  const out = new Map<string, [number, number]>();
  for (const k of Object.keys(b.tiles)) {
    const [r, c] = parseKey(k);
    for (let d = 0; d < 4; d++) {
      const nr = r + DR[d], nc = c + DC[d];
      const nk = key(nr, nc);
      if (!b.tiles[nk] && goalIndexAt(b, nr, nc) < 0) out.set(nk, [nr, nc]);
    }
  }
  return [...out.values()];
}

export interface Placement {
  r: number;
  c: number;
  rotated: boolean;
}

export function legalPlacements(b: BoardLike, type: string): Placement[] {
  const def = tileDef(type);
  if (!def) return [];
  const reach = reachable(b);
  const res: Placement[] = [];
  const symmetric = def.sides[0] === def.sides[2] && def.sides[1] === def.sides[3];
  for (const [r, c] of frontier(b)) {
    for (const rotated of symmetric ? [false] : [false, true]) {
      if (canPlace(b, type, rotated, r, c, reach)) res.push({ r, c, rotated });
    }
  }
  return res;
}

/** Tiles that a sinkhole may remove: any placed road tile (not depot, not goals). */
export function removableTiles(b: BoardLike): [number, number][] {
  return Object.entries(b.tiles)
    .filter(([, p]) => p.type in tileDefsRemovable)
    .map(([k]) => parseKey(k));
}
const tileDefsRemovable: Record<string, true> = {};
for (const t of [
  'road_cross', 'road_t_v', 'road_t_h', 'road_straight_h', 'road_straight_v', 'road_curve_es', 'road_curve_ws',
  'dead_cross', 'dead_t_v', 'dead_t_h', 'dead_straight_h', 'dead_straight_v', 'dead_curve_es', 'dead_curve_ws',
  'dead_single_n', 'dead_single_e',
]) tileDefsRemovable[t] = true;

/** Unrevealed goals whose cell is touched by a reachable, open road side. */
export function goalsReached(b: BoardLike, reach = reachable(b)): { goal: number; fromDir: Dir }[] {
  const res: { goal: number; fromDir: Dir }[] = [];
  b.goals.forEach((g, i) => {
    if (g.revealed) return;
    for (let d = 0; d < 4; d++) {
      const nr = g.r + DR[d], nc = g.c + DC[d];
      const n = tileAt(b, nr, nc);
      if (n && effSides(n.def, n.p.rotated)[opp(d)] && isReachableSide(reach, nr, nc, opp(d))) {
        res.push({ goal: i, fromDir: d as Dir });
        return;
      }
    }
  });
  return res;
}

export function boardBounds(b: BoardLike) {
  let minR = Infinity, maxR = -Infinity, minC = Infinity, maxC = -Infinity;
  const cells = [...Object.keys(b.tiles).map(parseKey), ...b.goals.map((g) => [g.r, g.c] as [number, number])];
  for (const [r, c] of cells) {
    minR = Math.min(minR, r); maxR = Math.max(maxR, r);
    minC = Math.min(minC, c); maxC = Math.max(maxC, c);
  }
  return { minR, maxR, minC, maxC };
}
