// 상태에 따라 영상 화면과 엑셀 화면을 바꿉니다.
// 규격: docs/design.md 3번 (GET /api/status)

const normalView = document.getElementById("normal");
const excelView = document.getElementById("excel");
const connText = document.getElementById("conn");
const startScreen = document.getElementById("start");
const testPanel = document.getElementById("test-panel");

let currentState = null; // 마지막으로 반영한 상태
let testState = STATE_ABSENT; // 테스트 모드에서 버튼으로 바꾸는 상태
let started = false; // 시작 버튼을 눌렀는지
let player = null; // 유튜브 플레이어
let videoReady = false; // 유튜브를 불러왔는지
let videoFailed = false; // 유튜브를 못 불러와서 가짜 영상으로 바꿨는지

// 탭 아이콘 (유튜브: 빨간 재생 버튼, 엑셀: 초록 X)
const ICON_NORMAL = "data:image/svg+xml," + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect x="1" y="6" width="30" height="20" rx="6" fill="#f00"/><path d="M13 11v10l9-5z" fill="#fff"/></svg>');
const ICON_EXCEL = "data:image/svg+xml," + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect x="2" y="2" width="28" height="28" rx="4" fill="#217346"/><path d="M10 9l12 14M22 9L10 23" stroke="#fff" stroke-width="3.5"/></svg>');

// 탭 제목과 아이콘을 바꿉니다.
function setTab(present) {
  document.title = present ? TITLE_EXCEL : TITLE_NORMAL;
  document.getElementById("favicon").href = present ? ICON_EXCEL : ICON_NORMAL;
}

// 유튜브 주소에서 영상 ID(11글자)와 시작 시간(초)을 뽑습니다. 못 찾으면 null.
// 예: youtube.com/watch?v=ID&t=19s, youtu.be/ID?t=1m5s, youtube.com/shorts/ID, ID 만 입력
function parseVideo(text) {
  const s = (text || "").trim();
  let id = /^[\w-]{11}$/.test(s) ? s : null;
  if (!id) {
    const m = s.match(/(?:v=|youtu\.be\/|shorts\/|embed\/|live\/)([\w-]{11})/);
    if (m) id = m[1];
  }
  if (!id) return null;
  const t = s.match(/[?&](?:t|start)=(?:(\d+)h)?(?:(\d+)m)?(\d+)?s?/);
  const start = t ? (+t[1] || 0) * 3600 + (+t[2] || 0) * 60 + (+t[3] || 0) : 0;
  return { id, start };
}

// 브라우저에 기억해 둔 영상 주소를 읽습니다. (막혀 있으면 null)
function loadSavedVideo() {
  try { return localStorage.getItem(VIDEO_STORAGE_KEY); } catch (e) { return null; }
}

// 고른 영상 주소를 브라우저에 기억합니다.
function saveVideo(url) {
  try { localStorage.setItem(VIDEO_STORAGE_KEY, url); } catch (e) { /* 기억 못 해도 동작에는 문제없음 */ }
}

// 처음 띄울 영상: 주소의 ?video= → 지난번에 고른 영상 → 기본 영상
const initialVideo = parseVideo(params.get("video")) || parseVideo(loadSavedVideo()) || parseVideo(DEFAULT_VIDEO_URL);

// 시작 화면의 주소 입력칸을 처리합니다. 알맞은 주소면 그 영상으로 바꿉니다.
function onVideoUrlInput() {
  const text = document.getElementById("video-url").value;
  const msg = document.getElementById("video-msg");
  if (!text.trim()) { msg.textContent = ""; return; }
  const video = parseVideo(text);
  if (!video) { msg.textContent = "유튜브 주소를 알아볼 수 없습니다. 영상 주소를 다시 복사해 주세요."; return; }
  saveVideo(text.trim());
  msg.textContent = "영상을 바꿨습니다. 뒤 화면에서 영상을 확인하세요.";
  if (player && player.cueVideoById) player.cueVideoById({ videoId: video.id, startSeconds: video.start });
}

// 유튜브 플레이어 스크립트를 불러옵니다. 시간 안에 못 불러오면 가짜 영상으로 바꿉니다.
function loadYouTube() {
  const tag = document.createElement("script");
  tag.src = "https://www.youtube.com/iframe_api";
  tag.onerror = useFakeVideo;
  document.head.appendChild(tag);
  setTimeout(() => { if (!videoReady) useFakeVideo(); }, VIDEO_LOAD_TIMEOUT_MS);
}

// 유튜브 스크립트가 준비되면 자동으로 불립니다. 플레이어를 만듭니다.
window.onYouTubeIframeAPIReady = function () {
  player = new YT.Player("player", {
    videoId: initialVideo.id,
    playerVars: { rel: 0, playsinline: 1, start: initialVideo.start },
    events: { onReady: onVideoReady, onError: useFakeVideo, onStateChange: showVideoTitle },
  });
};

// 영상 아래에 제목을 표시합니다. 영상을 바꾸면 제목도 따라 바뀝니다.
function showVideoTitle() {
  const title = player && player.getVideoData ? player.getVideoData().title : "";
  if (title) document.getElementById("video-title").textContent = title;
}

// 영상을 불러왔을 때: 제목을 표시하고, 이미 시작했으면 재생합니다.
function onVideoReady() {
  if (videoFailed) return;
  videoReady = true;
  showVideoTitle();
  if (started && currentState !== STATE_PRESENT) player.playVideo();
}

// 유튜브를 못 쓸 때(불러오기 실패, 재생 오류) 가짜 영상 화면으로 바꿉니다.
function useFakeVideo() {
  if (videoFailed) return;
  videoFailed = true;
  videoReady = false;
  const frame = document.getElementById("player");
  if (frame) frame.remove();
  document.getElementById("fake-video").classList.remove("hidden");
  console.log("[web] 유튜브를 불러오지 못해 가짜 영상 화면을 씁니다.");
}

// 영상을 재생하거나 멈춥니다. 유튜브를 못 불러왔으면 아무것도 하지 않습니다.
function setVideoPlaying(playing) {
  if (!videoReady) return;
  if (playing) player.playVideo();
  else player.pauseVideo();
}

// 상태를 화면에 반영합니다. 상태가 바뀔 때만 영상·탭을 바꿉니다.
function applyState(state) {
  if (state === currentState) return;
  const present = state === STATE_PRESENT;
  excelView.classList.toggle("hidden", !present);
  normalView.classList.toggle("hidden", present);
  setTab(present);
  setVideoPlaying(!present);
  if (present) focusSheet();
  currentState = state;
}

// 서버에 현재 상태를 묻습니다. 실패하면 화면은 그대로 두고 연결 끊김을 표시합니다.
async function fetchState() {
  try {
    const res = await fetch(`${SERVER_URL}/api/status`);
    const data = await res.json();
    connText.textContent = "";
    return data.state;
  } catch (e) {
    connText.textContent = "서버 연결 끊김";
    return null;
  }
}

// 상태를 한 번 확인하고 화면을 바꿉니다.
async function poll() {
  const state = TEST_MODE ? testState : await fetchState();
  if (state) applyState(state);
}

// 테스트 모드 버튼과 키보드(Alt+1: 감지, Alt+2: 사라짐)를 연결합니다. 숫자만 누르면 셀 입력이라 Alt 를 같이 씁니다.
function setupTestMode() {
  testPanel.classList.remove("hidden");
  connText.textContent = "테스트 모드";
  const set = (state) => { testState = state; };
  document.getElementById("btn-present").onclick = () => set(STATE_PRESENT);
  document.getElementById("btn-absent").onclick = () => set(STATE_ABSENT);
  document.addEventListener("keydown", (e) => {
    if (!e.altKey) return;
    if (e.key === "1") { e.preventDefault(); set(STATE_PRESENT); }
    if (e.key === "2") { e.preventDefault(); set(STATE_ABSENT); }
  });
}

// 시작 버튼: 전체 화면 전환과 소리 있는 영상 재생은 브라우저가 클릭 한 번을 받아야 허락해서 둡니다.
// 누르면 전체 화면으로 바꿔 주소창을 숨기고 영상을 재생합니다.
function start() {
  started = true;
  startScreen.classList.add("hidden");
  document.documentElement.requestFullscreen().catch(() => console.log("[web] 전체 화면 전환 실패"));
  if (TEST_MODE) setupTestMode();
  poll();
  setInterval(poll, POLL_MS);
}

initSheet();
initRibbon();
setTab(false);
loadYouTube();
document.getElementById("video-url").addEventListener("input", onVideoUrlInput);
document.getElementById("btn-start").onclick = start;
