"""사람이 감지되면 가짜 엑셀 창을 맨 앞으로 꺼내고, 사라지면 원래 하던 창으로 돌려놓습니다.

평소에는 다른 프로그램(인터넷, 오르카 등)을 쓰다가, 중앙 서버 상태가 present 가 되면
가짜 엑셀 화면(index.html?excel=1)을 전체 화면으로 띄웁니다.

- Windows 전용입니다. 추가 라이브러리 없이 파이썬 기본 기능만 씁니다.
- 이 프로그램이 src/web 폴더를 작은 웹 서버로 띄우고, 가짜 엑셀 페이지는 이 프로그램에게 상태를 묻습니다.
  그래서 창 전환과 인사 음성이 같은 상태를 보고 움직입니다.
- 창 닫기: 이 콘솔에서 Ctrl+C 를 누르면 가짜 엑셀 창도 같이 닫힙니다.
"""
import argparse
import ctypes
import json
import os
import shutil
import subprocess
import sys
import tempfile
import threading
import time
import urllib.request
from ctypes import wintypes
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
from common.protocol import STATE_ABSENT, STATE_PRESENT, now_iso, server_url  # noqa: E402

WEB_DIR = os.path.dirname(os.path.abspath(__file__))
LOCAL_PORT = 8090  # 이 노트북 안에서만 쓰는 페이지 주소의 포트
# 상태 확인 주기. 규격의 WEB_POLL_SEC(0.5초)보다 짧게 잡아 감지 후 창이 더 빨리 뜨게 합니다.
# 요청이 작아서 0.1초마다 물어도 서버에 부담이 거의 없습니다.
POPUP_POLL_SEC = 0.1
WINDOW_TITLE = "2026_4분기_매출보고서.xlsx"  # config.js 의 TITLE_EXCEL 앞부분
BROWSER_PATHS = [
    r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
    r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
    r"C:\Program Files\Google\Chrome\Application\chrome.exe",
    os.path.expandvars(r"%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe"),
]

user32 = ctypes.windll.user32
kernel32 = ctypes.windll.kernel32
SW_HIDE = 0
SW_SHOW = 5
SW_RESTORE = 9

state = {"value": STATE_ABSENT, "since": now_iso()}  # 지금 상태 (페이지에 그대로 알려줌)


# 페이지 파일을 주고, /api/status 요청에는 지금 상태를 돌려주는 작은 웹 서버입니다.
class Handler(SimpleHTTPRequestHandler):
    def do_GET(self):
        if self.path.startswith("/api/status"):
            body = json.dumps({"state": state["value"], "since": state["since"]}).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        else:
            super().do_GET()

    def log_message(self, *args):
        pass  # 0.5초마다 찍히는 요청 기록은 숨깁니다


# src/web 폴더를 LOCAL_PORT 로 띄웁니다.
def start_local_server():
    server = ThreadingHTTPServer(("127.0.0.1", LOCAL_PORT), partial(Handler, directory=WEB_DIR))
    threading.Thread(target=server.serve_forever, daemon=True).start()


# 설치된 엣지나 크롬 위치를 찾습니다.
def find_browser():
    for path in BROWSER_PATHS:
        if os.path.exists(path):
            return path
    return shutil.which("msedge") or shutil.which("chrome")


# 가짜 엑셀 페이지를 주소창 없는 전체 화면 창으로 엽니다. 인사 음성이 클릭 없이 나오도록 설정합니다.
def open_excel_window(browser):
    profile = os.path.join(tempfile.gettempdir(), "dda_excel_profile")
    url = f"http://127.0.0.1:{LOCAL_PORT}/index.html?excel=1"
    return subprocess.Popen([
        browser, f"--app={url}", "--kiosk", f"--user-data-dir={profile}",
        "--autoplay-policy=no-user-gesture-required", "--no-first-run", "--no-default-browser-check",
    ])


# 제목에 WINDOW_TITLE 이 들어간 창을 찾습니다. 없으면 None.
def find_window():
    found = []

    @ctypes.WINFUNCTYPE(wintypes.BOOL, wintypes.HWND, wintypes.LPARAM)
    def check(hwnd, _):
        length = user32.GetWindowTextLengthW(hwnd)
        if length and user32.IsWindowVisible(hwnd):
            buf = ctypes.create_unicode_buffer(length + 1)
            user32.GetWindowTextW(hwnd, buf, length + 1)
            if WINDOW_TITLE in buf.value:
                found.append(hwnd)
                return False
        return True

    user32.EnumWindows(check, 0)
    return found[0] if found else None


# 창을 맨 앞으로 꺼냅니다. 윈도우가 다른 프로그램의 창 전환을 막을 때가 있어 입력 스레드를 잠깐 붙입니다.
def bring_to_front(hwnd):
    if not user32.IsWindowVisible(hwnd):
        user32.ShowWindow(hwnd, SW_SHOW)
    if user32.IsIconic(hwnd):
        user32.ShowWindow(hwnd, SW_RESTORE)
    fg = user32.GetForegroundWindow()
    fg_thread = user32.GetWindowThreadProcessId(fg, None)
    my_thread = kernel32.GetCurrentThreadId()
    attached = fg_thread and fg_thread != my_thread and user32.AttachThreadInput(my_thread, fg_thread, True)
    user32.BringWindowToTop(hwnd)
    user32.SetForegroundWindow(hwnd)
    if attached:
        user32.AttachThreadInput(my_thread, fg_thread, False)


# 중앙 서버에 현재 상태를 묻습니다. 실패하면 None.
def fetch_state(server):
    try:
        with urllib.request.urlopen(f"{server}/api/status", timeout=1) as res:
            return json.loads(res.read())["state"]
    except Exception:
        return None


# 테스트 모드: 콘솔에 1 을 치면 감지, 2 를 치면 사라짐으로 바꿉니다.
def read_test_input(test_state):
    while True:
        key = input().strip()
        if key == "1":
            test_state["value"] = STATE_PRESENT
        elif key == "2":
            test_state["value"] = STATE_ABSENT


# 상태가 바뀌면 창을 바꿉니다. present: 엑셀 앞으로, absent: 엑셀 숨기고 원래 창으로.
# 전체 화면(kiosk) 창은 최소화 명령을 무시해서 숨기기(SW_HIDE)를 씁니다.
def switch(new_state, excel, memory):
    if new_state == STATE_PRESENT:
        current = user32.GetForegroundWindow()
        if current != excel:
            memory["prev"] = current
        bring_to_front(excel)
        print(f"[popup] {time.strftime('%H:%M:%S')} 사람 감지 -> 엑셀 화면")
    else:
        user32.ShowWindow(excel, SW_HIDE)
        prev = memory.get("prev")
        if prev and user32.IsWindow(prev):
            bring_to_front(prev)
        print(f"[popup] {time.strftime('%H:%M:%S')} 사람 사라짐 -> 원래 창")


def main():
    parser = argparse.ArgumentParser(description="사람이 감지되면 가짜 엑셀 창을 앞으로 꺼냅니다.")
    parser.add_argument("--server", help="중앙 서버 주소 (예: http://192.168.0.10:8000). 없으면 SERVER_HOST 환경변수 사용")
    parser.add_argument("--test", action="store_true", help="서버 없이 콘솔에서 1(감지)/2(사라짐)로 시험")
    args = parser.parse_args()
    server = (args.server or server_url("")).rstrip("/")

    browser = find_browser()
    if not browser:
        print("[popup] 엣지나 크롬을 찾지 못했습니다.")
        return
    start_local_server()
    proc = open_excel_window(browser)

    excel = None
    for _ in range(40):  # 창이 뜰 때까지 최대 20초 기다림
        time.sleep(0.5)
        excel = find_window()
        if excel:
            break
    if not excel:
        print("[popup] 가짜 엑셀 창을 찾지 못했습니다.")
        proc.terminate()
        return
    user32.ShowWindow(excel, SW_HIDE)

    test_state = {"value": STATE_ABSENT}
    if args.test:
        threading.Thread(target=read_test_input, args=(test_state,), daemon=True).start()
        print("[popup] 테스트 모드: 1 + Enter = 사람 감지, 2 + Enter = 사람 사라짐")
    else:
        print(f"[popup] 중앙 서버 {server} 상태를 {POPUP_POLL_SEC}초마다 확인합니다.")
    print("[popup] 준비 완료. 하던 작업을 하세요. 끝내려면 Ctrl+C")

    memory = {}
    lost = False
    try:
        while True:
            new_state = test_state["value"] if args.test else fetch_state(server)
            if new_state is None:
                if not lost:
                    print("[popup] 서버 연결 끊김 (화면은 그대로 둡니다)")
                lost = True
            else:
                if lost:
                    print("[popup] 서버 다시 연결됨")
                lost = False
                if new_state != state["value"]:
                    state["value"], state["since"] = new_state, now_iso()
                    switch(new_state, excel, memory)
            time.sleep(POPUP_POLL_SEC)
    except KeyboardInterrupt:
        print("[popup] 끝냅니다.")
    finally:
        proc.terminate()


if __name__ == "__main__":
    main()

# 실행: python src/web/excel_popup.py --server http://<서버IP>:8000
# 시험: python src/web/excel_popup.py --test
