# 딴짓보호로봇 (가제) — 3팀

> PC 사용 중 누군가 다가오면 AI가 감지해 화면을 업무 화면으로 바꾸고, 로봇이 대신 인사하는 시스템

📋 [요구사항](docs/requirements.md) · 🔌 [설계·통신 규격](docs/design.md) · 🎯 [마일스톤](docs/milestones/) · 📓 [작업 일지](docs/progress.md) · 📝 [회의록](docs/meetings/)

## 👥 역할 분담

| 이름 | 담당 | 코드 폴더 | 마일스톤 | GitHub |
|---|---|---|---|---|
| 한웅 | AI 사람 감지 + 중앙 서버 | `src/ai/`, `src/server/` | [M1](docs/milestones/M1-ai-server.md) | @gksdnd0519-commits |
| 유나 (팀장) | 로봇·HW | `src/robot/` | [M2](docs/milestones/M2-robot-greet.md) | @una8860-rgb |
| 채웅 | 웹 화면·대시보드 | `src/web/` | [M3](docs/milestones/M3-web.md) | @chaechaechae99 |
| 채연 | 앱 · 발표 | `src/app/` | [M4](docs/milestones/M4-app.md) | @kangchaeyeon82 |

## 📁 폴더 구조

```
README.md            프로젝트 설명서 (지금 보는 파일)
CLAUDE.md            Claude Code 지침 (AGENTS.md 참조)
AGENTS.md            팀 공통 AI 지침: 코드 규칙, 통신 규격 요약, 제약사항
requirements.txt     버전을 고정한 Python 라이브러리 목록
.gitignore           CLAUDE.local.md, .env 등 개인 파일 제외
src/                 소스 코드
  common/            공용 상수·함수 (protocol.py: 포트, 이벤트 이름 등)
  ai/                AI 사람 감지          ← 한웅
  robot/             라즈봇 인사 서버      ← 유나
  server/            중앙 서버             ← 한웅
  web/               웹 화면·대시보드      ← 채웅
  app/               앱                    ← 채연
data/                샘플 데이터 (혼자 개발할 때 쓰는 가짜 데이터)
reference/           라즈봇 등 장치 자료·링크
docs/
  requirements.md    요구사항: 무엇을 만들 것인가
  design.md          설계: 구조, 모듈 간 통신 규격
  milestones/        마일스톤과 담당자 (각자 진행 기록)
  progress.md        날짜별 작업 일지 (인수인계서)
  meetings/          회의록
  team/              팀 소개 페이지 (docs/team/index.html 을 브라우저로 열기)
```

## ✋ 작업 규칙

1. **내 담당 폴더만 수정합니다.** (`src/내모듈/`, 내 마일스톤 파일, 내 팀 소개 페이지)
2. 공용 파일(`src/common/`, `docs/design.md`, `requirements.txt`)은 PR로 팀 합의 후 수정합니다.
3. `main` 에 직접 push 할 수 없습니다. **내 브랜치 → Pull Request → 팀원 1명 승인 → merge**
4. 작업 시작 전엔 항상 `main` 최신 내용을 받아옵니다.
5. 비밀번호·API 키, 모델·영상 같은 큰 파일은 올리지 않습니다. (레포가 공개 상태)

## 🔁 작업 흐름 (Git)

```bash
# 처음 한 번
git clone https://github.com/una8860-rgb/Team_Project-team3.git
cd Team_Project-team3
pip install -r requirements.txt

# 작업할 때마다
git checkout main
git pull origin main
git checkout -b member2-robot-greet      # member번호-작업내용

# ... src/robot/ 에서 작업 ...
git add src/robot docs/milestones/M2-robot-greet.md
git commit -m "member2: 로봇 인사 서버 구현"
git push origin member2-robot-greet
# → GitHub 에서 Pull Request 만들기
```

## 🤖 AI 도구를 쓸 때

Claude Code 등은 `CLAUDE.md` → `AGENTS.md` 를 자동으로 읽고 팀 규칙을 따릅니다.
개인 메모는 `CLAUDE.local.md` 에 쓰면 git 에 올라가지 않습니다.
