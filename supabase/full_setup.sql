-- ============================================================================
-- Roleplay Tavern — FULL DATABASE SETUP (fresh Supabase project)
-- Concatenation of migrations 0001..0009 in order. Run ONCE on an empty DB.
-- (Re-running fails on duplicate policies/triggers — it is not idempotent as a whole.)
-- Preferred for managed setups: 'supabase db push'. This file is the SQL-Editor one-shot.
-- ============================================================================

-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- 0001_initial_schema_draft.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- 0001_initial_schema_draft.sql
-- 角色酒馆 V4 初始数据库草案
-- 执行前必须审查。Demo Mode 默认不写正式数据库。

create extension if not exists pgcrypto;

-- updated_at helper
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  handle text unique,
  display_name text,
  avatar_path text,
  default_mode text default 'user',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('user','owner','admin','support_readonly')),
  granted_by uuid references auth.users(id),
  granted_at timestamptz not null default now(),
  unique(user_id, role)
);

create or replace function public.has_role(required_role text)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = auth.uid() and role = required_role
  );
$$;



create or replace function public.is_owner()
returns boolean
language sql
security definer
set search_path = public
as $$
  select public.has_role('owner');
$$;

create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
as $$
  select public.has_role('admin');
$$;

create or replace function public.can_manage_public_content()
returns boolean
language sql
security definer
set search_path = public
as $$
  select public.has_role('owner') or public.has_role('admin');
$$;

create table if not exists public.model_presets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  name text not null,
  provider text not null default 'deepseek',
  model text not null default 'deepseek-chat',
  base_url text,
  temperature numeric default 0.8,
  top_p numeric,
  max_output_tokens int default 1200,
  context_message_limit int default 20,
  visibility text not null default 'private' check (visibility in ('private','demo','shared','system','admin')),
  is_default boolean default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.characters (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  slug text,
  summary text,
  card_json jsonb not null default '{}',
  avatar_path text,
  avatar_emoji text,
  tags text[] not null default '{}',
  visibility text not null default 'private' check (visibility in ('private','demo','shared','system','admin')),
  is_favorite boolean default false,
  archived_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.character_revisions (
  id uuid primary key default gen_random_uuid(),
  character_id uuid not null references public.characters(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  snapshot_json jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists public.sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  mode text not null default 'single' check (mode in ('single','group','narration','story')),
  status text not null default 'active' check (status in ('active','archived','deleted')),
  provider text,
  model text,
  active_branch_id uuid,
  primary_character_id uuid references public.characters(id) on delete set null,
  current_scene text,
  story_summary text,
  system_prompt text,
  style_rules text,
  tags text[] not null default '{}',
  visibility text not null default 'private' check (visibility in ('private','demo','shared','system','admin')),
  last_message_at timestamptz,
  archived_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.branches (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null default '主线',
  from_message_id uuid,
  created_at timestamptz not null default now()
);

alter table public.sessions
  add constraint sessions_active_branch_fk
  foreign key (active_branch_id) references public.branches(id) on delete set null;

create table if not exists public.session_participants (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  participant_type text not null default 'character' check (participant_type in ('user','character','narrator','system')),
  character_id uuid references public.characters(id) on delete cascade,
  sort_order int not null default 0,
  speaking_mode text default 'manual',
  is_active boolean default true,
  created_at timestamptz not null default now(),
  unique(session_id, character_id)
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid not null references public.sessions(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  character_id uuid references public.characters(id) on delete set null,
  role text not null check (role in ('user','assistant','system','narrator','tool')),
  sender_name text,
  content_text text not null,
  content_json jsonb not null default '{}',
  parent_id uuid references public.messages(id) on delete set null,
  edited_from_id uuid references public.messages(id) on delete set null,
  token_count int,
  hidden boolean default false,
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.prompt_templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  title text not null,
  category text default 'general',
  content text not null,
  description text,
  tags text[] not null default '{}',
  visibility text not null default 'private' check (visibility in ('private','demo','shared','system','admin')),
  is_favorite boolean default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.worldbooks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  scope text not null default 'private',
  description text,
  tags text[] not null default '{}',
  visibility text not null default 'private' check (visibility in ('private','demo','shared','system','admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.worldbook_entries (
  id uuid primary key default gen_random_uuid(),
  worldbook_id uuid not null references public.worldbooks(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  category text default 'general',
  content text not null,
  triggers text[] not null default '{}',
  priority int not null default 100,
  enabled boolean default true,
  scope text not null default 'global' check (scope in ('global','character','session','persona')),
  token_estimate int,
  last_triggered_at timestamptz,
  trigger_count int default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.memories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid references public.sessions(id) on delete cascade,
  character_id uuid references public.characters(id) on delete cascade,
  memory_type text not null default 'long_term' check (memory_type in ('short_term','long_term','summary','event','relationship','user_preference','character_preference')),
  title text,
  content text not null,
  source_message_id uuid references public.messages(id) on delete set null,
  salience int not null default 50,
  status text not null default 'active' check (status in ('suggested','active','disabled','deleted')),
  last_used_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.context_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid not null references public.sessions(id) on delete cascade,
  message_id uuid references public.messages(id) on delete set null,
  provider text,
  model text,
  input_tokens int,
  output_tokens int,
  cache_hit_tokens int,
  latency_ms int,
  cost_usd numeric,
  components_json jsonb not null default '[]',
  dropped_json jsonb not null default '[]',
  debug_enabled boolean default false,
  created_at timestamptz not null default now()
);

create table if not exists public.trash_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  entity_type text not null,
  entity_id uuid not null,
  snapshot_json jsonb not null,
  deleted_at timestamptz not null default now(),
  purge_after timestamptz
);

create table if not exists public.backup_artifacts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  scope text not null,
  format text not null default 'json',
  storage_path text not null,
  checksum text,
  schema_version text,
  created_at timestamptz not null default now(),
  expires_at timestamptz
);

create table if not exists public.audit_events (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references auth.users(id) on delete set null,
  actor_role text,
  action text not null,
  target_type text,
  target_id uuid,
  ip_hash text,
  ua_hash text,
  meta_json jsonb not null default '{}',
  created_at timestamptz not null default now()
);

-- Indexes
create index if not exists idx_characters_user_updated on public.characters(user_id, updated_at desc);
create index if not exists idx_characters_tags on public.characters using gin(tags);
create index if not exists idx_sessions_user_updated on public.sessions(user_id, updated_at desc);
create index if not exists idx_messages_session_branch_time on public.messages(session_id, branch_id, created_at);
create index if not exists idx_worldbook_entries_worldbook_priority on public.worldbook_entries(worldbook_id, priority desc);
create index if not exists idx_worldbook_entries_triggers on public.worldbook_entries using gin(triggers);
create index if not exists idx_memories_session_type on public.memories(session_id, memory_type);
create index if not exists idx_context_runs_user_time on public.context_runs(user_id, created_at desc);
create index if not exists idx_audit_events_actor_time on public.audit_events(actor_user_id, created_at desc);

-- updated_at triggers
create trigger set_profiles_updated_at before update on public.profiles for each row execute function public.set_updated_at();
create trigger set_model_presets_updated_at before update on public.model_presets for each row execute function public.set_updated_at();
create trigger set_characters_updated_at before update on public.characters for each row execute function public.set_updated_at();
create trigger set_sessions_updated_at before update on public.sessions for each row execute function public.set_updated_at();
create trigger set_prompt_templates_updated_at before update on public.prompt_templates for each row execute function public.set_updated_at();
create trigger set_worldbooks_updated_at before update on public.worldbooks for each row execute function public.set_updated_at();
create trigger set_worldbook_entries_updated_at before update on public.worldbook_entries for each row execute function public.set_updated_at();
create trigger set_memories_updated_at before update on public.memories for each row execute function public.set_updated_at();

-- Enable RLS
alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.model_presets enable row level security;
alter table public.characters enable row level security;
alter table public.character_revisions enable row level security;
alter table public.sessions enable row level security;
alter table public.branches enable row level security;
alter table public.session_participants enable row level security;
alter table public.messages enable row level security;
alter table public.prompt_templates enable row level security;
alter table public.worldbooks enable row level security;
alter table public.worldbook_entries enable row level security;
alter table public.memories enable row level security;
alter table public.context_runs enable row level security;
alter table public.trash_items enable row level security;
alter table public.backup_artifacts enable row level security;
alter table public.audit_events enable row level security;

-- V4.1 RLS policies: Owner/Admin boundary.
-- Owner has highest system permission. Admin manages demo/system/admin operational content only.
-- Admin does not default-read private user sessions/messages/memories/API-related data.

create policy profiles_self_or_staff_select on public.profiles
  for select using (id = auth.uid() or public.is_owner() or public.is_admin());
create policy profiles_self_update on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());
create policy profiles_self_insert on public.profiles
  for insert with check (id = auth.uid());

-- Public/operational content tables. Admin can manage demo/system/admin content, but not other users' private data.
create policy model_presets_select on public.model_presets
  for select using (user_id = auth.uid() or visibility in ('demo','system','shared') or public.is_owner() or (public.is_admin() and visibility in ('demo','system','admin')));
create policy model_presets_write on public.model_presets
  for all using (user_id = auth.uid() or public.is_owner() or (public.is_admin() and visibility in ('demo','system','admin')))
  with check (user_id = auth.uid() or public.is_owner() or (public.is_admin() and visibility in ('demo','system','admin')));

create policy characters_select on public.characters
  for select using (user_id = auth.uid() or visibility in ('demo','system','shared') or public.is_owner() or (public.is_admin() and visibility in ('demo','system','admin')));
create policy characters_write on public.characters
  for all using (user_id = auth.uid() or public.is_owner() or (public.is_admin() and visibility in ('demo','system','admin')))
  with check (user_id = auth.uid() or public.is_owner() or (public.is_admin() and visibility in ('demo','system','admin')));

create policy prompt_templates_select on public.prompt_templates
  for select using (user_id = auth.uid() or visibility in ('demo','system','shared') or public.is_owner() or (public.is_admin() and visibility in ('demo','system','admin')));
create policy prompt_templates_write on public.prompt_templates
  for all using (user_id = auth.uid() or public.is_owner() or (public.is_admin() and visibility in ('demo','system','admin')))
  with check (user_id = auth.uid() or public.is_owner() or (public.is_admin() and visibility in ('demo','system','admin')));

create policy worldbooks_select on public.worldbooks
  for select using (user_id = auth.uid() or visibility in ('demo','system','shared') or public.is_owner() or (public.is_admin() and visibility in ('demo','system','admin')));
create policy worldbooks_write on public.worldbooks
  for all using (user_id = auth.uid() or public.is_owner() or (public.is_admin() and visibility in ('demo','system','admin')))
  with check (user_id = auth.uid() or public.is_owner() or (public.is_admin() and visibility in ('demo','system','admin')));

create policy worldbook_entries_select on public.worldbook_entries
  for select using (
    user_id = auth.uid()
    or public.is_owner()
    or exists (
      select 1 from public.worldbooks wb
      where wb.id = worldbook_id
        and (wb.visibility in ('demo','system','shared') or (public.is_admin() and wb.visibility in ('demo','system','admin')))
    )
  );
create policy worldbook_entries_write on public.worldbook_entries
  for all using (
    user_id = auth.uid()
    or public.is_owner()
    or exists (
      select 1 from public.worldbooks wb
      where wb.id = worldbook_id
        and public.is_admin()
        and wb.visibility in ('demo','system','admin')
    )
  ) with check (
    user_id = auth.uid()
    or public.is_owner()
    or exists (
      select 1 from public.worldbooks wb
      where wb.id = worldbook_id
        and public.is_admin()
        and wb.visibility in ('demo','system','admin')
    )
  );

-- Sensitive private tables. Admin is intentionally excluded by default.
create policy character_revisions_owner_all on public.character_revisions
  for all using (user_id = auth.uid() or public.is_owner()) with check (user_id = auth.uid() or public.is_owner());
create policy sessions_owner_all on public.sessions
  for all using (user_id = auth.uid() or public.is_owner()) with check (user_id = auth.uid() or public.is_owner());
create policy branches_owner_all on public.branches
  for all using (user_id = auth.uid() or public.is_owner()) with check (user_id = auth.uid() or public.is_owner());
create policy session_participants_owner_all on public.session_participants
  for all using (user_id = auth.uid() or public.is_owner()) with check (user_id = auth.uid() or public.is_owner());
create policy messages_owner_all on public.messages
  for all using (user_id = auth.uid() or public.is_owner()) with check (user_id = auth.uid() or public.is_owner());
create policy memories_owner_all on public.memories
  for all using (user_id = auth.uid() or public.is_owner()) with check (user_id = auth.uid() or public.is_owner());
create policy context_runs_owner_all on public.context_runs
  for all using (user_id = auth.uid() or public.is_owner()) with check (user_id = auth.uid() or public.is_owner());
create policy trash_items_owner_all on public.trash_items
  for all using (user_id = auth.uid() or public.is_owner()) with check (user_id = auth.uid() or public.is_owner());
create policy backup_artifacts_owner_all on public.backup_artifacts
  for all using (user_id = auth.uid() or public.is_owner()) with check (user_id = auth.uid() or public.is_owner());

-- Roles and audit.
create policy user_roles_select on public.user_roles
  for select using (user_id = auth.uid() or public.is_owner() or public.is_admin());
create policy user_roles_owner_write on public.user_roles
  for all using (public.is_owner()) with check (public.is_owner());

create policy audit_events_select on public.audit_events
  for select using (actor_user_id = auth.uid() or public.is_owner() or public.is_admin());
create policy audit_events_insert on public.audit_events
  for insert with check (actor_user_id = auth.uid() or public.is_owner() or public.is_admin());


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- 0002_v41_owner_admin_policy_patch.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- 0002_v41_owner_admin_policy_patch.sql
-- V4.1：明确 Owner / Admin 权限边界。
-- 目标：Admin 管理 demo/system/admin 运营内容，但不默认读取普通用户 private 数据。



create or replace function public.is_owner()
returns boolean
language sql
security definer
set search_path = public
as $$
  select public.has_role('owner');
$$;

create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
as $$
  select public.has_role('admin');
$$;

create or replace function public.can_manage_public_content()
returns boolean
language sql
security definer
set search_path = public
as $$
  select public.has_role('owner') or public.has_role('admin');
$$;


drop policy if exists profiles_self_select on public.profiles;
drop policy if exists profiles_self_update on public.profiles;
drop policy if exists profiles_self_insert on public.profiles;
drop policy if exists model_presets_owner_all on public.model_presets;
drop policy if exists characters_owner_all on public.characters;
drop policy if exists character_revisions_owner_all on public.character_revisions;
drop policy if exists sessions_owner_all on public.sessions;
drop policy if exists branches_owner_all on public.branches;
drop policy if exists session_participants_owner_all on public.session_participants;
drop policy if exists messages_owner_all on public.messages;
drop policy if exists prompt_templates_owner_all on public.prompt_templates;
drop policy if exists worldbooks_owner_all on public.worldbooks;
drop policy if exists worldbook_entries_owner_all on public.worldbook_entries;
drop policy if exists memories_owner_all on public.memories;
drop policy if exists context_runs_owner_all on public.context_runs;
drop policy if exists trash_items_owner_all on public.trash_items;
drop policy if exists backup_artifacts_owner_all on public.backup_artifacts;
drop policy if exists user_roles_admin_select on public.user_roles;
drop policy if exists user_roles_admin_write on public.user_roles;
drop policy if exists audit_events_admin_select on public.audit_events;
drop policy if exists audit_events_insert on public.audit_events;
drop policy if exists profiles_self_or_staff_select on public.profiles;
drop policy if exists model_presets_select on public.model_presets;
drop policy if exists model_presets_write on public.model_presets;
drop policy if exists characters_select on public.characters;
drop policy if exists characters_write on public.characters;
drop policy if exists prompt_templates_select on public.prompt_templates;
drop policy if exists prompt_templates_write on public.prompt_templates;
drop policy if exists worldbooks_select on public.worldbooks;
drop policy if exists worldbooks_write on public.worldbooks;
drop policy if exists worldbook_entries_select on public.worldbook_entries;
drop policy if exists worldbook_entries_write on public.worldbook_entries;
drop policy if exists user_roles_select on public.user_roles;
drop policy if exists user_roles_owner_write on public.user_roles;
drop policy if exists audit_events_select on public.audit_events;

-- V4.1 RLS policies: Owner/Admin boundary.
-- Owner has highest system permission. Admin manages demo/system/admin operational content only.
-- Admin does not default-read private user sessions/messages/memories/API-related data.

create policy profiles_self_or_staff_select on public.profiles
  for select using (id = auth.uid() or public.is_owner() or public.is_admin());
create policy profiles_self_update on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());
create policy profiles_self_insert on public.profiles
  for insert with check (id = auth.uid());

-- Public/operational content tables. Admin can manage demo/system/admin content, but not other users' private data.
create policy model_presets_select on public.model_presets
  for select using (user_id = auth.uid() or visibility in ('demo','system','shared') or public.is_owner() or (public.is_admin() and visibility in ('demo','system','admin')));
create policy model_presets_write on public.model_presets
  for all using (user_id = auth.uid() or public.is_owner() or (public.is_admin() and visibility in ('demo','system','admin')))
  with check (user_id = auth.uid() or public.is_owner() or (public.is_admin() and visibility in ('demo','system','admin')));

create policy characters_select on public.characters
  for select using (user_id = auth.uid() or visibility in ('demo','system','shared') or public.is_owner() or (public.is_admin() and visibility in ('demo','system','admin')));
create policy characters_write on public.characters
  for all using (user_id = auth.uid() or public.is_owner() or (public.is_admin() and visibility in ('demo','system','admin')))
  with check (user_id = auth.uid() or public.is_owner() or (public.is_admin() and visibility in ('demo','system','admin')));

create policy prompt_templates_select on public.prompt_templates
  for select using (user_id = auth.uid() or visibility in ('demo','system','shared') or public.is_owner() or (public.is_admin() and visibility in ('demo','system','admin')));
create policy prompt_templates_write on public.prompt_templates
  for all using (user_id = auth.uid() or public.is_owner() or (public.is_admin() and visibility in ('demo','system','admin')))
  with check (user_id = auth.uid() or public.is_owner() or (public.is_admin() and visibility in ('demo','system','admin')));

create policy worldbooks_select on public.worldbooks
  for select using (user_id = auth.uid() or visibility in ('demo','system','shared') or public.is_owner() or (public.is_admin() and visibility in ('demo','system','admin')));
create policy worldbooks_write on public.worldbooks
  for all using (user_id = auth.uid() or public.is_owner() or (public.is_admin() and visibility in ('demo','system','admin')))
  with check (user_id = auth.uid() or public.is_owner() or (public.is_admin() and visibility in ('demo','system','admin')));

create policy worldbook_entries_select on public.worldbook_entries
  for select using (
    user_id = auth.uid()
    or public.is_owner()
    or exists (
      select 1 from public.worldbooks wb
      where wb.id = worldbook_id
        and (wb.visibility in ('demo','system','shared') or (public.is_admin() and wb.visibility in ('demo','system','admin')))
    )
  );
create policy worldbook_entries_write on public.worldbook_entries
  for all using (
    user_id = auth.uid()
    or public.is_owner()
    or exists (
      select 1 from public.worldbooks wb
      where wb.id = worldbook_id
        and public.is_admin()
        and wb.visibility in ('demo','system','admin')
    )
  ) with check (
    user_id = auth.uid()
    or public.is_owner()
    or exists (
      select 1 from public.worldbooks wb
      where wb.id = worldbook_id
        and public.is_admin()
        and wb.visibility in ('demo','system','admin')
    )
  );

-- Sensitive private tables. Admin is intentionally excluded by default.
create policy character_revisions_owner_all on public.character_revisions
  for all using (user_id = auth.uid() or public.is_owner()) with check (user_id = auth.uid() or public.is_owner());
create policy sessions_owner_all on public.sessions
  for all using (user_id = auth.uid() or public.is_owner()) with check (user_id = auth.uid() or public.is_owner());
create policy branches_owner_all on public.branches
  for all using (user_id = auth.uid() or public.is_owner()) with check (user_id = auth.uid() or public.is_owner());
create policy session_participants_owner_all on public.session_participants
  for all using (user_id = auth.uid() or public.is_owner()) with check (user_id = auth.uid() or public.is_owner());
create policy messages_owner_all on public.messages
  for all using (user_id = auth.uid() or public.is_owner()) with check (user_id = auth.uid() or public.is_owner());
create policy memories_owner_all on public.memories
  for all using (user_id = auth.uid() or public.is_owner()) with check (user_id = auth.uid() or public.is_owner());
create policy context_runs_owner_all on public.context_runs
  for all using (user_id = auth.uid() or public.is_owner()) with check (user_id = auth.uid() or public.is_owner());
create policy trash_items_owner_all on public.trash_items
  for all using (user_id = auth.uid() or public.is_owner()) with check (user_id = auth.uid() or public.is_owner());
create policy backup_artifacts_owner_all on public.backup_artifacts
  for all using (user_id = auth.uid() or public.is_owner()) with check (user_id = auth.uid() or public.is_owner());

-- Roles and audit.
create policy user_roles_select on public.user_roles
  for select using (user_id = auth.uid() or public.is_owner() or public.is_admin());
create policy user_roles_owner_write on public.user_roles
  for all using (public.is_owner()) with check (public.is_owner());

create policy audit_events_select on public.audit_events
  for select using (actor_user_id = auth.uid() or public.is_owner() or public.is_admin());
create policy audit_events_insert on public.audit_events
  for insert with check (actor_user_id = auth.uid() or public.is_owner() or public.is_admin());


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- 0003_v42_user_api_credentials.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- V4.2 Stage 7B draft: encrypted hosted API credentials
-- This migration is a design draft for Stage 7B.
-- Do NOT implement hosted user API key storage in Stage 3.
-- Never store plaintext API keys.

create table if not exists public.user_api_credentials (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null,
  label text not null,
  base_url text,
  encrypted_api_key text not null,
  key_hint text,
  storage_mode text not null default 'hosted_encrypted',
  is_default boolean not null default false,
  enabled boolean not null default true,
  last_tested_at timestamptz,
  last_used_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint user_api_credentials_storage_mode_check check (storage_mode in ('hosted_encrypted'))
);

create index if not exists idx_user_api_credentials_user_id on public.user_api_credentials(user_id);
create index if not exists idx_user_api_credentials_provider on public.user_api_credentials(user_id, provider);
create index if not exists idx_user_api_credentials_default on public.user_api_credentials(user_id, is_default) where deleted_at is null;

alter table public.user_api_credentials enable row level security;

-- Users can manage only their own encrypted credentials.
create policy "Users can select own api credentials"
  on public.user_api_credentials for select
  using (auth.uid() = user_id);

create policy "Users can insert own api credentials"
  on public.user_api_credentials for insert
  with check (auth.uid() = user_id);

create policy "Users can update own api credentials"
  on public.user_api_credentials for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete own api credentials"
  on public.user_api_credentials for delete
  using (auth.uid() = user_id);

-- Important: Admin is intentionally not granted a default policy to read private credentials.
-- Owner/Admin management should use aggregate status views or audited server-side functions, never plaintext key display.

-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- 0004_v43_product_completion_tables.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- V4.3 product completion draft tables
-- These tables support Stage 8-9 capabilities: global tags, public sharing, feedback, usage limits, announcements, and user preferences.
-- Execute only after reviewing Stage 8/9 requirements. Do not implement unrelated UI early.

create table if not exists public.tags (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  name text not null,
  color text,
  visibility text not null default 'private' check (visibility in ('private','demo','shared','system','admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, name)
);

create table if not exists public.tag_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  tag_id uuid not null references public.tags(id) on delete cascade,
  entity_type text not null check (entity_type in ('character','session','message','worldbook','worldbook_entry','memory','prompt_template','share')),
  entity_id uuid not null,
  created_at timestamptz not null default now(),
  unique(tag_id, entity_type, entity_id)
);

create table if not exists public.share_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  entity_type text not null check (entity_type in ('character','prompt_template','worldbook','worldbook_entry','demo_session')),
  entity_id uuid not null,
  slug text unique not null,
  title text not null,
  description text,
  visibility text not null default 'shared' check (visibility in ('shared','unlisted','disabled')),
  copied_count int not null default 0,
  expires_at timestamptz,
  disabled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.feedback_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  category text not null default 'general',
  status text not null default 'open' check (status in ('open','triaged','in_progress','resolved','closed')),
  title text not null,
  content text not null,
  page_url text,
  meta_json jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.system_announcements (
  id uuid primary key default gen_random_uuid(),
  created_by uuid references auth.users(id) on delete set null,
  title text not null,
  content text not null,
  status text not null default 'draft' check (status in ('draft','published','archived')),
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.usage_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  provider text,
  model text,
  event_type text not null,
  input_tokens int,
  output_tokens int,
  cost_usd numeric,
  status text,
  meta_json jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create table if not exists public.user_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  theme text not null default 'system',
  font_scale numeric not null default 1,
  bubble_width text not null default 'normal',
  show_avatars boolean not null default true,
  show_timestamps boolean not null default true,
  mobile_layout text not null default 'app',
  settings_json jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_tags_user on public.tags(user_id);
create index if not exists idx_tag_links_entity on public.tag_links(entity_type, entity_id);
create index if not exists idx_share_links_user on public.share_links(user_id, created_at desc);
create index if not exists idx_share_links_slug on public.share_links(slug);
create index if not exists idx_feedback_status on public.feedback_items(status, created_at desc);
create index if not exists idx_usage_events_user_time on public.usage_events(user_id, created_at desc);

alter table public.tags enable row level security;
alter table public.tag_links enable row level security;
alter table public.share_links enable row level security;
alter table public.feedback_items enable row level security;
alter table public.system_announcements enable row level security;
alter table public.usage_events enable row level security;
alter table public.user_preferences enable row level security;

-- Users manage their own private tags and tag links. Demo/system/admin tag management belongs to Owner/Admin.
create policy tags_select on public.tags
  for select using (user_id = auth.uid() or visibility in ('demo','system','shared') or public.is_owner() or (public.is_admin() and visibility in ('demo','system','admin')));
create policy tags_write on public.tags
  for all using (user_id = auth.uid() or public.is_owner() or (public.is_admin() and visibility in ('demo','system','admin')))
  with check (user_id = auth.uid() or public.is_owner() or (public.is_admin() and visibility in ('demo','system','admin')));

create policy tag_links_owner_all on public.tag_links
  for all using (user_id = auth.uid() or public.is_owner()) with check (user_id = auth.uid() or public.is_owner());

create policy share_links_select on public.share_links
  for select using (user_id = auth.uid() or visibility = 'shared' or public.is_owner() or public.is_admin());
create policy share_links_write on public.share_links
  for all using (user_id = auth.uid() or public.is_owner()) with check (user_id = auth.uid() or public.is_owner());

create policy feedback_insert_any_authenticated on public.feedback_items
  for insert with check (auth.uid() = user_id or user_id is null);
create policy feedback_select_self_or_staff on public.feedback_items
  for select using (user_id = auth.uid() or public.is_owner() or public.is_admin());
create policy feedback_staff_update on public.feedback_items
  for update using (public.is_owner() or public.is_admin()) with check (public.is_owner() or public.is_admin());

create policy announcements_select_published on public.system_announcements
  for select using (status = 'published' or public.is_owner() or public.is_admin());
create policy announcements_staff_write on public.system_announcements
  for all using (public.is_owner() or public.is_admin()) with check (public.is_owner() or public.is_admin());

create policy usage_events_select_self_or_staff on public.usage_events
  for select using (user_id = auth.uid() or public.is_owner() or public.is_admin());
create policy usage_events_insert_self_or_staff on public.usage_events
  for insert with check (user_id = auth.uid() or public.is_owner() or public.is_admin());

create policy user_preferences_owner_all on public.user_preferences
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- 0005_auth_user_bootstrap.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- 0005_auth_user_bootstrap.sql
-- 自动为新注册用户创建 profiles 和 user_roles (role='user')
-- 同时 backfill 已存在的 auth.users

-- ============================================
-- 1. handle_new_user 函数 (security definer)
-- ============================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Auto-create profile if not exists
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', new.email))
  on conflict (id) do nothing;

  -- Auto-assign role='user' if not exists
  insert into public.user_roles (user_id, role)
  values (new.id, 'user')
  on conflict (user_id, role) do nothing;

  return new;
end;
$$;

-- ============================================
-- 2. Trigger: after insert on auth.users
-- ============================================
drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();

-- ============================================
-- 3. Backfill: 补历史用户
-- ============================================

-- Backfill profiles for existing auth users who are missing one
insert into public.profiles (id, display_name)
select
  u.id,
  coalesce(u.raw_user_meta_data ->> 'display_name', u.email)
from auth.users u
where not exists (
  select 1 from public.profiles p where p.id = u.id
)
on conflict (id) do nothing;

-- Backfill user_roles for existing auth users who are missing one
insert into public.user_roles (user_id, role)
select
  u.id,
  'user'
from auth.users u
where not exists (
  select 1 from public.user_roles ur where ur.user_id = u.id and ur.role = 'user'
)
on conflict (user_id, role) do nothing;

-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- 0006_phase6_query_indexes.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- Phase 6 performance indexes for roleplay initial loads and context queries.
-- Non-destructive: no table shape or data changes.

create index if not exists idx_sessions_user_status_updated
  on public.sessions(user_id, status, updated_at desc)
  where deleted_at is null;

create index if not exists idx_messages_session_created
  on public.messages(session_id, created_at)
  where deleted_at is null;

create index if not exists idx_characters_user_active_updated
  on public.characters(user_id, updated_at desc)
  where deleted_at is null and archived_at is null;

create index if not exists idx_prompt_templates_user_updated
  on public.prompt_templates(user_id, updated_at desc);

create index if not exists idx_worldbooks_user_updated
  on public.worldbooks(user_id, updated_at desc);

create index if not exists idx_worldbook_entries_enabled_priority
  on public.worldbook_entries(worldbook_id, enabled, priority desc);

create index if not exists idx_memories_user_status_salience
  on public.memories(user_id, status, salience desc);

create index if not exists idx_session_participants_session_character
  on public.session_participants(session_id, character_id)
  where participant_type = 'character';

-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- 0007_phase7_versions_branches_soft_delete.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- 0007_phase7_versions_branches_soft_delete.sql
-- Phase 7: Message versions, branches, soft delete, context_runs persistence
-- Safe to re-run: uses IF NOT EXISTS / IF NOT EXISTS patterns

-- ============================================================
-- 1. message_revisions — edit version history
-- ============================================================
create table if not exists public.message_revisions (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.messages(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  revision_no int not null default 1,
  content_text text not null,
  edited_at timestamptz not null default now()
);

create index if not exists idx_message_revisions_message on public.message_revisions(message_id, revision_no desc);

-- ============================================================
-- 2. messages — add versioning + soft-delete columns
-- ============================================================
do $$ begin
  if not exists (select 1 from information_schema.columns where table_name = 'messages' and column_name = 'edited_at') then
    alter table public.messages add column edited_at timestamptz;
  end if;
  if not exists (select 1 from information_schema.columns where table_name = 'messages' and column_name = 'revision_no') then
    alter table public.messages add column revision_no int not null default 1;
  end if;
  if not exists (select 1 from information_schema.columns where table_name = 'messages' and column_name = 'superseded_by_message_id') then
    alter table public.messages add column superseded_by_message_id uuid references public.messages(id) on delete set null;
  end if;
  if not exists (select 1 from information_schema.columns where table_name = 'messages' and column_name = 'deleted_reason') then
    alter table public.messages add column deleted_reason text;
  end if;
end $$;

create index if not exists idx_messages_revision on public.messages(revision_no);
create index if not exists idx_messages_superseded on public.messages(superseded_by_message_id) where superseded_by_message_id is not null;

-- ============================================================
-- 3. branches — add title, parent, fork info, status, timestamps
-- ============================================================
do $$ begin
  if not exists (select 1 from information_schema.columns where table_name = 'branches' and column_name = 'title') then
    alter table public.branches add column title text;
  end if;
  if not exists (select 1 from information_schema.columns where table_name = 'branches' and column_name = 'parent_branch_id') then
    alter table public.branches add column parent_branch_id uuid references public.branches(id) on delete set null;
  end if;
  if not exists (select 1 from information_schema.columns where table_name = 'branches' and column_name = 'forked_from_message_id') then
    alter table public.branches add column forked_from_message_id uuid references public.messages(id) on delete set null;
  end if;
  if not exists (select 1 from information_schema.columns where table_name = 'branches' and column_name = 'status') then
    alter table public.branches add column status text not null default 'active' check (status in ('active', 'archived', 'merged'));
  end if;
  if not exists (select 1 from information_schema.columns where table_name = 'branches' and column_name = 'updated_at') then
    alter table public.branches add column updated_at timestamptz not null default now();
  end if;
end $$;

create index if not exists idx_branches_session_status on public.branches(session_id, status);
create index if not exists idx_branches_parent on public.branches(parent_branch_id) where parent_branch_id is not null;

-- ============================================================
-- 4. worldbooks — soft delete columns
-- ============================================================
do $$ begin
  if not exists (select 1 from information_schema.columns where table_name = 'worldbooks' and column_name = 'deleted_at') then
    alter table public.worldbooks add column deleted_at timestamptz;
  end if;
  if not exists (select 1 from information_schema.columns where table_name = 'worldbooks' and column_name = 'deleted_reason') then
    alter table public.worldbooks add column deleted_reason text;
  end if;
end $$;

create index if not exists idx_worldbooks_not_deleted on public.worldbooks(user_id, updated_at desc) where deleted_at is null;

-- ============================================================
-- 5. worldbook_entries — soft delete columns
-- ============================================================
do $$ begin
  if not exists (select 1 from information_schema.columns where table_name = 'worldbook_entries' and column_name = 'deleted_at') then
    alter table public.worldbook_entries add column deleted_at timestamptz;
  end if;
  if not exists (select 1 from information_schema.columns where table_name = 'worldbook_entries' and column_name = 'deleted_reason') then
    alter table public.worldbook_entries add column deleted_reason text;
  end if;
end $$;

create index if not exists idx_wbe_not_deleted on public.worldbook_entries(worldbook_id, priority desc) where deleted_at is null;

-- ============================================================
-- 6. prompt_templates — soft delete columns
-- ============================================================
do $$ begin
  if not exists (select 1 from information_schema.columns where table_name = 'prompt_templates' and column_name = 'deleted_at') then
    alter table public.prompt_templates add column deleted_at timestamptz;
  end if;
  if not exists (select 1 from information_schema.columns where table_name = 'prompt_templates' and column_name = 'deleted_reason') then
    alter table public.prompt_templates add column deleted_reason text;
  end if;
end $$;

create index if not exists idx_pt_not_deleted on public.prompt_templates(user_id, updated_at desc) where deleted_at is null;

-- ============================================================
-- 7. memories — add deleted_at timestamp to complement status='deleted'
-- ============================================================
do $$ begin
  if not exists (select 1 from information_schema.columns where table_name = 'memories' and column_name = 'deleted_at') then
    alter table public.memories add column deleted_at timestamptz;
  end if;
  if not exists (select 1 from information_schema.columns where table_name = 'memories' and column_name = 'deleted_reason') then
    alter table public.memories add column deleted_reason text;
  end if;
end $$;

create index if not exists idx_memories_not_deleted on public.memories(user_id, updated_at desc) where deleted_at is null;

-- ============================================================
-- 8. context_runs — add detailed context fields
-- ============================================================
do $$ begin
  if not exists (select 1 from information_schema.columns where table_name = 'context_runs' and column_name = 'branch_id') then
    alter table public.context_runs add column branch_id uuid references public.branches(id) on delete set null;
  end if;
  if not exists (select 1 from information_schema.columns where table_name = 'context_runs' and column_name = 'trigger_message_id') then
    alter table public.context_runs add column trigger_message_id uuid references public.messages(id) on delete set null;
  end if;
  if not exists (select 1 from information_schema.columns where table_name = 'context_runs' and column_name = 'system_prompt') then
    alter table public.context_runs add column system_prompt text;
  end if;
  if not exists (select 1 from information_schema.columns where table_name = 'context_runs' and column_name = 'provider_messages_json') then
    alter table public.context_runs add column provider_messages_json jsonb;
  end if;
  if not exists (select 1 from information_schema.columns where table_name = 'context_runs' and column_name = 'worldbook_hits_json') then
    alter table public.context_runs add column worldbook_hits_json jsonb;
  end if;
  if not exists (select 1 from information_schema.columns where table_name = 'context_runs' and column_name = 'skipped_entries_json') then
    alter table public.context_runs add column skipped_entries_json jsonb;
  end if;
  if not exists (select 1 from information_schema.columns where table_name = 'context_runs' and column_name = 'injected_memories_json') then
    alter table public.context_runs add column injected_memories_json jsonb;
  end if;
  if not exists (select 1 from information_schema.columns where table_name = 'context_runs' and column_name = 'summary_text') then
    alter table public.context_runs add column summary_text text;
  end if;
  if not exists (select 1 from information_schema.columns where table_name = 'context_runs' and column_name = 'token_budget') then
    alter table public.context_runs add column token_budget int;
  end if;
  if not exists (select 1 from information_schema.columns where table_name = 'context_runs' and column_name = 'estimated_tokens') then
    alter table public.context_runs add column estimated_tokens int;
  end if;
end $$;

create index if not exists idx_context_runs_session_branch on public.context_runs(session_id, branch_id, created_at desc);
create index if not exists idx_context_runs_message on public.context_runs(trigger_message_id);

-- ============================================================
-- 9. RLS policies for message_revisions
-- ============================================================
alter table public.message_revisions enable row level security;

create policy message_revisions_owner_all on public.message_revisions
  for all using (user_id = auth.uid() or public.is_owner())
  with check (user_id = auth.uid() or public.is_owner());

-- ============================================================
-- 10. Update messages RLS to allow superseded_by_message_id updates
-- (Existing policy already covers owner_all, so no change needed)
-- ============================================================

-- ============================================================
-- 11. Ensure existing branch data is consistent
-- Backfill: if a session has no branches, create default 'main' branch
-- and set active_branch_id on the session.
-- ============================================================
do $$
declare
  sess record;
  branch_id uuid;
begin
  for sess in
    select s.id, s.user_id, s.active_branch_id
    from public.sessions s
    where s.deleted_at is null
      and s.status = 'active'
      and s.active_branch_id is null
  loop
    -- Check if session already has a branch
    select b.id into branch_id
    from public.branches b
    where b.session_id = sess.id
    order by b.created_at asc
    limit 1;

    if branch_id is not null then
      update public.sessions set active_branch_id = branch_id where id = sess.id;
    else
      insert into public.branches (session_id, user_id, name, title, status)
      values (sess.id, sess.user_id, 'main', '主线', 'active')
      returning id into branch_id;
      update public.sessions set active_branch_id = branch_id where id = sess.id;
    end if;
  end loop;
end;
$$;

-- ============================================================
-- 12. Backfill messages without branch_id
-- Assign orphan messages to the session's active branch (or the first branch)
-- ============================================================
do $$
declare
  sess record;
  target_branch_id uuid;
begin
  for sess in
    select s.id, s.active_branch_id
    from public.sessions s
    where s.deleted_at is null
  loop
    if sess.active_branch_id is null then
      select b.id into target_branch_id
      from public.branches b
      where b.session_id = sess.id
      order by b.created_at asc
      limit 1;
    else
      target_branch_id := sess.active_branch_id;
    end if;

    if target_branch_id is not null then
      update public.messages
      set branch_id = target_branch_id
      where session_id = sess.id
        and (branch_id is null or branch_id not in (
          select b2.id from public.branches b2 where b2.session_id = sess.id
        ));
    end if;
  end loop;
end;
$$;

-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- 0008_phase8_1_hosted_encrypted_api_keys.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- 0008_phase8_1_hosted_encrypted_api_keys.sql
-- Stage 8.1: hosted encrypted API credentials for cross-device sync
-- Keep metadata and encrypted secrets in separate tables.

create table if not exists public.provider_credentials (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  label text,
  provider_type text not null check (provider_type in ('deepseek', 'openai_compatible')),
  base_url text,
  default_model text,
  storage_mode text not null default 'hosted_encrypted' check (storage_mode in ('hosted_encrypted')),
  status text not null default 'active' check (status in ('active', 'disabled', 'deleted')),
  is_default boolean not null default false,
  last_tested_at timestamptz,
  last_used_at timestamptz,
  last_error text,
  key_fingerprint text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.provider_credential_secrets (
  id uuid primary key default gen_random_uuid(),
  credential_id uuid not null references public.provider_credentials(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  encrypted_api_key text not null,
  encryption_iv text not null,
  encryption_alg text not null default 'AES-GCM',
  encryption_key_version text not null default 'v1',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists idx_provider_credentials_user_status_updated
  on public.provider_credentials(user_id, status, updated_at desc);

create index if not exists idx_provider_credentials_user_default
  on public.provider_credentials(user_id, is_default);

create index if not exists idx_provider_credential_secrets_credential
  on public.provider_credential_secrets(credential_id);

create index if not exists idx_provider_credential_secrets_user
  on public.provider_credential_secrets(user_id);

alter table public.provider_credentials enable row level security;
alter table public.provider_credential_secrets enable row level security;

drop policy if exists provider_credentials_owner_select on public.provider_credentials;
drop policy if exists provider_credentials_owner_insert on public.provider_credentials;
drop policy if exists provider_credentials_owner_update on public.provider_credentials;
drop policy if exists provider_credentials_owner_delete on public.provider_credentials;

create policy provider_credentials_owner_select
  on public.provider_credentials
  for select
  using (auth.uid() = user_id or public.is_owner());

create policy provider_credentials_owner_insert
  on public.provider_credentials
  for insert
  with check (auth.uid() = user_id or public.is_owner());

create policy provider_credentials_owner_update
  on public.provider_credentials
  for update
  using (auth.uid() = user_id or public.is_owner())
  with check (auth.uid() = user_id or public.is_owner());

create policy provider_credentials_owner_delete
  on public.provider_credentials
  for delete
  using (auth.uid() = user_id or public.is_owner());

-- Intentionally do not create read policies for provider_credential_secrets.
-- Browser clients must never be able to select encrypted secrets directly.

-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- 0009_worldbook_entry_extensions.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- Sub-project 2: store SillyTavern advanced worldbook fields losslessly.
alter table public.worldbook_entries
  add column if not exists extensions jsonb not null default '{}';
