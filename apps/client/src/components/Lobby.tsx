import { actions, emit, toast, useStore } from '../store';
import { art } from '../ui';
import { Chat } from './Chat';

export function Lobby() {
  const lobby = useStore((s) => s.lobby)!;
  const me = useStore((s) => s.session?.memberId);
  const isHost = lobby.hostId === me;
  const n = lobby.members.length;
  const link = `${location.origin}/?room=${lobby.code}`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      toast('초대 링크를 복사했습니다');
    } catch {
      toast(link);
    }
  };

  return (
    <div className="lobby">
      <div className="panel">
        <div className="lobby-head">
          <div>
            <div className="muted small">초대 코드</div>
            <div className="big-code">{lobby.code}</div>
          </div>
          <div className="col-right">
            <button className="btn small" onClick={copy}>
              링크 복사
            </button>
            <button className="btn small ghost" onClick={actions.leave}>
              나가기
            </button>
          </div>
        </div>

        <h3>
          참가자 {n}/10 <span className="muted small">{lobby.isPublic ? '· 공개 방' : '· 비공개 방'}</span>
        </h3>
        <ul className="members">
          {lobby.members.map((m) => (
            <li key={m.id}>
              <span className="avatar">{m.isBot ? '🤖' : '👷'}</span>
              <span className="grow">
                {m.name} {m.id === lobby.hostId && <span className="tag">방장</span>} {m.id === me && <span className="tag me">나</span>}
                {!m.isBot && !m.connected && <span className="tag off">연결 끊김</span>}
              </span>
              {isHost && m.id !== me && (
                <button className="btn tiny ghost" onClick={() => emit('room:kick', { memberId: m.id })}>
                  내보내기
                </button>
              )}
            </li>
          ))}
        </ul>

        {isHost ? (
          <div className="row">
            <button className="btn" disabled={n >= 10} onClick={() => emit('room:addBot')}>
              🤖 봇 추가
            </button>
            <button className="btn primary grow" disabled={n < 3} onClick={() => emit('room:start')}>
              {n < 3 ? `${3 - n}명 더 필요` : '게임 시작'}
            </button>
          </div>
        ) : (
          <p className="muted center">방장이 게임을 시작하기를 기다리는 중…</p>
        )}
      </div>

      <div className="panel rules">
        <h3>한눈에 보는 규칙</h3>
        <div className="rule-cards">
          <img src={art('role_builder')} alt="시공단" />
          <img src={art('role_mafia')} alt="마피아" />
          <img src={art('vault')} alt="금고" />
        </div>
        <ul>
          <li>
            <b>시공단</b>은 🏁 차고지(B4)에서 목적지 3곳(J2·J4·J6) 중 진짜 💰 금고까지 도로를 잇습니다.
          </li>
          <li>
            <b>마피아</b>는 정체를 숨긴 채 막다른 길·싱크홀·파손으로 공사를 망칩니다. 덱과 손패가 모두 떨어지면 마피아 승리.
          </li>
          <li>내 차례엔 하나만: 도로 놓기 / 행동 카드 쓰기 / 1장 버리기. 그 뒤 1장 뽑기.</li>
          <li>도구(🚜💡🚚)가 하나라도 고장 나면 도로를 못 놓습니다. 📞 제보로 목적지를 몰래 확인하세요.</li>
          <li>3라운드 현금 합계로 우승! 채팅에서 "H4" 처럼 좌표를 쓰면 보드에 표시됩니다.</li>
        </ul>
      </div>

      <div className="panel lobby-chat">
        <Chat />
      </div>
    </div>
  );
}
