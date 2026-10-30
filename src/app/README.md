# src/app — 앱 (담당: 채연)

감지 알림과 날짜별 감지 기록·횟수를 보여주는 앱입니다.

- 2초마다 `GET /api/events?date=` 확인 → 새 `person_detected` 가 있으면 알림
- 횟수: `GET /api/stats?date=`
- 서버가 없을 때: `data/sample_events.json` 으로 화면 개발
- 규격: `docs/design.md` ④ / 마일스톤: `docs/milestones/M4-app.md`
