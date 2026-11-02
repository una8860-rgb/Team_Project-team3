# src/ai — AI 사람 감지 (담당: 한웅)

웹캠으로 사람이 있는지 판단해서 중앙 서버에 이벤트를 보냅니다.

- 보내는 것: `POST /api/events` — 규격은 `docs/design.md` ①
- 기준: 2초 이상 보이면 `person_detected`, 3초 이상 안 보이면 `person_left` (각 1번만)
- 서버가 없을 때: 보낼 JSON을 콘솔에 출력하고 계속 돌아감
- 마일스톤: `docs/milestones/M1-ai-server.md`

## 파일

```
src/ai/
├── README.md         이 문서
└── detect_person.py  웹캠 사람 감지 (YOLO26n, 사람만 봄)
```

- 모델: Ultralytics YOLO26n (`yolo26n.pt`). 처음 실행할 때 레포 맨 위 폴더에 자동으로 받아집니다. git 에는 안 올라갑니다 (`.gitignore` 의 `*.pt`).
- 사람(person) 하나만 봅니다. 얼굴 인식, 영상·사진 저장, 영상 전송은 하지 않습니다. 서버에는 종류·시각·신뢰도만 보냅니다.
- 신뢰도 0.5 미만은 무시합니다. 노트북 부담을 줄이려고 화면을 320 크기로 줄여서 봅니다.

## 실행

레포 맨 위 폴더에서 실행합니다. 서버(`src/server/server.py`)를 먼저 켭니다.

```powershell
pip install -r requirements.txt

# 웹캠 없이 2초·3초 기준만 시험
python src/ai/detect_person.py --self-test

# 서버에 보내지 않고 JSON 만 출력
python src/ai/detect_person.py --dry-run

# 실제 실행 (서버와 같은 노트북)
python src/ai/detect_person.py
```

- 창에 웹캠 화면과 `state: PRESENT/ABSENT` 가 나옵니다. 끌 때는 창에서 `q`, 또는 PowerShell 에서 `Ctrl+C`.
- 외장 웹캠이 안 잡히면 `--camera 1`
- 창 없이 돌리려면 `--no-window` (메모리 절약)
- 서버가 다른 노트북이면 `$env:SERVER_HOST="서버IP"; python src/ai/detect_person.py`

## 웹캠이 안 열릴 때

1. 웹캠이 USB 로 꽂혀 있는지 확인합니다.
2. Zoom, 카메라 앱 등 웹캠을 쓰는 다른 프로그램을 끕니다.
3. Windows 설정 > 개인 정보 및 보안 > 카메라 에서 "데스크톱 앱이 카메라에 액세스하도록 허용" 을 켭니다.
4. `--camera 1`, `--camera 2` 로 번호를 바꿔 봅니다.
