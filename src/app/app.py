"""언더커버 앱 — 내 자리에 누가 오면 알려 주고, 위장 모드에서는 평범한 캘린더처럼 보입니다.

규격: docs/design.md ④ (GET /api/events, GET /api/stats, 2초마다)
화면 설계: src/app/SCREEN.md
서버에 연결이 안 되면 data/sample_events.json 을 오늘 날짜로 바꿔 보여줍니다 (테스트 모드).
"""
import json
import os
import sys
from datetime import date, datetime, timedelta

import requests
import streamlit as st

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, os.path.dirname(__file__))
from common.protocol import (  # noqa: E402
    APP_POLL_SEC,
    EVENT_PERSON_DETECTED,
    EVENT_PERSON_LEFT,
    KST,
    server_url,
)
from visits import (  # noqa: E402
    count_detections,
    current_state,
    events_on,
    group_visits,
    last_event_time,
    newest_detection,
    parse_time,
    quiet_minutes,
)

APP_DIR = os.path.dirname(__file__)
SAMPLE_FILE = os.path.join(APP_DIR, "..", "..", "data", "sample_events.json")
STYLE_FILE = os.path.join(APP_DIR, "style.css")
CONNECT_TIMEOUT_SEC = 0.5  # 서버에 연결될 때까지 기다리는 최대 시간 (서버가 꺼져 있으면 빨리 포기)
READ_TIMEOUT_SEC = 1.0     # 연결된 뒤 응답을 기다리는 최대 시간 (확인 주기 2초보다 짧게)
WEEKDAYS = ["월", "화", "수", "목", "금", "토", "일"]
WEEK_HEADER = ["일", "월", "화", "수", "목", "금", "토"]

MASK_SVG = (
    '<svg width="28" height="28" viewBox="0 0 28 28"><circle cx="14" cy="14" r="14" fill="#1F2329"/>'
    '<path d="M7 11.5c2.5-1.6 11.5-1.6 14 0-.3 4.3-2.7 7-7 7s-6.7-2.7-7-7z" fill="#fff"/>'
    '<ellipse cx="11" cy="13.6" rx="1.6" ry="1.1" fill="#1F2329"/>'
    '<ellipse cx="17" cy="13.6" rx="1.6" ry="1.1" fill="#1F2329"/></svg>'
)


# ---------- 시간·글자 형식 ----------

def now_kst():
    """한국 시간 기준 지금 시각을 돌려줍니다."""
    return datetime.now(KST)


def today_kst():
    """한국 시간 기준 오늘 날짜를 돌려줍니다."""
    return now_kst().date()


def fmt_day(day):
    """날짜를 '11월 2일 (월)' 형식으로 바꿉니다."""
    return f"{day.month}월 {day.day}일 ({WEEKDAYS[day.weekday()]})"


def fmt_duration(seconds):
    """머문 시간을 '26초' 또는 '2분 5초' 형식으로 바꿉니다."""
    if seconds is None:
        return "-"
    if seconds < 60:
        return f"{seconds}초"
    return f"{seconds // 60}분 {seconds % 60}초"


def week_start(day):
    """그 날짜가 들어 있는 주의 일요일을 돌려줍니다."""
    return day - timedelta(days=(day.weekday() + 1) % 7)


# ---------- 데이터 가져오기 ----------

def load_sample_events():
    """샘플 이벤트를 읽고, 날짜를 오늘로 바꿔 돌려줍니다. (오늘 화면에서 바로 보이게)"""
    with open(SAMPLE_FILE, encoding="utf-8") as f:
        events = json.load(f)
    today = today_kst().isoformat()
    for e in events:
        e["timestamp"] = today + e["timestamp"][10:]
    return events


def fetch_json(path, day):
    """서버에 GET 요청을 보내 JSON 을 돌려줍니다. 연결이 안 되면 None."""
    try:
        res = requests.get(server_url(path), params={"date": day.isoformat()}, timeout=(CONNECT_TIMEOUT_SEC, READ_TIMEOUT_SEC))
        res.raise_for_status()
        return res.json()
    except (requests.RequestException, ValueError):
        return None


def fetch_events(day):
    """서버에서 그날 이벤트 목록을 가져옵니다. 연결이 안 되면 None."""
    events = fetch_json("/api/events", day)
    return events if isinstance(events, list) else None


def fetch_count(day):
    """서버에서 그날 감지 횟수를 가져옵니다. 실패하면 None."""
    stats = fetch_json("/api/stats", day)
    if isinstance(stats, dict) and isinstance(stats.get("count"), int):
        return stats["count"]
    return None


@st.cache_data(ttl=60, show_spinner=False)
def fetch_past_count(day_iso):
    """지난 날짜의 감지 횟수 (자주 안 바뀌므로 60초 동안 기억해 둡니다)."""
    return fetch_count(date.fromisoformat(day_iso))


def get_events(day, connected):
    """그날 이벤트를 서버(연결됨) 또는 샘플(연결 안 됨)에서 가져옵니다."""
    if connected:
        events = fetch_events(day)
        if events is not None:
            return events_on(events, day)
    return events_on(st.session_state.sample_events, day)


def get_count(day, events, connected):
    """그날 감지 횟수. 서버 값이 없으면 목록에서 셉니다."""
    if connected:
        count = fetch_count(day) if day == today_kst() else fetch_past_count(day.isoformat())
        if count is not None:
            return count
    return count_detections(events)


def month_counts(month_first, connected):
    """달력에 표시할 날짜별 감지 횟수를 돌려줍니다. 오늘 이후는 계산하지 않습니다."""
    counts = {}
    for day in month_grid_days(month_first):
        if day > today_kst():
            break
        if connected and day != today_kst():
            counts[day] = fetch_past_count(day.isoformat()) or 0
        else:
            counts[day] = count_detections(get_events(day, connected))
    return counts


def month_grid_days(month_first):
    """달력에 그릴 날짜 목록: 그달 1일이 있는 주의 일요일부터 말일이 있는 주의 토요일까지."""
    next_first = (month_first + timedelta(days=32)).replace(day=1)
    last_day = next_first - timedelta(days=1)
    day, end = week_start(month_first), week_start(last_day) + timedelta(days=6)
    days = []
    while day <= end:
        days.append(day)
        day += timedelta(days=1)
    return days


# ---------- 상태 바꾸기 (버튼 콜백) ----------

def toggle_disguise():
    """위장 모드를 켜거나 끕니다."""
    st.session_state.disguise = not st.session_state.disguise
    st.session_state.month_open = False


def go_tab(tab):
    """아래 탭(home / log)을 바꿉니다."""
    st.session_state.tab = tab
    st.session_state.month_open = False


def select_day(day):
    """기록·캘린더에서 볼 날짜를 고릅니다."""
    st.session_state.day = day
    st.session_state.month = day.replace(day=1)


def set_month_open(is_open):
    """한 달 달력 화면을 펼치거나 접습니다."""
    st.session_state.month_open = is_open
    st.session_state.month = st.session_state.day.replace(day=1)


def pick_from_month(day):
    """한 달 달력에서 날짜를 누르면 그날을 고르고 달력을 접습니다."""
    select_day(day)
    st.session_state.month_open = False


def move_month(step):
    """달력의 달을 앞뒤로 옮깁니다."""
    first = st.session_state.month
    year, month = divmod(first.year * 12 + first.month - 1 + step, 12)
    st.session_state.month = date(year, month + 1, 1)


def add_fake_event(event_type):
    """테스트용: 샘플 데이터에 지금 시각의 가짜 이벤트를 하나 추가합니다."""
    events = st.session_state.sample_events
    events.append({
        "id": max((e["id"] for e in events), default=0) + 1,
        "type": event_type,
        "timestamp": now_kst().isoformat(timespec="seconds"),
        "confidence": 0.9 if event_type == EVENT_PERSON_DETECTED else None,
    })


def check_new_detection(today_events):
    """마지막으로 본 id 보다 큰 person_detected 가 있으면 알림을 띄웁니다."""
    newest = newest_detection(today_events)
    if newest is None:
        return
    last_seen_id = st.session_state.get("last_seen_id")
    # 처음 열었을 때는 이미 있던 기록이므로 알림 없이 기억만 합니다.
    if last_seen_id is not None and newest["id"] > last_seen_id:
        at = parse_time(newest["timestamp"]).strftime("%H:%M")
        message = f"회의 시작 {at}" if st.session_state.disguise else f"누가 왔어요! {at}"
        st.toast(message)
    if last_seen_id is None or newest["id"] > last_seen_id:
        st.session_state.last_seen_id = newest["id"]


# ---------- 공통 화면 조각 ----------

def html(markup):
    """HTML 조각을 화면에 그립니다."""
    st.markdown(markup, unsafe_allow_html=True)


def render_header(title_html, alert_dot):
    """맨 위: 왼쪽 제목, 오른쪽 위장 모드 버튼."""
    with st.container(key="row_header"):
        left, right = st.columns([3, 2], vertical_alignment="center")
        with left:
            html(title_html)
        with right:
            with st.container(key="modewrap_alert" if alert_dot else "modewrap"):
                st.button(
                    "위장 모드", key="mode_btn", icon=":material/shield:",
                    type="primary" if st.session_state.disguise else "secondary",
                    on_click=toggle_disguise,
                )


def render_banner(connected):
    """서버 연결이 안 되면 위쪽에 한 줄로 알립니다."""
    if connected:
        return
    text = "동기화 안 됨" if st.session_state.disguise else "서버 연결 안 됨 · 샘플 데이터"
    html(f'<div class="banner">{text}</div>')


def render_week(prefix):
    """이번 주 날짜 줄. 날짜를 누르면 그날을 고릅니다."""
    selected, today = st.session_state.day, today_kst()
    html('<div class="weekhead">' + "".join(f"<span>{d}</span>" for d in WEEK_HEADER) + "</div>")
    with st.container(key=f"row_week_{prefix}"):
        for col, offset in zip(st.columns(7), range(7)):
            day = week_start(selected) + timedelta(days=offset)
            with col:
                st.button(
                    str(day.day), key=f"d_{prefix}_w_{day.isoformat()}",
                    type="primary" if day == selected else "secondary",
                    disabled=day > today, on_click=select_day, args=(day,),
                )
    st.button("달력 펼치기", key=f"handle_open_{prefix}", icon=":material/expand_more:",
              on_click=set_month_open, args=(True,))


def render_month(prefix, connected, word):
    """한 달 달력 화면. 날짜 밑에 그날 횟수를 작게 보여주고, 누르면 그날로 돌아갑니다."""
    first, today = st.session_state.month, today_kst()
    with st.container(key=f"row_mnav_{prefix}"):
        prev_col, title_col, next_col = st.columns([1, 4, 1], vertical_alignment="center")
        prev_col.button("‹", key=f"mnav_{prefix}_prev", on_click=move_month, args=(-1,))
        title_col.markdown(f'<div class="month-title">{first.year}년 {first.month}월</div>', unsafe_allow_html=True)
        next_col.button(
            "›", key=f"mnav_{prefix}_next",
            disabled=first >= today.replace(day=1), on_click=move_month, args=(1,),
        )
    html('<div class="weekhead">' + "".join(f"<span>{d}</span>" for d in WEEK_HEADER) + "</div>")
    counts = month_counts(first, connected)
    days = month_grid_days(first)
    for week in range(len(days) // 7):
        with st.container(key=f"row_month_{prefix}_{week}"):
            for col, day in zip(st.columns(7), days[week * 7:week * 7 + 7]):
                outside = "_out" if day.month != first.month else ""
                with col:
                    st.button(
                        str(day.day), key=f"d_{prefix}_m_{day.isoformat()}{outside}",
                        type="primary" if day == st.session_state.day else "secondary",
                        disabled=day > today, on_click=pick_from_month, args=(day,),
                    )
                    count = counts.get(day, 0)
                    kind = "chip today" if day == today else "chip"
                    chip = f'<div class="{kind}">{word} {count}</div>' if count else '<div class="chip empty"></div>'
                    html(chip)
    html('<div class="caption">날짜를 누르면 그날 일정을 볼 수 있어요</div>')
    st.button("접기", key=f"handle_close_{prefix}", icon=":material/expand_less:",
              on_click=set_month_open, args=(False,))


def render_month_screen(title_html, prefix, word, alert_dot):
    """한 달 달력만 보이는 화면 (달력 펼치기를 눌렀을 때)."""
    render_header(title_html, alert_dot=alert_dot)
    render_banner(st.session_state.connected)
    render_month(prefix, st.session_state.connected, word)


def render_tabbar():
    """화면 아래에 고정된 탭 바 (홈 / 기록)."""
    with st.container(key="row_tabbar"):
        home_col, log_col = st.columns(2)
        home_col.button(
            "홈", key="tab_home", icon=":material/calendar_today:",
            type="primary" if st.session_state.tab == "home" else "secondary",
            on_click=go_tab, args=("home",),
        )
        log_col.button(
            "기록", key="tab_log", icon=":material/format_list_bulleted:",
            type="primary" if st.session_state.tab == "log" else "secondary",
            on_click=go_tab, args=("log",),
        )


def visit_row(visit, disguise):
    """방문 한 건을 목록 한 줄(HTML)로 만듭니다."""
    start = visit["start"].strftime("%H:%M:%S") if visit["start"] else "시작 기록 없음"
    end = visit["end"].strftime("%H:%M:%S") if visit["end"] else None
    status = visit["status"]
    if status == "now":
        title = "잠깐 미팅" if disguise else "지금 자리에 있음"
        times, right, tone = f"{start} ~ 현재", "진행 중", "now"
    elif status == "no_end":
        title = "잠깐 미팅" if disguise else "누가 왔어요"
        times, right, tone = f"{start} ~ 종료 기록 없음", "-", "past"
    else:
        title = "잠깐 미팅" if disguise else "누가 왔다 갔어요"
        times, right, tone = f"{start} ~ {end}", fmt_duration(visit["seconds"]), "past"
    return (
        f'<div class="visit {tone}"><span class="dot"></span>'
        f'<div class="visit-main"><div class="visit-title">{title}</div>'
        f'<div class="visit-time">{times}</div></div>'
        f'<div class="visit-right">{right}</div></div>'
    )


def render_test_buttons(connected):
    """서버 연결 전 테스트 기간에만: 가짜 감지 버튼."""
    if connected:
        return
    html('<div class="section-gap"></div><div class="test-title">테스트 (서버 연결 전에만 보여요)</div>')
    with st.container(key="row_test"):
        come, leave = st.columns(2)
        come.button("가짜 왔어요", key="fake_come", on_click=add_fake_event, args=(EVENT_PERSON_DETECTED,))
        leave.button("가짜 갔어요", key="fake_leave", on_click=add_fake_event, args=(EVENT_PERSON_LEFT,))


# ---------- 솔직 모드 화면 ----------

def status_card(today_events, now):
    """솔직 모드 홈의 상태 카드(HTML)를 만듭니다."""
    state = current_state(today_events)
    if state == "present":
        since = last_event_time(today_events, EVENT_PERSON_DETECTED).strftime("%H:%M")
        return f'<div class="card orange"><span class="dot"></span><h2>누가 왔어요!</h2><p>{since}부터 자리에 있어요</p></div>'
    if state == "empty":
        return '<div class="card green"><span class="dot"></span><h2>지금 아무도 없어요</h2><p>오늘은 아직 아무도 안 왔어요</p></div>'
    minutes = quiet_minutes(today_events, now)
    if minutes == 0:
        quiet = "방금 조용해졌어요"
    elif minutes < 60:
        quiet = f"{minutes}분째 조용해요"
    else:
        quiet = f"{minutes // 60}시간 {minutes % 60}분째 조용해요"
    return f'<div class="card green"><span class="dot"></span><h2>지금 아무도 없어요</h2><p>{quiet}</p></div>'


def stats_row(count, last_label, last_value):
    """'방문 N회 | 마지막 HH:MM' 두 칸(HTML)을 만듭니다."""
    return (
        f'<div class="stats"><div><span>{last_label[0]}</span><b>{count}회</b></div>'
        f'<div><span>{last_label[1]}</span><b>{last_value}</b></div></div>'
    )


def render_honest_home(today_events, count, now):
    """솔직 모드 홈: 상태 카드, 오늘 횟수, 최근 기록 3개."""
    alert = current_state(today_events) == "present"
    render_header(f'<div class="brand">{MASK_SVG}<span>언더커버</span></div>', alert_dot=alert)
    render_banner(st.session_state.connected)
    html(f'<div class="subdate">{fmt_day(now.date())}</div>')
    html(status_card(today_events, now))
    last = last_event_time(today_events, EVENT_PERSON_DETECTED)
    html(stats_row(count, ("오늘 방문", "마지막"), last.strftime("%H:%M") if last else "-"))
    with st.container(key="row_recent"):
        title_col, link_col = st.columns([3, 2], vertical_alignment="center")
        title_col.markdown('<div class="section-title">최근 기록</div>', unsafe_allow_html=True)
        link_col.button("전체 보기 ›", key="see_all", on_click=go_tab, args=("log",))
    visits = group_visits(today_events, is_today=True)[:3]
    if visits:
        html("".join(visit_row(v, disguise=False) for v in visits))
    else:
        html('<div class="empty">오늘은 아직 방문 기록이 없어요</div>')


def render_honest_log(day, events, count):
    """솔직 모드 기록: 이번 주 날짜 줄, 그날 방문 목록. 달력 펼치기를 누르면 한 달 달력만 보입니다."""
    is_today = day == today_kst()
    alert = current_state(get_events(today_kst(), st.session_state.connected)) == "present"
    brand = f'<div class="brand">{MASK_SVG}<span>언더커버</span></div>'
    if st.session_state.month_open:
        render_month_screen(brand, "hl", "방문", alert)
        return
    render_header(brand, alert_dot=alert)
    render_banner(st.session_state.connected)
    render_week("hl")
    last = last_event_time(events, EVENT_PERSON_DETECTED)
    label = ("오늘 방문" if is_today else "방문", "마지막")
    html(stats_row(count, label, last.strftime("%H:%M") if last else "-"))
    with st.container(key="row_logtitle"):
        title_col, date_col = st.columns([3, 2], vertical_alignment="center")
        title_col.markdown('<div class="section-title">방문 기록</div>', unsafe_allow_html=True)
        if is_today:
            date_col.markdown(f'<div class="muted right">{day.month}월 {day.day}일</div>', unsafe_allow_html=True)
        else:
            date_col.button("오늘로", key="go_today_h", on_click=select_day, args=(today_kst(),))
    visits = group_visits(events, is_today)
    if visits:
        html("".join(visit_row(v, disguise=False) for v in visits))
    else:
        html('<div class="empty">이날은 방문 기록이 없어요</div>')
    render_test_buttons(st.session_state.connected)


# ---------- 위장 모드 화면 ----------

def timeline_html(day, events, now):
    """위장 모드 홈의 그날 일정표(HTML)를 만듭니다. 오늘이면 지금 상태 블록을 넣습니다."""
    is_today = day == today_kst()
    visits = list(reversed(group_visits(events, is_today)))  # 시간 순서
    finished = [v for v in visits if v["status"] != "now"]
    if not finished and not is_today:
        return '<div class="empty">이날은 미팅이 없어요</div>'
    # 미팅이 있는 시간 + (오늘이면) 지금 앞뒤 시간만 보여주고, 사이 빈 시간은 한 줄로 줄입니다.
    shown = {(v["start"] or v["end"]).hour for v in finished}
    if is_today:
        shown |= set(range(max(0, now.hour - 1), min(23, now.hour + 3) + 1))

    rows = []
    previous = None
    for hour in sorted(shown):
        if previous is not None and hour - previous > 1:
            rows.append('<div class="tl-gap">···</div>')
        previous = hour
        chips = "".join(
            f'<div class="tl-chip">{(v["start"] or v["end"]).strftime("%H:%M")} 잠깐 미팅 · {fmt_duration(v["seconds"])}</div>'
            for v in finished if (v["start"] or v["end"]).hour == hour
        )
        if is_today and hour == now.hour:
            chips += f'<div class="tl-now"><span>지금 {now.strftime("%H:%M")}</span></div>' + status_block(events)
        rows.append(f'<div class="tl-row"><div class="tl-hour">{hour:02d}:00</div><div class="tl-body">{chips}</div></div>')
    return '<div class="timeline">' + "".join(rows) + "</div>"


def status_block(today_events):
    """위장 모드의 지금 상태 블록: 집중 시간(초록) 또는 회의 시작(주황)."""
    state = current_state(today_events)
    if state == "present":
        since = last_event_time(today_events, EVENT_PERSON_DETECTED).strftime("%H:%M")
        return f'<div class="tl-block orange"><h3>회의 시작</h3><p>{since}부터</p></div>'
    if state == "empty":
        return '<div class="tl-block green"><h3>집중 시간</h3><p>오늘 미팅 없음</p></div>'
    since = last_event_time(today_events, EVENT_PERSON_LEFT).strftime("%H:%M")
    return f'<div class="tl-block green"><h3>집중 시간</h3><p>{since}부터</p></div>'


def render_disguise_home(day, events, now):
    """위장 모드 홈: 이번 주 날짜 줄, 그날 일정표. 달력 펼치기를 누르면 한 달 달력만 보입니다."""
    title = f'<div class="title-date">{fmt_day(day)}</div>'
    if st.session_state.month_open:
        render_month_screen(title, "dh", "미팅", alert_dot=False)
        return
    render_header(title, alert_dot=False)
    render_banner(st.session_state.connected)
    render_week("dh")
    html(timeline_html(day, events, now))


def render_disguise_log(day, events):
    """위장 모드 기록: 이번 주 날짜 줄, 그날 미팅 목록. 달력 펼치기를 누르면 한 달 달력만 보입니다."""
    is_today = day == today_kst()
    title = f'<div class="title-date">{fmt_day(day)}</div>'
    if st.session_state.month_open:
        render_month_screen(title, "dl", "미팅", alert_dot=False)
        return
    render_header(title, alert_dot=False)
    render_banner(st.session_state.connected)
    render_week("dl")
    visits = group_visits(events, is_today)
    html(f'<div class="big-count">미팅 {len(visits)}건</div>')
    if visits:
        html("".join(visit_row(v, disguise=True) for v in visits))
    else:
        html('<div class="empty">이날은 미팅이 없어요</div>')


# ---------- 전체 ----------

def init_state():
    """처음 열 때 화면 상태를 준비합니다."""
    defaults = {
        "disguise": False,
        "tab": "home",
        "day": today_kst(),
        "month": today_kst().replace(day=1),
        "connected": False,
        "month_open": False,
    }
    for key, value in defaults.items():
        st.session_state.setdefault(key, value)
    if "sample_events" not in st.session_state:
        st.session_state.sample_events = load_sample_events()


@st.fragment(run_every=APP_POLL_SEC)
def render_app():
    """2초마다 서버에서 기록을 다시 가져와 화면 전체를 새로 그립니다."""
    now = now_kst()
    st.session_state.connected = fetch_events(now.date()) is not None
    connected = st.session_state.connected
    today_events = get_events(now.date(), connected)
    check_new_detection(today_events)

    day = st.session_state.day
    events = today_events if day == now.date() else get_events(day, connected)
    disguise, tab = st.session_state.disguise, st.session_state.tab
    if tab == "home" and not disguise:
        render_honest_home(today_events, get_count(now.date(), today_events, connected), now)
    elif tab == "home":
        render_disguise_home(day, events, now)
    elif not disguise:
        render_honest_log(day, events, get_count(day, events, connected))
    else:
        render_disguise_log(day, events)
    render_tabbar()


def main():
    """페이지 설정과 스타일을 적용하고 앱을 그립니다."""
    st.set_page_config(page_title="언더커버", layout="centered")
    with open(STYLE_FILE, encoding="utf-8") as f:
        st.markdown(f"<style>{f.read()}</style>", unsafe_allow_html=True)
    init_state()
    render_app()


main()

# 실행 (레포 맨 위 폴더 기준):  streamlit run src/app/app.py
# 서버 주소 지정 (PowerShell):  $env:SERVER_HOST="192.168.0.10"; streamlit run src/app/app.py
# 서버가 없으면 자동으로 샘플 데이터(data/sample_events.json)를 오늘 날짜로 바꿔 보여줍니다.
