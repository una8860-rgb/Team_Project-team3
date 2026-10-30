# M1. AI 사람 감지 + 중앙 서버 (담당: 한웅)

- **목표**: 웹캠으로 사람 존재를 판단하고(REQ-01), 이벤트를 저장·전달하는 중앙 서버를 만든다 (REQ-01·02·04)
- **코드**: `src/ai/`, `src/server/` · **규격**: `docs/design.md` ①~④
- **실행**: 한웅 노트북 한 대에서 AI + 서버 (서버 포트 8000)
- **기한**: 11/1 단독 시험 완료 → 11/2 통합

## 할 일 — AI (`src/ai/`)
- [ ] 사용할 모델·라이브러리 정하기 (`requirements.txt` 에 버전 고정 추가)
- [ ] 웹캠에서 사람 감지
- [ ] 2초 / 3초 기준으로 이벤트 1번만 보내기 (`POST /api/events`)
- [ ] 조명·거리별로 몇 번 테스트해서 결과 적기

## 할 일 — 서버 (`src/server/`)
- [ ] 서버 프레임워크 정하기 (`requirements.txt` 에 버전 고정 추가)
- [ ] `POST /api/events` · `GET /api/status` · `GET /api/events?date=` · `GET /api/stats?date=`
- [ ] `person_detected` 를 받으면 로봇에 `POST /greet` (타임아웃 2초, 로봇이 꺼져 있어도 서버는 계속 동작)
- [ ] `curl` 로 이벤트를 보내 단독 테스트 (`docs/design.md` 4번)

## 완료 기준
- 카메라 앞에 3초 서 있으면 `person_detected` 1번, 나가서 5초 지나면 `person_left` 1번
- 그때 `GET /api/status` 가 `present` → `absent` 로 바뀌고, `GET /api/events` 에 기록이 남음
- 로봇이 꺼져 있어도 서버가 멈추지 않음

## 진행 기록
- 10/29: 역할 확정 (AI)
- 10/30: 중앙 서버 담당 추가 (채웅 → 한웅). 서버는 한웅 노트북에서 AI와 함께 실행
