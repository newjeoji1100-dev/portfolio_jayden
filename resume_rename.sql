-- =====================================================================
-- resume_rename.sql : 표 이름 바꾸기 (한 번만 실행)
--
-- 예전 resume.sql 로 만든 표 4개의 이름 앞에 resume_ 를 붙인다.
--   admins   → resume_admins
--   profile  → resume_profile
--   projects → resume_projects
--   likes    → resume_likes
--
-- 안에 든 데이터(프로필, 카드, 좋아요, 관리자 명단)와 규칙은 그대로 따라간다.
-- 이미 바꾼 뒤에 다시 실행해도 오류 없이 아무 일도 하지 않는다.
-- 사용법: Supabase > SQL Editor 에 전체를 붙여 넣고 Run 한다.
-- =====================================================================

begin;

alter table if exists public.admins   rename to resume_admins;
alter table if exists public.profile  rename to resume_profile;
alter table if exists public.projects rename to resume_projects;
alter table if exists public.likes    rename to resume_likes;

-- "이 사람이 관리자인가?" 함수가 새 이름의 관리자 명단을 보게 한다
create or replace function public.resume_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.resume_admins where user_id = auth.uid());
$$;

commit;
