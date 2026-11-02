"""라즈봇 카메라로 사람이 있는지 판단합니다. 누구인지는 알아보지 않습니다.

- 1초 이상 계속 보이면 on_detected(confidence), 1초 이상 계속 안 보이면 on_left() 를 한 번 부릅니다.
- 카메라 영상은 메모리에서만 쓰고 저장하거나 밖으로 보내지 않습니다.
- 모델(MobileNet-SSD)은 레포에 올리지 않고 라즈봇 ~/models 에 따로 받아 둡니다. (src/robot/README.md 참고)
"""
import os
import time

DETECT_HOLD_SEC = 1       # 이만큼 계속 보이면 감지 (11/2 팀 결정: 규격의 2초보다 빠르게)
LEFT_HOLD_SEC = 1         # 이만큼 계속 안 보이면 사라짐 (11/2 팀 결정: 규격의 3초보다 빠르게.
                          # 더 줄이면 사람이 있는데도 한두 장면 놓쳐서 화면이 깜빡일 수 있음)

MODEL_DIR = os.environ.get("MODEL_DIR", os.path.expanduser("~/models"))
PROTOTXT = os.path.join(MODEL_DIR, "deploy.prototxt")
CAFFEMODEL = os.path.join(MODEL_DIR, "mobilenet_iter_73000.caffemodel")

CAMERA_INDEX = 0          # /dev/video0 (라즈봇 USB 카메라)
FRAME_SIZE = (640, 480)
PERSON_CLASS_ID = 15      # MobileNet-SSD 에서 "사람" 번호
MIN_CONFIDENCE = 0.35     # 이보다 확신이 낮으면 사람으로 치지 않음 (몸 일부만 보여도 잡히게 낮춤, 11/2)
LOOP_SLEEP_SEC = 0.1      # 한 장 처리 후 쉬는 시간 (파이가 너무 바빠지지 않게)


class PresenceTracker:
    """매 장면의 "사람 있음/없음" 을 받아 2초·3초 기준으로 감지·사라짐을 한 번씩 알립니다."""

    def __init__(self, on_detected, on_left):
        self.on_detected = on_detected
        self.on_left = on_left
        self.present = False      # 지금 "사람 있음" 상태로 알렸는지
        self.seen_since = None    # 사람이 계속 보이기 시작한 시각
        self.missing_since = None # 사람이 계속 안 보이기 시작한 시각
        self.best_confidence = 0.0

    def update(self, person_seen, confidence, now):
        """한 장면의 결과를 넣습니다."""
        if person_seen:
            self.missing_since = None
            if self.seen_since is None:
                self.seen_since = now
                self.best_confidence = 0.0
            self.best_confidence = max(self.best_confidence, confidence)
            if not self.present and now - self.seen_since >= DETECT_HOLD_SEC:
                self.present = True
                self.on_detected(round(self.best_confidence, 2))
        else:
            self.seen_since = None
            if self.missing_since is None:
                self.missing_since = now
            if self.present and now - self.missing_since >= LEFT_HOLD_SEC:
                self.present = False
                self.on_left()


def load_model():
    """사람 감지 모델을 엽니다."""
    import cv2
    if not (os.path.exists(PROTOTXT) and os.path.exists(CAFFEMODEL)):
        raise FileNotFoundError(f"모델 파일이 없습니다: {MODEL_DIR} (src/robot/README.md 의 모델 받기 참고)")
    return cv2.dnn.readNetFromCaffe(PROTOTXT, CAFFEMODEL)


def find_person(net, frame):
    """한 장면에서 가장 확실한 사람의 확신도(0~1)를 돌려줍니다. 없으면 0."""
    import cv2
    blob = cv2.dnn.blobFromImage(cv2.resize(frame, (300, 300)), 0.007843, (300, 300), 127.5)
    net.setInput(blob)
    detections = net.forward()
    best = 0.0
    for i in range(detections.shape[2]):
        if int(detections[0, 0, i, 1]) == PERSON_CLASS_ID:
            best = max(best, float(detections[0, 0, i, 2]))
    return best


def run(on_detected, on_left, should_pause=lambda: False):
    """카메라를 계속 보면서 사람이 오고 가는 것을 알립니다. 멈추지 않고 계속 돕니다."""
    import cv2
    net = load_model()
    camera = cv2.VideoCapture(CAMERA_INDEX)
    camera.set(cv2.CAP_PROP_FRAME_WIDTH, FRAME_SIZE[0])
    camera.set(cv2.CAP_PROP_FRAME_HEIGHT, FRAME_SIZE[1])
    tracker = PresenceTracker(on_detected, on_left)
    print("사람 감지 시작")

    while True:
        ok, frame = camera.read()
        if not ok:
            print("카메라 화면을 못 받음. 1초 뒤 다시 시도")
            time.sleep(1)
            continue
        if should_pause():
            # 인사하느라 고개를 숙인 동안에는 바닥만 보이므로 판단하지 않음
            time.sleep(LOOP_SLEEP_SEC)
            continue
        confidence = find_person(net, frame)
        tracker.update(confidence >= MIN_CONFIDENCE, confidence, time.time())
        time.sleep(LOOP_SLEEP_SEC)


if __name__ == "__main__":
    run(lambda c: print(f"사람 감지 (확신도 {c})"), lambda: print("사람 사라짐"))

# 감지만 따로 시험 (라즈봇에서):  python3 src/robot/person_detector.py
