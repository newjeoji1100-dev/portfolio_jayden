-- =====================================================================
-- resume.sql : 포트폴리오 홈페이지용 Supabase 설정
--
-- 사용법
--   1) Supabase > Authentication > Users 에서 관리자 계정(이메일·비밀번호)을 먼저 만든다.
--   2) 이 파일 맨 아래 "관리자 등록" 줄의 이메일을 내 관리자 이메일로 바꾼다.
--   3) Supabase > SQL Editor 에 전체를 붙여 넣고 Run 한다. (몇 번 실행해도 오류 없음)
--   4) (권장) Authentication > Sign In / Providers 에서 "Allow new users to sign up" 을 끈다.
--      켜 두어도 관리자 목록에 없는 사람은 아무것도 못 고치지만, 모르는 계정이 생기지 않게 한다.
--
-- 주의: 이미 있는 guestbook 표와 photos 보관함은 절대 건드리지 않는다.
--       여기서 만드는 것은 admins, profile, projects, likes, resume_guestbook 표와
--       resume 보관함, 그리고 그 이름들에 붙는 규칙뿐이다.
--
-- 이 사이트(명세.md)에 맞춰 원본에서 조정한 점
--   - projects.category 는 '영상'(MOTION) 또는 '사진'(STILLS)만 넣을 수 있다.
--   - 방문자는 방명록에 별명·한마디만, 좋아요에 카드 번호·브라우저 번호만 넣을 수 있다.
--     (작성 시각을 미래로 꾸며 목록 맨 위에 계속 고정하는 일을 막는다)
--   - 예시 데이터를 지금 화면(영상·사진 작가 김지영)에 맞췄다. 전부 가짜다.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. 표 만들기
-- ---------------------------------------------------------------------

-- 관리자 목록 (여기에 id가 있는 사람만 관리자)
create table if not exists public.admins (
  user_id uuid primary key references auth.users (id) on delete cascade
);

-- 프로필 (딱 한 줄만 있다: id는 항상 1)
create table if not exists public.profile (
  id           int primary key check (id = 1),
  name         text not null default '',
  title        text not null default '',
  career_badge text not null default '',
  email        text not null default '',
  phone        text not null default '',
  location     text not null default '',
  headline     text not null default '',
  intro        text not null default '',
  education    text not null default '',
  skills       text not null default '',
  experience   text not null default '',
  quote        text not null default '',
  photo_url    text,
  updated_at   timestamptz not null default now()
);

-- 포트폴리오 카드 (분류는 '영상' = MOTION, '사진' = STILLS)
create table if not exists public.projects (
  id            bigint generated always as identity primary key,
  number        text not null default '',
  category      text not null default '사진' check (category in ('영상', '사진')),
  title         text not null,
  description   text not null default '',
  tags          text[] not null default '{}',
  thumbnail_url text,
  file_url      text,  -- 사진 카드: 보관함 파일 주소 / 영상 카드: 유튜브·비메오 주소
  sort_order    int not null default 0,
  created_at    timestamptz not null default now()
);

-- 좋아요 (누를 때마다 한 줄. 같은 브라우저(client_id)는 카드마다 한 번만)
create table if not exists public.likes (
  id         bigint generated always as identity primary key,
  project_id bigint not null references public.projects (id) on delete cascade,
  client_id  text not null check (char_length(client_id) between 8 and 64),
  created_at timestamptz not null default now(),
  unique (project_id, client_id)
);

-- 방명록
create table if not exists public.resume_guestbook (
  id         bigint generated always as identity primary key,
  nickname   text not null check (char_length(nickname) between 1 and 20),
  message    text not null check (char_length(message) between 1 and 200),
  created_at timestamptz not null default now()
);


-- ---------------------------------------------------------------------
-- 2. "이 사람이 관리자인가?" 확인 함수 (아래 모든 규칙이 이걸 쓴다)
-- ---------------------------------------------------------------------
create or replace function public.resume_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;

grant execute on function public.resume_is_admin() to anon, authenticated;


-- ---------------------------------------------------------------------
-- 3. 규칙 켜기 (RLS) : 규칙이 없으면 아무도 못 쓴다
-- ---------------------------------------------------------------------
alter table public.admins           enable row level security;
alter table public.profile          enable row level security;
alter table public.projects         enable row level security;
alter table public.likes            enable row level security;
alter table public.resume_guestbook enable row level security;


-- ---------------------------------------------------------------------
-- 4. 표 사용 권한 (큰 문). 세부 규칙(작은 문)은 아래 policy 가 정한다.
-- ---------------------------------------------------------------------
revoke all on public.admins           from anon, authenticated;
revoke all on public.profile          from anon, authenticated;
revoke all on public.projects         from anon, authenticated;
revoke all on public.likes            from anon, authenticated;
revoke all on public.resume_guestbook from anon, authenticated;

grant select                          on public.admins           to authenticated;
grant select                          on public.profile          to anon, authenticated;
grant select                          on public.projects         to anon, authenticated;
grant select                          on public.likes            to anon, authenticated;
grant select                          on public.resume_guestbook to anon, authenticated;

-- 방문자가 넣을 수 있는 칸은 이것뿐 (번호·작성 시각은 데이터베이스가 정한다)
grant insert (project_id, client_id)  on public.likes            to anon, authenticated;
grant insert (nickname, message)      on public.resume_guestbook to anon, authenticated;

grant insert, update, delete          on public.profile          to authenticated;
grant insert, update, delete          on public.projects         to authenticated;
grant delete                          on public.likes            to authenticated;
grant delete                          on public.resume_guestbook to authenticated;


-- ---------------------------------------------------------------------
-- 5. 표별 규칙
-- ---------------------------------------------------------------------

-- admins : 로그인한 사람은 "자기 줄"만 볼 수 있다. 추가·수정·삭제 규칙은 없다
--          (관리자 등록은 SQL 편집기에서만 가능).
drop policy if exists "resume_admins_read_self" on public.admins;
create policy "resume_admins_read_self" on public.admins
  for select to authenticated
  using (user_id = auth.uid());

-- profile : 누구나 읽기, 관리자만 쓰기·고치기·지우기
drop policy if exists "resume_profile_read" on public.profile;
create policy "resume_profile_read" on public.profile
  for select to anon, authenticated using (true);

drop policy if exists "resume_profile_admin_insert" on public.profile;
create policy "resume_profile_admin_insert" on public.profile
  for insert to authenticated with check (public.resume_is_admin());

drop policy if exists "resume_profile_admin_update" on public.profile;
create policy "resume_profile_admin_update" on public.profile
  for update to authenticated
  using (public.resume_is_admin()) with check (public.resume_is_admin());

drop policy if exists "resume_profile_admin_delete" on public.profile;
create policy "resume_profile_admin_delete" on public.profile
  for delete to authenticated using (public.resume_is_admin());

-- projects : 누구나 읽기, 관리자만 쓰기·고치기·지우기
drop policy if exists "resume_projects_read" on public.projects;
create policy "resume_projects_read" on public.projects
  for select to anon, authenticated using (true);

drop policy if exists "resume_projects_admin_insert" on public.projects;
create policy "resume_projects_admin_insert" on public.projects
  for insert to authenticated with check (public.resume_is_admin());

drop policy if exists "resume_projects_admin_update" on public.projects;
create policy "resume_projects_admin_update" on public.projects
  for update to authenticated
  using (public.resume_is_admin()) with check (public.resume_is_admin());

drop policy if exists "resume_projects_admin_delete" on public.projects;
create policy "resume_projects_admin_delete" on public.projects
  for delete to authenticated using (public.resume_is_admin());

-- likes : 누구나 읽기·남기기, 지우기는 관리자만 (고치기는 아무도 못 함)
drop policy if exists "resume_likes_read" on public.likes;
create policy "resume_likes_read" on public.likes
  for select to anon, authenticated using (true);

drop policy if exists "resume_likes_insert" on public.likes;
create policy "resume_likes_insert" on public.likes
  for insert to anon, authenticated with check (true);

drop policy if exists "resume_likes_admin_delete" on public.likes;
create policy "resume_likes_admin_delete" on public.likes
  for delete to authenticated using (public.resume_is_admin());

-- resume_guestbook : 누구나 읽기·남기기, 지우기는 관리자만
drop policy if exists "resume_guestbook_read" on public.resume_guestbook;
create policy "resume_guestbook_read" on public.resume_guestbook
  for select to anon, authenticated using (true);

drop policy if exists "resume_guestbook_insert" on public.resume_guestbook;
create policy "resume_guestbook_insert" on public.resume_guestbook
  for insert to anon, authenticated with check (true);

drop policy if exists "resume_guestbook_admin_delete" on public.resume_guestbook;
create policy "resume_guestbook_admin_delete" on public.resume_guestbook
  for delete to authenticated using (public.resume_is_admin());


-- ---------------------------------------------------------------------
-- 6. 보관함 resume (공개, 이미지와 PDF, 한 파일 10MB까지)
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'resume', 'resume', true, 10485760,
  array['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'application/pdf']
)
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- 공개 보관함이라 파일 주소를 알면 누구나 볼 수 있다(별도 읽기 규칙 불필요).
-- 올리기·바꾸기·지우기는 관리자만. 모든 규칙은 bucket_id = 'resume' 에만 적용된다.
drop policy if exists "resume_files_admin_select" on storage.objects;
create policy "resume_files_admin_select" on storage.objects
  for select to authenticated
  using (bucket_id = 'resume' and public.resume_is_admin());

drop policy if exists "resume_files_admin_insert" on storage.objects;
create policy "resume_files_admin_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'resume' and public.resume_is_admin());

drop policy if exists "resume_files_admin_update" on storage.objects;
create policy "resume_files_admin_update" on storage.objects
  for update to authenticated
  using (bucket_id = 'resume' and public.resume_is_admin())
  with check (bucket_id = 'resume' and public.resume_is_admin());

drop policy if exists "resume_files_admin_delete" on storage.objects;
create policy "resume_files_admin_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'resume' and public.resume_is_admin());


-- ---------------------------------------------------------------------
-- 7. 예시 데이터 (전부 가짜). 이미 있으면 다시 넣지 않는다.
-- ---------------------------------------------------------------------
insert into public.profile
  (id, name, title, career_badge, email, phone, location,
   headline, intro, education, skills, experience, quote)
values
  (1, '김지영', '영상 · 사진 작가', '경력 5년',
   'jiyoung@example.com', '010-0000-0000', '제주',
   '제주의 빛과 바람을 기록하는 영상 · 사진 작가 김지영입니다. (예시)',
   '이 글은 예시입니다. 오름과 바다, 사람의 순간을 영상과 사진으로 담아 왔습니다.',
   '예시대학교 영상학과 졸업',
   'Premiere Pro, DaVinci Resolve, Lightroom, 드론 촬영',
   '예시스튜디오 촬영감독 (2021 ~ 현재)',
   '가장 좋은 장면은 기다린 만큼 온다. (예시)')
on conflict (id) do nothing;

insert into public.projects (number, category, title, description, tags, sort_order)
select v.number, v.category, v.title, v.description, v.tags, v.sort_order
from (values
  ('01', '영상', '예시 오름 다큐멘터리',
   '예시 설명입니다. 사계절 오름의 풍경을 담은 짧은 다큐멘터리.',
   array['촬영', '편집'], 1),
  ('02', '영상', '예시 브랜드 홍보 영상',
   '예시 설명입니다. 지역 브랜드를 소개하는 1분 홍보 영상.',
   array['연출', '드론'], 2),
  ('03', '사진', '예시 바다 사진 연작',
   '예시 설명입니다. 새벽 바다를 기록한 사진 12장.',
   array['풍경'], 3),
  ('04', '사진', '예시 인물 사진집',
   '예시 설명입니다. 마을 사람들의 일상을 담은 인물 사진.',
   array['인물', '보정'], 4)
) as v(number, category, title, description, tags, sort_order)
where not exists (select 1 from public.projects);


-- ---------------------------------------------------------------------
-- 8. 관리자 등록  ← 여기 이메일만 내 관리자 이메일로 바꾸세요
--    (1번 단계에서 Authentication > Users 에 만든 이메일)
-- ---------------------------------------------------------------------
insert into public.admins (user_id)
select id from auth.users where email = 'jeju.jayden@gmail.com'
on conflict (user_id) do nothing;
