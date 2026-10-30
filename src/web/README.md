# src/web — 웹 화면·대시보드 (담당: 채웅)

평소엔 일반 화면, 사람이 감지되면 가상의 엑셀 업무 화면으로 바뀌는 웹 페이지입니다.

- 0.5초마다 `GET /api/status` 확인 → `present` 면 엑셀 화면, `absent` 면 원래 화면
- 서버가 없을 때: `data/sample_status.json` 같은 고정값으로 화면 개발
- 규격: `docs/design.md` ③ / 마일스톤: `docs/milestones/M3-web.md`
