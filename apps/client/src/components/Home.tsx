import { useEffect, useState } from 'react';
import { art } from '../ui';
import { emit, saveName, savedName, socket, useStore } from '../store';

export function Home() {
  const [name, setName] = useState(savedName());
  const [code, setCode] = useState(() => new URLSearchParams(location.search).get('room')?.toUpperCase() ?? '');
  const [isPublic, setPublic] = useState(true);
  const rooms = useStore((s) => s.publicRooms);
  const connected = useStore((s) => s.connected);

  useEffect(() => {
    const t = setInterval(() => socket.emit('rooms:list'), 4000);
    return () => clearInterval(t);
  }, []);

  const nick = () => {
    const n = name.trim() || `시공${Math.floor(Math.random() * 90 + 10)}`;
    saveName(n);
    return n;
  };
  const join = (c: string) => c.trim() && emit('room:join', { code: c.trim().toUpperCase(), name: nick() });

  return (
    <div className="home">
      <div className="hero">
        <img src={art('back_play')} alt="" className="hero-card c1" />
        <img src={art('role_mafia')} alt="" className="hero-card c2" />
        <img src={art('vault')} alt="" className="hero-card c3" />
        <h1>
          ROAD <span>MAFIA</span>
        </h1>
        <p>금고까지 도로를 이어라. 단, 시공단 속에 마피아가 숨어 있다.</p>
      </div>

      <div className="panel home-form">
        <label className="field">
          <span>닉네임</span>
          <input value={name} maxLength={12} placeholder="예: 효준" onChange={(e) => setName(e.target.value)} />
        </label>

        <div className="row">
          <button className="btn primary grow" disabled={!connected} onClick={() => emit('room:create', { name: nick(), isPublic })}>
            방 만들기
          </button>
          <label className="check">
            <input type="checkbox" checked={isPublic} onChange={(e) => setPublic(e.target.checked)} /> 공개 방
          </label>
        </div>

        <div className="divider">또는 초대 코드로 참가</div>
        <div className="row">
          <input
            className="code-input grow"
            value={code}
            maxLength={6}
            placeholder="ABC123"
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            onKeyDown={(e) => e.key === 'Enter' && join(code)}
          />
          <button className="btn" disabled={!connected || code.length < 6} onClick={() => join(code)}>
            참가
          </button>
        </div>
      </div>

      <div className="panel">
        <h3>공개 방 {rooms.length ? `(${rooms.length})` : ''}</h3>
        {rooms.length === 0 && <p className="muted">열려 있는 공개 방이 없습니다. 방을 만들고 봇과 먼저 해보세요!</p>}
        <ul className="room-list">
          {rooms.map((r) => (
            <li key={r.code}>
              <span className="mono">{r.code}</span>
              <span className="grow">{r.host}의 방</span>
              <span className="muted">{r.count}/10</span>
              <button className="btn small" onClick={() => join(r.code)}>
                참가
              </button>
            </li>
          ))}
        </ul>
      </div>
      {!connected && <p className="muted center">서버에 연결하는 중…</p>}
    </div>
  );
}
