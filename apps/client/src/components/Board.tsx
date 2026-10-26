import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { PlayerView, addr, colName, effSides, key, rowName, tileDef } from '@roadmafia/engine';
import { useStore } from '../store';
import { art } from '../ui';

export type CellMark = 'place' | 'sink' | 'tip';

interface Props {
  view: PlayerView;
  marks: Map<string, CellMark>;
  ghost?: { type: string; rotated: boolean } | null;
  onCell: (r: number, c: number) => void;
}

const CW = 60, CH = 90;

export function Board({ view, marks, ghost, onCell }: Props) {
  const zoom = useStore((s) => s.zoom);
  const flash = useStore((s) => s.flash);
  const [hover, setHover] = useState<string | null>(null);
  const scroller = useRef<HTMLDivElement>(null);

  const { rows, cols } = useMemo(() => {
    let minR = -3, maxR = 3, minC = -1, maxC = 9;
    for (const k of Object.keys(view.tiles)) {
      const [r, c] = k.split(',').map(Number);
      minR = Math.min(minR, r - 1); maxR = Math.max(maxR, r + 1);
      minC = Math.min(minC, c - 1); maxC = Math.max(maxC, c + 1);
    }
    const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
    return { rows: range(minR, maxR), cols: range(minC, maxC) };
  }, [view.tiles]);

  // start centred on the depot so the first moves are visible on small screens
  useEffect(() => {
    scroller.current?.querySelector('[data-addr="B4"]')?.scrollIntoView({ block: 'center', inline: 'nearest' });
    if (scroller.current) scroller.current.scrollLeft = 0;
  }, []);

  // scroll a flashed coordinate into view
  useEffect(() => {
    if (!flash) return;
    scroller.current?.querySelector(`[data-addr="${flash}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
  }, [flash]);

  const w = CW * zoom, h = CH * zoom;
  const known = new Map(view.known.map((k) => [k.goal, k.kind]));

  return (
    <div className="board-scroll" ref={scroller}>
      <div
        className="board"
        style={{ gridTemplateColumns: `24px repeat(${cols.length}, ${w}px)`, gridTemplateRows: `20px repeat(${rows.length}, ${h}px)` }}
      >
        <div className="corner" />
        {cols.map((c) => (
          <div key={`h${c}`} className="col-head">
            {colName(c)}
          </div>
        ))}
        {rows.map(renderRow)}
      </div>
    </div>
  );

  function renderRow(r: number) {
    return (
      <Fragment key={r}>
        <div className="row-head">{rowName(r)}</div>
        {cols.map((c) => {
          const k = key(r, c);
          const a = addr(r, c);
          const placed = view.tiles[k];
          const gi = view.goals.findIndex((g) => g.r === r && g.c === c);
          const mark = marks.get(k);
          const cls = ['cell', mark ? `mark-${mark}` : '', flash === a ? 'flash' : '', placed || gi >= 0 ? 'filled' : ''].join(' ');
          let content = null;
          if (placed) {
            const def = tileDef(placed.type)!;
            const sides = effSides(def, placed.rotated);
            content = (
              <motion.div className="tile" initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} key={placed.type + placed.rotated}>
                <img src={art(def.art)} alt={def.label} style={{ transform: placed.rotated ? 'rotate(180deg)' : undefined }} draggable={false} />
                {placed.type.startsWith('goal_lot') && (
                  <svg className="stubs" viewBox="0 0 60 90">
                    {sides[0] && <rect x="22" y="0" width="16" height="22" />}
                    {sides[1] && <rect x="38" y="37" width="22" height="16" />}
                    {sides[2] && <rect x="22" y="68" width="16" height="22" />}
                    {sides[3] && <rect x="0" y="37" width="22" height="16" />}
                  </svg>
                )}
              </motion.div>
            );
          } else if (gi >= 0) {
            const kind = view.goals[gi].kind ?? known.get(gi);
            content = (
              <div className="tile">
                <img src={art('goal_back')} alt="목적지" draggable={false} />
                {kind && <span className={`goal-peek ${view.goals[gi].kind ? 'open' : ''}`}>{kind === 'vault' ? '💰' : '🏚️'}</span>}
              </div>
            );
          } else if (mark === 'place' && ghost && hover === k) {
            content = (
              <div className="tile ghost">
                <img src={art(tileDef(ghost.type)!.art)} alt="" style={{ transform: ghost.rotated ? 'rotate(180deg)' : undefined }} draggable={false} />
              </div>
            );
          }
          return (
            <div
              key={k}
              data-addr={a}
              className={cls}
              title={a}
              onMouseEnter={() => setHover(k)}
              onMouseLeave={() => setHover((h) => (h === k ? null : h))}
              onClick={() => mark && onCell(r, c)}
            >
              {content}
              {!placed && gi < 0 && !content && <span className="cell-addr">{a}</span>}
            </div>
          );
        })}
      </Fragment>
    );
  }
}

