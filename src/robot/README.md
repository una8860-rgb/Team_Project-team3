# src/robot — 라즈봇 인사 서버 (담당: 유나)

라즈봇에서 실행되는 작은 서버입니다. 인사 명령을 받으면 카메라 받침대를 숙였다 올립니다. 인사 음성은 없습니다 (10/31 결정).

- 받는 것: `POST /greet`, `GET /health` (포트 5000) — 규격은 `docs/design.md` ②
- 인사 중 요청은 무시 (쿨다운 10초)
- 로봇이 없을 때: 동작 대신 콘솔에 출력하는 테스트 모드
- 마일스톤: `docs/milestones/M2-robot-greet.md` / 장치 자료: `reference/`
