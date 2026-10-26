import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  BoardLike, Card, PlayerView, TOOLS, addr, TOOL_ICON, TOOL_LABEL, Tool, cardDef, key, legalPlacements, removableTiles,
} from '@roadmafia/engine';
import { actions, emit, useStore } from '../store';
import { CoordText, Modal, SEAT_COLORS, art, cardArt } from '../ui';
import { Board, CellMark } from './Board';
import { Chat } from './Chat';

type Tab = 'players' | 'log' | 'chat';

export function Game() {
  const view = useStore((s) => s.view)!;
  const lobby = useStore((s) => s.lobby)!;
  const selected = useStore((s) => s.selected);
  const rotated = useStore((s) => s.rotated);
  const unread = useStore((s) => s.unread);
  const [tab, setTab] = useState<Tab>('players');

  const me = view.players[view.me];
  const myTurn = view.phase === 'playing' && view.turn === view.me;
  const card = view.hand.find((c) => c.id === selected);
  const def = card ? cardDef(card.type) : null;
  const board: BoardLike = useMemo(() => ({ tiles: view.tiles, goals: view.goals }), [view.tiles, view.goals]);

  const placements = useMemo(() => (card && def?.kind === 'path' ? legalPlacements(board, card.type) : []), [board, card, def]);

  const marks = useMemo(() => {
    const m = new Map<string, CellMark>();
    if (!myTurn || !card || !def) return m;
    if (def.kind === 'path' && !me.broken.length) placements.filter((p) => p.rotated === rotated).forEach((p) => m.set(key(p.r, p.c), 'place'));
    if (def.kind === 'sinkhole') removableTiles(board).forEach(([r, c]) => m.set(key(r, c), 'sink'));
    if (def.kind === 'tipoff') view.goals.forEach((g) => !g.revealed && m.set(key(g.r, g.c), 'tip'));
    return m;
  }, [myTurn, card, def, placements, rotated, board, view.goals, me.broken.length]);

  const onCell = (r: number, c: number) => {
    if (!card || !def) return;
    if (def.kind === 'path') actions.move({ type: 'place', cardId: card.id, r, c, rotated });
    if (def.kind === 'sinkhole') actions.move({ type: 'sinkhole', cardId: card.id, r, c });
    if (def.kind === 'tipoff') {
      const goal = view.goals.findIndex((g) => g.r === r && g.c === c);
      actions.move({ type: 'tipoff', cardId: card.id, goal });
    }
  };

  // keyboard: R rotates, Esc clears, 1-6 selects
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === 'INPUT') return;
      if (e.key === 'r' || e.key === 'R') actions.rotate();
      if (e.key === 'Escape') actions.select(null);
      const n = Number(e.key);
      if (n >= 1 && n <= view.hand.length) actions.select(view.hand[n - 1].id);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [view.hand]);

  const hint = (() => {
    if (view.phase !== 'playing') return '';
    if (!myTurn) return `${view.players[view.turn].name}의 차례`;
    if (!card || !def) return '카드를 고르세요 (도로 놓기 · 행동 · 버리기)';
    switch (def.kind) {
      case 'path':
        if (me.broken.length) return '도구가 고장 나서 도로를 놓을 수 없어요. 버리기만 가능';
        if (!placements.length) return '놓을 수 있는 칸이 없어요. 버리기만 가능';
        return placements.some((p) => p.rotated === rotated) ? '노란 칸을 눌러 놓기 · R 또는 ↻ 로 회전' : '이 방향으로는 놓을 칸이 없어요. ↻ 회전해 보세요';
      case 'break':
        return '고장 낼 플레이어를 고르세요';
      case 'repair':
        return '고칠 도구 아이콘을 누르세요 (나 포함)';
      case 'tipoff':
        return '확인할 목적지(파란 칸)를 고르세요';
      case 'sinkhole':
        return '제거할 도로(빨간 칸)를 고르세요';
    }
  })();

  return (
    <div className="game">
      <TopBar view={view} deadline={lobby.deadline} />
      <div className="game-main">
        <div className="board-wrap">
          <Board view={view} marks={marks} ghost={card && def?.kind === 'path' ? { type: card.type, rotated } : null} onCell={onCell} />
          <div className="zoom">
            <button onClick={() => actions.zoom(-0.15)}>−</button>
            <button onClick={() => actions.zoom(0.15)}>＋</button>
          </div>
        </div>
        <aside className="side">
          <div className="tabs">
            <button className={tab === 'players' ? 'on' : ''} onClick={() => setTab('players')}>
              플레이어
            </button>
            <button className={tab === 'log' ? 'on' : ''} onClick={() => setTab('log')}>
              기록
            </button>
            <button className={tab === 'chat' ? 'on' : ''} onClick={() => setTab('chat')}>
              채팅{tab !== 'chat' && unread > 0 && <span className="badge">{unread}</span>}
            </button>
          </div>
          <div className="tab-body">
            {tab === 'players' && <Players view={view} card={card} myTurn={myTurn} />}
            {tab === 'log' && <Log view={view} />}
            {tab === 'chat' && <Chat />}
          </div>
        </aside>
      </div>
      <Hand view={view} myTurn={myTurn} hint={hint} />
      <TipoffModal />
      {view.phase !== 'playing' && <RoundModal view={view} isHost={lobby.hostId === view.players[view.me]?.id} deadline={lobby.deadline} />}
    </div>
  );
}

function useCountdown(deadline?: number) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, []);
  return deadline ? Math.max(0, Math.ceil((deadline - now) / 1000)) : null;
}

function TopBar({ view, deadline }: { view: PlayerView; deadline?: number }) {
  const left = useCountdown(view.phase === 'playing' ? deadline : undefined);
  const mafia = view.role === 'mafia';
  const [peek, setPeek] = useState(false);
  return (
    <header className="topbar">
      <button className="btn tiny ghost" onClick={() => confirm('게임에서 나갈까요? 봇이 대신 플레이합니다.') && actions.leave()}>
        ✕
      </button>
      <div className="brand">
        ROAD <span>MAFIA</span>
      </div>
      <div className="stat">
        라운드 <b>{view.round}</b>/{view.totalRounds}
      </div>
      <div className="stat">
        덱 <b>{view.deckCount}</b>
      </div>
      {left !== null && (
        <div className={`stat timer ${left <= 10 ? 'warn' : ''}`}>
          ⏱ <b>{left}</b>
        </div>
      )}
      <button className={`role-chip ${peek ? (mafia ? 'mafia' : 'builder') : 'hidden'}`} onClick={() => setPeek((p) => !p)} title="눌러서 내 역할 보기/가리기">
        {peek ? (mafia ? '🕴️ 마피아' : '👷 시공단') : '🂠 내 역할'}
      </button>
    </header>
  );
}

function Players({ view, card, myTurn }: { view: PlayerView; card?: Card; myTurn: boolean }) {
  const def = card ? cardDef(card.type) : null;
  return (
    <ul className="players">
      {view.players.map((p, i) => {
        const breakable = myTurn && def?.kind === 'break' && i !== view.me && !p.broken.includes(def.tool);
        return (
          <li
            key={p.id}
            className={`player ${view.turn === i && view.phase === 'playing' ? 'turn' : ''} ${breakable ? 'target' : ''}`}
            onClick={() => breakable && card && actions.move({ type: 'break', cardId: card.id, target: i })}
          >
            <span className="dot" style={{ background: SEAT_COLORS[i % SEAT_COLORS.length] }} />
            <div className="grow">
              <div className="pname">
                {p.name} {i === view.me && <span className="tag me">나</span>} {p.isBot && <span className="tag">봇</span>}
              </div>
              <div className="tools">
                {TOOLS.map((t) => {
                  const broken = p.broken.includes(t);
                  const fixable = myTurn && def?.kind === 'repair' && broken && def.tools.includes(t);
                  return (
                    <button
                      key={t}
                      className={`tool ${broken ? 'broken' : ''} ${fixable ? 'fixable' : ''}`}
                      title={`${TOOL_LABEL[t]}${broken ? ' (고장)' : ''}`}
                      disabled={!fixable}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (fixable && card) actions.move({ type: 'repair', cardId: card.id, target: i, tool: t as Tool });
                      }}
                    >
                      {TOOL_ICON[t]}
                    </button>
                  );
                })}
                <span className="hand-count" title="손패">
                  🂠 {p.handCount}
                </span>
              </div>
            </div>
            <div className="score" title="현금 합계">
              💵 {p.total}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function Log({ view }: { view: PlayerView }) {
  const items = [...view.log].reverse();
  return (
    <ol className="log">
      {items.map((e) => (
        <li key={e.n} className={`log-${e.kind}`}>
          <span className="muted">#{e.n}</span> <CoordText text={e.text} />
        </li>
      ))}
    </ol>
  );
}

function Hand({ view, myTurn, hint }: { view: PlayerView; myTurn: boolean; hint: string }) {
  const selected = useStore((s) => s.selected);
  const rotated = useStore((s) => s.rotated);
  const card = view.hand.find((c) => c.id === selected);
  const isPath = card && cardDef(card.type).kind === 'path';
  return (
    <footer className={`hand-bar ${myTurn ? 'my-turn' : ''}`}>
      <div className="hint">
        {myTurn && <b className="your-turn">내 차례!</b>} {hint}
      </div>
      <div className="hand-row">
        <div className="hand">
          <AnimatePresence initial={false} mode="popLayout">
            {view.hand.map((c, i) => (
              <motion.button
                layout
                key={c.id}
                initial={{ y: 40, opacity: 0 }}
                animate={{ y: selected === c.id ? -14 : 0, opacity: 1 }}
                exit={{ y: -60, opacity: 0 }}
                className={`hand-card ${selected === c.id ? 'sel' : ''}`}
                onClick={() => actions.select(c.id)}
                title={`${i + 1}`}
              >
                <img
                  src={cardArt(c.type)}
                  alt=""
                  draggable={false}
                  style={{ transform: selected === c.id && rotated && isPath ? 'rotate(180deg)' : undefined }}
                />
              </motion.button>
            ))}
          </AnimatePresence>
          {view.hand.length === 0 && <div className="muted small">손패 없음</div>}
        </div>
        <div className="hand-actions">
          <button className="btn small" disabled={!isPath} onClick={actions.rotate}>
            ↻ 회전
          </button>
          <button
            className="btn small danger"
            disabled={!myTurn || !card}
            onClick={() => card && actions.move({ type: 'discard', cardId: card.id })}
          >
            버리기
          </button>
        </div>
      </div>
    </footer>
  );
}

function TipoffModal() {
  const t = useStore((s) => s.tipoff);
  const view = useStore((s) => s.view);
  if (!t || !view) return null;
  const g = view.goals[t.goal];
  const close = () => useStore.setState({ tipoff: null });
  return (
    <Modal onClose={close}>
      <h2>📞 익명 제보</h2>
      <img className="modal-card" src={art(t.kind === 'vault' ? 'vault' : 'empty_lot')} alt="" />
      <p>
        <b>
          <CoordText text={addr(g.r, g.c)} />
        </b>{' '}
        은(는) {t.kind === 'vault' ? <b className="gold">💰 금고</b> : <b>🏚️ 공터</b>} 입니다.
      </p>
      <p className="muted small">나만 알고 있는 정보예요. 보드에 작게 표시해 둘게요.</p>
      <button className="btn primary" onClick={close}>
        확인
      </button>
    </Modal>
  );
}

function RoundModal({ view, isHost, deadline }: { view: PlayerView; isHost: boolean; deadline?: number }) {
  const left = useCountdown(deadline);
  const r = view.result!;
  const over = view.phase === 'gameOver';
  const ranking = view.players.map((p, i) => ({ ...p, i })).sort((a, b) => b.total - a.total);
  const best = ranking[0]?.total;
  return (
    <Modal>
      <h2 className={r.winner === 'builders' ? 'win-b' : 'win-m'}>{r.winner === 'builders' ? '👷 시공단 승리!' : '🕴️ 마피아 승리!'}</h2>
      <p className="muted">
        라운드 {view.round}/{view.totalRounds} · 금고 위치 <CoordText text={['J2', 'J4', 'J6'][r.vaultGoal]} />
        {r.connector !== undefined && ` · ${view.players[r.connector].name}이(가) 연결`}
      </p>
      <table className="result">
        <thead>
          <tr>
            <th>플레이어</th>
            <th>역할</th>
            <th>이번 라운드</th>
            <th>합계</th>
          </tr>
        </thead>
        <tbody>
          {(over ? ranking : view.players.map((p, i) => ({ ...p, i }))).map((p) => (
            <tr key={p.id} className={p.i === view.me ? 'me' : ''}>
              <td>
                {over && p.total === best && '🏆 '}
                {p.name}
              </td>
              <td>{r.roles[p.i] === 'mafia' ? '🕴️ 마피아' : '👷 시공단'}</td>
              <td>{r.gains[p.i] ? `+💵${r.gains[p.i]}` : '–'}</td>
              <td>
                <b>{p.total}</b>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {over ? (
        <>
          <h3>🏆 {ranking.filter((p) => p.total === best).map((p) => p.name).join(', ')} 우승!</h3>
          {isHost ? (
            <button className="btn primary" onClick={() => emit('room:lobby')}>
              대기실로 (다시 하기)
            </button>
          ) : (
            <p className="muted">방장이 대기실로 돌아가기를 기다리는 중…</p>
          )}
          <button className="btn ghost" onClick={actions.leave}>
            나가기
          </button>
        </>
      ) : (
        <>
          <p className="muted">{left !== null ? `${left}초 후 다음 라운드` : ''}</p>
          {isHost && (
            <button className="btn primary" onClick={() => emit('room:nextRound')}>
              다음 라운드 바로 시작
            </button>
          )}
        </>
      )}
    </Modal>
  );
}
