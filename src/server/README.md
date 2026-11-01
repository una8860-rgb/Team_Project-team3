# src/server — 중앙 서버 (담당: 한웅)

모든 신호가 모이는 허브입니다. 한웅 노트북에서 AI와 함께 실행합니다 (포트 8000).

- 받는 것: `POST /api/events` (AI)
- 보내는 것: `POST /greet` (로봇, 타임아웃 2초)
- 제공하는 것: `GET /api/status` (웹 화면), `GET /api/events`·`GET /api/stats` (앱)
- 웹 화면(`src/web`)도 이 서버가 같이 띄웁니다: `http://<서버IP>:8000/`, `http://<서버IP>:8000/dashboard.html`
- 규격: `docs/design.md` ①~④ / 마일스톤: `docs/milestones/M1-ai-server.md`

## 파일

```
src/server/
├── README.md    이 문서
├── server.py    중앙 서버 (Flask)
├── fake_ai.py   가짜 AI: 웹캠 없이 이벤트를 보내 서버를 시험
└── events.db    감지 기록 (서버를 켜면 생김, git 에 안 올라감)
```

## 실행

레포 맨 위 폴더에서 실행합니다. `requirements.txt` 에 이미 있는 Flask, requests 만 씁니다.

```powershell
pip install -r requirements.txt

# 로봇 없이 시험 (인사 명령을 콘솔에 출력만 함)
python src/server/server.py --mock-robot

# 11/2 실제 연동 (라즈봇 IP 를 넣고 실행)
$env:ROBOT_HOST="192.168.0.20"; python src/server/server.py
```

켜지면 접속 주소가 나옵니다.

```
중앙 서버 시작
  이 노트북:          http://localhost:8000
  휴대폰·다른 PC:     http://192.168.0.10:8000  (같은 Wi-Fi 에서)
  대시보드:           http://192.168.0.10:8000/dashboard.html
  상태 확인:          http://192.168.0.10:8000/api/status
```

"휴대폰·다른 PC" 주소를 단톡에 공유합니다. 끌 때는 `Ctrl+C`.

## 혼자 시험하기

서버를 켠 상태에서 PowerShell 창을 하나 더 열고:

```powershell
python src/server/fake_ai.py            # 사람이 왔다가 5초 뒤 감
python src/server/fake_ai.py detected   # 사람 나타남만
python src/server/fake_ai.py left       # 사람 사라짐만
```

브라우저에서 `http://localhost:8000/api/status` 를 새로고침하면 `present` / `absent` 가 바뀝니다.
`http://localhost:8000/api/events` 에 오늘 기록이 쌓입니다.

## 휴대폰·다른 PC 에서 접속이 안 될 때

1. 같은 Wi-Fi 인지 확인합니다. 휴대폰이 LTE/5G 로 붙어 있으면 안 됩니다.
2. Windows 방화벽: 서버를 처음 켤 때 "Windows 보안 경고" 창이 뜨면 개인 네트워크, 공용 네트워크 모두 체크하고 액세스 허용.
   핫스팟은 공용 네트워크로 잡히는 경우가 많아서 공용도 체크해야 합니다.
   창을 놓쳤으면 관리자 PowerShell 에서 한 번 실행합니다.
   ```powershell
   New-NetFirewallRule -DisplayName "team3 server 8000" -Direction Inbound -Protocol TCP -LocalPort 8000 -Action Allow
   ```
3. 노트북에서 `http://localhost:8000/api/status` 는 되는데 휴대폰만 안 되면 대부분 1번이나 2번 문제입니다.
4. 장소가 바뀌면 IP 도 바뀝니다. 서버를 다시 켜서 나온 주소를 다시 공유합니다.

## 안정성 관련

- 로봇이 꺼져 있거나 IP 가 틀려도 서버는 멈추지 않습니다. 로봇 요청은 따로 보내고 AI 에게는 바로 응답합니다.
- 여러 기기가 동시에 물어봐도 기록이 꼬이지 않게 잠금을 걸었습니다. (동시 요청 50개 시험: 모두 정상)
- API 응답에 `Cache-Control: no-store` 를 붙여 휴대폰 브라우저가 예전 상태를 보여주지 않게 했습니다.
- 다른 주소에서 연 웹 화면(`?server=http://...:8000`)도 접속되게 CORS 를 허용했습니다.
- 서버를 껐다 켜도 기록과 마지막 상태가 남습니다 (`events.db`).
- 틀린 요청은 규격대로 `{"ok": false, "error": "이유"}` 로 답합니다.

## 응답 예시

```
POST /api/events  {"type": "person_detected", "timestamp": "2026-11-02T14:03:21+09:00", "confidence": 0.87}
→ {"ok": true, "id": 1}

GET /api/status
→ {"state": "present", "since": "2026-11-02T14:03:21+09:00"}

GET /api/events?date=2026-11-02
→ [{"id": 1, "type": "person_detected", "timestamp": "2026-11-02T14:03:21+09:00", "confidence": 0.87}, ...]

GET /api/stats?date=2026-11-02
→ {"date": "2026-11-02", "count": 1}
```

- `timestamp` 를 빼면 서버가 받은 시각으로 기록합니다.
- `date` 를 빼면 오늘 날짜로 답합니다.
