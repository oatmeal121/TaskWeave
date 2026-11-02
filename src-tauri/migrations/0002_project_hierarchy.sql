alter table projects add column parent_project_id text references projects(id) on delete set null;

create index if not exists idx_projects_parent_project_id
on projects(parent_project_id);
