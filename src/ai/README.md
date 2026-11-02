# src/ai — AI 사람 감지 (담당: 한웅)

웹캠으로 사람이 있는지 판단해서 중앙 서버에 이벤트를 보냅니다.

- 보내는 것: `POST /api/events` — 규격은 `docs/design.md` ①
- 기준: 2초 이상 보이면 `person_detected`, 3초 이상 안 보이면 `person_left` (각 1번만)
- 서버가 없을 때: 보낼 JSON을 콘솔에 출력하는 테스트 모드
- 마일스톤: `docs/milestones/M1-ai-server.md`
- 설계 메모 (감지 분류 초안, 한계, 개인정보): [`NOTES.md`](NOTES.md)
