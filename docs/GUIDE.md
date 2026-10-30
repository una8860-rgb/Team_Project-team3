# 🔰 왕초보 가이드 — 명령어 없이 GitHub 쓰기

> 어려운 명령어는 몰라도 됩니다! **버튼만 누르면 돼요.**
> 막히면 단톡방에 캡처 올려주세요 🙌

## 먼저 기억할 3가지

1. **내 폴더만 고치기** — 한웅 `members/member1` · 유나 `members/member2` · 채웅 `members/member3` · 채연 `members/member4`
2. **고친 다음엔 "Pull Request(PR)" 만들기** — "내가 이렇게 고쳤어요, 확인해주세요" 라는 요청서
3. **팀원 1명이 승인(Approve)하면** 합쳐짐 → 남의 작업을 실수로 망가뜨릴 수 없어요

---

## 방법 A. 브라우저에서 바로 고치기 (설치 필요 없음, 추천 👍)

내 페이지 글 수정, 짧은 코드 수정은 이걸로 충분해요.

**1. 레포 들어가기**
👉 https://github.com/una8860-rgb/Team_Project-team3

**2. 내 폴더 → 고칠 파일 클릭**
예) `members` → `member3` → `info.js`

**3. 오른쪽 위 ✏️ 연필 아이콘 클릭** → 내용 수정

**4. 오른쪽 위 초록 버튼 `Commit changes...` 클릭**
- 창이 뜨면 `Commit message` 에 뭘 했는지 적기 (예: `member3: 담당 소개 작성`)
- ⚪ `Create a new branch for this commit and start a pull request` 가 선택된 상태 그대로 두기
- `Propose changes` 클릭

**5. `Create pull request` 클릭 → 끝!** 🎉
팀원 1명이 승인하면 합쳐져요.

> 💡 **파일 새로 올리기** (사진, 코드 파일 등): 내 폴더에서 `Add file` → `Upload files` → 파일 끌어다 놓기 → 4~5번과 동일

---

## 방법 B. GitHub Desktop (코드를 내 컴퓨터에서 돌려봐야 할 때)

AI·서버·로봇·앱 코드처럼 **내 컴퓨터에서 실행해봐야 하는 작업**은 이 방법을 써요.

### 처음 한 번만 (설치)
1. https://desktop.github.com 에서 **GitHub Desktop** 설치 → GitHub 계정으로 로그인
2. 메뉴 `File` → `Clone repository...`
3. `GitHub.com` 탭에서 **`una8860-rgb/Team_Project-team3`** 선택 → `Clone`
   (내 컴퓨터 `문서\GitHub\Team_Project-team3` 폴더에 다운로드돼요)

### 작업할 때마다 (5단계)

| 순서 | 어디를 누르나요 | 의미 |
|---|---|---|
| ① | 위쪽 `Current branch` → **`main`** 선택 → `Fetch origin` → `Pull origin` | 팀원들 최신 작업 받아오기 |
| ② | `Current branch` → `New branch` → 이름 입력 (예: `member3-web-server`) → `Create branch` | 내 작업용 공간 만들기 |
| ③ | `Repository` → `Show in Explorer` (또는 `Open in Visual Studio Code`) → **내 폴더에서** 작업 | 작업하기 |
| ④ | GitHub Desktop 왼쪽 아래 `Summary` 에 한 일 적기 → `Commit to member3-...` | 저장하기 |
| ⑤ | 위쪽 `Publish branch` → `Create Pull Request` → 브라우저에서 `Create pull request` | 올리고 확인 요청하기 |

> 💡 다음 작업 때는 다시 ①부터!

---

## 팀원 PR 승인하는 법 (리뷰)

내 이름으로 **"검토 요청(Review requested)"** 이 오면:

1. 레포 위쪽 `Pull requests` 탭 → 해당 PR 클릭
2. `Files changed` 탭 → 바뀐 내용 확인 (초록 = 추가, 빨강 = 삭제)
3. 오른쪽 위 `Review changes` (또는 `Submit review`) 클릭
4. 괜찮으면 ⚪ `Approve` → `Submit review`
5. 다시 `Conversation` 탭 맨 아래 → 초록 `Merge pull request` → `Confirm merge`

> ⚠️ 남의 폴더를 고친 PR이면 승인하지 말고 댓글로 알려주세요!

---

## 자주 묻는 질문

**Q. `main` 에 바로 저장이 안 돼요!**
A. 정상이에요 😊 `main` 은 보호되어 있어서 꼭 PR로 올려야 해요. (방법 A의 4번 참고)

**Q. 실수로 남의 파일을 고쳤어요.**
A. 괜찮아요. PR을 올리기 전이면 GitHub Desktop 에서 해당 파일 우클릭 → `Discard changes`. 이미 올렸으면 단톡에 알려주세요.

**Q. "conflict(충돌)" 라고 떠요.**
A. 두 사람이 같은 파일을 고쳐서 생긴 거예요. 혼자 해결하지 말고 팀장에게 캡처 보내주세요.

**Q. AI 모델 파일이나 영상이 안 올라가요.**
A. 용량이 커서 일부러 막아뒀어요. Google Drive 에 올리고 링크만 공유해주세요.

**Q. 내 페이지는 어디서 보나요?**
A. 레포 폴더의 `index.html` 을 더블클릭하면 브라우저에서 열려요.
