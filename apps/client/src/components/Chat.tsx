import { useEffect, useRef, useState } from 'react';
import { emit, useStore } from '../store';
import { CoordText, SEAT_COLORS } from '../ui';

const EMOTES: [string, string][] = [
  ['sus', '🤨'],
  ['trust', '🤝'],
  ['nice', '👍'],
  ['oops', '😅'],
  ['hurry', '⏰'],
  ['mafia', '🕴️'],
];

export function Chat() {
  const chat = useStore((s) => s.chat);
  const [text, setText] = useState('');
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    useStore.setState({ unread: 0 });
    box.current?.scrollTo({ top: box.current.scrollHeight, behavior: 'smooth' });
  }, [chat.length]);

  const send = () => {
    if (!text.trim()) return;
    emit('chat:send', { text });
    setText('');
  };

  return (
    <div className="chat">
      <div className="chat-list" ref={box}>
        {chat.length === 0 && <p className="muted small center">"H4 막힘 누구야?" 처럼 좌표로 대화해 보세요</p>}
        {chat.map((m) =>
          m.seat < 0 && !m.from ? (
            <div key={m.id} className="chat-sys">
              {m.text}
            </div>
          ) : (
            <div key={m.id} className={`chat-msg ${m.emote ? 'emote' : ''}`}>
              <b style={{ color: SEAT_COLORS[m.seat % SEAT_COLORS.length] ?? 'inherit' }}>{m.from}</b> <CoordText text={m.text} />
            </div>
          ),
        )}
      </div>
      <div className="emotes">
        {EMOTES.map(([k, e]) => (
          <button key={k} className="emote-btn" onClick={() => emit('chat:send', { emote: k })} title={k}>
            {e}
          </button>
        ))}
      </div>
      <div className="row chat-input">
        <input value={text} maxLength={200} placeholder="메시지" onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && !e.nativeEvent.isComposing && send()} />
        <button className="btn small" onClick={send}>
          전송
        </button>
      </div>
    </div>
  );
}
