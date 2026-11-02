create table if not exists projects (
  id text primary key,
  name text not null,
  color text,
  is_deleted integer not null default 0,
  deleted_at text,
  created_at text not null,
  updated_at text not null
);

create unique index if not exists idx_projects_active_name
on projects(name)
where is_deleted = 0;

create table if not exists tags (
  id text primary key,
  name text not null,
  color text,
  is_deleted integer not null default 0,
  deleted_at text,
  created_at text not null,
  updated_at text not null
);

create unique index if not exists idx_tags_active_name
on tags(name)
where is_deleted = 0;

create table if not exists recurring_task_templates (
  id text primary key,
  title text not null,
  frequency text not null check (frequency in ('daily', 'weekly', 'monthly', 'yearly')),
  is_important integer not null default 0,
  is_urgent integer not null default 0,
  project_id text references projects(id) on delete set null,
  start_on text not null,
  missing_date_policy text check (missing_date_policy in ('skip_period', 'use_last_day')),
  custom_due_rule text,
  is_deleted integer not null default 0,
  deleted_at text,
  created_at text not null,
  updated_at text not null
);

create table if not exists tasks (
  id text primary key,
  title text not null,
  description text not null default '',
  status text not null check (status in ('todo', 'doing', 'done')),
  is_important integer not null default 0,
  is_urgent integer not null default 0,
  start_date text not null,
  due_date text,
  completion_date text,
  project_id text references projects(id) on delete set null,
  parent_task_id text references tasks(id) on delete set null,
  child_category text,
  sort_order integer not null default 0,
  recurring_template_id text references recurring_task_templates(id) on delete set null,
  recurrence_occurrence_date text,
  is_deleted integer not null default 0,
  deleted_at text,
  created_at text not null,
  updated_at text not null,
  check (parent_task_id is null or parent_task_id <> id),
  check (
    (status = 'done' and completion_date is not null)
    or (status <> 'done' and completion_date is null)
  )
);

create index if not exists idx_tasks_status on tasks(status);
create index if not exists idx_tasks_project_id on tasks(project_id);
create index if not exists idx_tasks_parent_task_id on tasks(parent_task_id);
create index if not exists idx_tasks_parent_status_order on tasks(parent_task_id, status, sort_order);
create index if not exists idx_tasks_recurring_template_id on tasks(recurring_template_id);
create index if not exists idx_tasks_dates on tasks(start_date, due_date);
create index if not exists idx_tasks_is_deleted on tasks(is_deleted);

create unique index if not exists idx_tasks_template_occurrence
on tasks(recurring_template_id, recurrence_occurrence_date)
where recurring_template_id is not null and recurrence_occurrence_date is not null;

create table if not exists task_tags (
  task_id text not null references tasks(id) on delete cascade,
  tag_id text not null references tags(id) on delete cascade,
  primary key (task_id, tag_id)
);

create table if not exists activity_records (
  id text primary key,
  task_id text not null references tasks(id) on delete cascade,
  activity_date text not null,
  created_at text not null,
  unique (task_id, activity_date)
);

create table if not exists recurring_template_tags (
  template_id text not null references recurring_task_templates(id) on delete cascade,
  tag_id text not null references tags(id) on delete cascade,
  primary key (template_id, tag_id)
);

create table if not exists recurring_template_weekdays (
  template_id text not null references recurring_task_templates(id) on delete cascade,
  weekday integer not null check (weekday between 1 and 7),
  primary key (template_id, weekday)
);

create table if not exists recurring_template_month_days (
  template_id text not null references recurring_task_templates(id) on delete cascade,
  day_of_month integer check (day_of_month between 1 and 31),
  is_last_day integer not null default 0,
  check (
    (is_last_day = 1 and day_of_month is null)
    or (is_last_day = 0 and day_of_month is not null)
  )
);

create table if not exists recurring_template_year_days (
  template_id text not null references recurring_task_templates(id) on delete cascade,
  month integer not null check (month between 1 and 12),
  day_of_month integer check (day_of_month between 1 and 31),
  is_last_day integer not null default 0,
  check (
    (is_last_day = 1 and day_of_month is null)
    or (is_last_day = 0 and day_of_month is not null)
  )
);

create table if not exists trash_entries (
  id text primary key,
  entity_type text not null check (entity_type in ('task', 'project', 'tag', 'recurring_template')),
  entity_id text not null,
  deleted_at text not null,
  restore_payload text
);
