# 🟨 Road Mafia

도시 한복판에서 금고까지 도로를 잇는 **시공단**과, 그 사이에 몰래 섞여 공사를 망치는 **마피아**의 정체 숨기기 카드 게임.
React 웹 + Socket.IO 실시간 서버, Capacitor로 iOS/Android 패키징 준비.

## 바로 해보기

```bash
cd ~/Code/Road-mafia
nvm use            # Node 20 (.nvmrc)
npm install        # 처음 한 번
npm start          # 웹 빌드 + 서버 실행 → http://localhost:3000
```

1. 닉네임 입력 → **방 만들기**
2. 대기실에서 **🤖 봇 추가**로 3명 이상 채우기 (최대 10명)
3. **게임 시작** → 3라운드 현금 합계로 우승

같은 와이파이의 휴대폰·친구는 서버 실행 시 출력되는 `http://192.168.x.x:3000` 주소로 접속해 **초대 코드**(6자리)나 **공개 방 목록**으로 들어오면 됩니다.

### 조작법

| 하고 싶은 것 | 방법 |
| --- | --- |
| 도로 놓기 | 손패에서 도로 카드 선택 → 노란 칸 클릭 |
| 회전 (180°) | `↻ 회전` 버튼 또는 `R` 키 |
| 파손 | 파손 카드 선택 → 오른쪽 플레이어 목록에서 대상 클릭 |
| 수리 | 수리 카드 선택 → 초록 테두리 도구 아이콘 클릭 (나 포함) |
| 제보 | 제보 카드 선택 → 파란 📞 목적지 클릭 (나만 결과를 봄) |
| 싱크홀 | 싱크홀 카드 선택 → 빨간 테두리 도로 클릭 |
| 버리기 | 카드 선택 → `버리기` |
| 카드 빠른 선택 / 취소 | `1`~`6` / `Esc` |
| 좌표로 대화 | 채팅에 `H4` 처럼 쓰면 눌러서 보드에 표시 |
| 내 역할 보기 | 상단 `🂠 내 역할` 눌러서 보기/가리기 |

- 차례 제한 60초, 초과 시 무작위 1장 자동 버리기
- 게임 중 연결이 끊기면 10초 뒤 봇이 대신 두고, 새로고침하면 같은 자리로 복귀
- 게임 중 나가기 → 남은 게임은 봇이 대신 플레이

## 개발

```bash
npm run dev        # 서버(3000, 자동 재시작) + Vite(5173, HMR) 동시 실행 → http://localhost:5173
npm test           # 엔진 단위 테스트 + 봇 120판 시뮬레이션
npm run typecheck  # 전 패키지 타입 검사
```

서버 통합 테스트 (서버를 띄운 상태에서):

```bash
cd apps/server
RM_FAST=1 PORT=3999 npx tsx src/index.ts &   # RM_FAST=1: 봇이 즉시 둠
npx tsx test/e2e.ts      # 사람 1 + 봇 3, 3라운드 완주
npx tsx test/multi.ts    # 사람 2 + 봇 1, 비공개 정보 누출·재접속 검사
```

## 구조

```txt
road-mafia/                 (npm workspaces)
├─ packages/engine/         규칙 엔진 · 순수 함수 · 봇 AI · 테스트 (서버/클라이언트 공용)
│  ├─ src/cards.ts          카드 정의 (도로 40 · 행동 27 · 현금 28 · 역할 11)
│  ├─ src/board.ts          보드 좌표(B4 ↔ r,c) · 변 벡터 · 회전 · BFS 연결 · 놓기 검증
│  ├─ src/game.ts           라운드 진행 · 수 적용 · 보상 · 플레이어별 시야(makeView)
│  └─ src/bots.ts           휴리스틱 봇 (시공단: 금고로 전진 / 마피아: 막다른 길·싱크홀·파손)
├─ apps/server/             Express + Socket.IO 권위 서버 (방 · 타이머 · 봇 · 채팅)
├─ apps/client/             React + Vite + Zustand + Framer Motion
│  ├─ public/cards/*.svg    카드 아트 39종 (docs/card-art/gen.py 로 생성)
│  └─ capacitor.config.ts   iOS/Android 설정
└─ docs/card-art/gen.py     카드 SVG 생성 스크립트
```

### 서버가 비밀을 지키는 방식

- 덱 셔플·역할 배분·수 검증은 모두 서버(`crypto.randomInt`)에서.
- 각 소켓에는 `makeView(state, seat)` 결과만 전송: 남의 손패는 장수만, 역할은 라운드 종료 시 공개, 미공개 목적지는 제보한 본인에게만.
- 클라이언트 엔진은 "놓을 수 있는 칸" 미리보기용이고 판정은 항상 서버.

### 소켓 이벤트

| 방향 | 이벤트 | 내용 |
| --- | --- | --- |
| C→S | `room:create` / `room:join` / `room:resume` | 방 만들기 · 코드로 참가 · 세션 토큰으로 재접속 |
| C→S | `room:addBot` / `room:kick` / `room:start` / `room:nextRound` / `room:lobby` | 방장 전용 |
| C→S | `game:move` | `place` · `break` · `repair` · `tipoff` · `sinkhole` · `discard` |
| C→S | `chat:send` | `{ text }` 또는 `{ emote }` |
| S→C | `room:state` · `game:view` · `game:tipoff` · `chat:msg` | 대기실 · 개인 시야 · 제보 결과 · 채팅 |

## 모바일 앱 (Capacitor)

설정(`apps/client/capacitor.config.ts`)과 의존성은 들어 있고, 네이티브 프로젝트는 아직 만들지 않았습니다. Xcode / Android Studio 설치 후:

```bash
cd apps/client
npx cap add ios                 # 또는 android
VITE_SERVER_URL=http://<서버주소>:3000 npm run cap:sync
npx cap open ios
```

앱은 번들된 웹 파일을 로드하므로 `VITE_SERVER_URL` 로 게임 서버 주소를 지정해야 합니다.

## 다음 단계 후보

- 인터넷 배포 (웹: Vercel, 서버: Fly.io 등 상시 WebSocket 호스팅)
- 계정 · 전적 · 레이팅 · 리플레이 저장
- 카드 아트를 이모지 대신 전용 일러스트로 교체
- 변형 규칙 (클래식 금고, 하청업자 등), 2인 · 11–12인 지원
- 봇 난이도 조절
