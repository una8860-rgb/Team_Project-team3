# 🤖 딴짓보호로봇 (가제)

> PC 사용 중 누군가 다가오면 AI가 감지해 화면을 업무 화면으로 바꾸고, 로봇이 대신 인사하는 시스템
>
> 📋 [기획서](docs/PLAN.md) · 📝 [회의록](docs/meetings/)

팀원 각자가 **자기 작업공간(폴더)** 에서 맡은 파트를 진행하고, **Pull Request** 로 합치는 방식으로 협업합니다.
`index.html` 을 브라우저로 열면 프로젝트 홈과 팀원별 작업공간을 볼 수 있습니다. (빌드 도구 필요 없음)

## 👥 역할 분담

| 폴더 | 이름 | 담당 파트 | GitHub |
|---|---|---|---|
| `members/member1` | 한웅 | AI | @gksdnd0519-commits |
| `members/member2` | 유나 (팀장) | 로봇·HW | @una8860-rgb |
| `members/member3` | 채웅 | 웹사이트 | @chaechaechae99 |
| `members/member4` | 채연 | 앱 및 발표 | @kangchaeyeon82 |

## 📁 폴더 구조

```
index.html              프로젝트 홈                         ← 팀장만 수정
assets/
  project.js            프로젝트 이름·소개·목표               ← 팀장만 수정
  home.js, home.css     홈 화면 동작·스타일                   ← 팀장만 수정
members/
  member1/              한웅(AI) 작업공간                    ← 본인만 수정
    info.js             홈 카드에 보일 내 정보 (이름, 담당, 진행 상태)
    index.html          내 작업 페이지 (소개, 할 일, 진행 기록, 결과물)
    style.css           내 페이지 스타일
    src/                내 담당 파트 코드
  member2/ ...
docs/
  PLAN.md               프로젝트 기획서 (기능, 담당, 시연 시나리오)
  meetings/             회의록
.github/
  pull_request_template.md   PR 작성 양식
```

## ✋ 작업 규칙

1. **내 폴더(`members/내폴더/`)만 수정합니다.** 남의 폴더와 공용 파일(`index.html`, `assets/`)은 건드리지 않습니다.
2. 공용 파일 수정이 필요하면 팀장에게 요청합니다. (프로젝트 이름 변경도 `assets/project.js` 한 곳만 고치면 됩니다)
3. `main` 에 직접 push 하지 않습니다. **항상 내 브랜치 → Pull Request → 팀장 검토 → merge** 순서로 합칩니다.
4. 작업 시작 전에는 항상 `main` 의 최신 내용을 받아옵니다.

## 🔁 작업 흐름 (Git)

### 처음 한 번
```bash
git clone https://github.com/una8860-rgb/Team_Project-team3.git
cd Team_Project-team3
```

### 작업할 때마다
```bash
# 1. 최신 main 받기
git checkout main
git pull origin main

# 2. 내 브랜치 만들기 (이름 형식: member번호-작업내용)
git checkout -b member1-ai-model

# 3. 내 폴더에서 작업 후 커밋
git add members/member1
git commit -m "member1: 딴짓 감지 모델 초안"

# 4. GitHub 에 올리기
git push origin member1-ai-model
```

### 5. Pull Request 만들기
GitHub 저장소 페이지 → **Compare & pull request** 버튼 → 양식 채우고 **Create pull request**

### 6. 팀장: 검토 후 merge
PR 내용을 확인하고 문제가 없으면 **Merge pull request**. merge 된 브랜치는 삭제해도 됩니다.

## ➕ 팀원 추가하기 (팀장)

1. `members/member1` 폴더를 복사해 `members/member5` 로 만들고, 안의 `member1` → `member5` 로 바꿉니다.
2. `index.html` 의 팀원 목록에 한 줄 추가합니다.
   ```html
   <script src="members/member5/info.js"></script>
   ```

## 🌐 웹에 공개하기 (GitHub Pages)

GitHub 저장소 → **Settings → Pages** → Branch 를 `main` / `/ (root)` 로 저장하면
`https://una8860-rgb.github.io/Team_Project-team3/` 에서 사이트가 열립니다.

## 🚫 올리면 안 되는 파일

레포가 **공개(Public)** 라 누구나 볼 수 있습니다. `.gitignore` 에 아래 파일들이 자동 제외되도록 설정되어 있습니다.

- **비밀 정보**: 비밀번호, API 키, Wi-Fi 비밀번호 → `.env` 파일에 넣기 (예시는 `.env.example` 로 공유)
- **AI 모델·영상 파일** (`.pt`, `.onnx`, `.mp4` 등): 용량이 커서 GitHub 에 안 올라감 → Google Drive 로 공유하고 링크만 남기기
- **자동 생성 폴더**: `venv/`, `__pycache__/`, `node_modules/`

> 로봇 인사 음성(`.mp3`, `.wav`)처럼 작은 파일은 올려도 괜찮습니다.
