// 웹 화면 설정. 값은 src/common/protocol.py 와 맞춥니다.
const params = new URLSearchParams(location.search);

// 중앙 서버 주소. 비워 두면 이 페이지를 띄운 서버에 그대로 묻습니다.
// 다른 주소의 서버에 붙일 때는 주소 뒤에 ?server=http://192.168.0.10:8000 을 붙여 엽니다.
const SERVER_URL = params.get("server") || "";

// 상태 확인 주기 (protocol.py 의 WEB_POLL_SEC = 0.5)
const POLL_MS = 500;

// 상태 값 (protocol.py 의 STATE_PRESENT, STATE_ABSENT)
const STATE_PRESENT = "present";
const STATE_ABSENT = "absent";

// 평소 화면에 띄울 기본 유튜브 영상 주소. &t=19s 처럼 시작 시간을 넣으면 그 시간부터 재생합니다.
// 시작 화면에서 유튜브 주소를 붙여 넣으면 그 영상으로 바뀌고, 브라우저가 기억합니다.
// 주소 뒤에 ?video=유튜브주소 를 붙이면 그 영상을 먼저 씁니다.
const DEFAULT_VIDEO_URL = "https://www.youtube.com/watch?v=9gns6tZ3zy4&t=19s";
const VIDEO_STORAGE_KEY = "dda-video-url";

// 유튜브를 이 시간 안에 못 불러오면 가짜 영상 화면을 대신 보여줍니다.
const VIDEO_LOAD_TIMEOUT_MS = 8000;

// 브라우저 탭 제목
const TITLE_NORMAL = "YouTube";
const TITLE_EXCEL = "2026_4분기_매출보고서.xlsx - Excel";

// 테스트 모드: 서버 없이 버튼으로 상태를 바꿔 봅니다.
// 주소 뒤에 ?test=1 을 붙이거나, index.html 파일을 더블클릭해서 열면 켜집니다.
const TEST_MODE = params.has("test") || location.protocol === "file:";
