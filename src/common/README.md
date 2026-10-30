# src/common — 공용 함수·상수

모든 모듈이 같이 쓰는 값과 함수입니다. **수정은 PR로 팀 합의 후** 합니다.

- `protocol.py`: 포트, 이벤트 이름, 시간 기준, 주소 만드는 함수 (`docs/design.md` 와 같은 값)

```python
from common.protocol import server_url, now_iso, EVENT_PERSON_DETECTED
```
