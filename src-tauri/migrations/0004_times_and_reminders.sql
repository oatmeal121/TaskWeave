alter table tasks add column start_time text;
alter table tasks add column due_time text;
alter table recurring_task_templates add column start_time text;
alter table recurring_task_templates add column due_time text;

create table reminders (
  id text primary key,
  title text not null,
  description text not null default '',
  task_id text,
  anchor_at text not null,
  frequency text not null check (frequency in ('once', 'daily', 'weekly', 'monthly')),
  next_at text,
  enabled integer not null default 1,
  last_fired_at text,
  last_scheduled_at text,
  error text,
  created_at text not null,
  updated_at text not null
);
create index idx_reminders_due on reminders(enabled, next_at);
