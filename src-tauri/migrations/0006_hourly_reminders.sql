-- Expand the frequency CHECK inside the migration transaction. Copy the child
-- queue before dropping either original table, preserving pending/snoozed alerts
-- even with foreign_keys enabled and ON DELETE CASCADE in effect.
create table reminders_hourly (
  id text primary key,
  title text not null,
  description text not null default '',
  task_id text,
  anchor_at text not null,
  frequency text not null check (frequency in ('once', 'hourly', 'daily', 'weekly', 'monthly')),
  next_at text,
  enabled integer not null default 1,
  last_fired_at text,
  last_scheduled_at text,
  error text,
  created_at text not null,
  updated_at text not null
);
insert into reminders_hourly (id,title,description,task_id,anchor_at,frequency,next_at,enabled,last_fired_at,last_scheduled_at,error,created_at,updated_at)
select id,title,description,task_id,anchor_at,frequency,next_at,enabled,last_fired_at,last_scheduled_at,error,created_at,updated_at from reminders;

create table reminder_alerts_hourly (
  id text primary key,
  reminder_id text references reminders_hourly(id) on delete cascade,
  task_id text,
  title text not null,
  description text not null default '',
  scheduled_at text not null,
  available_at text not null,
  is_test integer not null default 0,
  unique(reminder_id, scheduled_at)
);
insert into reminder_alerts_hourly (id,reminder_id,task_id,title,description,scheduled_at,available_at,is_test)
select id,reminder_id,task_id,title,description,scheduled_at,available_at,is_test from reminder_alerts;

drop table reminder_alerts;
drop table reminders;
alter table reminders_hourly rename to reminders;
alter table reminder_alerts_hourly rename to reminder_alerts;
create index idx_reminders_due on reminders(enabled, next_at);
create index idx_reminder_alerts_available on reminder_alerts(available_at);

-- Collapse older duplicates of the same reminder. The latest available_at wins
-- so an existing snooze is preserved instead of being shown prematurely.
delete from reminder_alerts where reminder_id is not null and id not in (
  select id from (
    select id, row_number() over (
      partition by reminder_id order by available_at desc, scheduled_at desc, id desc
    ) as delivery_rank
    from reminder_alerts where reminder_id is not null
  ) where delivery_rank = 1
);
create unique index idx_reminder_alerts_reminder on reminder_alerts(reminder_id)
where reminder_id is not null;
