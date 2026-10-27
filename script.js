// ===== 첫 화면과 메뉴 =====

const menu = document.getElementById("menu");
const menuButton = document.querySelector(".menu-button");
const menuClose = document.querySelector(".menu-close");
const currentFilter = document.getElementById("current-filter");

// 지금 고른 분류 ("전체", "영상", "사진"). 카드를 만들 때 이 값으로 골라 보여 준다.
let selectedCategory = "전체";

// 원하는 칸으로 내려간다
function goTo(targetId) {
  const target = document.getElementById(targetId);
  if (target) {
    target.scrollIntoView();
  }
}

// 분류를 바꾼다
function setCategory(category) {
  selectedCategory = category;
  currentFilter.textContent = category;
}

function openMenu() {
  menu.hidden = false;
  menuButton.setAttribute("aria-expanded", "true");
  document.body.style.overflow = "hidden";
  menuClose.focus();
}

function closeMenu() {
  menu.hidden = true;
  menuButton.setAttribute("aria-expanded", "false");
  document.body.style.overflow = "";
  menuButton.focus();
}

// CONTACT, MOTION · ABOUT · STILLS: 해당 칸으로 내려간다
document.querySelectorAll(".contact-button, .hero-link").forEach(function (button) {
  button.addEventListener("click", function () {
    if (button.dataset.filter) {
      setCategory(button.dataset.filter);
    }
    goTo(button.dataset.target);
  });
});

// MENU 열고 닫기
menuButton.addEventListener("click", openMenu);
menuClose.addEventListener("click", closeMenu);

// 메뉴 안의 항목: 메뉴를 닫고 해당 칸으로 내려간다
document.querySelectorAll(".menu-link").forEach(function (button) {
  button.addEventListener("click", function () {
    closeMenu();
    if (button.dataset.target === "portfolio") {
      setCategory("전체");
    }
    goTo(button.dataset.target);
  });
});

// Esc 키로 메뉴 닫기
document.addEventListener("keydown", function (event) {
  if (event.key === "Escape" && !menu.hidden) {
    closeMenu();
  }
});

// 첫 화면을 조금이라도 내려가면 맨 위 줄에 어두운 바탕을 깐다
const topbar = document.querySelector(".topbar");

function updateTopbar() {
  topbar.classList.toggle("scrolled", window.scrollY > 40);
}

window.addEventListener("scroll", updateTopbar);
updateTopbar();
