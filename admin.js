// ===== Supabase 연결 정보 (공개 키만 넣는다) =====
const SUPABASE_URL = "https://mleyapzurbkmgkoczdin.supabase.co";
const SUPABASE_KEY = "sb_publishable_ZqafFtsKN_65vi1st9fk4A_IYm5vcX8";
const BUCKET = "resume";
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB (보관함 설정과 같다)
const SESSION_KEY = "resume_admin_session";

// 화면에서 버튼을 숨기는 것은 편의일 뿐이다.
// 실제로 관리자만 고칠 수 있게 막는 것은 Supabase 규칙(resume.sql)이다.


// ===== 로그인 정보 보관 =====

let session = null;

function saveSession(value) {
  session = value;
  try {
    if (value) {
      localStorage.setItem(SESSION_KEY, JSON.stringify(value));
    } else {
      localStorage.removeItem(SESSION_KEY);
    }
  } catch (error) {
    // 저장이 막혀 있어도 이 탭에서는 계속 쓸 수 있다
  }
}

function loadSession() {
  try {
    return JSON.parse(localStorage.getItem(SESSION_KEY) || "null");
  } catch (error) {
    return null;
  }
}

// Supabase가 돌려준 로그인 정보에서 필요한 것만 남긴다
function toSession(data) {
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: data.expires_at || Math.floor(Date.now() / 1000) + (data.expires_in || 3600),
    email: data.user ? data.user.email : "",
  };
}

async function authRequest(path, body) {
  const response = await fetch(SUPABASE_URL + "/auth/v1/" + path, {
    method: "POST",
    headers: { apikey: SUPABASE_KEY, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(function () {
    return {};
  });
  if (!response.ok) {
    const error = new Error(data.error_description || data.msg || data.message || "로그인 실패");
    error.status = response.status;
    throw error;
  }
  return data;
}

// 로그인 유효 시간이 1분도 안 남았으면 새로 받는다
async function getAccessToken() {
  if (!session) {
    throw new Error("로그인이 필요해요.");
  }
  if (session.expires_at * 1000 - 60000 < Date.now()) {
    try {
      const data = await authRequest("token?grant_type=refresh_token", {
        refresh_token: session.refresh_token,
      });
      saveSession(toSession(data));
    } catch (error) {
      saveSession(null);
      showLogin("로그인 시간이 끝났어요. 다시 로그인해 주세요.");
      throw error;
    }
  }
  return session.access_token;
}


// ===== Supabase 요청 =====

// 표에 요청을 보낸다 (로그인한 관리자 이름으로)
async function api(path, options) {
  const settings = options || {};
  const token = await getAccessToken();
  const response = await fetch(SUPABASE_URL + "/rest/v1/" + path, {
    method: settings.method || "GET",
    headers: Object.assign(
      {
        apikey: SUPABASE_KEY,
        Authorization: "Bearer " + token,
        "Content-Type": "application/json",
      },
      settings.headers || {}
    ),
    body: settings.body ? JSON.stringify(settings.body) : undefined,
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) {
    const error = new Error((data && data.message) || "요청 실패: " + response.status);
    error.status = response.status;
    throw error;
  }
  return data;
}

// 고치기·지우기: 규칙에 막히면 Supabase는 오류 대신 "0줄 바뀜"을 돌려준다.
// 그래서 바뀐 줄을 돌려받아 0줄이면 권한 오류로 알린다.
async function change(path, method, body, prefer) {
  const rows = await api(path, {
    method: method,
    headers: { Prefer: (prefer ? prefer + "," : "") + "return=representation" },
    body: body,
  });
  if (!rows || rows.length === 0) {
    throw new Error("바뀐 것이 없어요. 관리자 권한을 확인해 주세요.");
  }
  return rows;
}

// 파일을 보관함에 올리고 공개 주소를 돌려준다
async function uploadFile(file, folder) {
  if (file.size > MAX_FILE_SIZE) {
    throw new Error("파일이 10MB보다 커요: " + file.name);
  }
  const extension = (file.name.split(".").pop() || "bin").toLowerCase().replace(/[^a-z0-9]/g, "");
  const name = folder + "/" + Date.now() + "-" + Math.random().toString(36).slice(2, 8) + "." + extension;
  const token = await getAccessToken();
  const response = await fetch(SUPABASE_URL + "/storage/v1/object/" + BUCKET + "/" + name, {
    method: "POST",
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: "Bearer " + token,
      "Content-Type": file.type || "application/octet-stream",
    },
    body: file,
  });
  if (!response.ok) {
    const data = await response.json().catch(function () {
      return {};
    });
    throw new Error("파일을 올리지 못했어요: " + (data.message || data.error || response.status));
  }
  return SUPABASE_URL + "/storage/v1/object/public/" + BUCKET + "/" + name;
}


// ===== 화면 도우미 =====

function $(id) {
  return document.getElementById(id);
}

function setStatus(element, message, isError) {
  element.textContent = message;
  element.classList.toggle("error", Boolean(isError));
}

// http(s) 주소만 쓴다
function safeUrl(url) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return parsed.href;
    }
  } catch (error) {
    // 주소가 아니다
  }
  return "";
}

function showPreview(image, url) {
  const safe = safeUrl(url);
  image.hidden = !safe;
  if (safe) {
    image.src = safe;
  } else {
    image.removeAttribute("src");
  }
}

function makeButton(label, className, onClick) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = className;
  button.textContent = label;
  button.addEventListener("click", onClick);
  return button;
}


// ===== 로그인 · 로그아웃 =====

function showLogin(message) {
  $("admin-view").hidden = true;
  $("login-view").hidden = false;
  document.querySelectorAll(".signed-in").forEach(function (element) {
    element.hidden = true;
  });
  setStatus($("login-status"), message || "", Boolean(message));
}

async function showAdmin() {
  // 관리자 명단에 있는지 확인한다 (규칙상 자기 줄만 보인다)
  const rows = await api("resume_admins?select=user_id");
  if (rows.length === 0) {
    await logout();
    showLogin("관리자로 등록된 계정이 아니에요.");
    return;
  }
  $("login-view").hidden = true;
  $("admin-view").hidden = false;
  document.querySelectorAll(".signed-in").forEach(function (element) {
    element.hidden = false;
  });
  await Promise.all([loadProfile(), loadProjects(), loadGuestbook()]);
  resetProjectForm();
}

async function login() {
  const email = $("login-email").value.trim();
  const password = $("login-password").value;
  const status = $("login-status");
  if (!email || !password) {
    setStatus(status, "이메일과 비밀번호를 적어 주세요.", true);
    return;
  }
  $("login-button").disabled = true;
  setStatus(status, "로그인하는 중…");
  try {
    const data = await authRequest("token?grant_type=password", { email: email, password: password });
    saveSession(toSession(data));
    $("login-password").value = "";
    setStatus(status, "");
    await showAdmin();
  } catch (error) {
    console.error(error);
    setStatus(status, error.status === 400 ? "이메일이나 비밀번호가 맞지 않아요." : "로그인하지 못했어요: " + error.message, true);
  }
  $("login-button").disabled = false;
}

async function logout() {
  if (session) {
    try {
      await fetch(SUPABASE_URL + "/auth/v1/logout", {
        method: "POST",
        headers: { apikey: SUPABASE_KEY, Authorization: "Bearer " + session.access_token },
      });
    } catch (error) {
      // 서버에 못 알려도 이 브라우저에서는 로그아웃한다
    }
  }
  saveSession(null);
}

$("login-button").addEventListener("click", login);
$("login-password").addEventListener("keydown", function (event) {
  if (event.key === "Enter") {
    login();
  }
});
$("logout-button").addEventListener("click", async function () {
  await logout();
  showLogin();
});


// ===== 프로필 =====

let profilePhotoUrl = null;

async function loadProfile() {
  const rows = await api("resume_profile?id=eq.1&select=*");
  const profile = rows[0] || {};
  document.querySelectorAll("[data-field]").forEach(function (input) {
    input.value = profile[input.dataset.field] || "";
  });
  profilePhotoUrl = profile.photo_url || null;
  showPreview($("profile-photo-preview"), profilePhotoUrl);
  $("profile-photo-file").value = "";
}

$("profile-photo-file").addEventListener("change", function () {
  const file = $("profile-photo-file").files[0];
  if (file) {
    $("profile-photo-preview").src = URL.createObjectURL(file);
    $("profile-photo-preview").hidden = false;
  }
});

$("profile-photo-remove").addEventListener("click", function () {
  profilePhotoUrl = null;
  $("profile-photo-file").value = "";
  showPreview($("profile-photo-preview"), null);
});

async function saveProfile() {
  const status = $("profile-status");
  const button = $("profile-save");
  button.disabled = true;
  setStatus(status, "저장하는 중…");
  try {
    const body = { id: 1, updated_at: new Date().toISOString() };
    document.querySelectorAll("[data-field]").forEach(function (input) {
      body[input.dataset.field] = input.value.trim();
    });

    const file = $("profile-photo-file").files[0];
    if (file) {
      profilePhotoUrl = await uploadFile(file, "profile");
    }
    body.photo_url = profilePhotoUrl;

    // 줄이 있으면 고치고, 없으면 새로 만든다
    await change("resume_profile?on_conflict=id", "POST", body, "resolution=merge-duplicates");
    await loadProfile();
    setStatus(status, "저장했어요. 사이트를 새로고침하면 보여요.");
  } catch (error) {
    console.error(error);
    setStatus(status, "저장하지 못했어요: " + error.message, true);
  }
  button.disabled = false;
}

$("profile-save").addEventListener("click", saveProfile);


// ===== 포트폴리오 카드 =====

let projects = [];
let editingId = null; // 고치는 중인 카드 번호 (새 카드면 null)
let thumbnailUrl = null;

async function loadProjects() {
  const results = await Promise.all([
    api("resume_projects?select=*&order=sort_order.asc,id.asc"),
    api("resume_likes?select=project_id"),
  ]);
  projects = results[0];
  const likeCounts = {};
  results[1].forEach(function (like) {
    likeCounts[like.project_id] = (likeCounts[like.project_id] || 0) + 1;
  });

  const list = $("projects-list");
  list.replaceChildren.apply(list, projects.map(function (project) {
    const item = document.createElement("li");
    item.className = "list-item";

    const thumb = document.createElement("img");
    thumb.className = "list-thumb";
    thumb.alt = "";
    showPreview(thumb, project.thumbnail_url);
    thumb.hidden = false;

    const main = document.createElement("div");
    main.className = "list-main";
    const title = document.createElement("p");
    title.className = "list-title";
    title.textContent = project.title;
    const sub = document.createElement("p");
    sub.className = "list-sub";
    sub.textContent = [
      project.number,
      project.category === "영상" ? "영상 (MOTION)" : "사진 (STILLS)",
      "순서 " + project.sort_order,
    ].filter(Boolean).join(" · ");
    main.append(title, sub);

    const likes = document.createElement("span");
    likes.className = "likes";
    likes.textContent = "♥ " + (likeCounts[project.id] || 0);

    const tools = document.createElement("div");
    tools.className = "list-tools";
    tools.append(
      makeButton("수정", "btn small", function () {
        startEdit(project);
      }),
      makeButton("삭제", "btn small danger", function () {
        deleteProject(project);
      })
    );

    item.append(thumb, main, likes, tools);
    return item;
  }));
  $("projects-empty").hidden = projects.length > 0;
}

// 분류에 따라 "누르면 열 주소" 안내를 바꾼다
function updateFileLabel() {
  const isMotion = $("c-category").value === "영상";
  $("c-file-label").textContent = isMotion
    ? "누르면 열 영상 주소 (유튜브 · 비메오)"
    : "누르면 열 주소 (사진 · PDF 주소)";
  $("c-upload-field").hidden = isMotion;
}

$("c-category").addEventListener("change", updateFileLabel);

function resetProjectForm() {
  editingId = null;
  thumbnailUrl = null;
  $("project-form-title").textContent = "새 카드 추가";
  $("c-number").value = "";
  $("c-category").value = "영상";
  $("c-title").value = "";
  $("c-description").value = "";
  $("c-tags").value = "";
  $("c-sort").value = String(projects.length + 1);
  $("c-file-url").value = "";
  $("c-thumb-file").value = "";
  $("c-file").value = "";
  showPreview($("c-thumb-preview"), null);
  $("project-cancel").hidden = true;
  updateFileLabel();
}

function startEdit(project) {
  editingId = project.id;
  thumbnailUrl = project.thumbnail_url || null;
  $("project-form-title").textContent = "카드 수정: " + project.title;
  $("c-number").value = project.number || "";
  $("c-category").value = project.category === "영상" ? "영상" : "사진";
  $("c-title").value = project.title || "";
  $("c-description").value = project.description || "";
  $("c-tags").value = (project.tags || []).join(", ");
  $("c-sort").value = String(project.sort_order || 0);
  $("c-file-url").value = project.file_url || "";
  $("c-thumb-file").value = "";
  $("c-file").value = "";
  showPreview($("c-thumb-preview"), thumbnailUrl);
  $("project-cancel").hidden = false;
  setStatus($("project-status"), "");
  updateFileLabel();
  $("project-form-title").scrollIntoView({ behavior: "smooth", block: "start" });
}

$("project-cancel").addEventListener("click", function () {
  resetProjectForm();
  setStatus($("project-status"), "");
});

$("c-thumb-file").addEventListener("change", function () {
  const file = $("c-thumb-file").files[0];
  if (file) {
    $("c-thumb-preview").src = URL.createObjectURL(file);
    $("c-thumb-preview").hidden = false;
  }
});

$("c-thumb-remove").addEventListener("click", function () {
  thumbnailUrl = null;
  $("c-thumb-file").value = "";
  showPreview($("c-thumb-preview"), null);
});

async function saveProject() {
  const status = $("project-status");
  const button = $("project-save");
  const title = $("c-title").value.trim();
  if (!title) {
    setStatus(status, "제목을 적어 주세요.", true);
    return;
  }

  let fileUrl = $("c-file-url").value.trim();
  if (fileUrl && !safeUrl(fileUrl)) {
    setStatus(status, "주소는 https:// 로 시작해야 해요.", true);
    return;
  }

  button.disabled = true;
  setStatus(status, "저장하는 중…");
  try {
    const thumbFile = $("c-thumb-file").files[0];
    if (thumbFile) {
      thumbnailUrl = await uploadFile(thumbFile, "thumbnails");
    }
    const attachment = $("c-category").value === "사진" ? $("c-file").files[0] : null;
    if (attachment) {
      fileUrl = await uploadFile(attachment, "files");
    }

    const body = {
      number: $("c-number").value.trim(),
      category: $("c-category").value,
      title: title,
      description: $("c-description").value.trim(),
      tags: $("c-tags").value.split(",").map(function (tag) {
        return tag.trim();
      }).filter(Boolean),
      sort_order: parseInt($("c-sort").value, 10) || 0,
      thumbnail_url: thumbnailUrl,
      file_url: fileUrl || null,
    };

    if (editingId) {
      await change("resume_projects?id=eq." + editingId, "PATCH", body);
    } else {
      await change("resume_projects", "POST", body);
    }
    await loadProjects();
    resetProjectForm();
    setStatus(status, "저장했어요. 사이트를 새로고침하면 보여요.");
  } catch (error) {
    console.error(error);
    setStatus(status, "저장하지 못했어요: " + error.message, true);
  }
  button.disabled = false;
}

$("project-save").addEventListener("click", saveProject);

async function deleteProject(project) {
  if (!confirm("'" + project.title + "' 카드를 지울까요? 이 카드의 좋아요도 함께 지워져요.")) {
    return;
  }
  try {
    await change("resume_projects?id=eq." + project.id, "DELETE");
    if (editingId === project.id) {
      resetProjectForm();
    }
    await loadProjects();
    setStatus($("project-status"), "카드를 지웠어요.");
  } catch (error) {
    console.error(error);
    setStatus($("project-status"), "지우지 못했어요: " + error.message, true);
  }
}


// ===== 방명록 =====

function formatDate(value) {
  const date = new Date(value);
  const pad = function (number) {
    return String(number).padStart(2, "0");
  };
  return date.getFullYear() + "." + pad(date.getMonth() + 1) + "." + pad(date.getDate()) +
    " " + pad(date.getHours()) + ":" + pad(date.getMinutes());
}

async function loadGuestbook() {
  const rows = await api("resume_guestbook?select=*&order=created_at.desc,id.desc");
  const list = $("guest-list");
  list.replaceChildren.apply(list, rows.map(function (entry) {
    const item = document.createElement("li");
    item.className = "list-item";

    const main = document.createElement("div");
    main.className = "list-main";
    const title = document.createElement("p");
    title.className = "list-title";
    title.textContent = entry.nickname;
    const sub = document.createElement("p");
    sub.className = "list-sub";
    sub.textContent = formatDate(entry.created_at) + "\n" + entry.message;
    main.append(title, sub);

    const tools = document.createElement("div");
    tools.className = "list-tools";
    tools.append(makeButton("삭제", "btn small danger", async function () {
      if (!confirm(entry.nickname + " 님의 글을 지울까요?")) {
        return;
      }
      try {
        await change("resume_guestbook?id=eq." + entry.id, "DELETE");
        await loadGuestbook();
      } catch (error) {
        console.error(error);
        alert("지우지 못했어요: " + error.message);
      }
    }));

    item.append(main, tools);
    return item;
  }));
  $("guest-empty").hidden = rows.length > 0;
}


// ===== 처음 열 때 =====

(async function start() {
  session = loadSession();
  if (!session) {
    showLogin();
    return;
  }
  try {
    await showAdmin();
  } catch (error) {
    console.error(error);
    if (session) {
      showLogin("불러오지 못했어요. 다시 로그인해 주세요.");
    }
  }
})();
