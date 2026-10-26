// Card catalogue. Directions are indexed N=0, E=1, S=2, W=3.
export type Dir = 0 | 1 | 2 | 3;
export type Sides = [boolean, boolean, boolean, boolean];
export type Tool = 'excavator' | 'light' | 'truck';

export const TOOLS: Tool[] = ['excavator', 'light', 'truck'];
export const TOOL_LABEL: Record<Tool, string> = { excavator: '굴착기', light: '조명', truck: '덤프트럭' };
export const TOOL_ICON: Record<Tool, string> = { excavator: '🚜', light: '💡', truck: '🚚' };

export interface TileDef {
  kind: 'path';
  sides: Sides;
  /** Groups of sides that are joined inside the tile. Dead ends have none. */
  groups: Dir[][];
  dead: boolean;
  art: string;
  label: string;
  glyph: string;
}

export type ActionDef =
  | { kind: 'break'; tool: Tool; art: string; label: string }
  | { kind: 'repair'; tools: Tool[]; art: string; label: string }
  | { kind: 'tipoff'; art: string; label: string }
  | { kind: 'sinkhole'; art: string; label: string };

export type CardDef = TileDef | ActionDef;

export interface Card {
  id: string;
  type: string;
}

const sides = (s: string): Sides => ['N', 'E', 'S', 'W'].map((d) => s.includes(d)) as Sides;
const dirs = (s: string): Dir[] => [...s].map((d) => 'NESW'.indexOf(d) as Dir);

function tile(open: string, joined: string[], art: string, label: string, glyph: string): TileDef {
  return { kind: 'path', sides: sides(open), groups: joined.map(dirs), dead: joined.length === 0, art, label, glyph };
}

/** Fixed tiles that are never in a hand. */
export const SPECIAL_TILES: Record<string, TileDef> = {
  depot: tile('NESW', ['NESW'], 'depot', '차고지', '🏁'),
  goal_vault: tile('NESW', ['NESW'], 'vault', '금고', '💰'),
  goal_lotA: tile('NW', ['NW'], 'empty_lot', '공터', '🏚️'),
  goal_lotB: tile('SW', ['SW'], 'empty_lot', '공터', '🏚️'),
};

export const CARD_DEFS: Record<string, CardDef> = {
  road_cross: tile('NESW', ['NESW'], 'road_cross', '십자', '╬'),
  road_t_v: tile('NES', ['NES'], 'road_t_v', '세로 T', '╠'),
  road_t_h: tile('ESW', ['ESW'], 'road_t_h', '가로 T', '╦'),
  road_straight_h: tile('EW', ['EW'], 'road_straight_h', '가로 직선', '═'),
  road_straight_v: tile('NS', ['NS'], 'road_straight_v', '세로 직선', '║'),
  road_curve_es: tile('ES', ['ES'], 'road_curve_es', '커브', '╔'),
  road_curve_ws: tile('WS', ['WS'], 'road_curve_ws', '커브', '╗'),
  dead_cross: tile('NESW', [], 'dead_cross', '십자 막힘', '✖'),
  dead_t_v: tile('NES', [], 'dead_t_v', '세로 T 막힘', '✖'),
  dead_t_h: tile('ESW', [], 'dead_t_h', '가로 T 막힘', '✖'),
  dead_straight_h: tile('EW', [], 'dead_straight_h', '가로 막힘', '✖'),
  dead_straight_v: tile('NS', [], 'dead_straight_v', '세로 막힘', '✖'),
  dead_curve_es: tile('ES', [], 'dead_curve_es', '커브 막힘', '✖'),
  dead_curve_ws: tile('WS', [], 'dead_curve_ws', '커브 막힘', '✖'),
  dead_single_n: tile('N', [], 'dead_single_n', '단일 막힘', '✖'),
  dead_single_e: tile('E', [], 'dead_single_e', '단일 막힘', '✖'),
  break_excavator: { kind: 'break', tool: 'excavator', art: 'break_0', label: '파손 · 굴착기' },
  break_light: { kind: 'break', tool: 'light', art: 'break_1', label: '파손 · 조명' },
  break_truck: { kind: 'break', tool: 'truck', art: 'break_2', label: '파손 · 덤프트럭' },
  repair_excavator: { kind: 'repair', tools: ['excavator'], art: 'repair_0', label: '수리 · 굴착기' },
  repair_light: { kind: 'repair', tools: ['light'], art: 'repair_1', label: '수리 · 조명' },
  repair_truck: { kind: 'repair', tools: ['truck'], art: 'repair_2', label: '수리 · 덤프트럭' },
  repair_excavator_light: { kind: 'repair', tools: ['excavator', 'light'], art: 'repair_dual_0', label: '수리 · 굴착기/조명' },
  repair_light_truck: { kind: 'repair', tools: ['light', 'truck'], art: 'repair_dual_1', label: '수리 · 조명/덤프트럭' },
  repair_excavator_truck: { kind: 'repair', tools: ['excavator', 'truck'], art: 'repair_dual_2', label: '수리 · 굴착기/덤프트럭' },
  tipoff: { kind: 'tipoff', art: 'tipoff', label: '제보' },
  sinkhole: { kind: 'sinkhole', art: 'sinkhole', label: '싱크홀' },
};

/** Playing-deck composition: 40 road tiles + 27 action cards. */
export const DECK_COUNTS: Record<string, number> = {
  road_cross: 5, road_t_v: 5, road_t_h: 5, road_straight_h: 4, road_straight_v: 3, road_curve_es: 4, road_curve_ws: 5,
  dead_cross: 1, dead_t_v: 1, dead_t_h: 1, dead_straight_h: 1, dead_straight_v: 1, dead_curve_es: 1, dead_curve_ws: 1,
  dead_single_n: 1, dead_single_e: 1,
  break_excavator: 3, break_light: 3, break_truck: 3,
  repair_excavator: 2, repair_light: 2, repair_truck: 2,
  repair_excavator_light: 1, repair_light_truck: 1, repair_excavator_truck: 1,
  tipoff: 6, sinkhole: 3,
};

export const CASH_COUNTS: Record<number, number> = { 1: 16, 2: 8, 3: 4 };

/** [builders, mafia, hand size] by player count. Role cards dealt = players + 1. */
export const SETUP: Record<number, [number, number, number]> = {
  3: [3, 1, 6], 4: [4, 1, 6], 5: [4, 2, 6], 6: [5, 2, 5], 7: [5, 3, 5], 8: [6, 3, 4], 9: [7, 3, 4], 10: [7, 4, 4],
};

export const MAFIA_REWARD = (mafiaCount: number) => (mafiaCount === 1 ? 4 : mafiaCount <= 3 ? 3 : 2);

export function tileDef(type: string): TileDef | undefined {
  const d = CARD_DEFS[type] ?? SPECIAL_TILES[type];
  return d && d.kind === 'path' ? d : undefined;
}

export function cardDef(type: string): CardDef {
  const d = CARD_DEFS[type];
  if (!d) throw new Error(`unknown card ${type}`);
  return d;
}
