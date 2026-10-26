import { AnimatePresence, motion } from 'framer-motion';
import { useStore } from './store';
import { Home } from './components/Home';
import { Lobby } from './components/Lobby';
import { Game } from './components/Game';

export function App() {
  const lobby = useStore((s) => s.lobby);
  const view = useStore((s) => s.view);
  const toasts = useStore((s) => s.toasts);
  const connected = useStore((s) => s.connected);

  return (
    <>
      {view && lobby?.inGame ? <Game /> : lobby ? <Lobby /> : <Home />}
      {lobby && !connected && <div className="offline">연결이 끊겼습니다. 다시 연결하는 중…</div>}
      <div className="toasts">
        <AnimatePresence>
          {toasts.map((t) => (
            <motion.div key={t.id} className="toast" initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ opacity: 0 }}>
              {t.text}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </>
  );
}
