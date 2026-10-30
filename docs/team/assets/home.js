// 홈 화면 렌더링 — project.js 와 각 팀원의 info.js 를 읽어서 화면을 만듭니다.
// (공용 파일: 팀장만 수정)
const STATUS_CLASS = { "준비 중": "todo", "진행 중": "doing", "완료": "done" };

document.addEventListener("DOMContentLoaded", () => {
  document.title = PROJECT.name;
  document.getElementById("project-summary").textContent = PROJECT.summary;

  const goals = document.getElementById("project-goals");
  PROJECT.goals.forEach((goal) => {
    const li = document.createElement("li");
    li.textContent = goal;
    goals.appendChild(li);
  });

  const grid = document.getElementById("member-grid");
  MEMBERS.forEach((m) => {
    const card = document.createElement("a");
    card.className = "card";
    card.href = `members/${m.id}/index.html`;
    card.style.setProperty("--accent", m.color);
    card.innerHTML = `
      <span class="emoji">${m.emoji}</span>
      <strong class="name"></strong>
      <span class="role"></span>
      <span class="status ${STATUS_CLASS[m.status] || "todo"}"></span>
    `;
    card.querySelector(".name").textContent = m.name;
    card.querySelector(".role").textContent = m.role;
    card.querySelector(".status").textContent = m.status;
    grid.appendChild(card);
  });
});
