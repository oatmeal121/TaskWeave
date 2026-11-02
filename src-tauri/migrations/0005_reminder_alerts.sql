create table reminder_alerts (
  id text primary key,
  reminder_id text references reminders(id) on delete cascade,
  task_id text,
  title text not null,
  description text not null default '',
  scheduled_at text not null,
  available_at text not null,
  is_test integer not null default 0,
  unique(reminder_id, scheduled_at)
);
create index idx_reminder_alerts_available on reminder_alerts(available_at);
