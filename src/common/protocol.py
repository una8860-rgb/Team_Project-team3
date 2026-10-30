"""모듈 간 통신 규격 상수 — docs/design.md 와 같은 값입니다.

값을 바꾸려면 혼자 바꾸지 말고 docs/design.md 와 함께 PR로 팀 합의 후 수정하세요.
"""
import os
from datetime import datetime, timedelta, timezone

# 주소 — IP는 장소마다 바뀌므로 코드에 적지 않고 환경변수로 받습니다.
# 예) Windows PowerShell: $env:SERVER_HOST="192.168.0.10"
SERVER_HOST = os.environ.get("SERVER_HOST", "127.0.0.1")
ROBOT_HOST = os.environ.get("ROBOT_HOST", "127.0.0.1")
SERVER_PORT = 8000
ROBOT_PORT = 5000

# 이벤트 종류 (AI → 서버)
EVENT_PERSON_DETECTED = "person_detected"
EVENT_PERSON_LEFT = "person_left"

# 현재 상태 (서버 → 웹 화면)
STATE_PRESENT = "present"
STATE_ABSENT = "absent"

# 시간 기준 (초)
DETECT_HOLD_SEC = 2      # 이만큼 계속 보이면 person_detected
LEFT_HOLD_SEC = 3        # 이만큼 계속 안 보이면 person_left
ROBOT_TIMEOUT_SEC = 2    # 서버가 로봇 응답을 기다리는 최대 시간
ROBOT_COOLDOWN_SEC = 10  # 로봇이 인사 후 다음 인사까지 쉬는 시간
WEB_POLL_SEC = 0.5       # 웹 화면이 상태를 묻는 주기
APP_POLL_SEC = 2         # 앱이 기록을 묻는 주기

KST = timezone(timedelta(hours=9))


def now_iso():
    """지금 시각을 규격 형식(ISO 8601 + 한국 시간)으로 돌려줍니다. 예: 2026-11-02T14:03:21+09:00"""
    return datetime.now(KST).isoformat(timespec="seconds")


def server_url(path):
    """중앙 서버 주소를 만듭니다. 예: server_url("/api/events")"""
    return f"http://{SERVER_HOST}:{SERVER_PORT}{path}"


def robot_url(path):
    """로봇 서버 주소를 만듭니다. 예: robot_url("/greet")"""
    return f"http://{ROBOT_HOST}:{ROBOT_PORT}{path}"
