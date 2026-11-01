// 대시보드 그래프: 세로 막대그래프(시간대별, 최근 7일)와 하루 타임라인을 SVG 로 그립니다.

// 그래프 눈금 최댓값을 보기 좋은 수(4, 8, 20, 40 ...)로 올립니다. 눈금은 4칸입니다.
function niceMax(n) {
  if (n <= 4) return 4;
  const raw = n / 4;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((m) => m * pow).find((s) => s >= raw);
  return step * 4;
}

// 점들을 지나는 부드러운 곡선 경로를 만듭니다. (Catmull-Rom 곡선을 베지어로 바꿈)
function smoothPath(points) {
  if (points.length < 2) return "";
  let d = `M${points[0][0]},${points[0][1]}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] || points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] || p2;
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${c1[0]},${c1[1]} ${c2[0]},${c2[1]} ${p2[0]},${p2[1]}`;
  }
  return d;
}

// 위쪽만 둥근 막대 경로 (아래쪽은 기준선에 붙어 각짐)
function barPath(x0, x1, top, base, radius = 5) {
  const r = Math.min(radius, (base - top) / 2, (x1 - x0) / 2);
  return `M${x0},${base} V${top + r} Q${x0},${top} ${x0 + r},${top} H${x1 - r} Q${x1},${top} ${x1},${top + r} V${base} Z`;
}

// 세로 막대그래프를 그립니다. 높이는 그래프 칸(svg)의 실제 높이를 따릅니다.
// opts: { labelEvery: 몇 칸마다 아래 글자, highlight: 진하게 강조할 막대 번호,
//         muteOthers: 강조 막대 외에는 옅게, tracks: 막대 뒤 회색 기둥, trend: 흐름 곡선, yTitle: 세로축 제목, barMax: 막대 최대 너비 }
function drawColumns(svg, labels, values, opts = {}) {
  const W = svg.clientWidth || 600;
  const H = svg.clientHeight || 240;
  const pad = { l: opts.yTitle ? 52 : 36, r: 8, t: 30, b: 32 };
  const plotW = W - pad.l - pad.r;
  const plotH = H - pad.t - pad.b;
  const band = plotW / values.length;
  const barW = Math.min(opts.barMax || 22, band * 0.58);
  const max = niceMax(Math.max(...values));
  const y = (v) => pad.t + plotH - (v / max) * plotH;
  const base = pad.t + plotH;
  const every = opts.labelEvery || 1;
  const hl = opts.highlight;
  const cx = (i) => pad.l + band * i + band / 2;

  let html = "";
  if (opts.yTitle) {
    html += `<text class="axis-title" transform="translate(14 ${pad.t + plotH / 2}) rotate(-90)" text-anchor="middle">${opts.yTitle}</text>`;
  }
  // 가로 눈금선: 0, 절반, 최대
  [0, max / 2, max].forEach((v, i) => {
    html += `<line class="grid${i === 0 ? " base" : ""}" x1="${pad.l}" x2="${W - pad.r}" y1="${y(v)}" y2="${y(v)}" />`;
    html += `<text class="axis-text" x="${pad.l - 10}" y="${y(v) + 4}" text-anchor="end">${v}</text>`;
  });

  // 마우스를 올린 칸에 보이는 세로 점선 (평소엔 숨김)
  values.forEach((v, i) => {
    html += `<line class="guide" data-i="${i}" x1="${cx(i)}" x2="${cx(i)}" y1="${pad.t - 6}" y2="${base}" />`;
  });

  // 막대 뒤 회색 기둥: 모든 칸의 자리를 보여줘서 0인 칸도 비어 있다는 게 보이게 함
  if (opts.tracks) {
    values.forEach((v, i) => {
      html += `<path class="track-col" d="${barPath(cx(i) - barW / 2, cx(i) + barW / 2, pad.t, base)}" />`;
    });
  }

  // 흐름 곡선: 옅은 면적 + 선
  if (opts.trend && values.length > 1) {
    const gid = `${svg.id}-area`;
    const pts = values.map((v, i) => [cx(i), y(v)]);
    const line = smoothPath(pts);
    html += `<defs><linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" class="area-stop-top" /><stop offset="100%" class="area-stop-bottom" /></linearGradient></defs>`;
    html += `<path class="trend-area" d="${line} L${pts[pts.length - 1][0]},${base} L${pts[0][0]},${base} Z" fill="url(#${gid})" />`;
  }

  // 막대
  values.forEach((v, i) => {
    if (v <= 0) return;
    const strong = i === hl;
    const cls = strong ? "bar strong" : opts.muteOthers ? "bar muted" : "bar";
    html += `<path class="${cls}" data-i="${i}" d="${barPath(cx(i) - barW / 2, cx(i) + barW / 2, y(v), base)}" />`;
  });

  // 흐름 선과 점은 막대 위에
  if (opts.trend && values.length > 1) {
    const pts = values.map((v, i) => [cx(i), y(v)]);
    html += `<path class="trend-line" d="${smoothPath(pts)}" />`;
    pts.forEach(([px, py], i) => { html += `<circle class="trend-dot${i === hl ? " strong" : ""}" cx="${px}" cy="${py}" r="${i === hl ? 5 : 3.5}" />`; });
  }

  // 숫자: 값이 있는 칸마다, 강조 칸은 크게
  values.forEach((v, i) => {
    if (v <= 0) return;
    const strong = i === hl;
    const top = opts.trend ? Math.min(y(v), y(v)) : y(v);
    html += `<text class="value-text${strong ? " strong" : ""}" data-i="${i}" x="${cx(i)}" y="${top - (strong ? 14 : 10)}" text-anchor="middle">${v}</text>`;
  });

  // 아래 글자
  values.forEach((v, i) => {
    if (i % every !== 0 && i !== hl) return;
    html += `<text class="axis-text${i === hl ? " strong" : ""}" x="${cx(i)}" y="${H - 10}" text-anchor="middle">${labels[i]}</text>`;
  });

  // 마우스 감지 영역 (맨 위)
  values.forEach((v, i) => {
    html += `<rect class="hit" data-i="${i}" x="${cx(i) - band / 2}" y="${pad.t - 6}" width="${band}" height="${plotH + 6}" />`;
  });

  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  svg.innerHTML = html;
}

// 하루(0~24시)를 가로 띠로 그리고, 사람이 있던 구간을 칠합니다.
// spans: [{ start: 초, end: 초, live: 아직 머무는 중인지 }], nowSec: 오늘이면 지금 시각(초), 아니면 null
function drawTimeline(svg, spans, nowSec, opts = {}) {
  const W = svg.clientWidth || 800;
  const H = opts.height || 120;
  const pad = { l: 2, r: 2, t: 30, b: 28 };
  const trackH = H - pad.t - pad.b;
  const x = (sec) => pad.l + (sec / 86400) * (W - pad.l - pad.r);
  const minW = 10; // 몇십 초짜리 구간도 막대로 보이도록 최소 너비

  // 머무는 중 구간에 쓰는 빗금 무늬
  let html = `<defs><pattern id="${svg.id}-live" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
    <rect width="8" height="8" class="live-bg" /><rect width="3" height="8" class="live-stripe" /></pattern></defs>`;
  html += `<rect class="track" x="${pad.l}" y="${pad.t}" width="${W - pad.l - pad.r}" height="${trackH}" rx="10" />`;
  for (let h = 1; h < 24; h++) {
    const hx = x(h * 3600);
    html += `<line class="${h % 3 === 0 ? "tick major" : "tick"}" x1="${hx}" x2="${hx}" y1="${pad.t + 6}" y2="${pad.t + trackH - 6}" />`;
  }
  for (let h = 0; h <= 24; h += 3) {
    const hx = x(h * 3600);
    html += `<text class="axis-text" x="${hx}" y="${H - 6}" text-anchor="${h === 0 ? "start" : h === 24 ? "end" : "middle"}">${String(h).padStart(2, "0")}:00</text>`;
  }
  spans.forEach((s, i) => {
    const x0 = x(s.start);
    const w = Math.max(minW, x(s.end) - x0);
    const fill = s.live ? ` style="fill:url(#${svg.id}-live)"` : ""; // CSS 색보다 빗금 무늬가 우선하도록 style 로 지정
    html += `<rect class="span${s.live ? " live" : ""}" data-i="${i}" x="${x0}" y="${pad.t + 6}" width="${w}" height="${trackH - 12}" rx="4"${fill} />`;
  });
  if (nowSec != null) {
    const nx = x(nowSec);
    const label = opts.nowLabel || "지금";
    const lw = label.length * 8 + 20;
    const lx = Math.min(Math.max(nx - lw / 2, 0), W - lw);
    html += `<line class="now" x1="${nx}" x2="${nx}" y1="${pad.t - 4}" y2="${pad.t + trackH + 4}" />`;
    html += `<rect class="now-pill" x="${lx}" y="1" width="${lw}" height="22" rx="11" />`;
    html += `<text class="now-text" x="${lx + lw / 2}" y="16" text-anchor="middle">${label}</text>`;
  }
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  svg.style.height = `${H}px`;
  svg.innerHTML = html;
}

// 그래프 위에서 마우스가 올라간 칸(data-i)의 툴팁을 보여주고, 그 칸을 강조합니다.
// contentOf(i) 는 { title, rows: [[이름, 값], ...] } 또는 null 을 돌려줍니다.
function attachTooltip(svg, tip, contentOf) {
  svg.addEventListener("mousemove", (e) => {
    const hit = e.target.closest("[data-i]");
    svg.querySelectorAll(".hover").forEach((el) => el.classList.remove("hover"));
    const c = hit ? contentOf(+hit.dataset.i) : null;
    if (!c) { tip.classList.add("hidden"); return; }
    svg.querySelectorAll(`[data-i="${hit.dataset.i}"]`).forEach((el) => el.classList.add("hover"));
    tip.innerHTML = `<div class="tip-title">${c.title}</div>` +
      c.rows.map(([k, v]) => `<div class="tip-row"><span>${k}</span><b>${v}</b></div>`).join("");
    const box = svg.getBoundingClientRect();
    const left = Math.min(Math.max(e.clientX - box.left, 70), box.width - 70);
    tip.style.left = `${left}px`;
    tip.style.top = `${e.clientY - box.top - 14}px`;
    tip.classList.remove("hidden");
  });
  svg.addEventListener("mouseleave", () => {
    tip.classList.add("hidden");
    svg.querySelectorAll(".hover").forEach((el) => el.classList.remove("hover"));
  });
}
