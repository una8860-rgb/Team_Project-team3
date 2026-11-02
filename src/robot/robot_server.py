"""라즈봇 인사 서버 — 카메라로 사람을 감지하면 직접 고개 숙여 인사하고, 중앙 서버에 감지 이벤트를 보냅니다.

- 사람 감지: person_detector.py (1초 보이면 감지, 1초 안 보이면 사라짐)
- 감지하면 인사 + POST /api/events (person_detected), 사라지면 POST /api/events (person_left)
- 서버의 POST /greet 도 그대로 받습니다. 이미 인사했으면 쿨다운으로 건너뜁니다.
규격: docs/design.md ①② (포트 5000, 쿨다운 10초)
"""
import argparse
import os
import sys
import threading
import time

import requests
from flask import Flask, jsonify, request

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from common.protocol import (  # noqa: E402
    EVENT_PERSON_DETECTED,
    EVENT_PERSON_LEFT,
    ROBOT_COOLDOWN_SEC,
    ROBOT_PORT,
    now_iso,
    server_url,
)

# 받침대 각도 — 2026-10-30 실물 확인 (reference/raspbot.md)
BASE_ANGLE = 30   # 평소 각도: 정면(수평)
BOW_ANGLE = 0     # 숙인 각도: 인사 (0 보다 작게는 못 감)
PAN_CENTER = 78   # 좌우 정면 (10/31 다시 맞춤)
BOW_HOLD_SEC = 1  # 숙인 채로 멈추는 시간
GREET_WITH_DANCE = True  # True 면 인사 뒤에 율동까지 함 (11/2 팀 결정), False 면 인사만
BOW_STEP_DEG = 2       # 인사할 때 고개를 한 번에 이만큼씩 나눠서 움직임
BOW_STEP_SEC = 0.04    # 나눈 한 칸마다 쉬는 시간 (클수록 천천히, 30도 → 약 0.6초)
FACE_FRONT_RETRY_SEC = 10  # 서버 시작 후 정면을 한 번 더 맞추기까지 기다리는 시간
SERVER_TIMEOUT_SEC = 2     # 중앙 서버에 이벤트를 보낼 때 기다리는 최대 시간

# 라즈봇 V2 확장보드 (I2C) — 제조사 Raspbot_Lib 의 Ctrl_Servo 와 같은 방식
I2C_BUS = 1
BOARD_ADDR = 0x2B   # 확인: sudo i2cdetect -y 1 에 2b 가 보이면 맞음
SERVO_REG = 0x02
TILT_SERVO_ID = 1   # 상하 (보드 S1 에 꽂힘)
PAN_SERVO_ID = 2    # 좌우 (보드 S2 에 꽂힘)

app = Flask(__name__)
mock_mode = False          # True 면 로봇 없이 콘솔에 출력만 함
_last_greet_time = 0.0
_greet_lock = threading.Lock()
_greeting = threading.Event()  # 인사(고개 숙임) 중이면 켜짐 — 그동안 사람 감지를 쉼
_i2c = None


def set_servo(servo_id, angle):
    """서보 하나를 angle 도(0~180)로 움직입니다."""
    global _i2c
    angle = max(0, min(angle, 180))
    if mock_mode:
        print(f"[테스트] 서보 {servo_id} → {angle}도")
        return
    if _i2c is None:
        import smbus  # 라즈베리파이에서만 있음: sudo apt install python3-smbus
        _i2c = smbus.SMBus(I2C_BUS)
    _i2c.write_i2c_block_data(BOARD_ADDR, SERVO_REG, [servo_id, angle])


def move_head(angle):
    """카메라 받침대를 위아래로 angle 도로 움직입니다."""
    set_servo(TILT_SERVO_ID, angle)


def move_head_slowly(start, end):
    """고개를 start 도에서 end 도까지 조금씩 나눠서 천천히 움직입니다."""
    step = BOW_STEP_DEG if end > start else -BOW_STEP_DEG
    for angle in range(start, end, step):
        move_head(angle)
        time.sleep(BOW_STEP_SEC)
    move_head(end)


def face_front():
    """카메라가 정면을 보게 합니다. 서버 시작 때 한 번 실행."""
    set_servo(PAN_SERVO_ID, PAN_CENTER)
    move_head(BASE_ANGLE)


def greet():
    """인사 동작: 천천히 숙이기 → 잠깐 멈춤 → 원위치 → 율동. 그동안 사람 감지는 쉽니다."""
    _greeting.set()
    try:
        move_head_slowly(BASE_ANGLE, BOW_ANGLE)
        time.sleep(BOW_HOLD_SEC)
        move_head_slowly(BOW_ANGLE, BASE_ANGLE)
        if GREET_WITH_DANCE:
            dance_moves()
        face_front()
        time.sleep(0.5)  # 고개가 다 올라온 뒤에 감지를 다시 시작
    finally:
        set_buzzer(False)  # 혹시 켜진 채 끝나지 않게
        _greeting.clear()


BUZZER_REG = 0x06
DANCE_PAN_SWING = 25   # 도리도리 할 때 정면에서 좌우로 이만큼 돌림


def set_buzzer(on):
    """부저를 켜거나 끕니다."""
    global _i2c
    if mock_mode:
        print(f"[테스트] 부저 {'켬' if on else '끔'}")
        return
    if _i2c is None:
        import smbus
        _i2c = smbus.SMBus(I2C_BUS)
    _i2c.write_i2c_block_data(BOARD_ADDR, BUZZER_REG, [1 if on else 0])


def beep(sec=0.08):
    """부저를 sec 초 동안 짧게 울립니다."""
    set_buzzer(True)
    time.sleep(sec)
    set_buzzer(False)


def move_pan_slowly(start, end, step_deg=3, step_sec=0.02):
    """고개를 좌우로 start 도에서 end 도까지 조금씩 나눠서 움직입니다."""
    step = step_deg if end > start else -step_deg
    for angle in range(start, end, step):
        set_servo(PAN_SERVO_ID, angle)
        time.sleep(step_sec)
    set_servo(PAN_SERVO_ID, end)


def dance_moves():
    """율동 동작만 (약 8초): 끄덕끄덕 → 도리도리 → 갸우뚱 → 인사. 바퀴는 쓰지 않습니다."""
    face_front()
    time.sleep(0.3)
    # 1) 끄덕끄덕 4번, 숙일 때마다 삐
    for _ in range(4):
        beep()
        move_head_slowly(BASE_ANGLE, 12)
        move_head_slowly(12, BASE_ANGLE)
    # 2) 도리도리 2번
    left, right = PAN_CENTER + DANCE_PAN_SWING, PAN_CENTER - DANCE_PAN_SWING
    move_pan_slowly(PAN_CENTER, left)
    for _ in range(2):
        beep()
        move_pan_slowly(left, right)
        beep()
        move_pan_slowly(right, left)
    move_pan_slowly(left, PAN_CENTER)
    # 3) 갸우뚱: 옆 보면서 살짝 숙였다가 반대쪽
    for side in (left, right):
        move_pan_slowly(PAN_CENTER, side)
        move_head_slowly(BASE_ANGLE, 18)
        time.sleep(0.3)
        move_head_slowly(18, BASE_ANGLE)
        move_pan_slowly(side, PAN_CENTER)
    # 4) 마무리 인사 + 삐삐
    move_head_slowly(BASE_ANGLE, BOW_ANGLE)
    beep()
    time.sleep(0.1)
    beep()
    time.sleep(0.6)
    move_head_slowly(BOW_ANGLE, BASE_ANGLE)


def dance():
    """율동만 합니다 (POST /dance). 그동안 사람 감지는 쉽니다."""
    _greeting.set()
    try:
        dance_moves()
    finally:
        set_buzzer(False)  # 혹시 켜진 채 끝나지 않게
        face_front()
        time.sleep(0.5)
        _greeting.clear()


def try_greet(reason):
    """쿨다운이 아니면 인사를 시작하고 True, 쿨다운 중이면 False 를 돌려줍니다."""
    global _last_greet_time
    with _greet_lock:
        if _greeting.is_set():  # 인사·율동이 아직 안 끝났으면 겹치지 않게 건너뜀
            print(f"인사 건너뜀 (동작 중), {reason}")
            return False
        if time.time() - _last_greet_time < ROBOT_COOLDOWN_SEC:
            print(f"인사 건너뜀 (쿨다운 중), {reason}")
            return False
        _last_greet_time = time.time()
    print(f"인사 시작, {reason}")
    # 응답을 바로 돌려주려고 인사는 따로 실행합니다.
    threading.Thread(target=greet, daemon=True).start()
    return True


def send_event(event_type, confidence=None):
    """중앙 서버에 감지 이벤트를 보냅니다. 서버가 꺼져 있어도 로봇은 멈추지 않습니다."""
    body = {"type": event_type, "timestamp": now_iso(), "confidence": confidence}
    try:
        res = requests.post(server_url("/api/events"), json=body, timeout=SERVER_TIMEOUT_SEC)
        print(f"서버에 {event_type} 보냄: {res.status_code} {res.text.strip()}")
    except requests.RequestException as error:
        print(f"서버 연결 실패 (로봇은 계속 동작): {error.__class__.__name__}")


def on_person_detected(confidence):
    """사람이 1초 이상 보이면: 인사하고 서버에 알립니다."""
    print(f"사람 감지 (확신도 {confidence})")
    try_greet(f"사람 감지, 확신도 {confidence}")
    send_event(EVENT_PERSON_DETECTED, confidence)


def on_person_left():
    """사람이 1초 이상 안 보이면: 서버에 알립니다."""
    print("사람 사라짐")
    send_event(EVENT_PERSON_LEFT)


def start_detector():
    """사람 감지를 따로 돌립니다. 카메라나 모델이 없으면 감지 없이 인사 서버만 돌아갑니다."""
    def loop():
        try:
            import person_detector
            person_detector.run(on_person_detected, on_person_left, should_pause=_greeting.is_set)
        except Exception as error:  # 감지가 멈춰도 /greet 는 계속 받게
            print(f"사람 감지를 시작하지 못함 (인사 서버는 계속 동작): {error}")
    threading.Thread(target=loop, daemon=True).start()


@app.post("/greet")
def greet_endpoint():
    """서버의 인사 명령을 받습니다. 쿨다운 중이면 인사하지 않고 넘어갑니다."""
    event_id = (request.get_json(silent=True) or {}).get("event_id")
    if not try_greet(f"서버 명령 event_id={event_id}"):
        return jsonify(ok=True, skipped="cooldown")
    return jsonify(ok=True)


@app.post("/dance")
def dance_endpoint():
    """율동 명령을 받습니다. 인사나 율동 중이면 건너뜁니다."""
    if _greeting.is_set():
        return jsonify(ok=True, skipped="busy")
    threading.Thread(target=dance, daemon=True).start()
    return jsonify(ok=True)


@app.get("/health")
def health():
    """연결 확인용."""
    return jsonify(ok=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--mock", action="store_true", help="로봇 없이 콘솔 출력만 하는 테스트 모드")
    parser.add_argument("--no-camera", action="store_true", help="사람 감지 없이 /greet 명령만 받기")
    args = parser.parse_args()
    mock_mode = args.mock
    face_front()
    # 전원을 켤 때 보드가 늦게 서보를 기본 위치로 돌려놓으므로, 잠시 뒤 한 번 더 정면으로 맞춤
    threading.Timer(FACE_FRONT_RETRY_SEC, face_front).start()
    if not args.no_camera:
        start_detector()
    app.run(host="0.0.0.0", port=ROBOT_PORT)

# 실행 (라즈봇에서, 레포 맨 위 폴더 기준):   SERVER_HOST=<서버IP> python3 src/robot/robot_server.py
# 테스트 모드 (로봇 없이):                  python3 src/robot/robot_server.py --mock --no-camera
# 확인 (노트북에서):  curl.exe -X POST http://<라즈봇IP>:5000/greet
