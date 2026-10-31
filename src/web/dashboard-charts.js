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
function barPath(x0, x1, top, base) {
  const r = Math.min(5, (base - top) / 2, (x1 - x0) / 2);
  return `M${x0},${base} V${top + r} Q${x0},${top} ${x0 + r},${top} H${x1 - r} Q${x1},${top} ${x1},${top + r} V${base} Z`;
}

// 세로 막대그래프를 그립니다.
// opts: { height, labelEvery(몇 칸마다 아래 글자), highlight(강조할 막대 번호),
//         values: "all"(값이 있는 막대마다 숫자) | "highlight"(강조 막대만), trend(뒤에 흐름 곡선) }
function drawColumns(svg, labels, values, opts = {}) {
  const W = svg.clientWidth || 600;
  const H = opts.height || 240;
  const pad = { l: 34, r: 10, t: 26, b: 28 };
  const plotW = W - pad.l - pad.r;
  const plotH = H - pad.t - pad.b;
  const band = plotW / values.length;
  const barW = Math.min(opts.barMax || 22, band * 0.56);
  const max = niceMax(Math.max(...values));
  const y = (v) => pad.t + plotH - (v / max) * plotH;
  const base = pad.t + plotH;
  const every = opts.labelEvery || 1;
  const hasHighlight = opts.highlight != null;
  const cx = (i) => pad.l + band * i + band / 2;

  let html = "";
  // 가로 눈금선과 왼쪽 숫자
  for (let i = 0; i <= 4; i++) {
    const v = (max / 4) * i;
    html += `<line class="grid${i === 0 ? " base" : ""}" x1="${pad.l}" x2="${W - pad.r}" y1="${y(v)}" y2="${y(v)}" />`;
    html += `<text class="axis-text" x="${pad.l - 8}" y="${y(v) + 4}" text-anchor="end">${v}</text>`;
  }

  // 흐름 곡선: 막대 뒤에 옅은 면적 + 얇은 선
  if (opts.trend && values.length > 1) {
    const gid = `${svg.id}-area`;
    const pts = values.map((v, i) => [cx(i), y(v)]);
    const line = smoothPath(pts);
    html += `<defs><linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" class="area-stop-top" /><stop offset="100%" class="area-stop-bottom" /></linearGradient></defs>`;
    html += `<path class="trend-area" d="${line} L${pts[pts.length - 1][0]},${base} L${pts[0][0]},${base} Z" fill="url(#${gid})" />`;
    html += `<path class="trend-line" d="${line}" />`;
  }

  // 막대, 아래 글자, 숫자
  values.forEach((v, i) => {
    const x = cx(i);
    const strong = i === opts.highlight;
    if (i % every === 0 || strong) html += `<text class="axis-text${strong ? " strong" : ""}" x="${x}" y="${H - 8}" text-anchor="middle">${labels[i]}</text>`;
    html += `<rect class="hit" data-i="${i}" x="${x - band / 2}" y="${pad.t}" width="${band}" height="${plotH}" />`;
    if (v > 0) {
      const top = y(v);
      const cls = hasHighlight ? (strong ? "bar strong" : "bar muted") : "bar";
      html += `<path class="${cls}" data-i="${i}" d="${barPath(x - barW / 2, x + barW / 2, top, base)}" />`;
      const showValue = opts.values === "all" || (opts.values === "highlight" && strong);
      if (showValue) html += `<text class="value-text${strong ? " strong" : ""}" data-i="${i}" x="${x}" y="${top - (strong && opts.trend ? 13 : 8)}" text-anchor="middle">${v}</text>`;
    }
  });
  if (opts.trend && hasHighlight) {
    const i = opts.highlight;
    html += `<circle class="trend-dot" cx="${cx(i)}" cy="${y(values[i])}" r="4" />`;
  }
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  svg.style.height = `${H}px`;
  svg.innerHTML = html;
}

// 하루(0~24시)를 가로 띠로 그리고, 사람이 있던 구간을 칠합니다.
// spans: [{ start: 초, end: 초, live: 아직 머무는 중인지 }], nowSec: 오늘이면 지금 시각(초), 아니면 null
function drawTimeline(svg, spans, nowSec, opts = {}) {
  const W = svg.clientWidth || 800;
  const H = opts.height || 78;
  const pad = { l: 8, r: 8, t: 10, b: 24 };
  const trackH = H - pad.t - pad.b;
  const x = (sec) => pad.l + (sec / 86400) * (W - pad.l - pad.r);
  const minW = 3; // 아주 짧게 머문 구간도 보이도록 최소 너비

  let html = `<rect class="track" x="${pad.l}" y="${pad.t}" width="${W - pad.l - pad.r}" height="${trackH}" rx="8" />`;
  for (let h = 0; h <= 24; h += 3) {
    const hx = x(h * 3600);
    if (h > 0 && h < 24) html += `<line class="tick" x1="${hx}" x2="${hx}" y1="${pad.t + 1}" y2="${pad.t + trackH - 1}" />`;
    html += `<text class="axis-text" x="${hx}" y="${H - 6}" text-anchor="${h === 0 ? "start" : h === 24 ? "end" : "middle"}">${h}시</text>`;
  }
  spans.forEach((s, i) => {
    const x0 = x(s.start);
    const w = Math.max(minW, x(s.end) - x0);
    html += `<rect class="span${s.live ? " live" : ""}" data-i="${i}" x="${x0}" y="${pad.t + 5}" width="${w}" height="${trackH - 10}" rx="3" />`;
  });
  if (nowSec != null) {
    const nx = x(nowSec);
    html += `<line class="now" x1="${nx}" x2="${nx}" y1="${pad.t - 4}" y2="${pad.t + trackH + 4}" />`;
    html += `<circle class="now-dot" cx="${nx}" cy="${pad.t - 4}" r="3.5" />`;
  }
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  svg.style.height = `${H}px`;
  svg.innerHTML = html;
}

// 그래프 위에서 마우스가 올라간 항목(data-i)의 툴팁을 보여주고, 그 막대·숫자를 강조합니다.
function attachTooltip(svg, tip, textOf) {
  svg.addEventListener("mousemove", (e) => {
    const hit = e.target.closest("[data-i]");
    svg.querySelectorAll(".hover").forEach((el) => el.classList.remove("hover"));
    const text = hit ? textOf(+hit.dataset.i) : null;
    if (!text) { tip.classList.add("hidden"); return; }
    svg.querySelectorAll(`.bar[data-i="${hit.dataset.i}"], .span[data-i="${hit.dataset.i}"], .value-text[data-i="${hit.dataset.i}"]`)
      .forEach((el) => el.classList.add("hover"));
    const box = svg.getBoundingClientRect();
    tip.textContent = text;
    tip.style.left = `${e.clientX - box.left}px`;
    tip.style.top = `${e.clientY - box.top - 12}px`;
    tip.classList.remove("hidden");
  });
  svg.addEventListener("mouseleave", () => {
    tip.classList.add("hidden");
    svg.querySelectorAll(".hover").forEach((el) => el.classList.remove("hover"));
  });
}
