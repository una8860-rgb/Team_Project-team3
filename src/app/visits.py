"""감지 이벤트 계산 — 서버에서 받은 이벤트 목록으로 방문, 현재 상태, 횟수를 만듭니다.

화면(Streamlit)과 상관없는 계산만 모아 두었습니다. 규격: docs/design.md ④
"""
import os
import sys
from datetime import datetime

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from common.protocol import EVENT_PERSON_DETECTED, EVENT_PERSON_LEFT, KST  # noqa: E402


def parse_time(timestamp):
    """ISO 시각 문자열을 datetime 으로 바꿉니다."""
    return datetime.fromisoformat(timestamp).astimezone(KST)


def events_on(events, day):
    """이벤트 목록에서 그날 이벤트만 id 순서로 골라 돌려줍니다."""
    picked = [e for e in events if parse_time(e["timestamp"]).date() == day]
    return sorted(picked, key=lambda e: e["id"])


def group_visits(events, is_today):
    """나타남과 사라짐을 묶어 방문 목록을 만듭니다. 최신 방문이 앞에 옵니다.

    방문 = {"start", "end", "seconds", "status"}
    status: "done"(끝남) / "now"(지금 있음) / "no_end"(종료 기록 없음) / "no_start"(시작 기록 없음)
    """
    visits = []
    open_visit = None
    for e in events:
        at = parse_time(e["timestamp"])
        if e["type"] == EVENT_PERSON_DETECTED:
            # 나타남이 연달아 오면 마지막 것을 기준으로 합니다.
            open_visit = {"start": at, "end": None, "seconds": None, "status": "now"}
        elif e["type"] == EVENT_PERSON_LEFT:
            if open_visit is None:
                visits.append({"start": None, "end": at, "seconds": None, "status": "no_start"})
            else:
                open_visit["end"] = at
                open_visit["seconds"] = int((at - open_visit["start"]).total_seconds())
                open_visit["status"] = "done"
                visits.append(open_visit)
                open_visit = None
    if open_visit is not None:
        if not is_today:
            open_visit["status"] = "no_end"
        visits.append(open_visit)
    return list(reversed(visits))


def current_state(today_events):
    """오늘 마지막 이벤트로 지금 상태를 돌려줍니다: "present" / "absent" / "empty"."""
    if not today_events:
        return "empty"
    return "present" if today_events[-1]["type"] == EVENT_PERSON_DETECTED else "absent"


def last_event_time(today_events, event_type):
    """오늘 이벤트 중 해당 종류의 마지막 시각을 돌려줍니다. 없으면 None."""
    times = [parse_time(e["timestamp"]) for e in today_events if e["type"] == event_type]
    return times[-1] if times else None


def count_detections(events):
    """이벤트 목록에서 person_detected 개수를 셉니다."""
    return sum(1 for e in events if e["type"] == EVENT_PERSON_DETECTED)


def quiet_minutes(today_events, now):
    """마지막으로 사라진 뒤 몇 분 지났는지 돌려줍니다. 사라짐 기록이 없으면 None."""
    left_at = last_event_time(today_events, EVENT_PERSON_LEFT)
    if left_at is None:
        return None
    return max(0, int((now - left_at).total_seconds() // 60))


def newest_detection(events):
    """가장 최근 person_detected 이벤트를 돌려줍니다. 없으면 None."""
    detected = [e for e in events if e["type"] == EVENT_PERSON_DETECTED]
    return max(detected, key=lambda e: e["id"]) if detected else None
