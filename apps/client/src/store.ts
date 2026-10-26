import { io, Socket } from 'socket.io-client';
import { create } from 'zustand';
import type { GoalKind, Move, PlayerView } from '@roadmafia/engine';

export interface LobbyMember {
  id: string;
  name: string;
  isBot: boolean;
  connected: boolean;
  away: boolean;
}

export interface LobbyState {
  code: string;
  isPublic: boolean;
  hostId: string;
  members: LobbyMember[];
  inGame: boolean;
  deadline?: number;
}

export interface ChatMsg {
  id: number;
  from: string;
  seat: number;
  text: string;
  emote?: string;
  ts: number;
}

export interface Session {
  code: string;
  memberId: string;
  token: string;
}

export interface PublicRoom {
  code: string;
  host: string;
  count: number;
}

interface Toast {
  id: number;
  text: string;
}

interface State {
  connected: boolean;
  session: Session | null;
  lobby: LobbyState | null;
  view: PlayerView | null;
  chat: ChatMsg[];
  unread: number;
  publicRooms: PublicRoom[];
  toasts: Toast[];
  tipoff: { goal: number; kind: GoalKind } | null;
  selected: string | null;
  rotated: boolean;
  flash: string | null;
  zoom: number;
}

const SESSION_KEY = 'rm.session';
const NAME_KEY = 'rm.name';

const storage = {
  get(k: string) {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set(k: string, v: string | null) {
    try {
      v === null ? localStorage.removeItem(k) : localStorage.setItem(k, v);
    } catch {
      /* private mode */
    }
  },
};

export const savedName = () => storage.get(NAME_KEY) ?? '';
export const saveName = (n: string) => storage.set(NAME_KEY, n);

const loadSession = (): Session | null => {
  try {
    return JSON.parse(storage.get(SESSION_KEY) ?? 'null');
  } catch {
    return null;
  }
};

export const useStore = create<State>(() => ({
  connected: false,
  session: loadSession(),
  lobby: null,
  view: null,
  chat: [],
  unread: 0,
  publicRooms: [],
  toasts: [],
  tipoff: null,
  selected: null,
  rotated: false,
  flash: null,
  zoom: typeof window !== 'undefined' && window.innerWidth < 600 ? 0.62 : 1,
}));

const set = useStore.setState;
const get = useStore.getState;

export const socket: Socket = io(import.meta.env.VITE_SERVER_URL || undefined, { transports: ['websocket', 'polling'] });

let toastSeq = 0;
export function toast(text: string) {
  const id = ++toastSeq;
  set((s) => ({ toasts: [...s.toasts, { id, text }] }));
  setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), 3200);
}

export function emit(event: string, arg?: unknown): Promise<boolean> {
  return new Promise((resolve) => {
    socket.timeout(8000).emit(event, arg, (err: Error | null, res?: { ok: boolean; error?: string }) => {
      if (err) {
        toast('서버 응답이 없습니다');
        return resolve(false);
      }
      if (!res?.ok) toast(res?.error ?? '실패했습니다');
      resolve(!!res?.ok);
    });
  });
}

export const actions = {
  move(m: Move) {
    set({ selected: null, rotated: false });
    return emit('game:move', m);
  },
  select(cardId: string | null) {
    set((s) => ({ selected: s.selected === cardId ? null : cardId, rotated: s.selected === cardId ? s.rotated : false }));
  },
  rotate() {
    set((s) => ({ rotated: !s.rotated }));
  },
  flash(cell: string) {
    set({ flash: cell });
    setTimeout(() => get().flash === cell && set({ flash: null }), 1800);
  },
  leave() {
    emit('room:leave');
    storage.set(SESSION_KEY, null);
    set({ session: null, lobby: null, view: null, chat: [], selected: null });
    history.replaceState(null, '', location.pathname);
  },
  zoom(d: number) {
    set((s) => ({ zoom: Math.min(1.6, Math.max(0.5, +(s.zoom + d).toFixed(2))) }));
  },
};

socket.on('connect', () => {
  set({ connected: true });
  const s = get().session;
  if (s) {
    socket.emit('room:resume', s, (r: { ok: boolean }) => {
      if (!r.ok) {
        storage.set(SESSION_KEY, null);
        set({ session: null, lobby: null, view: null });
      }
    });
  }
  socket.emit('rooms:list');
});
socket.on('disconnect', () => set({ connected: false }));
socket.on('session', (s: Session) => {
  storage.set(SESSION_KEY, JSON.stringify(s));
  set({ session: s });
});
socket.on('room:state', (lobby: LobbyState) => set({ lobby, ...(lobby.inGame ? {} : { view: null }) }));
socket.on('game:view', (view: PlayerView) => {
  const prev = get().view;
  // drop a selection that is no longer in hand
  const sel = get().selected;
  set({ view, ...(sel && !view.hand.some((c) => c.id === sel) ? { selected: null } : {}) });
  if (view.phase === 'playing' && view.turn === view.me && (!prev || prev.turn !== view.me || prev.phase !== 'playing')) {
    navigator.vibrate?.(80);
  }
});
socket.on('game:tipoff', (t) => set({ tipoff: t }));
socket.on('chat:history', (chat: ChatMsg[]) => set({ chat }));
socket.on('chat:msg', (m: ChatMsg) => set((s) => ({ chat: [...s.chat.slice(-79), m], unread: s.unread + 1 })));
socket.on('rooms:list', (publicRooms: PublicRoom[]) => set({ publicRooms }));
socket.on('toast', (t: string) => toast(t));
socket.on('kicked', () => {
  toast('방에서 내보내졌습니다');
  storage.set(SESSION_KEY, null);
  set({ session: null, lobby: null, view: null, chat: [] });
});
