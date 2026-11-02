"""AI 사람 감지 — 웹캠으로 사람이 있는지 보고 중앙 서버에 이벤트를 보냅니다.

규격: docs/design.md ① (POST /api/events)
- 사람이 2초 이상 계속 보이면 person_detected 를 한 번 보냄
- 사람이 3초 이상 계속 안 보이면 person_left 를 한 번 보냄
- 사람(person)이 있는지만 봅니다. 얼굴 인식·영상 저장은 하지 않습니다.
- 서버가 꺼져 있으면 보낼 JSON 을 콘솔에 출력만 하고 계속 돌아갑니다.
"""
import argparse
import json
import os
import sys
import time

import requests

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from common.protocol import (  # noqa: E402
    DETECT_HOLD_SEC,
    EVENT_PERSON_DETECTED,
    EVENT_PERSON_LEFT,
    LEFT_HOLD_SEC,
    now_iso,
    server_url,
)

MODEL_NAME = "yolo26n.pt"  # 처음 실행할 때 자동으로 받아짐 (git 에 안 올라감)
PERSON_CLASS_ID = 0        # YOLO(COCO) 에서 0번이 사람
MIN_CONFIDENCE = 0.5       # 이 값보다 낮은 감지는 무시
IMAGE_SIZE = 320           # 작을수록 빠르고 메모리를 덜 씀
SEND_TIMEOUT_SEC = 3


class PersonWatcher:
    """보임/안 보임을 계속 받아서, 2초·3초 기준을 넘는 순간에만 이벤트를 하나 돌려줍니다."""

    def __init__(self):
        self.present = False      # 서버에 알린 현재 상태
        self.change_since = None  # 상태와 다른 화면이 시작된 시각
        self.best_conf = 0.0      # 보이는 동안 가장 높았던 신뢰도

    def update(self, seen, conf, now):
        """이번 화면 결과를 넣으면 보낼 이벤트("person_detected"/"person_left")나 None 을 돌려줍니다."""
        if seen == self.present:
            self.change_since = None
            return None
        if self.change_since is None:
            self.change_since = now
            self.best_conf = 0.0
        if seen:
            self.best_conf = max(self.best_conf, conf)
        hold = DETECT_HOLD_SEC if seen else LEFT_HOLD_SEC
        if now - self.change_since < hold:
            return None
        self.present = seen
        self.change_since = None
        return EVENT_PERSON_DETECTED if seen else EVENT_PERSON_LEFT


def send_event(event_type, confidence, dry_run):
    """서버에 이벤트를 보냅니다. 서버가 없거나 dry_run 이면 보낼 JSON 을 출력만 합니다."""
    body = {"type": event_type, "timestamp": now_iso(), "confidence": confidence}
    if dry_run:
        print("[테스트 모드] 보낼 JSON:", json.dumps(body, ensure_ascii=False))
        return
    try:
        res = requests.post(server_url("/api/events"), json=body, timeout=SEND_TIMEOUT_SEC)
        print(f"보냄 {event_type} → {res.status_code} {res.text.strip()}")
    except requests.RequestException:
        print(f"[서버 연결 안 됨] {server_url('/api/events')} 대신 출력:", json.dumps(body, ensure_ascii=False))


def open_camera(index):
    """웹캠을 엽니다. Windows 에서는 CAP_DSHOW 가 빨리 켜져서 먼저 시도합니다."""
    import cv2
    cap = cv2.VideoCapture(index, cv2.CAP_DSHOW)
    if not cap.isOpened():
        cap = cv2.VideoCapture(index)
    if not cap.isOpened():
        sys.exit(f"웹캠({index})을 열 수 없습니다. 다른 프로그램이 웹캠을 쓰고 있는지 확인하세요.")
    return cap


def find_person(model, frame):
    """화면에서 사람을 찾아 (사람이 있는지, 가장 높은 신뢰도, 표시용 그림)을 돌려줍니다."""
    result = model.predict(frame, classes=[PERSON_CLASS_ID], conf=MIN_CONFIDENCE,
                           imgsz=IMAGE_SIZE, verbose=False)[0]
    confs = result.boxes.conf.tolist()
    return len(confs) > 0, max(confs, default=0.0), result.plot()


def draw_status(frame, watcher, seen):
    """화면 왼쪽 위에 지금 상태를 글자로 표시합니다."""
    import cv2
    state = "PRESENT" if watcher.present else "ABSENT"
    text = f"state: {state}  seen: {'yes' if seen else 'no'}  (q: quit)"
    color = (0, 0, 255) if watcher.present else (0, 200, 0)
    cv2.putText(frame, text, (10, 25), cv2.FONT_HERSHEY_SIMPLEX, 0.6, color, 2)


def run_camera(args):
    """웹캠 화면을 계속 읽으면서 사람을 찾고, 기준을 넘으면 서버에 이벤트를 보냅니다."""
    import cv2
    from ultralytics import YOLO

    model = YOLO(MODEL_NAME)
    cap = open_camera(args.camera)
    watcher = PersonWatcher()
    print(f"사람 감지 시작 (서버: {server_url('/api/events')}). 끄려면 q 또는 Ctrl+C")
    try:
        while True:
            ok, frame = cap.read()
            if not ok:
                print("웹캠 화면을 읽지 못했습니다. 종료합니다.")
                break
            seen, conf, shown = find_person(model, frame)
            event = watcher.update(seen, conf, time.time())
            if event:
                confidence = round(watcher.best_conf, 2) if event == EVENT_PERSON_DETECTED else None
                send_event(event, confidence, args.dry_run)
            if args.no_window:
                continue
            draw_status(shown, watcher, seen)
            cv2.imshow("team3 person detect", shown)
            if cv2.waitKey(1) & 0xFF in (ord("q"), 27):
                break
    except KeyboardInterrupt:
        pass
    finally:
        cap.release()
        cv2.destroyAllWindows()


def run_self_test():
    """웹캠 없이 2초·3초 기준이 맞는지 시간표를 흉내 내서 확인합니다."""
    watcher = PersonWatcher()
    # (시각, 보임 여부): 1초 잠깐 보임 → 무시 / 2초 넘게 보임 → detected / 2초 안 보임 → 무시 / 3초 넘게 안 보임 → left
    timeline = [(0, True), (1, False), (2, True), (3, True), (4.1, True), (5, False), (6, True),
                (7, False), (9, False), (10.1, False), (11, False)]
    sent = []
    for t, seen in timeline:
        event = watcher.update(seen, 0.9 if seen else 0.0, t)
        if event:
            sent.append((t, event))
            print(f"{t:>5}초  {event}")
    expected = [(4.1, EVENT_PERSON_DETECTED), (10.1, EVENT_PERSON_LEFT)]
    print("자체 시험:", "통과" if sent == expected else f"실패 (기대 {expected})")
    return sent == expected


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--camera", type=int, default=0, help="웹캠 번호 (기본 0, 외장 웹캠이면 1)")
    parser.add_argument("--dry-run", action="store_true", help="서버에 보내지 않고 보낼 JSON 을 출력만 함")
    parser.add_argument("--no-window", action="store_true", help="웹캠 화면 창을 띄우지 않음 (메모리 절약)")
    parser.add_argument("--self-test", action="store_true", help="웹캠 없이 2초·3초 기준만 시험")
    args = parser.parse_args()
    if args.self_test:
        sys.exit(0 if run_self_test() else 1)
    run_camera(args)

# 실행 (레포 맨 위 폴더 기준, 서버를 먼저 켠 뒤):  python src/ai/detect_person.py
# 서버 없이 시험 (JSON 출력만):                   python src/ai/detect_person.py --dry-run
# 웹캠 없이 2초·3초 기준 시험:                     python src/ai/detect_person.py --self-test
# 서버가 다른 노트북이면 (PowerShell):             $env:SERVER_HOST="192.168.0.10"; python src/ai/detect_person.py
