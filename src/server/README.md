# src/server — 중앙 서버 (담당: 채웅)

모든 신호가 모이는 허브입니다. 채웅 노트북에서 실행합니다 (포트 8000).

- 받는 것: `POST /api/events` (AI)
- 보내는 것: `POST /greet` (로봇, 타임아웃 2초)
- 제공하는 것: `GET /api/status` (웹 화면), `GET /api/events`·`GET /api/stats` (앱)
- 규격: `docs/design.md` ①~④ / 마일스톤: `docs/milestones/M3-web-server.md`
