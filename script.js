// ===== Supabase 연결 정보 (공개 키만 넣는다) =====
const SUPABASE_URL = "https://mleyapzurbkmgkoczdin.supabase.co";
const SUPABASE_KEY = "sb_publishable_ZqafFtsKN_65vi1st9fk4A_IYm5vcX8";

// Supabase 표에 요청을 보낸다. 실패하면 오류를 던진다.
async function api(path, options) {
  const settings = options || {};
  const response = await fetch(SUPABASE_URL + "/rest/v1/" + path, {
    method: settings.method || "GET",
    headers: Object.assign(
      { apikey: SUPABASE_KEY, "Content-Type": "application/json" },
      settings.headers || {}
    ),
    body: settings.body ? JSON.stringify(settings.body) : undefined,
  });
  if (!response.ok) {
    const error = new Error("Supabase 요청 실패: " + response.status);
    error.status = response.status;
    throw error;
  }
  // 돌려준 내용이 없으면(좋아요 저장 등) null
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

// http(s) 주소만 쓴다 (이상한 주소가 들어와도 실행되지 않게)
function safeUrl(url) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return parsed.href;
    }
  } catch (error) {
    // 주소가 아니면 아래에서 빈 값
  }
  return "";
}

// 브라우저 저장소는 막혀 있을 수 있어서 항상 try로 감싼다
function readStorage(key) {
  try {
    return localStorage.getItem(key);
  } catch (error) {
    return null;
  }
}

function writeStorage(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch (error) {
    // 저장이 안 되어도 화면은 그대로 동작한다
  }
}


// ===== 첫 화면과 메뉴 =====

const menu = document.getElementById("menu");
const menuButton = document.querySelector(".menu-button");
const menuClose = document.querySelector(".menu-close");

// 원하는 칸으로 내려간다
function goTo(targetId) {
  const target = document.getElementById(targetId);
  if (target) {
    target.scrollIntoView();
  }
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


// ===== ABOUT ME + PORTFOLIO 글 (profile 표) =====

function setText(id, text) {
  document.getElementById(id).textContent = text || "";
}

function showProfile(profile) {
  // 브라우저 탭 제목: "이름 포트폴리오"
  if (profile.name) {
    document.title = profile.name + " 포트폴리오";
  }

  setText("profile-name", profile.name);
  setText("profile-title", profile.title);
  setText("info-name", profile.name);
  setText("info-location", profile.location);

  const badge = document.getElementById("profile-badge");
  badge.textContent = profile.career_badge || "";
  badge.hidden = !profile.career_badge;

  const email = document.getElementById("info-email");
  email.textContent = profile.email || "";
  email.href = "mailto:" + (profile.email || "");

  const phone = document.getElementById("info-phone");
  phone.textContent = profile.phone || "";
  phone.href = "tel:" + (profile.phone || "").replace(/[^0-9+]/g, "");

  const photoUrl = safeUrl(profile.photo_url);
  if (photoUrl) {
    const photo = document.getElementById("profile-photo");
    const image = document.createElement("img");
    image.src = photoUrl;
    image.alt = (profile.name || "") + " 프로필 사진";
    photo.replaceChildren(image);
  }

  setText("headline", profile.headline);
  setText("intro", profile.intro);
  setText("education", profile.education);
  setText("skills", profile.skills);
  setText("experience", profile.experience);

  const quote = document.getElementById("quote");
  quote.textContent = profile.quote || "";
  quote.hidden = !profile.quote;
}

async function loadProfile() {
  const rows = await api("resume_profile?id=eq.1&select=*");
  if (rows.length > 0) {
    showProfile(rows[0]);
  }
}


// ===== PORTFOLIO HIGHLIGHTS 카드 (projects · likes 표) =====

const cardList = document.getElementById("cards");
const cardsEmpty = document.getElementById("cards-empty");

let projects = [];
let likeCounts = {};
// 지금 고른 분류 ("전체", "영상", "사진")
let selectedCategory = "전체";

// 이 브라우저의 번호 (좋아요를 카드마다 한 번만 누르게 할 때 쓴다)
function getClientId() {
  let id = readStorage("resume_client_id");
  if (!id) {
    id = crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2);
    writeStorage("resume_client_id", id);
  }
  return id;
}

// 이 브라우저에서 좋아요를 누른 카드 번호 목록
function getLikedIds() {
  try {
    return JSON.parse(readStorage("resume_liked") || "[]");
  } catch (error) {
    return [];
  }
}

function rememberLiked(projectId) {
  const liked = getLikedIds();
  if (!liked.includes(projectId)) {
    liked.push(projectId);
    writeStorage("resume_liked", JSON.stringify(liked));
  }
}

// 분류를 바꾼다
function setCategory(category) {
  selectedCategory = category;
  document.querySelectorAll(".filter-button").forEach(function (button) {
    button.setAttribute("aria-pressed", String(button.dataset.category === category));
  });
  renderCards();
}

document.querySelectorAll(".filter-button").forEach(function (button) {
  button.addEventListener("click", function () {
    setCategory(button.dataset.category);
  });
});

// 카드 하나를 만든다
function makeCard(project) {
  const card = document.createElement("article");
  card.className = "card";

  // 카드를 누르면 열 주소 (영상: 유튜브·비메오, 사진: 이미지·PDF)
  const fileUrl = safeUrl(project.file_url);
  const main = document.createElement(fileUrl ? "a" : "div");
  main.className = "card-main";
  if (fileUrl) {
    main.href = fileUrl;
    main.target = "_blank";
    main.rel = "noopener";
  }

  // 브라우저 창 모양 썸네일
  const thumb = document.createElement("div");
  thumb.className = "card-thumb";
  const bar = document.createElement("div");
  bar.className = "card-thumb-bar";
  bar.innerHTML = "<span></span><span></span><span></span>";
  thumb.appendChild(bar);

  const thumbUrl = safeUrl(project.thumbnail_url);
  if (thumbUrl) {
    const image = document.createElement("img");
    image.src = thumbUrl;
    image.alt = "";
    image.loading = "lazy";
    thumb.appendChild(image);
  } else {
    const blank = document.createElement("div");
    blank.className = "card-thumb-blank";
    blank.textContent = project.category === "영상" ? "MOTION" : "STILLS";
    thumb.appendChild(blank);
  }
  main.appendChild(thumb);

  const body = document.createElement("div");
  body.className = "card-body";

  const meta = document.createElement("p");
  meta.className = "card-meta";
  meta.textContent = (project.number ? project.number + " · " : "") +
    (project.category === "영상" ? "MOTION" : "STILLS");
  body.appendChild(meta);

  const title = document.createElement("h4");
  title.className = "card-title";
  title.textContent = project.title;
  body.appendChild(title);

  if (project.description) {
    const description = document.createElement("p");
    description.className = "card-description";
    description.textContent = project.description;
    body.appendChild(description);
  }

  if (project.tags && project.tags.length > 0) {
    const tags = document.createElement("ul");
    tags.className = "card-tags";
    project.tags.forEach(function (tag) {
      const item = document.createElement("li");
      item.textContent = tag;
      tags.appendChild(item);
    });
    body.appendChild(tags);
  }

  main.appendChild(body);
  card.appendChild(main);

  // 좋아요 버튼
  const liked = getLikedIds().includes(project.id);
  const likeButton = document.createElement("button");
  likeButton.type = "button";
  likeButton.className = "like-button";
  likeButton.setAttribute("aria-pressed", String(liked));
  likeButton.setAttribute("aria-label", "좋아요");
  likeButton.innerHTML =
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-7.5-4.6-9.6-9.2C.9 8.4 3 4.5 6.7 4.5c2.1 0 3.6 1.2 4.3 2.4.7-1.2 2.2-2.4 4.3-2.4 3.7 0 5.8 3.9 4.3 7.3C19.5 16.4 12 21 12 21z"/></svg>';
  const count = document.createElement("span");
  count.className = "like-count";
  count.textContent = likeCounts[project.id] || 0;
  likeButton.appendChild(count);
  likeButton.addEventListener("click", function () {
    likeProject(project.id, likeButton);
  });
  card.appendChild(likeButton);

  return card;
}

function renderCards() {
  const visible = projects.filter(function (project) {
    return selectedCategory === "전체" || project.category === selectedCategory;
  });
  cardList.replaceChildren.apply(cardList, visible.map(makeCard));
  cardsEmpty.hidden = visible.length > 0;
}

async function likeProject(projectId, button) {
  if (button.getAttribute("aria-pressed") === "true" || button.disabled) {
    return;
  }
  button.disabled = true;
  try {
    await api("resume_likes", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: { project_id: projectId, client_id: getClientId() },
    });
    likeCounts[projectId] = (likeCounts[projectId] || 0) + 1;
    rememberLiked(projectId);
  } catch (error) {
    if (error.status === 409) {
      // 이 브라우저는 이미 눌렀다
      rememberLiked(projectId);
    } else {
      alert("좋아요를 저장하지 못했어요. 잠시 뒤 다시 눌러 주세요.");
    }
  }
  button.disabled = false;
  renderCards();
}

async function loadProjects() {
  const results = await Promise.all([
    api("resume_projects?select=*&order=sort_order.asc,id.asc"),
    api("resume_likes?select=project_id"),
  ]);
  projects = results[0];
  likeCounts = {};
  results[1].forEach(function (like) {
    likeCounts[like.project_id] = (likeCounts[like.project_id] || 0) + 1;
  });
  renderCards();
}


// ===== 방명록 (resume_guestbook 표) =====

const guestNickname = document.getElementById("guest-nickname");
const guestMessage = document.getElementById("guest-message");
const guestCounter = document.getElementById("guest-counter");
const guestSubmit = document.getElementById("guest-submit");
const guestStatus = document.getElementById("guest-status");
const guestList = document.getElementById("guest-list");
const guestEmpty = document.getElementById("guest-empty");

// 2026.10.27 14:05 모양으로 날짜를 쓴다
function formatDate(value) {
  const date = new Date(value);
  const pad = function (number) {
    return String(number).padStart(2, "0");
  };
  return date.getFullYear() + "." + pad(date.getMonth() + 1) + "." + pad(date.getDate()) +
    " " + pad(date.getHours()) + ":" + pad(date.getMinutes());
}

function makeGuestItem(entry) {
  const item = document.createElement("li");
  item.className = "guestbook-item";

  const head = document.createElement("p");
  head.className = "guestbook-head";
  const name = document.createElement("strong");
  name.textContent = entry.nickname;
  const time = document.createElement("time");
  time.dateTime = entry.created_at;
  time.textContent = formatDate(entry.created_at);
  head.append(name, time);

  const message = document.createElement("p");
  message.className = "guestbook-message";
  message.textContent = entry.message;

  item.append(head, message);
  return item;
}

function updateGuestEmpty() {
  guestEmpty.hidden = guestList.children.length > 0;
}

// 최신 글 100개를 불러온다
async function loadGuestbook() {
  const rows = await api("resume_guestbook?select=*&order=created_at.desc,id.desc&limit=100");
  guestList.replaceChildren.apply(guestList, rows.map(makeGuestItem));
  updateGuestEmpty();
}

guestMessage.addEventListener("input", function () {
  guestCounter.textContent = guestMessage.value.length + " / 200";
});

async function submitGuestbook() {
  const nickname = guestNickname.value.trim();
  const message = guestMessage.value.trim();
  if (!nickname || !message) {
    guestStatus.textContent = "별명과 한마디를 모두 적어 주세요.";
    return;
  }

  guestSubmit.disabled = true;
  guestStatus.textContent = "남기는 중…";
  try {
    const rows = await api("resume_guestbook?select=*", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: { nickname: nickname, message: message },
    });
    guestList.prepend(makeGuestItem(rows[0]));
    updateGuestEmpty();
    guestMessage.value = "";
    guestCounter.textContent = "0 / 200";
    guestStatus.textContent = "남겼어요. 고마워요!";
  } catch (error) {
    console.error(error);
    guestStatus.textContent = "남기지 못했어요. 잠시 뒤 다시 눌러 주세요.";
  }
  guestSubmit.disabled = false;
}

guestSubmit.addEventListener("click", submitGuestbook);


// ===== 처음 열 때 불러오기 =====
Promise.all([loadProfile(), loadProjects(), loadGuestbook()]).catch(function (error) {
  console.error(error);
  document.getElementById("load-error").hidden = false;
});
