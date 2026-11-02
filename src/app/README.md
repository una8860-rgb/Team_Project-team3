# 언더커버

![언더커버: 누가 오면 알려 주고, 필요하면 업무 캘린더로 숨는 앱](design/readme/hero.jpg)

| 담당 | 도구 | 규격 | 화면 설계 | 진행 상황 |
|:---:|:---:|:---:|:---:|:---:|
| 채연 | Streamlit (Python) | [`design.md` ④](../../docs/design.md) | [`SCREEN.md`](SCREEN.md) | [`M4-app.md`](../../docs/milestones/M4-app.md) |

## 1. 무엇을 하는 프로젝트인지

```mermaid
flowchart LR
    P([사람이 다가옴]) --> AI[웹캠 AI<br/>사람 감지]
    AI --> W[웹 화면<br/>엑셀로 전환]
    AI --> R[라즈봇<br/>고개 숙여 인사]
    AI --> A[언더커버 앱<br/>알림 + 방문 기록]
    classDef app fill:#FDE3D3,stroke:#D9480F,stroke-width:3px,color:#7C2D12
    class A app
```

## 2. 각 부분이 어떤 역할을 하는지

```mermaid
flowchart LR
    AI["AI 감지 · 한웅<br/>src/ai"] -- "POST /api/events" --> S[("중앙 서버 · 한웅<br/>src/server<br/>기록 저장")]
    S -- "POST /greet" --> R["로봇 · 유나<br/>src/robot"]
    W["웹 화면 · 채웅<br/>src/web"] -- "GET /api/status<br/>0.5초마다" --> S
    A["앱 · 채연<br/>src/app"] -- "GET /api/events<br/>GET /api/stats<br/>2초마다" --> S
    classDef app fill:#FDE3D3,stroke:#D9480F,stroke-width:3px,color:#7C2D12
    class A app
```

## 3. 어떤 기능을 포함하는지

### 솔직 모드

![솔직 모드 · 한눈에 보는 기능: 홈 탭 지금 상태, 홈 탭 누가 오면 바로 알림, 기록 탭 방문 기록, 기록 탭 날짜별 기록](design/readme/features.gif)

### 위장 모드

![위장 모드 · 버튼 한 번으로 위장: 홈 탭 누가 와 있어요, 홈 탭 버튼 한 번에 위장, 기록 탭 기록도 위장, 홈 탭 사람이 가면, 홈 탭 다시 누르면 원래대로](design/readme/disguise.gif)

| 실제 상태 | 위장 모드에서 보이는 말 |
|:---:|:---:|
| 아무도 없음 | 집중 시간 |
| 누가 와 있음 | 회의 시작 |
| 누가 왔다 감 | 잠깐 미팅 |
| 방문 기록 | 미팅 기록 |

## 4. 결과물에는 어떤 것이 있는지

```
src/app/
├── app.py       화면: 홈 · 기록 · 위장 모드 · 알림 · 서버 연결
├── visits.py    계산: 방문 묶기 · 지금 상태 · 횟수
├── style.css    디자인: 색 · 글꼴 · 핸드폰 폭
├── SCREEN.md    화면 설계서
└── design/      시안 · README 이미지
```

## 5. 예시는 어떤 것이 있는지

한 사람이 왔다 갔을 때 앱 화면이 바뀌는 순서

```mermaid
sequenceDiagram
    participant AI as 웹캠 AI
    participant S as 중앙 서버
    participant A as 언더커버 앱
    AI->>S: person_detected (오후 2:03:21)
    loop 2초마다
        A->>S: GET /api/events?date=오늘
        S-->>A: 기록 목록
    end
    Note over A: 주황 카드 "누가 왔어요!"<br/>알림 + 주황 점 깜빡임
    AI->>S: person_left (오후 2:03:40)
    A->>S: GET /api/events?date=오늘
    S-->>A: 기록 목록
    Note over A: 초록 카드 "지금 아무도 없어요"<br/>방문 1건 · 19초
```

## 6. 프로젝트 전반의 흐름

앱 화면이 바뀌는 규칙

```mermaid
stateDiagram-v2
    direction LR
    state "솔직 모드" as H {
        없음: 지금 아무도 없어요 (초록)
        있음: 누가 왔어요! (주황)
        없음 --> 있음: person_detected
        있음 --> 없음: person_left
    }
    state "위장 모드" as D {
        집중: 집중 시간 (초록)
        회의: 회의 시작 (주황)
        집중 --> 회의: person_detected
        회의 --> 집중: person_left
    }
    H --> D: 위장 모드 버튼
    D --> H: 위장 모드 버튼
```

## 7. 실행 방법

```
pip install -r requirements.txt
streamlit run src/app/app.py
```

| 상황 | 하는 법 |
|---|---|
| 휴대폰으로 보기 | 같은 Wi-Fi 에서 터미널의 `Network URL` 접속 |
| 실제 서버 연결 (11/2) | `$env:SERVER_HOST="서버IP"; streamlit run src/app/app.py` |
| 끄기 | 터미널에서 `Ctrl + C` |
