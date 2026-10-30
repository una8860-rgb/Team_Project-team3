# src/app/CLAUDE.md — 앱 폴더 전용 지침

> 루트의 `CLAUDE.md`, `AGENTS.md` 규칙을 먼저 따르고, 이 파일은 **앱(`src/app/`)에만** 해당하는 내용을 덧붙입니다.
> 담당: 채연 (member4) · 마일스톤: `docs/milestones/M4-app.md`

## 작업 시작할 때

1. `src/app/HANDOVER.md` 를 먼저 읽고 **현재 상태**와 **다음 할 일**을 확인합니다.
2. 통신 규격은 `docs/design.md` ④ 를 확인합니다. 규격과 다른 코드는 만들지 않습니다.

## 작업을 마칠 때 (꼭 하기)

- 작업이 끝나면 `src/app/HANDOVER.md` 의 **"현재 상태"** 와 **"다음 할 일"** 을 갱신합니다.
  - 현재 상태: 오늘 완성된 것, 동작 확인한 것, 아직 안 되는 것
  - 다음 할 일: 바로 이어서 할 일을 순서대로
  - "작업 기록" 맨 아래에 날짜와 한 일을 한 줄 추가
- `docs/milestones/M4-app.md` 의 진행 기록에도 날짜와 한 일을 추가하도록 사용자에게 안내합니다.

## 앱이 하는 일 (요약)

- 2초마다 `GET /api/events?date=YYYY-MM-DD` 로 그날 기록을 가져옵니다.
- 마지막으로 본 `id` 보다 큰 `person_detected` 가 생기면 **알림**을 띄웁니다.
- `GET /api/stats?date=YYYY-MM-DD` 로 그날 감지 횟수를 보여줍니다.
- 기록이 없으면 "기록 없음" 을 보여줍니다.

## 앱 코드 규칙

- 서버 주소·포트·이벤트 이름·주기는 코드에 직접 쓰지 않습니다.
  - Python이면 `src/common/protocol.py` 의 `server_url()`, `EVENT_PERSON_DETECTED`, `APP_POLL_SEC` 를 씁니다.
  - Python이 아닌 도구라면 설정 파일 한 곳에 모아 두고, 값은 `protocol.py` 와 똑같이 맞춥니다.
- **테스트 모드**: 서버에 연결이 안 되면 `data/sample_events.json` 을 읽어서 화면을 보여줍니다.
- 서버가 꺼져 있거나 응답이 늦어도 앱이 멈추거나 꺼지지 않게 합니다. (오류는 화면에 짧게 표시)
- 웹캠 영상·사진은 다루지 않습니다. 앱은 이벤트 종류·시각·신뢰도만 받습니다.

## 하지 말 것

- `src/app/` 밖의 파일은 고치지 않습니다. 필요하면 사용자에게 제안만 합니다.
- 서버 IP·비밀번호 같은 값을 이 레포(공개)에 올리지 않습니다. 개인 메모는 `src/app/CLAUDE.local.md` 에 적습니다.
