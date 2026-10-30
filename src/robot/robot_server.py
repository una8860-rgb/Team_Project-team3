"""라즈봇 인사 서버 — POST /greet 를 받으면 고개 숙여 인사하고 인사 음성을 냅니다.

규격: docs/design.md ② (포트 5000, 쿨다운 10초)
"""
import argparse
import os
import subprocess
import sys
import threading
import time

from flask import Flask, jsonify, request

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from common.protocol import ROBOT_COOLDOWN_SEC, ROBOT_PORT  # noqa: E402

# 받침대 각도 — 2026-10-30 실물 확인 (reference/raspbot.md)
BASE_ANGLE = 30   # 평소 각도: 정면(수평)
BOW_ANGLE = 0     # 숙인 각도: 인사 (0 보다 작게는 못 감)
PAN_CENTER = 80   # 좌우 정면
BOW_HOLD_SEC = 1  # 숙인 채로 멈추는 시간

VOICE_FILE = os.path.join(os.path.dirname(__file__), "sounds", "greeting.mp3")

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


def face_front():
    """카메라가 정면을 보게 합니다. 서버 시작 때 한 번 실행."""
    set_servo(PAN_SERVO_ID, PAN_CENTER)
    move_head(BASE_ANGLE)


def play_voice():
    """인사 음성을 재생합니다. 기다리지 않고 바로 다음 동작으로 넘어갑니다."""
    if mock_mode:
        print("[테스트] 음성: 안녕하십니까 팀장님!")
        return
    # 라즈베리파이에 mpg123 이 필요합니다: sudo apt install mpg123
    subprocess.Popen(["mpg123", "-q", VOICE_FILE])


def greet():
    """인사 동작: 음성 → 숙이기 → 잠깐 멈춤 → 원위치."""
    play_voice()
    move_head(BOW_ANGLE)
    time.sleep(BOW_HOLD_SEC)
    move_head(BASE_ANGLE)


@app.post("/greet")
def greet_endpoint():
    """서버의 인사 명령을 받습니다. 쿨다운 중이면 인사하지 않고 넘어갑니다."""
    global _last_greet_time
    event_id = (request.get_json(silent=True) or {}).get("event_id")

    with _greet_lock:
        if time.time() - _last_greet_time < ROBOT_COOLDOWN_SEC:
            print(f"인사 요청 무시 (쿨다운 중), event_id={event_id}")
            return jsonify(ok=True, skipped="cooldown")
        _last_greet_time = time.time()

    print(f"인사 시작, event_id={event_id}")
    # 서버가 2초 안에 응답을 받아야 하므로 인사는 따로 실행하고 바로 응답합니다.
    threading.Thread(target=greet, daemon=True).start()
    return jsonify(ok=True)


@app.get("/health")
def health():
    """연결 확인용."""
    return jsonify(ok=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--mock", action="store_true", help="로봇 없이 콘솔 출력만 하는 테스트 모드")
    mock_mode = parser.parse_args().mock
    face_front()
    app.run(host="0.0.0.0", port=ROBOT_PORT)

# 실행 (라즈봇에서, 레포 맨 위 폴더 기준):   python3 src/robot/robot_server.py
# 테스트 모드 (로봇 없이):                  python3 src/robot/robot_server.py --mock
# 확인 (노트북에서):  curl -X POST http://<라즈봇IP>:5000/greet
