# src/robot — 라즈봇: 사람 감지 + 인사 (담당: 유나)

라즈봇 카메라로 사람이 있는지 보고, 사람이 오면 고개를 천천히 숙여 인사합니다. 동시에 중앙 서버에 감지 이벤트를 보내서 웹 화면 전환과 앱 기록이 이어지게 합니다. 인사 음성은 없습니다 (10/31 결정). 감지는 11/2 부터 한웅 노트북 웹캠 대신 라즈봇이 합니다.

| 상황 | 라즈봇이 하는 일 |
|---|---|
| 사람이 1초 이상 보임 | 고개 숙여 인사 + 서버에 `person_detected` |
| 사람이 1초 이상 안 보임 | 서버에 `person_left` (웹 화면이 원래대로) |
| 인사 중 | 사람 감지를 쉼 (고개를 숙이면 바닥만 보이므로) |
| 마지막 인사 후 10초 안 | 다시 인사하지 않음 (쿨다운) |

- 파일: `robot_server.py` (인사 서버, 포트 5000), `person_detector.py` (사람 감지)
- 사람이 있는지만 판단합니다. 누구인지는 알아보지 않고, 영상은 저장하거나 밖으로 보내지 않습니다.
- 받는 것: `POST /greet`, `GET /health`. 보내는 것: `POST /api/events`. 규격은 `docs/design.md` ①②
- 장치 정보·각도·고장 기록: `reference/raspbot.md` / 마일스톤: `docs/milestones/M2-robot-greet.md`

## 1. 켜기

1. 라즈봇 본체 전원 스위치를 켭니다.
2. 1분쯤 기다립니다. 켜지는 동안 고개가 옆으로 한 번 튀었다가 정면으로 돌아옵니다.
3. 고개가 정면을 보면 준비 끝입니다. 인사 서버와 사람 감지가 저절로 실행됩니다.

라즈봇은 유나 휴대폰 핫스팟 `Team3` 에만 붙습니다. 장소가 바뀌어도 이 핫스팟만 켜면 됩니다. 서버·웹·앱 노트북도 모두 `Team3` 에 연결합니다.

## 2. 주소 맞추기

라즈봇과 중앙 서버는 서로의 IP가 필요합니다. 핫스팟을 다시 켜면 IP가 바뀔 수 있으니, 바뀌면 휴대폰 핫스팟 화면의 "연결된 기기"에서 확인합니다.

| 기기 | 11/2 IP |
|---|---|
| 라즈봇 (`yuna`) | `10.199.49.250` |
| 중앙 서버 (한웅 노트북) | `10.199.49.251` |

중앙 서버에 라즈봇 IP 넣기 (한웅 노트북, PowerShell):
```
$env:ROBOT_HOST="10.199.49.250"; python src/server/server.py
```

라즈봇에 서버 IP 넣기 (유나 노트북). `~/team3/robot.env` 의 `SERVER_HOST` 를 바꾸고 다시 켭니다:
```
ssh pi "sed -i 's/^SERVER_HOST=.*/SERVER_HOST=10.199.49.251/' ~/team3/robot.env"
ssh -t pi "sudo systemctl restart robot-greet"
```

## 3. 확인

카메라 앞에 1초 서 있으면 고개를 숙이고, 웹 화면이 엑셀로 바뀝니다. 카메라 밖으로 나가면 1~2초 뒤 원래 화면으로 돌아옵니다.

카메라 없이 인사만 시켜 보기 (노트북, PowerShell 은 `curl.exe`):
```
curl.exe http://<라즈봇IP>:5000/health
curl.exe -X POST http://<라즈봇IP>:5000/greet
```

| 응답 | 뜻 |
|---|---|
| `{"ok":true}` | 인사함 |
| `{"ok":true,"skipped":"cooldown"}` | 마지막 인사 후 10초가 안 지나서 건너뜀. 오류 아님 |
| 응답 없음 (시간 초과) | 라즈봇이 꺼져 있거나 다른 와이파이에 있음 |

감지 기록 보기 (유나 노트북):
```
ssh pi "journalctl -u robot-greet -n 30"
```
`사람 감지 (확신도 0.9)`, `서버에 person_detected 보냄: 200` 같은 줄이 나오면 정상입니다.

## 4. 끄기

전원 스위치를 바로 끄면 SD카드가 망가질 수 있습니다. 파이를 먼저 종료합니다.

1. 유나 노트북에서 실행: `ssh -t pi "sudo shutdown -h now"` (파이 비밀번호 입력)
2. 파이의 초록불이 멈추고 빨간불만 남을 때까지 10~20초 기다립니다.
3. 전원 스위치를 끕니다.

유나 노트북이 없으면, 시연이 다 끝난 뒤 초록불이 깜빡이지 않을 때 스위치를 끕니다.

## 5. 문제 해결

| 증상 | 할 일 |
|---|---|
| 켠 뒤 고개가 옆을 보고 있음 | 10초 더 기다립니다. 서버가 정면을 한 번 더 맞춥니다 |
| 사람이 서 있는데 인사를 안 함 | 1~2m 떨어져서 상반신 이상이 카메라에 보이게 섭니다. 마지막 인사 후 10초 안이면 쉬는 중입니다. 로그에 `사람 감지 시작` 이 있는지 확인 |
| 인사는 하는데 웹 화면이 안 바뀜 | 로그에 `서버 연결 실패` 가 있으면 `robot.env` 의 서버 IP 확인 (2번), 한웅 서버가 켜져 있는지 확인 |
| 아무도 없는데 인사함 | 카메라 앞의 옷·사진·포스터를 치웁니다. 계속되면 `person_detector.py` 의 `MIN_CONFIDENCE` 를 올립니다 (지금 0.35) |
| 웹 화면이 엑셀과 원래 화면을 오감 | `person_detector.py` 의 `LEFT_HOLD_SEC` 를 1 에서 1.5 로 올립니다 |
| `/health` 응답 없음 | 라즈봇 전원, 같은 와이파이인지, IP가 맞는지 확인. 켠 지 1분이 안 됐으면 기다립니다 |
| 응답은 `{"ok":true}` 인데 고개가 안 움직임 | 전원 스위치가 켜져 있는지(서보는 배터리 전원으로 움직임), 배터리 충전, 서보 선이 보드 S1·S2 핀에 끝까지 꽂혀 있는지 확인 |

## 6. 개발자용

로봇 없이 테스트 모드로 실행 (서보 대신 콘솔에 출력, 카메라 감지 끔, 아무 컴퓨터에서나 가능):
```
py -3.13 -m pip install -r requirements.txt
py -3.13 src/robot/robot_server.py --mock --no-camera
```
Python 은 3.13 을 씁니다 (라즈봇과 같은 버전). 3.15 에서는 앱용 `streamlit` 이 쓰는 `pandas` 가 설치되지 않습니다 (11/1 확인). 없으면 `py install 3.13`.
다른 PowerShell 창에서 `curl.exe -X POST http://127.0.0.1:5000/greet` 로 확인합니다.

바꿀 수 있는 값:
| 파일 | 값 | 지금 | 뜻 |
|---|---|---|---|
| `robot_server.py` | `BASE_ANGLE` / `BOW_ANGLE` / `PAN_CENTER` | 30 / 0 / 78 | 평소 상하 / 인사 상하 / 좌우 정면 각도. 상하는 작을수록 아래, 좌우는 작을수록 오른쪽 (로봇 뒤에서 볼 때) |
| `robot_server.py` | `BOW_STEP_DEG` / `BOW_STEP_SEC` | 2 / 0.04 | 고개를 2도씩 0.04초마다 움직임. 30도 숙이는 데 약 0.6초 |
| `robot_server.py` | `BOW_HOLD_SEC` | 1 | 숙인 채 멈추는 시간 |
| `person_detector.py` | `DETECT_HOLD_SEC` / `LEFT_HOLD_SEC` | 1 / 1 | 이만큼 보이면 감지 / 안 보이면 사라짐 (규격은 2초/3초였지만 11/2 줄임) |
| `person_detector.py` | `MIN_CONFIDENCE` | 0.35 | 사람으로 칠 최소 확신도. 낮을수록 몸 일부만 보여도 잡히지만 잘못 잡을 수 있음 |

라즈봇에 바뀐 코드 넣기 (유나 노트북, 레포 맨 위 폴더에서):
```
scp -r src/common src/robot pi:~/team3/src/
ssh -t pi "sudo systemctl restart robot-greet"
```

라즈봇 쪽 설정 (자세한 순서는 `reference/raspbot.md` "OS 를 새로 설치했을 때"):
- 코드 위치: `~/team3/src/`, 서버 IP 설정: `~/team3/robot.env`
- 사람 감지 모델 (MobileNet-SSD, 23MB): `~/models/` 에 따로 받음. 큰 파일이라 레포에 올리지 않음
- 자동 실행: systemd 서비스 `robot-greet` (멈추면 3초 뒤 다시 켜짐)
- 필요한 프로그램 (apt): `python3-flask`, `python3-smbus`, `i2c-tools`, `python3-opencv`. I2C 켜기: `sudo raspi-config nonint do_i2c 0`
