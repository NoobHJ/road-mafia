import { Fragment, ReactNode } from 'react';
import { cardDef, tileDef } from '@roadmafia/engine';
import { actions } from './store';

export const art = (name: string) => `/cards/${name}.svg`;
export const cardArt = (type: string) => art(tileDef(type)?.art ?? cardDef(type).art);

export const SEAT_COLORS = ['#e8590c', '#1c7ed6', '#2f9e44', '#ae3ec9', '#f03e3e', '#0ca678', '#f59f00', '#5c7cfa', '#d6336c', '#495057'];

/** Turns sheet coordinates like "H4" into buttons that flash the cell on the board. */
export function CoordText({ text }: { text: string }) {
  const parts = text.split(/\b([A-Z]-?\d{1,2})\b/);
  return (
    <>
      {parts.map((p, i) =>
        i % 2 ? (
          <button key={i} className="coord" onClick={() => actions.flash(p)}>
            {p}
          </button>
        ) : (
          <Fragment key={i}>{p}</Fragment>
        ),
      )}
    </>
  );
}

export function Modal({ children, onClose }: { children: ReactNode; onClose?: () => void }) {
  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}
