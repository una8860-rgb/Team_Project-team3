"""중앙 서버 — AI 감지 이벤트를 받아 저장하고, 로봇·웹 화면·앱에 나눠줍니다.

규격: docs/design.md ①~④ (포트 8000)
- POST /api/events        AI 가 감지 이벤트를 보냄 → 저장, person_detected 면 로봇에 인사 명령
- GET  /api/status        웹 화면이 현재 상태를 물음 (present / absent)
- GET  /api/events?date=  앱이 그날 기록을 물음
- GET  /api/stats?date=   앱이 그날 감지 횟수를 물음
- GET  /                  웹 화면(src/web) 을 그대로 보여줌
"""
import argparse
import os
import socket
import sqlite3
import sys
import threading
from datetime import date, datetime

import requests
from flask import Flask, jsonify, request, send_from_directory

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from common.protocol import (  # noqa: E402
    EVENT_PERSON_DETECTED,
    EVENT_PERSON_LEFT,
    KST,
    ROBOT_TIMEOUT_SEC,
    SERVER_PORT,
    STATE_ABSENT,
    STATE_PRESENT,
    now_iso,
    robot_url,
)

SERVER_DIR = os.path.dirname(os.path.abspath(__file__))
WEB_DIR = os.path.join(SERVER_DIR, "..", "web")
DATA_DIR = os.path.join(SERVER_DIR, "..", "..", "data")
DB_FILE = os.path.join(SERVER_DIR, "events.db")  # 감지 기록 저장 파일 (git 에 안 올라감)

EVENT_TYPES = (EVENT_PERSON_DETECTED, EVENT_PERSON_LEFT)

app = Flask(__name__, static_folder=WEB_DIR, static_url_path="")
app.json.ensure_ascii = False  # 응답의 한글을 그대로 보여줌 (\u 로 바꾸지 않음)
app.config["MAX_CONTENT_LENGTH"] = 16 * 1024  # 이벤트 본문은 작으므로 큰 요청은 거절
mock_robot = False  # True 면 로봇에 요청하지 않고 콘솔에 출력만 함
_db_lock = threading.Lock()      # 여러 기기가 동시에 물어봐도 기록 파일이 꼬이지 않게
_status_lock = threading.Lock()
_status = {"state": STATE_ABSENT, "since": now_iso()}


def open_db():
    """기록 파일(SQLite)을 엽니다. 처음이면 표를 만듭니다."""
    conn = sqlite3.connect(DB_FILE, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute(
        """CREATE TABLE IF NOT EXISTS events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            type TEXT NOT NULL,
            timestamp TEXT NOT NULL,
            day TEXT NOT NULL,
            confidence REAL
        )"""
    )
    conn.commit()
    return conn


db = open_db()


def fail(message, code=400):
    """규격의 실패 응답 {"ok": false, "error": ...} 을 만듭니다."""
    return jsonify(ok=False, error=message), code


def parse_timestamp(text):
    """ISO 8601 시각 글자를 한국 시간 datetime 으로 바꿉니다. 형식이 틀리면 None."""
    try:
        moment = datetime.fromisoformat(text)
    except (TypeError, ValueError):
        return None
    if moment.tzinfo is None:
        moment = moment.replace(tzinfo=KST)
    return moment.astimezone(KST)


def parse_confidence(value):
    """신뢰도를 0~1 숫자로 바꿉니다. 없거나 이상하면 None."""
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    return value if 0 <= value <= 1 else None


def read_day(args):
    """요청 주소의 ?date=2026-11-02 를 읽습니다. 없으면 오늘, 형식이 틀리면 None."""
    text = args.get("date")
    if not text:
        return datetime.now(KST).date().isoformat()
    try:
        return date.fromisoformat(text).isoformat()
    except ValueError:
        return None


def save_event(event_type, moment, confidence):
    """이벤트 하나를 기록 파일에 저장하고 번호(id)를 돌려줍니다."""
    timestamp = moment.isoformat(timespec="seconds")
    with _db_lock:
        cur = db.execute(
            "INSERT INTO events (type, timestamp, day, confidence) VALUES (?, ?, ?, ?)",
            (event_type, timestamp, moment.date().isoformat(), confidence),
        )
        db.commit()
    return cur.lastrowid, timestamp


def update_status(event_type, timestamp):
    """이벤트에 맞게 현재 상태(present / absent)를 바꿉니다. 같은 상태면 since 를 그대로 둡니다."""
    new_state = STATE_PRESENT if event_type == EVENT_PERSON_DETECTED else STATE_ABSENT
    with _status_lock:
        if _status["state"] != new_state:
            _status.update(state=new_state, since=timestamp)


def send_greet(event_id):
    """로봇에 인사 명령을 보냅니다. 로봇이 꺼져 있어도 서버는 멈추지 않습니다."""
    if mock_robot:
        print(f"[테스트] 로봇에 인사 명령 보냄, event_id={event_id}")
        return
    try:
        res = requests.post(robot_url("/greet"), json={"event_id": event_id}, timeout=ROBOT_TIMEOUT_SEC)
        print(f"로봇 응답 {res.status_code}: {res.text.strip()}")
    except requests.RequestException as error:
        print(f"로봇 연결 실패 (서버는 계속 동작): {error.__class__.__name__}")


@app.after_request
def add_common_headers(response):
    """모든 응답에 공통 머리글을 붙입니다."""
    # 다른 주소에서 연 웹 화면(?server=...)도 서버에 물어볼 수 있게 허락
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type"
    # 휴대폰 브라우저가 예전 상태를 기억해 두고 보여주지 않게, API 응답은 저장하지 말라고 알림
    if request.path.startswith("/api/"):
        response.headers["Cache-Control"] = "no-store"
    return response


@app.errorhandler(404)
def not_found(error):
    """없는 주소. API 는 규격대로 JSON 으로 알려줍니다."""
    if request.path.startswith("/api/"):
        return fail("없는 주소입니다", 404)
    return error


@app.errorhandler(405)
def wrong_method(error):
    """GET/POST 를 잘못 쓴 요청."""
    return fail("요청 방식(GET/POST)이 틀렸습니다", 405)


@app.errorhandler(413)
def too_large(error):
    """너무 큰 요청 본문."""
    return fail("요청이 너무 큽니다", 413)


@app.errorhandler(500)
def server_error(error):
    """서버 안에서 난 오류. 서버는 멈추지 않고 실패 응답만 보냅니다."""
    print(f"서버 오류: {error}")
    return fail("서버 오류", 500)


@app.post("/api/events")
def post_event():
    """① AI 가 보낸 감지 이벤트를 저장합니다."""
    body = request.get_json(silent=True)
    if not isinstance(body, dict):
        return fail("JSON 본문이 필요합니다")

    event_type = body.get("type")
    if event_type not in EVENT_TYPES:
        return fail(f"type 은 {EVENT_PERSON_DETECTED} 또는 {EVENT_PERSON_LEFT} 이어야 합니다")

    # timestamp 가 없으면 받은 시각으로 기록합니다.
    moment = parse_timestamp(body.get("timestamp") or now_iso())
    if moment is None:
        return fail("timestamp 형식이 틀렸습니다. 예: 2026-11-02T14:03:21+09:00")

    event_id, timestamp = save_event(event_type, moment, parse_confidence(body.get("confidence")))
    update_status(event_type, timestamp)
    print(f"이벤트 저장 id={event_id} {event_type} {timestamp}")

    if event_type == EVENT_PERSON_DETECTED:
        # AI 에게 바로 응답하려고 로봇 요청은 따로 보냅니다.
        threading.Thread(target=send_greet, args=(event_id,), daemon=True).start()
    return jsonify(ok=True, id=event_id)


@app.get("/api/status")
def get_status():
    """③ 웹 화면에 현재 상태를 알려줍니다."""
    with _status_lock:
        return jsonify(dict(_status))


@app.get("/api/events")
def get_events():
    """④ 앱에 그날 이벤트 목록을 알려줍니다 (오래된 것부터)."""
    day = read_day(request.args)
    if day is None:
        return fail("date 형식이 틀렸습니다. 예: 2026-11-02")
    with _db_lock:
        rows = db.execute(
            "SELECT id, type, timestamp, confidence FROM events WHERE day = ? ORDER BY id", (day,)
        ).fetchall()
    return jsonify([dict(row) for row in rows])


@app.get("/api/stats")
def get_stats():
    """④ 앱에 그날 감지(person_detected) 횟수를 알려줍니다."""
    day = read_day(request.args)
    if day is None:
        return fail("date 형식이 틀렸습니다. 예: 2026-11-02")
    with _db_lock:
        count = db.execute(
            "SELECT COUNT(*) FROM events WHERE day = ? AND type = ?", (day, EVENT_PERSON_DETECTED)
        ).fetchone()[0]
    return jsonify(date=day, count=count)


@app.get("/")
def web_home():
    """웹 화면 첫 페이지 (src/web/index.html)."""
    return send_from_directory(WEB_DIR, "index.html")


@app.get("/data/<path:name>")
def sample_data(name):
    """data/ 의 샘플 파일 (대시보드 테스트 모드가 씀)."""
    return send_from_directory(DATA_DIR, name)


def restore_status():
    """서버를 다시 켰을 때 마지막 이벤트로 현재 상태를 되돌립니다."""
    row = db.execute("SELECT type, timestamp FROM events ORDER BY id DESC LIMIT 1").fetchone()
    if row:
        state = STATE_PRESENT if row["type"] == EVENT_PERSON_DETECTED else STATE_ABSENT
        _status.update(state=state, since=row["timestamp"])


def lan_ip():
    """같은 Wi-Fi 의 휴대폰·다른 PC 가 접속할 이 노트북의 IP 를 찾습니다."""
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        sock.connect(("8.8.8.8", 80))  # 실제로 데이터를 보내지는 않고 IP 만 알아냄
        return sock.getsockname()[0]
    except OSError:
        return "127.0.0.1"
    finally:
        sock.close()


def print_addresses():
    """서버를 켤 때 접속 주소를 알려줍니다."""
    base = f"http://{lan_ip()}:{SERVER_PORT}"
    print("중앙 서버 시작")
    print(f"  이 노트북:          http://localhost:{SERVER_PORT}")
    print(f"  휴대폰·다른 PC:     {base}  (같은 Wi-Fi 에서)")
    print(f"  대시보드:           {base}/dashboard.html")
    print(f"  상태 확인:          {base}/api/status")
    print(f"  로봇 주소:          {robot_url('/greet')}" + ("  (테스트 모드: 보내지 않음)" if mock_robot else ""))


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--mock-robot", action="store_true", help="로봇 없이 인사 명령을 콘솔에 출력만 하는 테스트 모드")
    mock_robot = parser.parse_args().mock_robot
    restore_status()
    print_addresses()
    app.run(host="0.0.0.0", port=SERVER_PORT, threaded=True)

# 실행 (레포 맨 위 폴더 기준):       python src/server/server.py
# 테스트 모드 (로봇 없이):           python src/server/server.py --mock-robot
# 로봇 주소 지정 (PowerShell):       $env:ROBOT_HOST="192.168.0.20"; python src/server/server.py
# 확인: 브라우저에서 http://localhost:8000/api/status
