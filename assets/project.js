// 프로젝트 기본 정보 — 프로젝트 이름이 바뀌면 여기만 고치면 홈과 모든 팀원 페이지에 반영됩니다.
// (공용 파일: 팀장만 수정)
const PROJECT = {
  name: "딴짓보호로봇",
  tag: "가제",
  summary: "프로젝트 한 줄 소개를 여기에 적어주세요.",
  goals: [
    "목표 1을 적어주세요.",
    "목표 2를 적어주세요.",
    "목표 3을 적어주세요.",
  ],
};

// 팀원 정보는 각자 members/내폴더/info.js 에서 registerMember(...) 로 등록합니다.
const MEMBERS = [];
function registerMember(info) {
  MEMBERS.push(info);
}

// 팀원 페이지 상단의 프로젝트 이름 표시용
document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll("[data-project-name]").forEach((el) => {
    el.textContent = PROJECT.tag ? `${PROJECT.name} (${PROJECT.tag})` : PROJECT.name;
  });
});
