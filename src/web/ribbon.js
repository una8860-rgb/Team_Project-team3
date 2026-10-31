// 엑셀 리본 메뉴: 버튼(data-cmd)과 선택 상자(data-ctl)를 sheet.js 의 기능에 연결합니다.

let fillColor = "#ffff00"; // 채우기 색 버튼이 칠할 색
let fontColor = "#ff0000"; // 글꼴 색 버튼이 칠할 색

// 버튼 이름 → 할 일
const RIBBON_COMMANDS = {
  undo, redo,
  paste: pasteCells,
  cut: () => copyCells(true),
  copy: () => copyCells(false),
  painter: pickPainter,
  sizeUp: () => changeSize(1),
  sizeDown: () => changeSize(-1),
  bold: () => toggleStyle("bold"),
  italic: () => toggleStyle("italic"),
  underline: () => toggleStyle("underline"),
  strike: () => toggleStyle("strike"),
  border: () => toggleStyle("border"),
  fill: () => setStyle({ fill: fillColor }),
  color: () => setStyle({ color: fontColor }),
  vtop: () => setStyle({ valign: "top" }),
  vmiddle: () => setStyle({ valign: "middle" }),
  vbottom: () => setStyle({ valign: "bottom" }),
  left: () => setStyle({ halign: "left", indent: 0 }),
  center: () => setStyle({ halign: "center", indent: 0 }),
  right: () => setStyle({ halign: "right", indent: 0 }),
  outdent: () => changeIndent(-1),
  indent: () => changeIndent(1),
  wrap: () => toggleStyle("wrap"),
  merge: () => setStyle({ halign: "center" }), // 실제 병합 대신 가운데 맞춤만 합니다
  currency: () => setStyle({ numFmt: "currency" }),
  percent: () => setStyle({ numFmt: "percent", decimals: 0 }),
  comma: () => setStyle({ numFmt: "number" }),
  decUp: () => changeDecimals(1),
  decDown: () => changeDecimals(-1),
  autosum: autoSum,
  clearFmt: clearFormats,
};

// 선택 상자가 바뀌었을 때 할 일
const RIBBON_CONTROLS = {
  font: (v) => setStyle({ font: v }),
  size: (v) => setStyle({ size: +v }),
  numFmt: (v) => setStyle({ numFmt: v }),
  fillColor: (v) => { fillColor = v; document.getElementById("fill-bar").setAttribute("fill", v); setStyle({ fill: v }); },
  fontColor: (v) => { fontColor = v; document.getElementById("color-bar").style.background = v; setStyle({ color: v }); },
};

// 리본이 선택한 셀의 서식을 보여주도록 맞춥니다. (굵게 눌림, 글꼴·크기·표시 형식)
function showSelectionInRibbon(style, cell) {
  const bold = style.bold ?? (cell ? isBoldByDefault(cell) : false);
  const on = { bold, italic: style.italic, underline: style.underline, strike: style.strike, border: style.border, wrap: style.wrap,
    left: style.halign === "left", center: style.halign === "center", right: style.halign === "right",
    vtop: style.valign === "top", vmiddle: style.valign === "middle", vbottom: style.valign === "bottom" };
  document.querySelectorAll(".xl-ribbon [data-cmd]").forEach((b) => b.classList.toggle("on", !!on[b.dataset.cmd]));
  document.querySelector('[data-ctl="font"]').value = style.font || "맑은 고딕";
  document.querySelector('[data-ctl="size"]').value = String(style.size || 10);
  const pct = cell && cell.fmt === "pct";
  document.querySelector('[data-ctl="numFmt"]').value = style.numFmt || (pct ? "percent" : "general");
}

// 리본 버튼·선택 상자를 연결합니다.
function initRibbon() {
  const ribbon = document.querySelector(".xl-ribbon");
  // 버튼을 눌러도 셀 입력칸에서 커서가 빠지지 않게 합니다.
  ribbon.addEventListener("mousedown", (e) => { if (e.target.closest("button")) e.preventDefault(); });
  ribbon.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-cmd]");
    if (btn && RIBBON_COMMANDS[btn.dataset.cmd]) RIBBON_COMMANDS[btn.dataset.cmd]();
  });
  ribbon.querySelectorAll("[data-ctl]").forEach((el) => {
    el.addEventListener("change", () => RIBBON_CONTROLS[el.dataset.ctl](el.value));
  });
  onSelectionChange = showSelectionInRibbon;
}
