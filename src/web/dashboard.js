// 감지 기록 대시보드: 숫자 카드, 타임라인, 그래프, 기록 표를 2초마다 새로 그립니다.
// 새 감지 알림, 기록 필터, 엑셀(CSV) 내보내기, 발표용 크게 보기, 다크 모드를 지원합니다.
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
const TREND_DAYS = 7;
const TREND_CACHE_MS = 15000; // 최근 7일 추이는 자주 바뀌지 않아서 15초마다만 다시 받음
const TOAST_MS = 5000;
const TOAST_MAX = 3; // 알림은 최대 3개까지 보임
const PAGE_SIZE = 10; // 기록 표 한 페이지에 보이는 줄 수
const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

const dateInput = document.getElementById("date");
let sampleEvents = null; // 테스트 모드에서 쓰는 샘플 기록
let lastSeenId = null; // 새로 생긴 기록을 알리려고 마지막으로 본 번호를 기억
let filter = "all"; // 기록 표 필터
let page = 1; // 기록 표에서 보고 있는 페이지
let view = null; // 마지막으로 그린 데이터 (다시 그리기, 내보내기에 씀)
let trendCache = { date: null, at: 0, data: null };

// ---- 시간 도우미 ----

// 오늘 날짜를 한국 시간 기준 "2026-11-02" 형식으로 돌려줍니다.
function todayKst() {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });
}

// 날짜를 며칠 앞뒤로 옮깁니다. ("2026-11-02", -1) → "2026-11-01"
function shiftDate(date, days) {
  const d = new Date(`${date}T12:00:00+09:00`);
  d.setDate(d.getDate() + days);
  return d.toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });
}

// "2026-11-02T14:03:21+09:00" 에서 "14:03:21" 만 뽑습니다.
function timeOf(ts) {
  return ts ? ts.slice(11, 19) : "-";
}

// 시각 문자열을 그날 0시부터 지난 초로 바꿉니다.
function secOfDay(ts) {
  return +ts.slice(11, 13) * 3600 + +ts.slice(14, 16) * 60 + +ts.slice(17, 19);
}

// 지금 한국 시각을 그날 0시부터 지난 초로 돌려줍니다.
function nowSecKst() {
  return secOfDay(`0000-00-00T${new Date().toLocaleTimeString("sv-SE", { timeZone: "Asia/Seoul" })}`);
}

// 초를 "1분 5초", "1시간 2분" 처럼 바꿉니다.
function durationText(sec) {
  if (sec == null || isNaN(sec)) return "-";
  const s = Math.round(sec);
  if (s < 60) return `${s}초`;
  if (s < 3600) return `${Math.floor(s / 60)}분 ${s % 60}초`;
  return `${Math.floor(s / 3600)}시간 ${Math.floor((s % 3600) / 60)}분`;
}

// ---- 데이터 받기 ----

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
async function fetchDay(date) {
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

// 선택한 날짜까지 최근 7일의 날짜별 감지 횟수를 가져옵니다. 15초 동안은 저장해 둔 값을 씁니다.
async function fetchTrend(date) {
  if (trendCache.date === date && Date.now() - trendCache.at < TREND_CACHE_MS) return trendCache.data;
  const dates = Array.from({ length: TREND_DAYS }, (_, i) => shiftDate(date, i - TREND_DAYS + 1));
  let counts;
  if (TEST_MODE) {
    const all = await loadSample();
    counts = dates.map((d) => all.filter((e) => e.type === EVENT_DETECTED && e.timestamp.startsWith(d)).length);
  } else {
    counts = (await Promise.all(dates.map((d) => getJson(`/api/stats?date=${d}`)))).map((s) => s.count);
  }
  trendCache = { date, at: Date.now(), data: { dates, counts } };
  return trendCache.data;
}

// ---- 계산 ----

// 감지 → 그 다음 사라짐을 묶어 '머문 구간' 목록을 만듭니다. 아직 안 사라졌으면 end 가 null.
function buildVisits(events) {
  const visits = [];
  let open = null;
  for (const e of events) {
    if (e.type === EVENT_DETECTED) {
      open = { id: e.id, startTs: e.timestamp, endTs: null, confidence: e.confidence };
      visits.push(open);
    } else if (e.type === EVENT_LEFT && open) {
      open.endTs = e.timestamp;
      open = null;
    }
  }
  visits.forEach((v) => { v.stay = v.endTs ? (new Date(v.endTs) - new Date(v.startTs)) / 1000 : null; });
  return visits;
}

// 시간대(0~23시)별 감지 횟수
function hourlyCounts(events) {
  const counts = Array(24).fill(0);
  events.filter((e) => e.type === EVENT_DETECTED).forEach((e) => { counts[+e.timestamp.slice(11, 13)] += 1; });
  return counts;
}

// ---- 그리기 ----

// 숫자 카드(주요 4개 + 추가 4개)를 채웁니다.
function renderKpis(day, visits, hourly) {
  const set = (id, text) => { document.getElementById(id).textContent = text; };
  set("kpi-count", `${day.count}회`);
  set("kpi-count-sub", dateInput.value);

  const stateEl = document.getElementById("kpi-state");
  const present = day.status && day.status.state === STATE_PRESENT;
  stateEl.innerHTML = `<span class="pulse"></span>${present ? "사람 있음" : "사람 없음"}`;
  stateEl.className = `kpi-value state ${present ? "present" : "absent"}`;
  document.getElementById("kpi-state-card").classList.toggle("is-present", !!present);
  set("kpi-state-sub", day.status && day.status.since ? `${timeOf(day.status.since)}부터` : "");

  const last = visits[visits.length - 1];
  set("kpi-last", last ? timeOf(last.startTs).slice(0, 5) : "-");
  set("kpi-last-sub", last && last.confidence != null ? `신뢰도 ${Math.round(last.confidence * 100)}%` : "");

  const done = visits.filter((v) => v.stay != null);
  const total = done.reduce((a, v) => a + v.stay, 0);
  set("kpi-stay", done.length ? durationText(total / done.length) : "-");

  const peak = Math.max(...hourly);
  const peakHour = hourly.indexOf(peak);
  set("kpi-peak", peak ? `${peakHour}시대 (${peak}회)` : "-");

  const longest = done.reduce((m, v) => (!m || v.stay > m.stay ? v : m), null);
  set("kpi-longest", longest ? `${durationText(longest.stay)} (${timeOf(longest.startTs).slice(0, 5)})` : "-");

  set("kpi-total", done.length ? durationText(total) : "-");

  const confs = visits.map((v) => v.confidence).filter((c) => c != null);
  set("kpi-conf", confs.length ? `${Math.round((confs.reduce((a, b) => a + b, 0) / confs.length) * 100)}%` : "-");
}

// 오늘의 타임라인을 그립니다. 머무는 중인 구간은 지금 시각까지 이어서 그립니다.
function renderTimeline(visits, date) {
  const isToday = date === todayKst();
  const now = isToday ? nowSecKst() : null;
  const spans = visits.map((v) => {
    const start = secOfDay(v.startTs);
    const end = v.endTs ? secOfDay(v.endTs) : (isToday ? now : start);
    return { start, end: Math.max(start, end), live: !v.endTs && isToday };
  });
  drawTimeline(document.getElementById("timeline"), spans, now, { height: document.body.classList.contains("big") ? 110 : 78 });
}

// 기록 표를 최신순으로 그립니다. 필터를 따르고, 한 페이지에 10줄씩, 새로 생긴 기록은 잠깐 강조합니다.
function renderTable(events, visits, newIds) {
  const stays = Object.fromEntries(visits.map((v) => [v.id, v.stay]));
  const shown = [...events].reverse().filter((e) => filter === "all" || e.type === filter);
  const pages = Math.max(1, Math.ceil(shown.length / PAGE_SIZE));
  page = Math.min(page, pages);
  const pageRows = shown.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  renderPager(pages);
  document.getElementById("rows").innerHTML = pageRows.map((e) => {
    const detected = e.type === EVENT_DETECTED;
    const live = detected && stays[e.id] == null;
    const stay = detected ? (live ? '<span class="tag live"><span class="pulse"></span>머무는 중</span>' : durationText(stays[e.id])) : "";
    const icon = detected ? ICON_DETECTED : ICON_LEFT;
    return `<tr class="${newIds.has(e.id) ? "new" : ""}">
      <td class="id">${e.id}</td>
      <td><span class="tag ${detected ? "present" : "absent"}">${icon}${detected ? "사람 감지" : "사람 사라짐"}</span></td>
      <td class="time">${timeOf(e.timestamp)}</td>
      <td class="num">${confidenceCell(e.confidence)}</td>
      <td class="num">${stay}</td>
    </tr>`;
  }).join("");
  document.getElementById("empty").classList.toggle("hidden", shown.length > 0);
  document.getElementById("table-count").textContent = filter === "all" ? `${events.length}건` : `${shown.length}건 / 전체 ${events.length}건`;
}

// 기록 표 뱃지 아이콘 (사람 감지: 사람, 사람 사라짐: 나가는 화살표)
const ICON_DETECTED = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="3.5"/><path d="M5 20a7 7 0 0114 0"/></svg>';
const ICON_LEFT = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 4H5v16h5M15 8l4 4-4 4M19 12H9"/></svg>';

// 신뢰도 칸: 숫자와 작은 막대로 보여줍니다. 값이 없으면 "-".
function confidenceCell(c) {
  if (c == null) return '<span class="muted">-</span>';
  const pct = Math.round(c * 100);
  return `<span class="conf"><span class="conf-bar"><i style="width:${pct}%"></i></span>${pct}%</span>`;
}

// 표 아래 페이지 번호(이전 1 2 3 다음)를 그립니다. 한 페이지뿐이면 숨깁니다.
function renderPager(pages) {
  const nav = document.getElementById("pager");
  if (pages <= 1) { nav.innerHTML = ""; return; }
  let html = `<button data-page="${page - 1}" ${page === 1 ? "disabled" : ""} aria-label="이전 페이지">&lsaquo;</button>`;
  for (let p = 1; p <= pages; p++) html += `<button data-page="${p}" class="${p === page ? "on" : ""}">${p}</button>`;
  html += `<button data-page="${page + 1}" ${page === pages ? "disabled" : ""} aria-label="다음 페이지">&rsaquo;</button>`;
  nav.innerHTML = html;
}

// 그래프 두 개와 타임라인을 다시 그립니다. (창 크기·크게 보기가 바뀔 때도 부름)
function redrawCharts() {
  if (!view) return;
  const big = document.body.classList.contains("big");
  const hourLabels = Array.from({ length: 24 }, (_, h) => `${h}시`);
  drawColumns(document.getElementById("chart"), hourLabels, view.hourly, { height: big ? 320 : 240, labelEvery: 3, values: "all", barMax: 16 });
  if (view.trend) {
    const labels = view.trend.dates.map((d) => `${+d.slice(5, 7)}/${+d.slice(8, 10)}`);
    drawColumns(document.getElementById("trend"), labels, view.trend.counts, { height: big ? 320 : 240, highlight: TREND_DAYS - 1, values: "all", trend: true, barMax: 26 });
  }
  renderTimeline(view.visits, view.date);
}

// ---- 새 감지 알림 ----

// 오른쪽 위에 알림을 잠깐 띄웁니다.
function showToast(event) {
  const box = document.getElementById("toasts");
  const el = document.createElement("div");
  el.className = "toast";
  const conf = event.confidence != null ? ` · 신뢰도 ${Math.round(event.confidence * 100)}%` : "";
  el.innerHTML = `<span class="toast-dot"></span><div><b>사람이 감지되었습니다</b><small>${timeOf(event.timestamp)}${conf}</small></div>`;
  box.prepend(el);
  [...box.children].slice(TOAST_MAX).forEach((old) => old.remove()); // 한꺼번에 많이 오면 최근 것만 남김
  setTimeout(() => el.classList.add("out"), TOAST_MS);
  setTimeout(() => el.remove(), TOAST_MS + 400);
}

// ---- 한 번 새로 받아서 그리기 ----

// 데이터를 새로 받아 화면 전체를 다시 그립니다. 실패하면 마지막 화면을 두고 연결 끊김을 표시합니다.
async function refresh() {
  const conn = document.getElementById("conn");
  const date = dateInput.value;
  try {
    const [day, trend] = await Promise.all([fetchDay(date), fetchTrend(date)]);
    const visits = buildVisits(day.events);
    const hourly = hourlyCounts(day.events);
    const newIds = new Set(lastSeenId === null ? [] : day.events.filter((e) => e.id > lastSeenId).map((e) => e.id));
    day.events.filter((e) => newIds.has(e.id) && e.type === EVENT_DETECTED).forEach(showToast);
    lastSeenId = day.events.reduce((m, e) => Math.max(m, e.id), lastSeenId ?? 0);

    view = { date, events: day.events, visits, hourly, trend };
    renderKpis(day, visits, hourly);
    renderTable(day.events, visits, newIds);
    redrawCharts();
    conn.textContent = TEST_MODE ? "테스트 모드 (샘플 데이터)" : "";
    conn.classList.remove("bad");
    document.getElementById("updated").textContent = `마지막 갱신 ${new Date().toLocaleTimeString("sv-SE", { timeZone: "Asia/Seoul" })}`;
  } catch (e) {
    conn.textContent = "서버 연결 끊김";
    conn.classList.add("bad");
  }
}

// ---- 버튼들 ----

// 브라우저에 설정을 기억합니다. (막혀 있어도 동작에는 문제없음)
function saveSetting(key, value) {
  try { localStorage.setItem(key, value); } catch (e) { /* 무시 */ }
}

// 오른쪽 위 버튼: 밝은 화면 ↔ 어두운 화면을 바꾸고 기억합니다.
function setupThemeToggle() {
  const btn = document.getElementById("theme-toggle");
  const sync = () => {
    const dark = document.documentElement.dataset.theme === "dark";
    btn.setAttribute("aria-label", dark ? "밝은 화면으로" : "다크 모드 켜기");
    btn.title = dark ? "밝은 화면" : "다크 모드";
  };
  btn.addEventListener("click", () => {
    const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    saveSetting("dda-theme", next);
    sync();
  });
  sync();
}

// 크게 보기: 표를 숨기고 카드·그래프만 크게, 전체 화면으로 보여줍니다. Esc 로 나갑니다.
function setupBigMode() {
  const btn = document.getElementById("big-toggle");
  const setBig = (on) => {
    document.body.classList.toggle("big", on);
    btn.querySelector("span").textContent = on ? "원래대로" : "크게 보기";
    redrawCharts();
  };
  btn.addEventListener("click", () => {
    const on = !document.body.classList.contains("big");
    setBig(on);
    if (on && !document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => {});
    if (!on && document.fullscreenElement) document.exitFullscreen().catch(() => {});
  });
  document.addEventListener("fullscreenchange", () => { if (!document.fullscreenElement) setBig(false); });
}

// 기록 표 필터 (전체 / 감지만 / 사라짐만)
function setupFilter() {
  const buttons = document.querySelectorAll(".seg button");
  buttons.forEach((b) => b.addEventListener("click", () => {
    filter = b.dataset.filter;
    page = 1;
    buttons.forEach((x) => x.classList.toggle("on", x === b));
    if (view) renderTable(view.events, view.visits, new Set());
  }));
}

// 페이지 번호를 누르면 그 페이지를 보여줍니다.
function setupPager() {
  document.getElementById("pager").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-page]");
    if (!b || b.disabled || !view) return;
    page = +b.dataset.page;
    renderTable(view.events, view.visits, new Set());
  });
}

// 엑셀로 내보내기: 지금 날짜의 기록을 CSV 파일로 받습니다. (엑셀에서 한글이 깨지지 않게 BOM 을 붙임)
function setupCsv() {
  document.getElementById("csv").addEventListener("click", () => {
    if (!view) return;
    const stays = Object.fromEntries(view.visits.map((v) => [v.id, v.stay]));
    const lines = [["번호", "종류", "시각", "신뢰도(%)", "머문 시간(초)"].join(",")];
    view.events.forEach((e) => {
      const detected = e.type === EVENT_DETECTED;
      lines.push([
        e.id,
        detected ? "사람 감지" : "사람 사라짐",
        e.timestamp,
        e.confidence != null ? Math.round(e.confidence * 100) : "",
        detected && stays[e.id] != null ? Math.round(stays[e.id]) : "",
      ].join(","));
    });
    const blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `감지기록_${view.date}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  });
}

// 그래프 툴팁을 연결합니다.
function setupTooltips() {
  attachTooltip(document.getElementById("chart"), document.getElementById("chart-tip"),
    (i) => (view ? `${i}시 ~ ${i + 1}시: ${view.hourly[i]}회` : null));
  attachTooltip(document.getElementById("trend"), document.getElementById("trend-tip"), (i) => {
    if (!view || !view.trend) return null;
    const d = view.trend.dates[i];
    const wd = WEEKDAYS[new Date(`${d}T12:00:00+09:00`).getDay()];
    return `${+d.slice(5, 7)}월 ${+d.slice(8, 10)}일 (${wd}): ${view.trend.counts[i]}회`;
  });
  attachTooltip(document.getElementById("timeline"), document.getElementById("timeline-tip"), (i) => {
    const v = view && view.visits[i];
    if (!v) return null;
    if (!v.endTs) return `${timeOf(v.startTs)} ~ 지금 (머무는 중)`;
    return `${timeOf(v.startTs)} ~ ${timeOf(v.endTs)} (${durationText(v.stay)})`;
  });
}

// 처음 열 때: 날짜를 정하고, 2초마다 새로 받습니다. 테스트 모드면 샘플이 있는 날짜로 시작합니다.
async function initDashboard() {
  setupThemeToggle();
  setupBigMode();
  setupFilter();
  setupPager();
  setupCsv();
  setupTooltips();
  dateInput.value = TEST_MODE ? (await loadSample())[0].timestamp.slice(0, 10) : todayKst();
  dateInput.addEventListener("change", () => { lastSeenId = null; page = 1; refresh(); });
  window.addEventListener("resize", redrawCharts);
  await refresh();
  setInterval(refresh, DASHBOARD_POLL_MS);
}

initDashboard();
