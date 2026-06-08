-- Sub-project 2: store SillyTavern advanced worldbook fields losslessly.
alter table public.worldbook_entries
  add column if not exists extensions jsonb not null default '{}';
