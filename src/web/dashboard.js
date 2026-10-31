// 감지 기록 대시보드: 날짜별 감지 횟수, 현재 상태, 시간대별 그래프, 기록 표를 2초마다 새로 그립니다.
// 규격: docs/design.md 3번, 4번 (GET /api/events?date=, GET /api/stats?date=, GET /api/status)

// 서버 없이 볼 때 쓰는 샘플 (data/sample_events.json 을 못 읽으면 이 값을 씁니다)
const FALLBACK_EVENTS = [
  { id: 1, type: "person_detected", timestamp: "2026-11-02T14:03:21+09:00", confidence: 0.87 },
  { id: 2, type: "person_left", timestamp: "2026-11-02T14:03:40+09:00", confidence: null },
  { id: 3, type: "person_detected", timestamp: "2026-11-02T14:10:05+09:00", confidence: 0.92 },
  { id: 4, type: "person_left", timestamp: "2026-11-02T14:10:31+09:00", confidence: null },
];
const EVENT_DETECTED = "person_detected";
const EVENT_LEFT = "person_left";

const dateInput = document.getElementById("date");
let sampleEvents = null; // 테스트 모드에서 쓰는 샘플 기록
let lastSeenId = null; // 새로 생긴 기록을 강조하려고 마지막으로 본 번호를 기억

// 오늘 날짜를 한국 시간 기준 "2026-11-02" 형식으로 돌려줍니다.
function todayKst() {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });
}

// "2026-11-02T14:03:21+09:00" 에서 "14:03:21" 만 뽑습니다.
function timeOf(ts) {
  return ts ? ts.slice(11, 19) : "-";
}

// 초를 "1분 5초" 처럼 바꿉니다.
function durationText(sec) {
  if (sec == null || isNaN(sec)) return "-";
  const s = Math.round(sec);
  return s < 60 ? `${s}초` : `${Math.floor(s / 60)}분 ${s % 60}초`;
}

// 서버에서 JSON 을 받아 옵니다.
async function getJson(path) {
  const res = await fetch(`${SERVER_URL}${path}`);
  if (!res.ok) throw new Error(res.status);
  return res.json();
}

// 테스트 모드용 샘플 기록을 읽습니다. 레포의 data/sample_events.json 을 먼저 시도합니다.
async function loadSample() {
  if (sampleEvents) return sampleEvents;
  try {
    const res = await fetch("../../data/sample_events.json");
    sampleEvents = await res.json();
  } catch (e) {
    sampleEvents = FALLBACK_EVENTS;
  }
  return sampleEvents;
}

// 선택한 날짜의 기록·횟수·현재 상태를 가져옵니다. 테스트 모드면 샘플로 만듭니다.
async function fetchData(date) {
  if (TEST_MODE) {
    const events = (await loadSample()).filter((e) => e.timestamp.startsWith(date));
    const last = events[events.length - 1];
    return {
      events,
      count: events.filter((e) => e.type === EVENT_DETECTED).length,
      status: { state: last && last.type === EVENT_DETECTED ? STATE_PRESENT : STATE_ABSENT, since: last ? last.timestamp : null },
    };
  }
  const [events, stats, status] = await Promise.all([
    getJson(`/api/events?date=${date}`),
    getJson(`/api/stats?date=${date}`),
    getJson("/api/status"),
  ]);
  return { events, count: stats.count, status };
}

// 감지마다 머문 시간(감지 → 그 다음 사라짐)을 계산합니다. { 감지 번호: 초 }
function stayTimes(events) {
  const stays = {};
  let open = null;
  for (const e of events) {
    if (e.type === EVENT_DETECTED) open = e;
    else if (e.type === EVENT_LEFT && open) {
      stays[open.id] = (new Date(e.timestamp) - new Date(open.timestamp)) / 1000;
      open = null;
    }
  }
  return stays;
}

// 숫자 카드 4개를 채웁니다.
function renderKpis(data, stays) {
  const detected = data.events.filter((e) => e.type === EVENT_DETECTED);
  document.getElementById("kpi-count").textContent = `${data.count}회`;
  document.getElementById("kpi-count-sub").textContent = dateInput.value;

  const stateEl = document.getElementById("kpi-state");
  const present = data.status && data.status.state === STATE_PRESENT;
  stateEl.textContent = present ? "사람 있음" : "사람 없음";
  stateEl.className = `kpi-value state ${present ? "present" : "absent"}`;
  document.getElementById("kpi-state-sub").textContent = data.status && data.status.since ? `${timeOf(data.status.since)}부터` : "";

  const last = detected[detected.length - 1];
  document.getElementById("kpi-last").textContent = last ? timeOf(last.timestamp).slice(0, 5) : "-";
  document.getElementById("kpi-last-sub").textContent = last && last.confidence != null ? `신뢰도 ${Math.round(last.confidence * 100)}%` : "";

  const values = Object.values(stays);
  document.getElementById("kpi-stay").textContent = values.length ? durationText(values.reduce((a, b) => a + b, 0) / values.length) : "-";
}

// 그래프 눈금 최댓값을 보기 좋은 수(1, 2, 5, 10, 20 ...)로 올립니다.
function niceMax(n) {
  if (n <= 4) return 4;
  const step = [1, 2, 5].map((m) => m * 10 ** Math.floor(Math.log10(n / 4))).find((s) => s * 4 >= n) || 10 ** Math.ceil(Math.log10(n));
  return step * 4;
}

// 시간대별(0~23시) 감지 횟수 막대그래프를 그립니다. 막대에 마우스를 올리면 툴팁을 보여줍니다.
function renderChart(events) {
  const counts = Array(24).fill(0);
  events.filter((e) => e.type === EVENT_DETECTED).forEach((e) => { counts[+e.timestamp.slice(11, 13)] += 1; });

  const svg = document.getElementById("chart");
  const W = svg.clientWidth || 800;
  const H = 220;
  const pad = { l: 32, r: 8, t: 18, b: 24 };
  const plotW = W - pad.l - pad.r;
  const plotH = H - pad.t - pad.b;
  const band = plotW / 24;
  const barW = Math.min(24, band * 0.6);
  const max = niceMax(Math.max(...counts));
  const y = (v) => pad.t + plotH - (v / max) * plotH;
  const peak = Math.max(...counts);

  let html = "";
  for (let i = 0; i <= 4; i++) {
    const v = (max / 4) * i;
    html += `<line class="grid" x1="${pad.l}" x2="${W - pad.r}" y1="${y(v)}" y2="${y(v)}" />`;
    html += `<text class="axis-text" x="${pad.l - 6}" y="${y(v) + 4}" text-anchor="end">${v}</text>`;
  }
  counts.forEach((c, h) => {
    const cx = pad.l + band * h + band / 2;
    if (h % 3 === 0) html += `<text class="axis-text" x="${cx}" y="${H - 6}" text-anchor="middle">${h}시</text>`;
    html += `<rect class="hit" data-h="${h}" x="${cx - band / 2}" y="${pad.t}" width="${band}" height="${plotH}" />`;
    if (c > 0) {
      const top = y(c);
      const r = Math.min(4, (pad.t + plotH - top) / 2);
      const x0 = cx - barW / 2;
      const x1 = cx + barW / 2;
      const base = pad.t + plotH;
      html += `<path class="bar" data-h="${h}" d="M${x0},${base} V${top + r} Q${x0},${top} ${x0 + r},${top} H${x1 - r} Q${x1},${top} ${x1},${top + r} V${base} Z" />`;
      if (c === peak) html += `<text class="value-text" x="${cx}" y="${top - 5}" text-anchor="middle">${c}</text>`;
    }
  });
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  svg.innerHTML = html;
  svg.dataset.counts = JSON.stringify(counts);
}

// 그래프 위에서 마우스 위치에 맞는 시간대의 툴팁을 보여줍니다.
function setupTooltip() {
  const svg = document.getElementById("chart");
  const tip = document.getElementById("tooltip");
  svg.addEventListener("mousemove", (e) => {
    const hit = e.target.closest("[data-h]");
    svg.querySelectorAll(".bar.hover").forEach((b) => b.classList.remove("hover"));
    if (!hit) { tip.classList.add("hidden"); return; }
    const h = +hit.dataset.h;
    const counts = JSON.parse(svg.dataset.counts || "[]");
    const bar = svg.querySelector(`.bar[data-h="${h}"]`);
    if (bar) bar.classList.add("hover");
    const box = svg.getBoundingClientRect();
    tip.textContent = `${h}시 ~ ${h + 1}시: ${counts[h] || 0}회`;
    tip.style.left = `${e.clientX - box.left}px`;
    tip.style.top = `${e.clientY - box.top - 10}px`;
    tip.classList.remove("hidden");
  });
  svg.addEventListener("mouseleave", () => {
    tip.classList.add("hidden");
    svg.querySelectorAll(".bar.hover").forEach((b) => b.classList.remove("hover"));
  });
}

// 기록 표를 최신순으로 그립니다. 지난번 이후 새로 생긴 기록은 잠깐 강조합니다.
function renderTable(events, stays) {
  const rows = [...events].reverse().map((e) => {
    const detected = e.type === EVENT_DETECTED;
    const isNew = lastSeenId !== null && e.id > lastSeenId;
    return `<tr class="${isNew ? "new" : ""}">
      <td>${e.id}</td>
      <td><span class="tag ${detected ? "present" : "absent"}">${detected ? "사람 감지" : "사람 사라짐"}</span></td>
      <td>${timeOf(e.timestamp)}</td>
      <td class="num">${e.confidence != null ? Math.round(e.confidence * 100) + "%" : "-"}</td>
      <td class="num">${detected ? (stays[e.id] == null ? "머무는 중" : durationText(stays[e.id])) : ""}</td>
    </tr>`;
  });
  document.getElementById("rows").innerHTML = rows.join("");
  document.getElementById("empty").classList.toggle("hidden", events.length > 0);
  document.getElementById("table-count").textContent = `${events.length}건`;
  const maxId = events.reduce((m, e) => Math.max(m, e.id), lastSeenId ?? 0);
  lastSeenId = maxId;
}

// 한 번 새로 받아서 화면 전체를 다시 그립니다. 실패하면 마지막 화면을 두고 연결 끊김을 표시합니다.
async function refresh() {
  const conn = document.getElementById("conn");
  try {
    const data = await fetchData(dateInput.value);
    const stays = stayTimes(data.events);
    renderKpis(data, stays);
    renderChart(data.events);
    renderTable(data.events, stays);
    conn.textContent = TEST_MODE ? "테스트 모드 (샘플 데이터)" : "";
    conn.classList.remove("bad");
    document.getElementById("updated").textContent = `마지막 갱신 ${new Date().toLocaleTimeString("sv-SE", { timeZone: "Asia/Seoul" })}`;
  } catch (e) {
    conn.textContent = "서버 연결 끊김";
    conn.classList.add("bad");
  }
}

// 처음 열 때: 날짜를 정하고, 2초마다 새로 받습니다. 테스트 모드면 샘플이 있는 날짜로 시작합니다.
async function initDashboard() {
  dateInput.value = TEST_MODE ? (await loadSample())[0].timestamp.slice(0, 10) : todayKst();
  dateInput.addEventListener("change", () => { lastSeenId = null; refresh(); });
  window.addEventListener("resize", refresh);
  setupTooltip();
  await refresh();
  setInterval(refresh, DASHBOARD_POLL_MS);
}

initDashboard();
