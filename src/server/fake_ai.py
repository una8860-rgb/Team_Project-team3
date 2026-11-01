"""가짜 AI — 웹캠 없이 서버에 감지 이벤트를 보내 서버를 시험합니다.

규격: docs/design.md ① (POST /api/events)
"""
import argparse
import os
import sys
import time

import requests

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from common.protocol import EVENT_PERSON_DETECTED, EVENT_PERSON_LEFT, now_iso, server_url  # noqa: E402

STAY_SEC = 5  # 사람이 머무는 시간 (흉내)


def send_event(event_type, confidence=None):
    """서버에 이벤트 하나를 보내고 응답을 출력합니다."""
    body = {"type": event_type, "timestamp": now_iso(), "confidence": confidence}
    res = requests.post(server_url("/api/events"), json=body, timeout=3)
    print(f"보냄 {event_type} → {res.status_code} {res.json()}")


def visit_once():
    """사람이 왔다가(person_detected) 잠시 뒤 가는(person_left) 장면을 흉내 냅니다."""
    send_event(EVENT_PERSON_DETECTED, 0.9)
    time.sleep(STAY_SEC)
    send_event(EVENT_PERSON_LEFT)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("action", choices=["visit", "detected", "left"], nargs="?", default="visit",
                        help="visit: 왔다가 감 / detected: 사람 나타남만 / left: 사람 사라짐만")
    action = parser.parse_args().action
    if action == "visit":
        visit_once()
    elif action == "detected":
        send_event(EVENT_PERSON_DETECTED, 0.9)
    else:
        send_event(EVENT_PERSON_LEFT)

# 실행 (서버를 먼저 켠 뒤, 레포 맨 위 폴더 기준):
#   python src/server/fake_ai.py            사람이 왔다가 5초 뒤 감
#   python src/server/fake_ai.py detected   사람 나타남만 보냄
#   python src/server/fake_ai.py left       사람 사라짐만 보냄
