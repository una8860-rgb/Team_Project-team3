// 가짜 엑셀 시트: 셀 선택(여러 칸), 입력, 수식 계산, 서식, 실행 취소, 복사·붙여넣기를 합니다.

const COLS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
const ROW_COUNT = 40;
const COL_WIDTHS = { A: 120, B: 80, C: 90, D: 90, E: 90, F: 100, G: 90, H: 80 };
const UNDO_LIMIT = 50;

// 셀 하나: { raw: 입력한 글자, value: 계산된 값, cls: 기본 모양, fmt: "num"/"pct", style: { 서식 } }
const cells = {};
let anchor = "F5"; // 여러 칸 선택의 시작 셀
let active = "F5"; // 지금 커서가 있는 셀
let editing = false; // 셀에 입력 중인지
let editor = null; // 선택된 셀 위에 겹쳐 두는 입력칸
let dragging = false; // 마우스로 끌어서 선택 중인지
let clip = null; // 복사한 칸들 { rows, cols, data: [[셀]], cut: 잘라내기 여부, from: [주소] }
let painterStyle = null; // 서식 복사(붓)로 집어 둔 서식
const undoStack = [];
const redoStack = [];
let onSelectionChange = () => {}; // 리본이 선택 상태를 따라가도록 ribbon.js 가 바꿔 끼웁니다.

// ---- 주소 계산 ----

// "C5" → [열 번호, 행 번호]
function pos(addr) {
  return [COLS.indexOf(addr[0]), +addr.slice(1)];
}

// [열 번호, 행 번호] → "C5"
function addrOf(c, r) {
  return `${COLS[c]}${r}`;
}

// 선택한 칸들의 주소 목록 (anchor 와 active 가 만드는 사각형)
function selectedAddrs() {
  const [c1, r1] = pos(anchor);
  const [c2, r2] = pos(active);
  const list = [];
  for (let r = Math.min(r1, r2); r <= Math.max(r1, r2); r++) {
    for (let c = Math.min(c1, c2); c <= Math.max(c1, c2); c++) list.push(addrOf(c, r));
  }
  return list;
}

// 셀 주소를 가로·세로로 옮깁니다. 끝에 닿으면 멈춥니다.
function moved(addr, dc, dr) {
  const [c, r] = pos(addr);
  return addrOf(Math.min(COLS.length - 1, Math.max(0, c + dc)), Math.min(ROW_COUNT, Math.max(1, r + dr)));
}

// 셀을 가져옵니다. 없으면 빈 셀을 만듭니다.
function cellAt(addr) {
  if (!cells[addr]) cells[addr] = { raw: "", value: "", cls: "", fmt: "num", style: {} };
  if (!cells[addr].style) cells[addr].style = {};
  return cells[addr];
}

// ---- 보고서 기본 내용 ----

// 보고서 기본 내용을 넣습니다. 합계·달성률은 수식이라 숫자를 바꾸면 다시 계산됩니다.
function buildReport() {
  const depts = [
    ["영업1팀", "김민수", 1520, 1610, 1755, 4800],
    ["영업2팀", "이서연", 1340, 1420, 1500, 4500],
    ["마케팅팀", "박지훈", 980, 1050, 1120, 3300],
    ["개발팀", "최유진", 2100, 2230, 2310, 6500],
    ["기획팀", "정하늘", 870, 910, 965, 2900],
    ["고객지원팀", "한도윤", 760, 805, 840, 2500],
    ["해외사업팀", "오세린", 1180, 1265, 1390, 3700],
  ];
  const put = (addr, raw, cls = "", fmt = "num") => { cells[addr] = { raw: String(raw), cls, fmt, style: {} }; };

  put("A1", "2026년 4분기 부서별 매출 보고서", "title");
  put("A2", "단위: 만 원 / 작성: 경영지원팀 / 기준일 2026-10-31", "sub");
  ["부서", "담당자", "10월", "11월", "12월", "합계", "목표", "달성률"].forEach((h, i) => put(`${COLS[i]}4`, h, "head"));
  depts.forEach((d, i) => {
    const r = 5 + i;
    const band = i % 2 ? "band" : "";
    put(`A${r}`, d[0], band);
    put(`B${r}`, d[1], band);
    put(`C${r}`, d[2], band);
    put(`D${r}`, d[3], band);
    put(`E${r}`, d[4], band);
    put(`F${r}`, `=SUM(C${r}:E${r})`, band);
    put(`G${r}`, d[5], band);
    put(`H${r}`, `=F${r}/G${r}`, band, "pct");
  });
  const tr = 5 + depts.length;
  const last = tr - 1;
  put(`A${tr}`, "합계", "total");
  put(`B${tr}`, "", "total");
  ["C", "D", "E", "F", "G"].forEach((c) => put(`${c}${tr}`, `=SUM(${c}5:${c}${last})`, "total"));
  put(`H${tr}`, `=F${tr}/G${tr}`, "total", "pct");
  put(`A${tr + 2}`, "* 12월은 10/31 기준 예상치 포함", "sub");
  put(`A${tr + 3}`, "* 달성률 = 합계 / 목표", "sub");
}

// ---- 계산 ----

// 셀의 숫자 값을 돌려줍니다. 숫자가 아니면 0.
function numberOf(addr) {
  const v = cells[addr] && cells[addr].value;
  return typeof v === "number" ? v : 0;
}

// 수식을 계산합니다. SUM/AVERAGE/MAX/MIN(범위), 셀 주소, 사칙연산만 됩니다. 잘못되면 "#VALUE!".
function evaluate(formula) {
  let expr = formula.slice(1).toUpperCase();
  expr = expr.replace(/(SUM|AVERAGE|MAX|MIN)\(([A-Z])(\d+):([A-Z])(\d+)\)/g, (_, fn, c1, r1, c2, r2) => {
    const nums = [];
    for (let c = COLS.indexOf(c1); c <= COLS.indexOf(c2); c++) {
      for (let r = +r1; r <= +r2; r++) {
        const v = cells[addrOf(c, r)] && cells[addrOf(c, r)].value;
        if (typeof v === "number") nums.push(v);
      }
    }
    if (fn === "SUM") return String(nums.reduce((a, b) => a + b, 0));
    if (!nums.length) return "0";
    if (fn === "AVERAGE") return String(nums.reduce((a, b) => a + b, 0) / nums.length);
    return String(fn === "MAX" ? Math.max(...nums) : Math.min(...nums));
  });
  expr = expr.replace(/\b([A-Z])(\d+)\b/g, (_, c, r) => String(numberOf(`${c}${r}`)));
  if (!/^[\d+\-*/().\s]+$/.test(expr)) return "#VALUE!";
  try {
    const result = Function(`"use strict"; return (${expr});`)();
    return Number.isFinite(result) ? result : "#DIV/0!";
  } catch (e) {
    return "#VALUE!";
  }
}

// 모든 셀의 값을 다시 계산합니다. 수식이 다른 수식을 쓰는 경우를 위해 몇 번 반복합니다.
function recalc() {
  for (let pass = 0; pass < 3; pass++) {
    for (const addr in cells) {
      const cell = cells[addr];
      const raw = cell.raw;
      const num = Number(raw.replace(/,/g, ""));
      if (cell.style.numFmt === "text") cell.value = raw;
      else if (raw.startsWith("=")) cell.value = evaluate(raw);
      else cell.value = raw.trim() !== "" && !isNaN(num) ? num : raw;
    }
  }
}

// ---- 화면 그리기 ----

// 셀에 보여줄 글자를 만듭니다. 표시 형식(일반/숫자/통화/백분율)과 소수 자릿수를 따릅니다.
function display(cell) {
  if (!cell) return "";
  const v = cell.value;
  if (typeof v !== "number") return v;
  const s = cell.style;
  const numFmt = s.numFmt || (cell.fmt === "pct" ? "percent" : "general");
  const dec = s.decimals;
  const fixed = (x, d) => x.toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d });
  if (numFmt === "percent") return fixed(v * 100, dec ?? 1) + "%";
  if (numFmt === "currency") return "₩" + fixed(v, dec ?? 0);
  if (numFmt === "number") return fixed(v, dec ?? 0);
  if (dec !== undefined) return fixed(v, dec);
  return v.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

// 셀 서식을 화면 스타일로 바꿉니다.
function cssOf(style) {
  const css = [];
  if (style.bold !== undefined) css.push(`font-weight:${style.bold ? 700 : 400}`);
  if (style.italic) css.push("font-style:italic");
  const lines = [style.underline && "underline", style.strike && "line-through"].filter(Boolean);
  if (lines.length) css.push(`text-decoration:${lines.join(" ")}`);
  if (style.size) css.push(`font-size:${style.size}pt`);
  if (style.font) css.push(`font-family:"${style.font}"`);
  if (style.color) css.push(`color:${style.color}`);
  if (style.fill) css.push(`background:${style.fill}`);
  if (style.halign) css.push(`text-align:${style.halign}`);
  if (style.valign) css.push(`vertical-align:${style.valign}`);
  if (style.wrap) css.push("white-space:normal");
  if (style.indent) css.push(`padding-left:${6 + style.indent * 12}px`);
  if (style.border) css.push("border:1px solid #333");
  return css.join(";");
}

// 셀 하나를 화면에 다시 그립니다.
function renderCell(addr) {
  const td = document.querySelector(`td[data-addr="${addr}"]`);
  if (!td) return;
  const cell = cells[addr];
  const v = cell && cell.value;
  const classes = [cell ? cell.cls : ""];
  if (typeof v === "number") classes.push("num");
  const isPct = cell && (cell.style.numFmt === "percent" || (cell.fmt === "pct" && !cell.style.numFmt));
  if (isPct && typeof v === "number" && !cell.cls.includes("total") && !cell.style.color) classes.push(v >= 1 ? "up" : "down");
  // 글자가 칸보다 길고 오른쪽 칸이 비어 있으면 진짜 엑셀처럼 옆으로 넘쳐 보이게 합니다.
  const [c, r] = pos(addr);
  const next = cells[addrOf(c + 1, r)];
  if (typeof v === "string" && v && !(cell.style.wrap) && (!next || next.raw === "")) classes.push("spill");
  if (selectedAddrs().length > 1 && selectedAddrs().includes(addr)) classes.push("inrange");
  if (addr === active) classes.push("sel");
  td.className = classes.join(" ").trim();
  td.style.cssText = cell ? cssOf(cell.style) : "";
  td.textContent = display(cell);
}

// 모든 셀을 다시 그립니다.
function renderAll() {
  document.querySelectorAll("td[data-addr]").forEach((td) => renderCell(td.dataset.addr));
}

// 격자(열 머리글, 행 번호, 셀)를 만듭니다.
function drawGrid() {
  const head = COLS.map((c) => `<th data-col="${c}" style="width:${COL_WIDTHS[c] || 80}px">${c}</th>`).join("");
  document.getElementById("grid-head").innerHTML = `<tr><th style="width:40px"></th>${head}</tr>`;
  // 표 전체 너비를 정해 둬야 글자가 커져도 열 너비가 그대로 유지됩니다.
  const total = 40 + COLS.reduce((sum, c) => sum + (COL_WIDTHS[c] || 80), 0);
  document.querySelector(".xl-grid").style.width = `${total}px`;
  let body = "";
  for (let r = 1; r <= ROW_COUNT; r++) {
    body += `<tr><th data-row="${r}">${r}</th>`;
    for (const c of COLS) body += `<td data-addr="${c}${r}"></td>`;
    body += "</tr>";
  }
  document.getElementById("grid-body").innerHTML = body;
}

// 머리글 강조, 이름 상자, 수식 입력줄, 상태 표시줄을 지금 선택에 맞춥니다.
function updateChrome() {
  const addrs = selectedAddrs();
  const [c1, r1] = pos(anchor);
  const [c2, r2] = pos(active);
  document.querySelectorAll(".xl-grid th.hl").forEach((th) => th.classList.remove("hl"));
  for (let c = Math.min(c1, c2); c <= Math.max(c1, c2); c++) document.querySelector(`th[data-col="${COLS[c]}"]`).classList.add("hl");
  for (let r = Math.min(r1, r2); r <= Math.max(r1, r2); r++) document.querySelector(`th[data-row="${r}"]`).classList.add("hl");
  document.getElementById("name-box").textContent = active;
  if (!editing) document.getElementById("formula").textContent = cells[active] ? cells[active].raw : "";
  const nums = addrs.map((a) => cells[a] && cells[a].value).filter((v) => typeof v === "number");
  const filled = addrs.filter((a) => cells[a] && cells[a].raw !== "").length;
  const fmt = (x) => x.toLocaleString(undefined, { maximumFractionDigits: 2 });
  let text = "";
  if (addrs.length > 1 && filled > 1) {
    text = nums.length ? `평균: ${fmt(nums.reduce((a, b) => a + b, 0) / nums.length)}   개수: ${filled}   합계: ${fmt(nums.reduce((a, b) => a + b, 0))}` : `개수: ${filled}`;
  } else if (nums.length === 1 && addrs.length === 1) {
    text = `합계: ${display(cells[active])}`;
  }
  document.getElementById("status-sum").textContent = text;
  placeEditor();
  onSelectionChange(cellAt(active).style, cells[active]);
}

// 셀을 선택합니다. extend 가 true 면 anchor 는 두고 범위를 넓힙니다.
function selectCell(addr, extend = false) {
  const before = selectedAddrs();
  active = addr;
  if (!extend) anchor = addr;
  if (painterStyle && !extend) applyPainter();
  new Set([...before, ...selectedAddrs()]).forEach(renderCell);
  updateChrome();
}

// ---- 실행 취소 ----

// 바꾸기 전 상태를 기억합니다.
function remember() {
  undoStack.push(JSON.stringify(cells));
  if (undoStack.length > UNDO_LIMIT) undoStack.shift();
  redoStack.length = 0;
}

// 기억해 둔 상태로 시트를 되돌립니다.
function restore(snapshot) {
  for (const k in cells) delete cells[k];
  Object.assign(cells, JSON.parse(snapshot));
  recalc();
  renderAll();
  updateChrome();
}

// 실행 취소
function undo() {
  if (!undoStack.length) return;
  redoStack.push(JSON.stringify(cells));
  restore(undoStack.pop());
}

// 다시 실행
function redo() {
  if (!redoStack.length) return;
  undoStack.push(JSON.stringify(cells));
  restore(redoStack.pop());
}

// 시트를 바꾸는 작업을 실행합니다. 실행 취소를 위해 바꾸기 전 상태를 남기고, 끝나면 다시 계산·그리기.
function change(fn) {
  remember();
  fn();
  recalc();
  renderAll();
  updateChrome();
  editor.focus();
}

// ---- 서식 ----

// 선택한 칸 전체의 서식을 바꿉니다. 예: setStyle({ bold: true })
function setStyle(props) {
  change(() => selectedAddrs().forEach((a) => Object.assign(cellAt(a).style, props)));
}

// 지금 셀 기준으로 켜기/끄기를 바꿉니다. 예: toggleStyle("bold")
function toggleStyle(key) {
  const cur = cellAt(active);
  const now = key === "bold" && cur.style.bold === undefined ? isBoldByDefault(cur) : !!cur.style[key];
  setStyle({ [key]: !now });
}

// 머리글·제목·합계 줄은 원래 굵게 보입니다.
function isBoldByDefault(cell) {
  return /head|title|total/.test(cell.cls);
}

// 글꼴 크기를 바꿉니다. (기본 10pt)
function changeSize(delta) {
  const sizes = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 36, 48, 72];
  const now = cellAt(active).style.size || 10;
  const idx = sizes.findIndex((s) => s >= now);
  const next = sizes[Math.min(sizes.length - 1, Math.max(0, (idx === -1 ? sizes.length - 1 : idx) + delta))];
  setStyle({ size: next });
}

// 소수 자릿수를 늘리거나 줄입니다.
function changeDecimals(delta) {
  const cur = cellAt(active);
  const base = cur.style.decimals ?? (cur.fmt === "pct" && !cur.style.numFmt ? 1 : 0);
  setStyle({ decimals: Math.max(0, Math.min(6, base + delta)) });
}

// 들여쓰기를 늘리거나 줄입니다.
function changeIndent(delta) {
  setStyle({ indent: Math.max(0, (cellAt(active).style.indent || 0) + delta), halign: "left" });
}

// 선택한 칸의 서식을 모두 지웁니다. (글자는 그대로)
function clearFormats() {
  change(() => selectedAddrs().forEach((a) => { cellAt(a).style = {}; }));
}

// 서식 복사(붓): 지금 셀의 서식을 집어 두고, 다음에 클릭한 셀에 붙입니다.
function pickPainter() {
  painterStyle = { ...cellAt(active).style };
  document.querySelector(".xl-grid").classList.add("painting");
}

// 집어 둔 서식을 지금 선택에 붙입니다.
function applyPainter() {
  const style = painterStyle;
  painterStyle = null;
  document.querySelector(".xl-grid").classList.remove("painting");
  change(() => selectedAddrs().forEach((a) => { cellAt(a).style = { ...style }; }));
}

// 자동 합계: 지금 셀 위쪽(없으면 왼쪽)의 숫자 칸들을 더하는 SUM 수식을 넣습니다.
function autoSum() {
  const [c, r] = pos(active);
  let top = r - 1;
  while (top >= 1 && typeof (cells[addrOf(c, top)] || {}).value === "number") top--;
  let formula = null;
  if (top < r - 1) formula = `=SUM(${addrOf(c, top + 1)}:${addrOf(c, r - 1)})`;
  else {
    let left = c - 1;
    while (left >= 0 && typeof (cells[addrOf(left, r)] || {}).value === "number") left--;
    if (left < c - 1) formula = `=SUM(${addrOf(left + 1, r)}:${addrOf(c - 1, r)})`;
  }
  if (formula) change(() => { cellAt(active).raw = formula; });
}

// ---- 복사·붙여넣기 ----

// 선택한 칸들을 복사합니다. cut 이 true 면 붙여넣을 때 원래 칸을 비웁니다.
function copyCells(cut = false) {
  const [c1, r1] = pos(anchor);
  const [c2, r2] = pos(active);
  const cs = Math.min(c1, c2), rs = Math.min(r1, r2);
  const cols = Math.abs(c1 - c2) + 1, rows = Math.abs(r1 - r2) + 1;
  const data = [];
  for (let r = 0; r < rows; r++) {
    data.push([]);
    for (let c = 0; c < cols; c++) data[r].push(JSON.parse(JSON.stringify(cellAt(addrOf(cs + c, rs + r)))));
  }
  clip = { rows, cols, data, cut, from: selectedAddrs() };
  const text = data.map((row) => row.map(display).join("\t")).join("\n");
  if (navigator.clipboard) navigator.clipboard.writeText(text).catch(() => {});
}

// 복사한 칸들을 지금 셀부터 붙여넣습니다.
function pasteCells() {
  if (!clip) return;
  const [c0, r0] = pos(active);
  change(() => {
    if (clip.cut) clip.from.forEach((a) => { cells[a] = { raw: "", value: "", cls: cellAt(a).cls, fmt: "num", style: {} }; });
    clip.data.forEach((row, r) => row.forEach((cell, c) => {
      if (c0 + c < COLS.length && r0 + r <= ROW_COUNT) cells[addrOf(c0 + c, r0 + r)] = JSON.parse(JSON.stringify(cell));
    }));
    if (clip.cut) clip = null;
  });
}

// 선택한 칸들의 내용을 지웁니다. (서식은 남김)
function clearContents() {
  change(() => selectedAddrs().forEach((a) => { cellAt(a).raw = ""; }));
}

// ---- 입력 ----

// 입력칸을 지금 셀 위에 겹쳐 놓습니다.
function placeEditor() {
  const td = document.querySelector(`td[data-addr="${active}"]`);
  const wrap = document.querySelector(".xl-grid-wrap");
  const a = td.getBoundingClientRect();
  const b = wrap.getBoundingClientRect();
  Object.assign(editor.style, {
    left: `${a.left - b.left + wrap.scrollLeft}px`,
    top: `${a.top - b.top + wrap.scrollTop}px`,
    width: `${Math.max(a.width, 80)}px`,
    height: `${a.height}px`,
  });
  const s = cellAt(active).style;
  editor.style.fontSize = s.size ? `${s.size}pt` : "";
  editor.style.fontWeight = s.bold ? "700" : "";
  editor.style.fontFamily = s.font ? `"${s.font}"` : "";
}

// 셀 수정을 시작합니다. keep 이 true 면 기존 내용을 이어서 고칩니다.
function startEdit(keep) {
  editing = true;
  editor.classList.add("editing");
  editor.value = keep && cells[active] ? cells[active].raw : "";
  editor.focus();
}

// 입력한 내용을 셀에 넣고 다시 계산합니다.
function commitEdit() {
  if (!editing) return;
  const text = editor.value;
  stopEdit();
  change(() => { cellAt(active).raw = text; });
}

// 입력을 끝냅니다. (취소할 때도 씁니다)
function stopEdit() {
  editing = false;
  editor.classList.remove("editing");
  editor.value = "";
  document.getElementById("formula").textContent = cells[active] ? cells[active].raw : "";
}

// Ctrl 단축키: 실행 취소, 다시 실행, 복사, 잘라내기, 붙여넣기, 굵게, 기울임, 밑줄
function onShortcut(e) {
  const k = e.key.toLowerCase();
  const map = {
    z: undo, y: redo, c: () => copyCells(false), x: () => copyCells(true), v: pasteCells,
    b: () => toggleStyle("bold"), i: () => toggleStyle("italic"), u: () => toggleStyle("underline"),
  };
  if (!map[k] || editing) return false;
  e.preventDefault();
  map[k]();
  return true;
}

// 키보드 처리: 선택 상태에선 이동·지우기, 입력 중엔 Enter/Tab 으로 확정, Esc 로 취소합니다.
function onEditorKey(e) {
  if (e.isComposing || e.altKey) return; // 한글 조합 중이거나 Alt 단축키면 건드리지 않음
  if (e.ctrlKey || e.metaKey) { onShortcut(e); return; }
  const moves = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };
  if (e.key === "Enter" || e.key === "Tab") {
    e.preventDefault();
    commitEdit();
    selectCell(e.key === "Enter" ? moved(active, 0, e.shiftKey ? -1 : 1) : moved(active, e.shiftKey ? -1 : 1, 0));
  } else if (e.key === "Escape") {
    stopEdit();
    if (painterStyle) { painterStyle = null; document.querySelector(".xl-grid").classList.remove("painting"); }
  } else if (e.key === "F2") {
    e.preventDefault();
    startEdit(true);
  } else if (!editing && moves[e.key]) {
    e.preventDefault();
    selectCell(moved(active, ...moves[e.key]), e.shiftKey);
  } else if (!editing && (e.key === "Delete" || e.key === "Backspace")) {
    e.preventDefault();
    clearContents();
  }
}

// 입력칸에 글자가 들어오면 입력 중으로 바꾸고, 수식 입력줄에도 같이 보여줍니다.
function onEditorInput() {
  if (!editing) {
    editing = true;
    editor.classList.add("editing");
  }
  document.getElementById("formula").textContent = editor.value;
}

// 마우스: 누르면 선택 시작(Shift 면 범위 넓히기), 끌면 범위 선택, 더블클릭이면 수정 시작.
function onGridMouseDown(e) {
  const td = e.target.closest("td[data-addr]");
  if (!td) return;
  e.preventDefault();
  commitEdit();
  dragging = true;
  selectCell(td.dataset.addr, e.shiftKey);
  editor.focus();
}

// 마우스로 끄는 동안 범위를 넓힙니다.
function onGridMouseOver(e) {
  const td = e.target.closest("td[data-addr]");
  if (dragging && td && td.dataset.addr !== active) selectCell(td.dataset.addr, true);
}

// 시트를 처음 준비합니다.
function initSheet() {
  editor = document.getElementById("cell-editor");
  buildReport();
  drawGrid();
  recalc();
  renderAll();
  editor.addEventListener("keydown", onEditorKey);
  editor.addEventListener("input", onEditorInput);
  editor.addEventListener("blur", () => { if (editing) commitEdit(); });
  const grid = document.querySelector(".xl-grid");
  grid.addEventListener("mousedown", onGridMouseDown);
  grid.addEventListener("mouseover", onGridMouseOver);
  document.addEventListener("mouseup", () => { dragging = false; });
  grid.addEventListener("dblclick", (e) => { if (e.target.closest("td[data-addr]")) startEdit(true); });
}

// 엑셀 화면이 보일 때 부릅니다. 선택한 셀 위치를 맞추고 바로 입력할 수 있게 합니다.
function focusSheet() {
  updateChrome();
  editor.focus();
}
