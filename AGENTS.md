# AGENTS.md — 팀 공통 AI 지침

> 이 레포에서 일하는 모든 AI 도구(Claude Code, Codex, Cursor 등)와 사람이 따르는 규칙입니다.
> 팀원이 비전공자 위주이므로, 코드와 설명은 **입문자가 읽고 이해할 수 있게** 작성합니다.

## 프로젝트 요약

딴짓 보호 로봇(가제): 웹캠 AI가 사람 접근을 감지하면 웹 화면을 엑셀 업무 화면으로 바꾸고, 라즈봇이 고개 숙여 인사하며, 앱에 감지 기록을 남기는 시스템.

- 무엇을 만드나: [docs/requirements.md](docs/requirements.md)
- 어떻게 연결하나 (통신 규격): [docs/design.md](docs/design.md) ← **코드 작성 전 반드시 확인**
- 일정·담당: [docs/milestones/](docs/milestones/)

## 폴더 소유권 — 자기 담당 폴더만 수정

| 폴더 | 담당 |
|---|---|
| `src/ai/`, `src/server/`, `docs/milestones/M1-ai-server.md` | 한웅 |
| `src/robot/`, `reference/`, `docs/milestones/M2-robot-greet.md` | 유나 |
| `src/web/`, `docs/milestones/M3-web.md` | 채웅 |
| `src/app/`, `docs/milestones/M4-app.md` | 채연 |
| `src/common/`, `docs/design.md`, `requirements.txt` | 공용 — **수정은 PR로 팀 합의** |
| 그 외 (`README.md`, `AGENTS.md`, `docs/` 나머지) | 팀장(유나) |

- 다른 사람 폴더의 파일은 고치지 않습니다. 필요하면 제안만 하고 담당자에게 알립니다.
- `main` 브랜치에 직접 push 하지 않습니다. 브랜치 이름: `member번호-작업내용` (예: `member2-robot-greet`) → Pull Request.

## 코드 규칙

- 언어: Python (앱은 담당자가 정한 도구). 이름은 `snake_case`, 상수는 `UPPER_CASE`.
- **IP·포트·이벤트 이름을 코드에 직접 쓰지 않습니다.** `src/common/protocol.py` 의 상수를 가져다 씁니다.
  ```python
  from common.protocol import SERVER_PORT, EVENT_PERSON_DETECTED
  ```
- 함수는 짧게, 하는 일이 하나가 되게. 함수 위에 무엇을 하는지 한국어 주석 한 줄.
- 실행 파일 맨 아래에 실행 방법을 주석으로 남깁니다. (예: `# 실행: python src/robot/robot_server.py`)
- **하드웨어나 다른 모듈이 없어도 돌아가는 테스트 모드**를 둡니다. (예: 로봇 없으면 동작 대신 콘솔 출력, 서버 없으면 `data/` 의 샘플 데이터 사용)

## 함수·통신 규격 (요약, 원본은 docs/design.md)

| 방향 | 요청 | 응답 |
|---|---|---|
| AI → 서버 | `POST /api/events` `{"type", "timestamp", "confidence"}` | `{"ok": true, "id": 12}` |
| 서버 → 로봇 | `POST /greet` `{"event_id"}` · `GET /health` | `{"ok": true}` |
| 웹 화면 → 서버 | `GET /api/status` (0.5초마다) | `{"state": "present"/"absent", "since"}` |
| 앱 → 서버 | `GET /api/events?date=` · `GET /api/stats?date=` (2초마다) | 이벤트 목록 / `{"date", "count"}` |

- 모든 본문은 JSON. 시간은 ISO 8601 + 한국 시간 (`2026-11-02T14:03:21+09:00`).
- 성공 `{"ok": true, ...}` / 실패 `{"ok": false, "error": "이유"}`.
- 로봇 요청 타임아웃 2초, 로봇 쿨다운 10초. 감지 기준: 2초 이상 보이면 감지, 3초 이상 안 보이면 사라짐.

## 제약사항

- **공개(Public) 레포**입니다. 비밀번호·API 키·Wi-Fi 비밀번호를 올리지 않습니다. 필요하면 `.env` (git 제외)에 넣고 예시는 `.env.example` 로.
- AI 모델 파일·영상 등 큰 파일은 올리지 않습니다 (Google Drive 공유).
- 웹캠 영상·사진을 저장하거나 기기 밖으로 보내지 않습니다. **특정 인물 식별(얼굴 인식) 금지.** 서버에는 이벤트 종류·시각·신뢰도만 보냅니다.
- 새 라이브러리를 쓰면 `requirements.txt` 에 **버전을 고정**해 추가하고 PR 설명에 적습니다.
- 개발 기간이 짧습니다 (11/2 통합, 11/3 발표). 새 기능보다 **필수 기능 완성과 시연 안정성**이 우선입니다.

## 글쓰기 규칙

### 이모지 금지
- 문서(.md), 커밋 메시지, PR 제목·설명, 코드 주석, 로그 출력에 이모지를 쓰지 않습니다.
- AGENTS.md, CLAUDE.md 같은 AI 지침 파일에도 쓰지 않습니다.
- 상태 표시는 글자로 적습니다. (예: 완료, 진행 중, 안 함, `[x]`, `[ ]`)

### AI체 금지
- 사람이 쓴 것처럼 짧고 담백하게 씁니다.
- 쓰지 않는 표현
  - 과장: "획기적인", "완벽하게", "강력한", "효과적으로"
  - 빈 말: "다양한", "~를 통해", "~에 있어서", "~할 수 있습니다"를 문장마다 반복
  - 마무리 상투구: "도움이 되었길 바랍니다", "궁금한 점이 있으면 언제든"
  - 내용 없는 요약 문단, 불필요한 굵은 글씨
- 할 일·사실 위주로 씁니다.
  - 나쁜 예: "효과적인 알림 기능을 통해 사용자 경험을 향상시킵니다"
  - 좋은 예: "새 감지가 생기면 알림을 띄웁니다"

### AI를 기여자(contributor)로 올리지 않음
- 커밋 메시지에 `Co-Authored-By: Claude ...` 같은 AI 공동 작성자 줄을 넣지 않습니다.
- PR 설명에 "Generated with Claude Code" 같은 AI 생성 문구를 넣지 않습니다.
- 커밋 작성자는 항상 본인 GitHub 계정입니다.

## AI 도구에게

- 작업 전에 `docs/design.md` 를 읽고, 규격과 다른 코드를 만들지 마세요. 규격 변경이 필요하면 코드를 바꾸지 말고 사용자에게 제안하세요.
- 사용자의 담당 폴더 밖은 수정하지 마세요.
- 작업을 마치면 사용자의 마일스톤 파일(`docs/milestones/Mx-*.md`)의 진행 기록에 날짜와 한 일을 추가하도록 안내하세요.
